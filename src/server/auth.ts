import {isIP} from 'node:net';
import {secureRequest} from './identity-origin';
import {googleRouter,type GoogleSettings} from './google-identity';
import type {IdentityProtection} from './identity-db';
/**
 * Authentication for the LAN show server.
 *
 *   - Operators log in with a PIN (POST /api/auth/login) and get a session token, delivered as the
 *     HttpOnly cookie `nava_session`; browser WebSockets reuse that cookie.
 *   - Screens (renderers) authenticate with the shared `security.screenToken`
 *     (WS `hello.token`, or `Authorization: Bearer <token>` on /api/tts, /api/dialog, /api/frame).
 *   - Tablets are anonymous (they only speak the tablet WS protocol).
 *
 * Roles: viewer < operator < admin; `screen` is a separate principal kind.
 * Sessions are persisted in data/sessions.json so a server restart does not log operators out.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Context, MiddlewareHandler, Next } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppConfig, SecurityConfig, SessionInfo, UserRole } from "../shared/types";
import { CONFIG_DEFAULTS_R4 } from "../shared/types";
import type { HelloMsg } from "../shared/protocol";
import { ROLE_RANK, UsersStore, toPublicUser } from "./users";
import type { LogFn } from "./runlog";
import type { AuditLog } from "./audit";
import type { AuditAction, AuditEntry } from "../shared/admin";

export const SESSION_COOKIE = "nava_session";

export type Principal =
  | { kind: "user"; userId: string; name: string; role: UserRole; token: string }
  | { kind: "screen"; role: "screen" };

export type AuthEnv = { Variables: { principal: Principal | null } };

/** Why a set of sessions was invalidated; the WS close code tells the console what to do next. */
export interface RevocationInfo {
  /** 4401: sign in again (revoked, disabled, deleted, PIN changed). 4409: reconnect and re-read the role. */
  code: 4401 | 4409;
  reason: string;
}

export interface AuthDeps {
  identityProtection?:IdentityProtection;
  bundledAdministrator?:boolean;
  config: AppConfig;
  appRoot: string;
  log: LogFn;
  /** Persistent audit of administrative changes; optional so tests can run without a filesystem. */
  audit?: AuditLog;
  /**
   * Called with the session tokens that just became invalid, so the owner of the WebSocket clients can
   * close the affected connections. Server-side HTTP checks do not need this (sessionByToken already
   * rejects them); it exists because an OPEN WebSocket would otherwise keep its stale principal.
   */
  onSessionsRevoked?: (tokens: string[], info: RevocationInfo) => void;
}

export interface Auth {
  router: Hono<AuthEnv>;
  usersRouter: Hono<AuthEnv>;
  users: UsersStore;
  security: SecurityConfig;
  /** Attaches `c.var.principal` (or null) for every request; never rejects. */
  identify: MiddlewareHandler<AuthEnv>;
  /** Rejects with 401/403 unless a user with at least `minRole` is present. */
  requireRole(minRole: UserRole): MiddlewareHandler<AuthEnv>;
  /** Accepts a screen token OR a user with at least `minRole`. */
  requireScreenOrRole(minRole: UserRole): MiddlewareHandler<AuthEnv>;
  /** WS hello authentication. */
  authenticateHello(msg: HelloMsg, cookieToken?:string): { ok: true; principal: Principal | null } | { ok: false; code: number; reason: string };
  principalOf(c: Context<AuthEnv>): Principal | null;
  /** Best-effort client address for logs and audit (X-Forwarded-For, then the socket). */
  clientIp(c: Context<AuthEnv>): string;
  /**
   * Rejects state-changing requests whose Origin / Sec-Fetch-Site does not match this server. The session
   * cookie is SameSite=Lax, so this is defence in depth for admin mutations, not the only barrier.
   */
  sameOrigin: MiddlewareHandler<AuthEnv>;
  sessions(): SessionInfo[];
  /** Opaque, non-reversible identifier for a session (hash of the token). Safe to send to the admin UI. */
  sessionIdOf(token: string): string;
  revoke(token: string): Promise<boolean>;
  /** Revokes one session by its opaque id. Returns the session that was removed, or null. */
  revokeById(id: string, info: RevocationInfo): Promise<SessionInfo | null>;
  /** Revokes every session of a user (optionally keeping one token, e.g. the acting admin's own). */
  revokeUser(userId: string, info: RevocationInfo, keepToken?: string): Promise<number>;
  /** Writes an audit entry (no-op without an AuditLog). Resolves false when persistence failed. */
  audit(entry: Omit<AuditEntry, "t">): Promise<boolean>;
  load(): Promise<void>;
}

const LOGIN_WINDOW_MS = 5 * 60_000;
const LOGIN_MAX_ATTEMPTS = 8;

function securityOf(config: AppConfig): SecurityConfig {
  const merged={ ...CONFIG_DEFAULTS_R4.security, ...(config.security ?? {}) };merged.sessionTtlMin=Math.max(5,Math.min(1440,Number.isFinite(merged.sessionTtlMin)?merged.sessionTtlMin:720));return merged;
}

function tokenEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length > 0 && ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function createAuth(deps: AuthDeps): Auth {
  const { identityProtection,config, appRoot, log, audit: auditLog, onSessionsRevoked } = deps;
  const security = securityOf(config);
  const users = new UsersStore(path.resolve(appRoot, security.usersFile), security.operatorPin, log, identityProtection);
  const sessionsPath = path.resolve(appRoot, path.dirname(security.usersFile), "sessions.json");
  const sessions = new Map<string, SessionInfo>();
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  let screenTokenWarned = false;

  // ---- sessions -------------------------------------------------------------
  const pruneSessions = (): void => {
    const now = Date.now();
    for (const [token, s] of sessions) if (Date.parse(s.expiresAt) <= now) sessions.delete(token);
  };
  const saveSessions=()=>{pruneSessions();users.database.write('sessions',[...sessions.values()]);return Promise.resolve();};
  const loadSessions=async()=>{for(const s of users.database.read<SessionInfo[]>('sessions')??[])if(s&&/^[a-f0-9]{64}$/.test(s.token)&&Number.isFinite(Date.parse(s.expiresAt)))sessions.set(s.token,s);pruneSessions();
    try{const legacy=await fs.readFile(sessionsPath,'utf8');users.database.write('legacy-sessions-backup',legacy);await fs.unlink(sessionsPath);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  };
  const createSession = (userId: string, name: string, role: UserRole,c?:Context<AuthEnv>,method="local"): SessionInfo => {
    const token = randomBytes(32).toString("hex");
    const now = Date.now();
    const s: SessionInfo = {
      token,
      userId,
      name,
      role,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + Math.max(5, security.sessionTtlMin) * 60_000).toISOString(),
    };
    if(c){let browser=getCookie(c,'exodus_device');if(!browser||! /^[a-f0-9]{64}$/.test(browser)){browser=randomBytes(32).toString('hex');setCookie(c,'exodus_device',browser,{httpOnly:true,sameSite:'Lax',secure:secureRequest(c),path:'/',maxAge:31536000});}
      s.deviceId=createHash('sha256').update(userId+browser).digest('hex').slice(0,24);s.userAgent=(c.req.header('user-agent')??'Necunoscut').slice(0,300);s.ip=clientIp(c);s.lastSeenAt=s.createdAt;s.authMethod=method;
      const devices=users.database.read<Array<Record<string,unknown>>>('devices')??[];const previous=devices.find(d=>d.id===s.deviceId);users.database.write('devices',[...devices.filter(d=>d.id!==s.deviceId).slice(-499),{id:s.deviceId,userId,name,userAgent:s.userAgent,ip:s.ip,firstSeenAt:previous?.firstSeenAt??s.createdAt,lastSeenAt:s.createdAt,authMethod:method}]);
    }
    const evicted=[...sessions.values()].filter(x=>x.userId===userId).slice(0,-19).map(s=>s.token);for(const token of evicted)sessions.delete(token);if(evicted.length)onSessionsRevoked?.(evicted,{code:4401,reason:'Limita de sesiuni a contului a fost atinsă.'});
    sessions.set(token, s);
    void saveSessions();
    return s;
  };
  const sessionIdOf = (token: string): string => createHash("sha256").update(token).digest("hex").slice(0, 24);
  /** Removes the given tokens, persists, and tells the WS owner to drop the matching connections. */
  const dropSessions = async (tokens: string[], info: RevocationInfo): Promise<number> => {
    let n = 0;
    for (const t of tokens) if (sessions.delete(t)) n += 1;
    if (tokens.length > 0) onSessionsRevoked?.(tokens, info);
    if (n > 0) await saveSessions();
    return n;
  };
  const tokensOfUser = (userId: string, keepToken?: string): string[] => {
    const out: string[] = [];
    for (const [tok, s] of sessions) if (s.userId === userId && tok !== keepToken) out.push(tok);
    return out;
  };
  const audit: Auth["audit"] = (entry) => {
    if (!auditLog) return Promise.resolve(true);
    return auditLog.record({ t: new Date().toISOString(), ...entry });
  };
  const actorOf = (p: Principal | null): AuditEntry["actor"] =>
    p?.kind === "user" ? { id: p.userId, name: p.name, role: p.role } : null;

  let lastDeviceSave=0;
  const sessionByToken = (token: string | undefined | null): SessionInfo | null => {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const s = sessions.get(token);
    if (!s) return null;
    if (Date.parse(s.expiresAt) <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    const u = users.get(s.userId);
    if (!u || u.disabled || u.lockedAt || u.mustChangeCredential) {
      sessions.delete(token);
      return null;
    }
    s.lastSeenAt=new Date().toISOString();
    if(Date.now()-lastDeviceSave>60000){lastDeviceSave=Date.now();const devices=users.database.read<Array<Record<string,unknown>>>('devices')??[];for(const device of devices){const last=[...sessions.values()].filter(session=>session.deviceId===device.id).map(session=>session.lastSeenAt??session.createdAt).sort().at(-1);if(last)device.lastSeenAt=last;}users.database.write('devices',devices);}
    // keep role fresh if an admin changed it
    if (u.role !== s.role) s.role = u.role;
    s.name=u.name;
    return s;
  };

  // ---- principals -----------------------------------------------------------
  const bearerOf = (c: Context<AuthEnv>): string | null => {
    const h = c.req.header("authorization") ?? c.req.header("Authorization");
    if (!h) return null;
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    return m ? m[1].trim() : null;
  };
  const screenTokenOk = (token: string | undefined | null): boolean => {
    if (!security.screenToken) {
      if (!screenTokenWarned) {
        screenTokenWarned = true;
        log("warn", "security.screenToken is empty — screens are accepted WITHOUT a token (set one in config.json)");
      }
      return true;
    }
    return typeof token === "string" && tokenEquals(token, security.screenToken);
  };
  const resolvePrincipal = (c: Context<AuthEnv>): Principal | null => {
    const bearer = bearerOf(c);
    const cookie = getCookie(c, SESSION_COOKIE);
    const s = sessionByToken(bearer) ?? sessionByToken(cookie);
    if (s) return { kind: "user", userId: s.userId, name: s.name, role: s.role, token: s.token };
    if (bearer && security.screenToken && tokenEquals(bearer, security.screenToken)) return { kind: "screen", role: "screen" };
    return null;
  };
  const identify: MiddlewareHandler<AuthEnv> = async (c, next) => {
    c.set("principal", resolvePrincipal(c));
    await next();
  };
  const principalOf = (c: Context<AuthEnv>): Principal | null => {
    const p = c.get("principal");
    return p === undefined ? resolvePrincipal(c) : p;
  };
  const deny = (c: Context<AuthEnv>, status: 401 | 403, reason: string) =>
    c.json({ ok: false, reason, code: status === 401 ? 4401 : 4403 }, status);
  const requireRole = (minRole: UserRole): MiddlewareHandler<AuthEnv> => {
    return async (c: Context<AuthEnv>, next: Next) => {
      const p = principalOf(c);
      if (!p || p.kind !== "user") return deny(c, 401, "Autentificare necesară (PIN)");
      if (ROLE_RANK[p.role] < ROLE_RANK[minRole]) return deny(c, 403, `Necesită rolul ${minRole}`);
      await next();
    };
  };
  const requireScreenOrRole = (minRole: UserRole): MiddlewareHandler<AuthEnv> => {
    return async (c: Context<AuthEnv>, next: Next) => {
      const p = principalOf(c);
      if (p?.kind === "screen") return next();
      if (!p) {
        // legacy grace: no screenToken configured -> allow (logged once)
        if (!security.screenToken && bearerOf(c) === null) {
          screenTokenOk(null);
          return next();
        }
        return deny(c, 401, "Autentificare necesară (token ecran sau PIN)");
      }
      if (ROLE_RANK[p.role] < ROLE_RANK[minRole]) return deny(c, 403, `Necesită rolul ${minRole}`);
      await next();
    };
  };

  // ---- login rate limit -----------------------------------------------------
  let globalAttempts={count:0,resetAt:0};
  const reserveLogin = (ip: string): (() => void) | null => {
    const now = Date.now();
    for(const [key,value] of loginAttempts)if(value.resetAt<=now)loginAttempts.delete(key);
    if(globalAttempts.resetAt<=now)globalAttempts={count:0,resetAt:now+LOGIN_WINDOW_MS};
    if(globalAttempts.count>=80)return null;
    if(!loginAttempts.has(ip)&&loginAttempts.size>=1024)return null;
    let rec=loginAttempts.get(ip);
    if(!rec){rec={count:0,resetAt:now+LOGIN_WINDOW_MS};loginAttempts.set(ip,rec);}
    if(rec.count>=LOGIN_MAX_ATTEMPTS)return null;
    const bucket=rec,globalBucket=globalAttempts;
    bucket.count++;globalBucket.count++;
    // Reserve before asynchronous hashing: concurrent bad PINs cannot bypass the limit.
    // Successful verification refunds only its own slot; earlier failures still count.
    return ()=>{bucket.count=Math.max(0,bucket.count-1);globalBucket.count=Math.max(0,globalBucket.count-1);};
  };  const clientIp = (c:Context<AuthEnv>):string=>{const peer=(c.env as {incoming?:{socket?:{remoteAddress?:string}}})?.incoming?.socket?.remoteAddress??'unknown-peer';if(['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)){const forwarded=c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim();if(forwarded&&isIP(forwarded))return forwarded;}return peer;};

  // ---- same-origin guard for mutations ----------------------------------------
  const sameOrigin: MiddlewareHandler<AuthEnv> = async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
    const site = c.req.header("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      return deny(c, 403, "Cererea vine din alt site");
    }
    const origin = c.req.header("origin");
    const host = c.req.header("host") ?? new URL(c.req.url).host;
    if (origin && host) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      if (originHost !== host) return deny(c, 403, "Origine neacceptată pentru această acțiune");
    }
    await next();
  };

  // ---- routers --------------------------------------------------------------
  const router = new Hono<AuthEnv>();
  router.use("*", sameOrigin);
  router.use('*',async(c,next)=>{await next();c.header('Cache-Control','no-store');});
  router.get('/providers',c=>c.json({google:!!users.database.read<GoogleSettings>('google')?.enabled,domain:'ucdc.ro',usernameRequired:true}));
  router.route('/google',googleRouter(users,async(c,user)=>{const session=createSession(user.id,user.name,user.role,c,'google');setCookie(c,SESSION_COOKIE,session.token,{path:'/',httpOnly:true,sameSite:'Lax',secure:secureRequest(c),maxAge:Math.max(5,security.sessionTtlMin)*60});await audit({actor:{id:user.id,name:user.name,role:user.role},action:'auth.login',ok:true,detail:'Google Workspace login',ip:clientIp(c)});}));
  const setupFile=path.join(path.dirname(users.path),'identity-setup.json');
  router.get('/setup',c=>c.json({required:users.needsSetup(),local:['127.0.0.1','::1','::ffff:127.0.0.1'].includes(clientIp(c))}));
  let setupBusy=false;
  router.post('/setup',async c=>{
    if(setupBusy)return c.json({ok:false,reason:'Configurare în curs.'},409);setupBusy=true;try{
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(clientIp(c)))return c.json({ok:false,reason:'Configurarea inițială se face de pe PC-ul navei.'},403);
    if(!users.needsSetup())return c.json({ok:false,reason:'Identitatea este deja configurată.'},409);
    const body=await c.req.json().catch(()=>null);if(!body||typeof body.token!=='string'||typeof body.username!=='string'||typeof body.password!=='string')return c.json({ok:false,reason:'Date invalide.'},400);
    const setup=JSON.parse(await fs.readFile(setupFile,'utf8'));if(!tokenEquals(setup.token,body.token)||Date.now()>setup.expiresAt)return c.json({ok:false,reason:'Cod de configurare incorect sau expirat.'},403);
    const result=await users.createPasswordAccount(body.username,body.password);if(!result.ok)return c.json(result,result.status as 400);
    await fs.unlink(setupFile);await audit({actor:null,action:'user.create',target:{kind:'user',id:result.value.id},ok:true,detail:'Local first-run enrollment',ip:clientIp(c)});return c.json({ok:true});
    }finally{setupBusy=false;}
  });
  router.post("/login", async (c) => {
    let body: { pin?: unknown; username?:unknown; password?:unknown; code?:unknown;newCredential?:unknown };
    try {
      body = await c.req.json();
      if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid body");
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const ip = clientIp(c);
    const successfulLogin=reserveLogin(ip);
    if (!successfulLogin) {
      log("warn", "auth: login rate limited", { ip });
      return c.json({ ok: false, reason: "Prea multe încercări. Așteaptă 5 minute." }, 429);
    }
    const name=typeof body.username==='string'?body.username.trim():'';
    if(!name||name.length>128)return c.json({ok:false,reason:'Introdu numele de utilizator și parola sau PIN-ul.'},400);
    const credential=typeof body.password==='string'?body.password:typeof body.pin==='string'?body.pin:'';
    if(credential.length>128)return c.json({ok:false,reason:'Date de autentificare invalide.'},400);
    const result=await users.authenticate(name,credential,typeof body.code==='string'?body.code.slice(0,64):'',typeof body.newCredential==='string'?body.newCredential:undefined);
    if(!result.ok||!result.user){
      const account=users.findByName(name);if(result.locked&&account)await dropSessions(tokensOfUser(account.id),{code:4401,reason:'Cont blocat după încercări nereușite.'});
      await audit({actor:account?{id:account.id,name:account.name,role:account.role}:null,action:'auth.login',ok:false,detail:result.locked?'Account locked':result.factorRequired?'MFA required':result.changeRequired?'Credential change required':'Invalid credentials',ip});
      return c.json({ok:false,factorRequired:result.factorRequired,changeRequired:result.changeRequired,reason:result.locked?'Cont blocat. Cere administratorului deblocarea.':result.changeRequired?'Schimbă parola/PIN-ul temporar înainte de a continua.':result.factorRequired?'Introdu codul Authenticator sau un cod de recuperare.':'Utilizator, parolă/PIN sau cod incorect.'},result.locked?423:401);
    }
    successfulLogin();const user=result.user;
    const s=createSession(user.id,user.name,user.role,c,user.passwordHash?'password':'pin');
    setCookie(c, SESSION_COOKIE, s.token, {
      path: "/",
      httpOnly: true,
      secure: secureRequest(c),
      sameSite: "Lax",
      maxAge: Math.max(5, security.sessionTtlMin) * 60,
    });
    log("info", `auth: login ${user.role} "${user.name}"`, { ip });
    void audit({ actor: { id: user.id, name: user.name, role: user.role }, action: "auth.login", ok: true, ip });
    return c.json({ ok: true, user: toPublicUser(user), expiresAt: s.expiresAt });
  });
  router.post("/logout", async (c) => {
    const p = principalOf(c);
    if (p?.kind === "user") {
      await dropSessions([p.token], { code: 4401, reason: "Ai ieșit din cont" });
      void audit({ actor: actorOf(p), action: "auth.logout", ok: true, ip: clientIp(c) });
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
  router.get("/me", (c) => {
    const p = principalOf(c);
    if (!p) return c.json({ ok: false, authenticated: false, reason: "Neautentificat", code: 4401 }, 401);
    if (p.kind === "screen") return c.json({ ok: true, authenticated: true, kind: "screen", role: "screen" });
    const u = users.get(p.userId);
    // WebSocket authentication uses the HttpOnly cookie; do not expose the bearer secret.
    // Native screen clients continue to use their dedicated screen token.
    return c.json({
      ok: true,
      authenticated: true,
      kind: "user",

      user: u ? toPublicUser(u) : { id: p.userId, name: p.name, role: p.role },
    });
  });
  router.get("/sessions", requireRole("admin"), (c) => {
    pruneSessions();
    // Legacy listing: the token is replaced by its opaque id (never a prefix of the secret).
    return c.json({ sessions: [...sessions.values()].map(({ token, ...s }) => ({ ...s, id: sessionIdOf(token) })) });
  });

  // ---- users (admin) ---------------------------------------------------------
  const usersRouter = new Hono<AuthEnv>();
  usersRouter.use("*", requireRole("admin"));
  usersRouter.use("*", sameOrigin);
  /** Audits a user mutation and reports the outcome with the same shape the routes already use. */
  const auditUser = (c: Context<AuthEnv>, action: AuditAction, target: AuditEntry["target"], ok: boolean, detail?: string) =>
    audit({ actor: actorOf(principalOf(c)), action, target, ok, detail, ip: clientIp(c) });
  const targetName = (id: string): string | undefined => users.get(id)?.name;

  usersRouter.get("/", (c) => c.json({ users: users.list() }));
  usersRouter.post("/", async (c) => {
    let body: { name?: unknown; role?: unknown; pin?: unknown; password?:unknown };
    try {
      body = (await c.req.json()) as typeof body;
      if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid body");
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const name = String(body.name ?? "");
    const role = String(body.role ?? "operator") as UserRole;
    const r = typeof body.password==='string'?await users.createPasswordAccount(name,body.password,role):/^\d{6,8}$/.test(String(body.pin??''))?await users.create(name,role,String(body.pin)): {ok:false as const,reason:'PIN de 6–8 cifre necesar.',status:400};
    if(r.ok)await users.requireCredentialChange(r.value.id);
    const audited = await auditUser(
      c,
      "user.create",
      r.ok ? { kind: "user", id: r.value.id, name: r.value.name } : { kind: "user", id: "", name: name.trim().slice(0, 32) },
      r.ok,
      r.ok ? `Cont nou cu rolul ${role}` : r.reason,
    );
    return r.ok ? c.json({ ok: true, user: r.value, audited }, 201) : c.json({ ok: false, reason: r.reason }, r.status as 400);
  });
  usersRouter.patch("/:id", async (c) => {
    const me = principalOf(c);
    const id = c.req.param("id");
    let body: { name?: unknown; role?: unknown; disabled?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
      if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid body");
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const patch: { name?: string; role?: UserRole; disabled?: boolean } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.role === "string") patch.role = body.role as UserRole;
    if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
    const existing=users.get(id);
    const before = existing?{...existing}:undefined;
    const r = await users.update(id, patch, me?.kind === "user" ? me.userId : "");
    if (r.ok && before) {
      // An OPEN WebSocket keeps the principal it had at `hello`; make the change effective now.
      if (patch.disabled === true) {
        await dropSessions(tokensOfUser(id), { code: 4401, reason: "Contul a fost dezactivat" });
      } else if (patch.role !== undefined && patch.role !== before.role) {
        await dropSessions(tokensOfUser(id), { code: 4409, reason: "Rolul contului s-a schimbat; reconectare" });
      }
    }
    const changes = [
      patch.name !== undefined ? "nume" : null,
      patch.role !== undefined ? `rol → ${patch.role}` : null,
      patch.disabled !== undefined ? (patch.disabled ? "dezactivat" : "reactivat") : null,
    ].filter(Boolean);
    const audited = await auditUser(c, "user.update", { kind: "user", id, name: r.ok ? r.value.name : before?.name }, r.ok, r.ok ? changes.join(", ") : r.reason);
    return r.ok ? c.json({ ok: true, user: r.value, audited }) : c.json({ ok: false, reason: r.reason }, r.status as 400);
  });
  usersRouter.post("/:id/pin", async (c) => {
    const id = c.req.param("id");
    let body: { pin?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
      if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid body");
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const r = await users.resetCredential(id, String(body.pin ?? ""),"pin");
    if (r.ok) {
      // A PIN change signs that user out everywhere, including open consoles.
      await dropSessions(tokensOfUser(id), { code: 4401, reason: "PIN-ul a fost schimbat; autentifică-te din nou" });
    }
    const audited = await auditUser(c, "user.pin", { kind: "user", id, name: targetName(id) }, r.ok, r.ok ? "PIN nou; sesiunile contului au fost închise" : r.reason);
    return r.ok ? c.json({ ok: true, user: r.value, audited }) : c.json({ ok: false, reason: r.reason }, r.status as 400);
  });
  usersRouter.post('/:id/unlock',async c=>{const id=c.req.param('id'),r=await users.unlock(id);await auditUser(c,'user.update',{kind:'user',id},r.ok,'Account unlock');return r.ok?c.json({ok:true,user:r.value}):c.json(r,r.status as 400);});
  usersRouter.post('/:id/credential',async c=>{const id=c.req.param('id'),body=await c.req.json().catch(()=>null);if(!body||!['pin','password'].includes(body.kind)||typeof body.credential!=='string')return c.json({ok:false,reason:'Date invalide.'},400);const r=await users.resetCredential(id,body.credential,body.kind);if(r.ok)await dropSessions(tokensOfUser(id),{code:4401,reason:'Credențiale resetate de administrator.'});await auditUser(c,'user.update',{kind:'user',id},r.ok,'Credential reset; next login change required');return r.ok?c.json({ok:true,user:r.value}):c.json(r,r.status as 400);});
  usersRouter.delete("/:id", async (c) => {
    const me = principalOf(c);
    const id = c.req.param("id");
    const name = targetName(id);
    const r = await users.remove(id, me?.kind === "user" ? me.userId : "");
    if (r.ok) await dropSessions(tokensOfUser(id), { code: 4401, reason: "Contul a fost șters" });
    const audited = await auditUser(c, "user.delete", { kind: "user", id, name }, r.ok, r.ok ? "Cont șters" : r.reason);
    return r.ok ? c.json({ ok: true, audited }) : c.json({ ok: false, reason: r.reason }, r.status as 400);
  });

  // ---- WS -------------------------------------------------------------------
  const authenticateHello: Auth["authenticateHello"] = (msg,cookieToken) => {
    if (msg.client === "tablet") return { ok: true, principal: null };
    if (msg.client === "screen") {
      if (screenTokenOk(msg.token)) return { ok: true, principal: { kind: "screen", role: "screen" } };
      return { ok: false, code: 4401, reason: "token de ecran invalid (security.screenToken)" };
    }
    // control
    const s = sessionByToken(cookieToken) ?? sessionByToken(msg.token);
    if (!s) return { ok: false, code: 4401, reason: "sesiune invalidă — autentifică-te cu PIN" };
    if (ROLE_RANK[s.role] < ROLE_RANK.viewer) return { ok: false, code: 4403, reason: "rol insuficient" };
    return { ok: true, principal: { kind: "user", userId: s.userId, name: s.name, role: s.role, token: s.token } };
  };

  return {
    router,
    usersRouter,
    users,
    security,
    identify,
    requireRole,
    requireScreenOrRole,
    authenticateHello,
    principalOf,
    clientIp,
    sameOrigin,
    sessions: () => {
      pruneSessions();
      return [...sessions.values()];
    },
    sessionIdOf,
    async revoke(token) {
      return (await dropSessions([token], { code: 4401, reason: "Sesiunea a fost închisă" })) > 0;
    },
    async revokeById(id, info) {
      pruneSessions();
      for (const [token, s] of sessions) {
        if (sessionIdOf(token) === id) {
          await dropSessions([token], info);
          return s;
        }
      }
      return null;
    },
    async revokeUser(userId, info, keepToken) {
      return dropSessions(tokensOfUser(userId, keepToken), info);
    },
    audit,
    async load() {
      await users.load();
      const changedAdmin=deps.bundledAdministrator?await users.applyBundledAdministrator():null;
      if(users.needsSetup())await fs.writeFile(setupFile,JSON.stringify({token:randomBytes(32).toString("base64url"),expiresAt:Date.now()+86400000}),{mode:0o600});
      await loadSessions();
      if(changedAdmin)await dropSessions(tokensOfUser(changedAdmin),{code:4401,reason:'Credențialele administratorului au fost actualizate.'});
    },
  };
}
