/**
 * Authentication for the LAN show server.
 *
 *   - Operators log in with a PIN (POST /api/auth/login) and get a session token, delivered as the
 *     HttpOnly cookie `nava_session` AND in the JSON body (for WS `hello.token`).
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
  authenticateHello(msg: HelloMsg): { ok: true; principal: Principal | null } | { ok: false; code: number; reason: string };
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
  return { ...CONFIG_DEFAULTS_R4.security, ...(config.security ?? {}) };
}

function tokenEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length > 0 && ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function createAuth(deps: AuthDeps): Auth {
  const { config, appRoot, log, audit: auditLog, onSessionsRevoked } = deps;
  const security = securityOf(config);
  const users = new UsersStore(path.resolve(appRoot, security.usersFile), security.operatorPin, log);
  const sessionsPath = path.resolve(appRoot, path.dirname(security.usersFile), "sessions.json");
  const sessions = new Map<string, SessionInfo>();
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  let screenTokenWarned = false;

  // ---- sessions -------------------------------------------------------------
  const pruneSessions = (): void => {
    const now = Date.now();
    for (const [token, s] of sessions) if (Date.parse(s.expiresAt) <= now) sessions.delete(token);
  };
  let saving: Promise<void> = Promise.resolve();
  const saveSessions = (): Promise<void> => {
    pruneSessions();
    const list = [...sessions.values()];
    saving = saving.then(async () => {
      await fs.mkdir(path.dirname(sessionsPath), { recursive: true });
      await fs.writeFile(sessionsPath, JSON.stringify({ version: 1, sessions: list }), "utf8");
    });
    return saving;
  };
  const loadSessions = async (): Promise<void> => {
    try {
      const raw = JSON.parse(await fs.readFile(sessionsPath, "utf8")) as { sessions?: SessionInfo[] };
      for (const s of raw.sessions ?? []) {
        if (s && typeof s.token === "string" && typeof s.expiresAt === "string") sessions.set(s.token, s);
      }
      pruneSessions();
    } catch {
      /* no sessions yet */
    }
  };
  const createSession = (userId: string, name: string, role: UserRole): SessionInfo => {
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
    sessions.set(token, s);
    void saveSessions();
    return s;
  };
  const sessionIdOf = (token: string): string => createHash("sha256").update(token).digest("hex").slice(0, 24);
  /** Removes the given tokens, persists, and tells the WS owner to drop the matching connections. */
  const dropSessions = async (tokens: string[], info: RevocationInfo): Promise<number> => {
    let n = 0;
    for (const t of tokens) if (sessions.delete(t)) n += 1;
    if (n > 0) await saveSessions();
    if (tokens.length > 0) onSessionsRevoked?.(tokens, info);
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

  const sessionByToken = (token: string | undefined | null): SessionInfo | null => {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const s = sessions.get(token);
    if (!s) return null;
    if (Date.parse(s.expiresAt) <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    const u = users.get(s.userId);
    if (!u || u.disabled) {
      sessions.delete(token);
      return null;
    }
    // keep role fresh if an admin changed it
    if (u.role !== s.role) s.role = u.role;
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
  const loginAllowed = (ip: string): boolean => {
    const now = Date.now();
    const rec = loginAttempts.get(ip);
    if (!rec || rec.resetAt <= now) {
      loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      return true;
    }
    rec.count += 1;
    return rec.count <= LOGIN_MAX_ATTEMPTS;
  };
  const clientIp = (c: Context<AuthEnv>): string =>
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || (c.env as { incoming?: { socket?: { remoteAddress?: string } } })?.incoming?.socket?.remoteAddress || "?";

  // ---- same-origin guard for mutations ----------------------------------------
  const sameOrigin: MiddlewareHandler<AuthEnv> = async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
    const site = c.req.header("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "same-site" && site !== "none") {
      return deny(c, 403, "Cererea vine din alt site");
    }
    const origin = c.req.header("origin");
    const host = c.req.header("host");
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
  router.post("/login", async (c) => {
    let body: { pin?: unknown };
    try {
      body = (await c.req.json()) as { pin?: unknown };
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const ip = clientIp(c);
    if (!loginAllowed(ip)) {
      log("warn", "auth: login rate limited", { ip });
      return c.json({ ok: false, reason: "Prea multe încercări. Așteaptă 5 minute." }, 429);
    }
    const pin = typeof body.pin === "string" ? body.pin.trim() : typeof body.pin === "number" ? String(body.pin) : "";
    const user = users.verifyPin(pin);
    if (!user) {
      log("warn", "auth: bad PIN", { ip });
      return c.json({ ok: false, reason: "PIN incorect" }, 401);
    }
    const s = createSession(user.id, user.name, user.role);
    await users.touchLogin(user.id);
    setCookie(c, SESSION_COOKIE, s.token, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      maxAge: Math.max(5, security.sessionTtlMin) * 60,
    });
    log("info", `auth: login ${user.role} "${user.name}"`, { ip });
    void audit({ actor: { id: user.id, name: user.name, role: user.role }, action: "auth.login", ok: true, ip });
    return c.json({ ok: true, token: s.token, user: toPublicUser(user), expiresAt: s.expiresAt });
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
    // The console needs the session token for the WS `hello` (the cookie is HttpOnly), so /me returns it
    // to an already-authenticated caller. LAN/HTTP show network; see docs/SECURITATE.md.
    return c.json({
      ok: true,
      authenticated: true,
      kind: "user",
      token: p.token,
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
    let body: { name?: unknown; role?: unknown; pin?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const name = String(body.name ?? "");
    const role = String(body.role ?? "operator") as UserRole;
    const r = await users.create(name, role, String(body.pin ?? ""));
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
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const patch: { name?: string; role?: UserRole; disabled?: boolean } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.role === "string") patch.role = body.role as UserRole;
    if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
    const before = users.get(id);
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
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const r = await users.setPin(id, String(body.pin ?? ""));
    if (r.ok) {
      // A PIN change signs that user out everywhere, including open consoles.
      await dropSessions(tokensOfUser(id), { code: 4401, reason: "PIN-ul a fost schimbat; autentifică-te din nou" });
    }
    const audited = await auditUser(c, "user.pin", { kind: "user", id, name: targetName(id) }, r.ok, r.ok ? "PIN nou; sesiunile contului au fost închise" : r.reason);
    return r.ok ? c.json({ ok: true, user: r.value, audited }) : c.json({ ok: false, reason: r.reason }, r.status as 400);
  });
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
  const authenticateHello: Auth["authenticateHello"] = (msg) => {
    if (msg.client === "tablet") return { ok: true, principal: null };
    if (msg.client === "screen") {
      if (screenTokenOk(msg.token)) return { ok: true, principal: { kind: "screen", role: "screen" } };
      return { ok: false, code: 4401, reason: "token de ecran invalid (security.screenToken)" };
    }
    // control
    const s = sessionByToken(msg.token);
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
      await loadSessions();
    },
  };
}
