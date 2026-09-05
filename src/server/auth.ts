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

import { randomBytes, timingSafeEqual } from "node:crypto";
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

export const SESSION_COOKIE = "nava_session";

export type Principal =
  | { kind: "user"; userId: string; name: string; role: UserRole; token: string }
  | { kind: "screen"; role: "screen" };

export type AuthEnv = { Variables: { principal: Principal | null } };

export interface AuthDeps {
  config: AppConfig;
  appRoot: string;
  log: LogFn;
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
  sessions(): SessionInfo[];
  revoke(token: string): Promise<boolean>;
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
  const { config, appRoot, log } = deps;
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
    return c.json({ ok: true, token: s.token, user: toPublicUser(user), expiresAt: s.expiresAt });
  });
  router.post("/logout", async (c) => {
    const p = principalOf(c);
    if (p?.kind === "user") {
      sessions.delete(p.token);
      await saveSessions();
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
    return c.json({ sessions: [...sessions.values()].map((s) => ({ ...s, token: `${s.token.slice(0, 6)}…` })) });
  });

  const usersRouter = new Hono<AuthEnv>();
  usersRouter.use("*", requireRole("admin"));
  usersRouter.get("/", (c) => c.json({ users: users.list() }));
  usersRouter.post("/", async (c) => {
    let body: { name?: unknown; role?: unknown; pin?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const r = await users.create(String(body.name ?? ""), String(body.role ?? "operator") as UserRole, String(body.pin ?? ""));
    return r.ok ? c.json({ ok: true, user: r.value }, 201) : c.json({ ok: false, reason: r.reason }, r.status as 400);
  });
  usersRouter.patch("/:id", async (c) => {
    const me = principalOf(c);
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
    const r = await users.update(c.req.param("id"), patch, me?.kind === "user" ? me.userId : "");
    return r.ok ? c.json({ ok: true, user: r.value }) : c.json({ ok: false, reason: r.reason }, r.status as 400);
  });
  usersRouter.post("/:id/pin", async (c) => {
    let body: { pin?: unknown };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const r = await users.setPin(c.req.param("id"), String(body.pin ?? ""));
    if (r.ok) {
      // a PIN change invalidates that user's sessions (except none: keep simple & safe)
      for (const [tok, s] of sessions) if (s.userId === c.req.param("id")) sessions.delete(tok);
      await saveSessions();
    }
    return r.ok ? c.json({ ok: true, user: r.value }) : c.json({ ok: false, reason: r.reason }, r.status as 400);
  });
  usersRouter.delete("/:id", async (c) => {
    const me = principalOf(c);
    const r = await users.remove(c.req.param("id"), me?.kind === "user" ? me.userId : "");
    if (r.ok) {
      for (const [tok, s] of sessions) if (s.userId === r.value.id) sessions.delete(tok);
      await saveSessions();
    }
    return r.ok ? c.json({ ok: true }) : c.json({ ok: false, reason: r.reason }, r.status as 400);
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
    sessions: () => {
      pruneSessions();
      return [...sessions.values()];
    },
    async revoke(token) {
      const had = sessions.delete(token);
      if (had) await saveSessions();
      return had;
    },
    async load() {
      await users.load();
      await loadSessions();
    },
  };
}
