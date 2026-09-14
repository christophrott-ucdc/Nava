import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { UsersStore } from './users';
import { totp, matchTotp, newTotpSecret, sealSecret, openSecret } from './totp';
import { createAuth } from './auth';
import { createAdminRouter } from './admin';
import { parseNvidiaCsv } from './admin-dashboard';
import type { AppConfig } from '../shared/types';
const password = 'Isolated-test-password-42';
test('TOTP RFC 6238 SHA1 vectors, window/replay and authenticated encryption', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    for (const [seconds, expected] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']] as const)
        assert.equal(totp(secret, Math.floor(seconds / 30), 8), expected);
    const now = 120000, code = totp(secret, 4);
    assert.equal(matchTotp(secret, code, -1, now), 4);
    assert.equal(matchTotp(secret, code, 4, now), null);
    assert.equal(matchTotp(secret, code, -1, now + 90000), null);
    assert.match(newTotpSecret(), /^[A-Z2-7]{32}$/);
    const key = randomBytes(32), sealed = sealSecret(secret, key);
    assert.equal(openSecret(sealed, key), secret);
    assert.throws(() => openSecret(sealed, randomBytes(32)));
    const b = Buffer.from(sealed, 'base64');
    b[15] ^= 1;
    assert.throws(() => openSecret(b.toString('base64'), key));
});
test('Password + MFA persist, concurrent recovery code consumption is one-use, PIN cannot bypass', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nava-mfa-')), file = path.join(root, 'users.json');
    try {
        const store = new UsersStore(file, '9384', () => { });
        await store.load();
        const created = await store.createPasswordAccount('Christoph', password);
        assert(created.ok);
        const id = created.value.id;
        assert.equal((await store.createPasswordAccount('christoph', password)).ok, false);
        assert.equal(await store.verifyPassword('Christoph', 'wrong'), null);
        assert.equal((await store.verifyPassword('christoph', password))?.id, id);
        assert.equal((await store.setPin(id, '1122')).ok, false);
        assert.equal(await store.verifyPin('1122'), null);
        const start = await store.beginMfa(id, password);
        assert(start.ok);
        assert.equal(store.securityStatus(id).mfaEnabled, false);
        const confirmed = await store.confirmMfa(id, totp(start.value.secret, Math.floor(Date.now() / 30000)));
        assert(confirmed.ok);
        assert.equal(confirmed.value.recoveryCodes.length, 8);
        const raw = await readFile(path.join(root,'identity.sqlite'),'utf8');
        assert(!raw.includes(start.value.secret));
        assert(!raw.includes(password));
        assert(!raw.includes(confirmed.value.recoveryCodes[0]));
        const results = await Promise.all(Array.from({ length: 8 }, () => store.verifySecondFactor(id, confirmed.value.recoveryCodes[0])));
        assert.equal(results.filter(Boolean).length, 1);
        const reloaded = new UsersStore(file, '9384', () => { });
        await reloaded.load();
        assert.equal(await reloaded.verifySecondFactor(id, confirmed.value.recoveryCodes[0]), false);
        assert.equal(reloaded.securityStatus(id).recoveryCodesRemaining, 7);
        const keyPath=path.join(root,'identity.key');await rename(keyPath,keyPath+'.saved');
        await assert.rejects(new UsersStore(file,'9384',()=>{}).load(),/Cheia identității lipsește/);
        await assert.rejects(readFile(keyPath),{code:'ENOENT'});await rename(keyPath+'.saved',keyPath);
        assert.equal((await reloaded.changeSecurity(id, password, 'invalid', 'changed-password-value')).ok, false);
        assert.equal((await reloaded.changeSecurity(id, password, confirmed.value.recoveryCodes[1], 'changed-password-value')).ok, true);
        assert.equal(await reloaded.verifyPassword('Christoph', password), null);
        assert.equal((await reloaded.changeSecurity(id, 'changed-password-value', confirmed.value.recoveryCodes[2])).ok, true);
        assert.equal(reloaded.securityStatus(id).mfaEnabled, false);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
test('Corrupt identity file fails closed and is never overwritten', async () => { const root = await mkdtemp(path.join(os.tmpdir(), 'nava-identity-')), file = path.join(root, 'users.json'); try {
    for (const bad of ['{broken', '{"users":[]}', '{"users":[{"role":"admin"}]}']) {
        await writeFile(file, bad);
        await assert.rejects(new UsersStore(file, '9384', () => { }).load());
        assert.equal(await readFile(file, 'utf8'), bad);
    }
}
finally {
    await rm(root, { recursive: true, force: true });
} });
test('NVIDIA parser reports unavailable values as null', () => { assert.deepEqual(parseNvidiaCsv('RTX 4080, 12, 4000, 16384, 42\n'), [{ name: 'RTX 4080', utilization: 12, memoryUsedMb: 4000, memoryTotalMb: 16384, temperatureC: 42 }]); assert.equal(parseNvidiaCsv('GPU, N/A, [Not Supported], 100, N/A')[0].utilization, null); assert.deepEqual(parseNvidiaCsv(''), []); });
test('Admin API password onboarding, RBAC, QR enrollment, MFA login and safe wiki', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nava-admin-api-'));
    const auth = createAuth({ config: { security: { operatorPin: '9384', screenToken: '', sessionTtlMin: 30, usersFile: 'users.json' } } as AppConfig, appRoot: root, log: () => { } });
    await auth.load();await auth.users.create("admin","admin","9384");
    const app = new Hono();
    app.route('/api/auth', auth.router);
    app.route('/api/admin', createAdminRouter(auth, undefined, { appRoot: root }));
    const login = async (body: unknown) => app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...body as object,...((body as {pin?:string}).pin?{username:(body as {pin:string}).pin==='7261'?'Operator':'admin'}:{})}) });
    const cookie = (r: Response) => r.headers.get('set-cookie')!.match(/nava_session=[a-f0-9]+/)![0];
    const req = (route: string, session = '', body?: unknown, origin?: string) => app.request('/api/admin' + route, { method: body === undefined ? 'GET' : 'POST', headers: { cookie: session, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    try {
        assert.equal((await req('/security')).status, 401);
        const operator = await auth.users.create('Operator', 'operator', '7261');
        assert(operator.ok);
        const op = cookie(await login({ pin: '7261' }));
        for (const endpoint of ['/security', '/metrics', '/wiki'])
            assert.equal((await req(endpoint, op)).status, 403);
        const admin = cookie(await login({ pin: '9384' }));
        assert.equal((await req('/security/create-christoph', admin, { password }, 'https://evil.example')).status, 403);
        assert.equal((await req('/security/create-christoph', admin, { password })).status, 200);
        const session = cookie(await login({ username: 'Christoph', password }));
        const setup = await req('/security/mfa-start', session, { password });
        assert.equal(setup.status, 200);
        assert.equal(setup.headers.get('cache-control'), 'no-store');
        const enrollment = await setup.json();
        assert(enrollment.qr.startsWith('data:image/png;base64,'));
        const confirm = await req('/security/mfa-confirm', session, { code: totp(enrollment.secret, Math.floor(Date.now() / 30000)) });
        assert.equal(confirm.status, 200);
        const codes = (await confirm.json()).recoveryCodes;
        const blocked = await login({ username: 'Christoph', password });
        assert.equal(blocked.status, 401);
        assert.equal((await blocked.json()).factorRequired, true);
        assert.equal((await login({ username: 'Christoph', password, code: codes[0] })).status, 200);
        assert.equal((await login({ username: 'Christoph', password, code: codes[0] })).status, 401);
        const overview = JSON.stringify(await (await req('/overview', session)).json());
        assert(!overview.includes('passwordHash'));
        assert(!overview.includes(enrollment.secret));
        assert.equal((await req('/wiki/unknown', session)).status, 404);
        await writeFile(path.join(root, 'README.md'), '# Local wiki\nHello');
        assert.equal((await (await req('/wiki/start', session)).json()).content, '# Local wiki\nHello');
        const metrics = await req('/metrics', session);
        assert.equal(metrics.status, 200);
        const m = await metrics.json();
        assert(m.host.memoryTotalBytes > 0);
        assert.equal(m.electron, null);
    }
    finally {
        for (const s of auth.sessions())
            await auth.revoke(s.token);
        await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
});
