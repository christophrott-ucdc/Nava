import { secureRequest, requestOrigin } from './identity-origin';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AuthEnv } from './auth';
import type { UsersStore } from './users';
import type { UserRecord } from '../shared/types';
export type GoogleSettings = {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
};
export function validateGoogleIdentity(payload: JWTPayload, nonce: string) { if (payload.nonce !== nonce || payload.hd !== 'ucdc.ro' || payload.email_verified !== true || typeof payload.email !== 'string' || !payload.email.toLowerCase().endsWith('@ucdc.ro') || typeof payload.sub !== 'string' || !payload.sub)
    throw Error('Invalid organization identity'); return { sub: payload.sub, email: payload.email.toLowerCase() }; }
export async function verifyGoogleToken(token: string, nonce: string, clientId: string, keys: JWTVerifyGetKey) { const { payload } = await jwtVerify(token, keys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId, algorithms: ['RS256'], maxTokenAge: '10m', clockTolerance: 5 }); if (payload.azp && payload.azp !== clientId)
    throw Error('Wrong client'); return validateGoogleIdentity(payload, nonce); }
export function validGoogleSettings(value: GoogleSettings) { const uri = new URL(value.redirectUri); return value.clientId.length <= 300 && value.clientSecret.length <= 300 && value.redirectUri.length <= 500 && value.clientId.endsWith('.apps.googleusercontent.com') && value.clientSecret.length >= 8 && uri.pathname === '/api/auth/google/callback' && !uri.search && !uri.hash && !uri.username && !uri.password && (uri.protocol === 'https:' || uri.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(uri.hostname)); }
export function googleRouter(users: UsersStore, issue: (c: Context<AuthEnv>, user: UserRecord) => Promise<void>) {
    const router = new Hono<AuthEnv>();
    const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
    const pending = new Map<string, {
        nonce: string;
        verifier: string;
        expires: number;
        settings: GoogleSettings;
    }>();
    const settings = () => users.database.read<GoogleSettings>('google');
    router.get('/start', c => {
        const config = settings();
        if (!config?.enabled)
            return c.redirect('/login/?authError=google-unavailable');
        if (new URL(config.redirectUri).origin !== requestOrigin(c))
            return c.redirect('/login/?authError=google-origin');
        for (const [key, value] of pending)
            if (value.expires < Date.now())
                pending.delete(key);
        if (pending.size >= 100)
            return c.json({ ok: false, reason: 'Prea multe autentificări în curs.' }, 429);
        const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
        pending.set(state, { nonce, verifier, expires: Date.now() + 300000, settings: config });
        setCookie(c, 'exodus_oidc', state, { path: '/api/auth/google', httpOnly: true, sameSite: 'Lax', secure: secureRequest(c), maxAge: 300 });
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'openid email profile', hd: 'ucdc.ro', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
        return c.redirect(url.href);
    });
    router.get('/callback', async (c) => {
        const state = c.req.query('state') ?? '', cookie = getCookie(c, 'exodus_oidc') ?? '', flow = pending.get(state);
        pending.delete(state);
        deleteCookie(c, 'exodus_oidc', { path: '/api/auth/google' });
        if (!flow || flow.expires < Date.now() || state.length !== cookie.length || !state || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie)))
            return c.redirect('/login/?authError=google-state');
        try {
            const config = flow.settings;
            if (!settings()?.enabled)
                throw Error('Disabled');
            const code = c.req.query('code');
            if (!code)
                throw Error('No code');
            const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: 'authorization_code', code_verifier: flow.verifier }), signal: AbortSignal.timeout(10000) });
            if (!response.ok)
                throw Error('Token exchange failed');
            const token = await response.json() as {
                id_token?: string;
            };
            if (!token.id_token)
                throw Error('Missing token');
            const identity = await verifyGoogleToken(token.id_token, flow.nonce, config.clientId, keys), result = await users.provisionGoogle(identity.sub, identity.email);
            if (!result.ok)
                throw Error('Account unavailable');
            await issue(c, result.value);
            return c.redirect('/control/');
        }
        catch {
            return c.redirect('/login/?authError=google-denied');
        }
    });
    return router;
}
