import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { scryptSync, randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { UsersStore } from './users';
import { createAuth } from './auth';
import { createAdminRouter } from './admin';
import { verifyGoogleToken } from './google-identity';
import { BUNDLED_ADMIN } from './bundled-admin';
import type { AppConfig } from '../shared/types';
const password = 'A long isolated password 2026';
test('Bundled administrator applies once and preserves later credential changes and lockout', async () => {
    const root=await mkdtemp(path.join(os.tmpdir(),'identity-bundled-'));
    try {
        const file=path.join(root,'users.json'),store=new UsersStore(file,'',()=>{});
        await store.load();const id=await store.applyBundledAdministrator();assert(id);
        assert.equal(store.get(id)?.role,'admin');assert.equal(store.get(id)?.passwordHash,BUNDLED_ADMIN.hash);
        assert.equal(store.needsSetup(),false);
        assert((await store.resetCredential(id,password,'password')).ok);
        for(let i=0;i<5;i++)await store.authenticate('Christoph','incorrect','');
        const restarted=new UsersStore(file,'',()=>{});await restarted.load();
        assert.equal(await restarted.applyBundledAdministrator(),null);
        assert.notEqual(restarted.get(id)?.passwordHash,BUNDLED_ADMIN.hash);
        assert(restarted.get(id)?.mustChangeCredential);assert(restarted.get(id)?.lockedAt);
    } finally {await rm(root,{recursive:true,force:true});}
});
test('Interrupted legacy cleanup resumes without replacing current identities', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'identity-interrupted-'));
    try {
        const file = path.join(root, 'users.json');
        const store = new UsersStore(file, '', () => {});
        await store.load();
        const created = await store.createPasswordAccount('CurrentAdmin', password);
        assert(created.ok);
        const legacy = { version: 1, users: [] };
        store.database.write('legacy-users-backup', legacy);
        await writeFile(file, JSON.stringify(legacy));
        const restarted = new UsersStore(file, '', () => {});
        await restarted.load();
        await assert.rejects(readFile(file), { code: 'ENOENT' });
        assert((await restarted.authenticate('CurrentAdmin', password, '')).ok);
        const changed = { version: 1, users: [], note: 'preserve this different file' };
        await writeFile(file, JSON.stringify(changed));
        const again = new UsersStore(file, '', () => {});
        await again.load();
        assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), changed);
        assert.equal(again.list().length, 1);
    } finally { await rm(root, { recursive: true, force: true }); }
});
test('No default identity; legacy 4078 disabled, SQLite migration encrypted and restart stable', async () => { const root = await mkdtemp(path.join(os.tmpdir(), 'identity-migrate-')); try {
    const file = path.join(root, 'users.json'), salt = randomBytes(16).toString('hex');
    await writeFile(file, JSON.stringify({ version: 1, users: [{ id: 'old', name: 'admin', role: 'admin', salt, pinHash: scryptSync('4078', salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex'), createdAt: new Date().toISOString() }] }));
    const store = new UsersStore(file, '4078', () => { });
    await store.load();
    assert(store.needsSetup());
    assert.equal((await store.authenticate('admin', '4078', '')).ok, false);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
    const raw = await readFile(store.database.file);
    assert(!raw.includes(Buffer.from('pinHash')));
    const reloaded = new UsersStore(file, '4078', () => { });
    await reloaded.load();
    assert.equal(reloaded.get('old')?.disabled, true);
}
finally {
    await rm(root, { recursive: true, force: true });
} });
test('Five failures lock one account atomically across restart; unlock and temporary reset', async () => { const root = await mkdtemp(path.join(os.tmpdir(), 'identity-lock-')); try {
    const file = path.join(root, 'users.json');
    let store = new UsersStore(file, '4078', () => { });
    await store.load();
    assert.equal(store.list().length, 0);
    const created = await store.createPasswordAccount('Operator', password, 'operator');
    assert(created.ok);
    const attempts = await Promise.all(Array.from({ length: 12 }, () => store.authenticate('Operator', 'wrong', '')));
    assert(attempts.every(a => !a.ok));
    assert.equal(store.get(created.value.id)?.failedAttempts, 5);
    assert(store.get(created.value.id)?.lockedAt);
    store = new UsersStore(file, '', () => { });
    await store.load();
    assert.equal((await store.authenticate('Operator', password, '')).locked, true);
    assert((await store.unlock(created.value.id)).ok);
    assert((await store.authenticate('Operator', password, '')).ok);
    assert((await store.resetCredential(created.value.id, 'Temporary password 2026', 'password')).ok);
    assert((await store.authenticate('Operator', 'Temporary password 2026', '')).changeRequired);
    assert((await store.authenticate('Operator', 'Temporary password 2026', '', 'User selected permanent password')).ok);
    assert.equal((await store.authenticate('Operator', 'Temporary password 2026', '')).ok, false);
}
finally {
    await rm(root, { recursive: true, force: true });
} });
test('Google signed token validates issuer, audience, nonce and hosted domain; auto provision stays viewer', async () => {
    const keys = await generateKeyPair('RS256'), jwk = await exportJWK(keys.publicKey);
    jwk.kid = 'test';
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const sign = (extra: Record<string, unknown> = {}) => new SignJWT({ hd: 'ucdc.ro', email: 'person@ucdc.ro', email_verified: true, nonce: 'nonce', ...extra }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://accounts.google.com').setAudience('client').setSubject('google-sub').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
    const valid = await verifyGoogleToken(await sign(), 'nonce', 'client', jwks);
    assert.equal(valid.email, 'person@ucdc.ro');
    for (const changes of [{ hd: 'evil.ro' }, { email: 'person@ucdc.ro.evil' }, { email_verified: false }, { nonce: 'other' }])
        await assert.rejects(verifyGoogleToken(await sign(changes), 'nonce', 'client', jwks));
    await assert.rejects(verifyGoogleToken(await sign(), 'nonce', 'wrong-client', jwks));
    const foreign = await generateKeyPair('RS256');
    const forged = await new SignJWT({ hd: 'ucdc.ro' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(foreign.privateKey);
    await assert.rejects(verifyGoogleToken(forged, 'nonce', 'client', jwks));
    const root = await mkdtemp(path.join(os.tmpdir(), 'identity-google-'));
    try {
        const store = new UsersStore(path.join(root, 'users.json'), '', () => { });
        await store.load();
        const one = await store.provisionGoogle(valid.sub, valid.email), two = await store.provisionGoogle(valid.sub, valid.email);
        assert(one.ok && two.ok);
        assert.equal(one.value.id, two.value.id);
        assert.equal(one.value.role, 'viewer');
        assert.equal(store.list().length, 1);
        assert.equal((await store.resetCredential(one.value.id, password, 'password')).ok, false);
        await store.createPasswordAccount('local', password);
        assert.equal((await store.provisionGoogle('other-sub', valid.email)).ok, false);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
test('Named login, role guards, device metadata, session revocation and no credential leaks', async () => { const root = await mkdtemp(path.join(os.tmpdir(), 'identity-rbac-')); const auth = createAuth({ config: { security: { operatorPin: '4078', screenToken: 'screen', sessionTtlMin: 30, usersFile: 'users.json' } } as AppConfig, appRoot: root, log: () => { } }); await auth.load(); const app = new Hono(); app.route('/api/auth', auth.router); app.route('/api/users', auth.usersRouter); app.route('/api/admin', createAdminRouter(auth)); app.post('/operate', auth.requireRole('operator'), c => c.json({ ok: true })); const login = (username: string) => app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Android QA device' }, body: JSON.stringify({ username, password }) }); const token = (r: Response) => r.headers.get('set-cookie')?.match(/nava_session=([a-f0-9]+)/)?.[1]; try {
    for (const role of ['viewer', 'operator', 'admin'] as const) {
        assert((await auth.users.createPasswordAccount(role, password, role)).ok);
        const response = await login(role);
        assert.equal(response.status, 200);
        const t = token(response);
        assert(t);
        const headers = { Authorization: 'Bearer ' + t };
        assert.equal((await app.request('/api/admin/identity', { headers })).status, role === 'admin' ? 200 : 403);
        assert.equal((await app.request('/operate', { method: 'POST', headers })).status, role === 'viewer' ? 403 : 200);
        if (role === 'admin') {
            const data = await (await app.request('/api/admin/identity', { headers })).json();
            assert.equal(data.devices.length, 3);
            assert(data.devices.every((d: {
                userAgent: string;
            }) => d.userAgent === 'Android QA device'));
            assert(!JSON.stringify(data).includes('clientSecret'));
        }
        await auth.revoke(t);
        assert.equal((await app.request('/operate', { method: 'POST', headers })).status, 401);
    }
    assert.equal((await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '4078' }) })).status, 400);
}
finally {
    for (const s of auth.sessions())
        await auth.revoke(s.token);
    await rm(root, { recursive: true, force: true });
} });
test('First-run enrollment is local, random-token protected and consumed once', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'identity-setup-'));
    const auth = createAuth({ config: { security: { operatorPin: '4078', screenToken: '', sessionTtlMin: 30, usersFile: 'users.json' } } as AppConfig, appRoot: root, log: () => { } });
    await auth.load();
    try {
        assert(auth.users.needsSetup());
        const setup = JSON.parse(await readFile(path.join(root, 'identity-setup.json'), 'utf8'));
        const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'FirstAdmin', password, token: setup.token }) };
        assert.equal((await auth.router.request('/setup', options)).status, 403);
        const local = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
        assert.equal((await auth.router.request('/setup', { ...options, headers: { ...options.headers, 'X-Forwarded-For': '192.168.1.50' } }, local)).status, 403);
        assert.equal((await auth.router.request('/setup', { ...options, headers: { ...options.headers, 'X-Forwarded-For': '127.0.0.1' } }, { incoming: { socket: { remoteAddress: '192.168.1.50' } } })).status, 403);
        const replies = await Promise.all(Array.from({ length: 3 }, () => auth.router.request('/setup', options, local)));
        assert.equal(replies.filter(r => r.status === 200).length, 1);
        assert.equal(auth.users.list().length, 1);
        assert.equal(auth.users.needsSetup(), false);
        await assert.rejects(readFile(path.join(root, 'identity-setup.json')), { code: 'ENOENT' });
        assert.equal((await auth.router.request('/setup', options, local)).status, 409);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
