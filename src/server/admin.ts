/**
 * Admin API (/api/admin), admin-only on the server:
 *
 *   GET  /overview                      accounts, sessions (opaque ids), permissions, audit availability
 *   POST /sessions/:id/revoke           close one session by its opaque id (not the caller's own)
 *   POST /users/:userId/sessions/revoke close every session of a user (keeps the caller's own)
 *   GET  /audit?limit=100               newest audit entries first
 *
 * Account mutations stay on /api/users (auth.usersRouter) so there is a single store and a single guard.
 * Every response is `Cache-Control: no-store`; no route ever returns a token, PIN or hash.
 */

import { Hono } from "hono";
import type { Auth, AuthEnv } from "./auth";
import type { AuditLog } from "./audit";
import { ADMIN_PERMISSIONS, hasAdminPermission, type AdminAuditResponse, type AdminOverview, type AdminPermission } from "../shared/admin";

const AUDIT_DEFAULT_LIMIT = 100;
const AUDIT_MAX_LIMIT = 500;

export function createAdminRouter(auth: Auth, auditLog?: AuditLog) {
  const router = new Hono<AuthEnv>();
  router.use("*", auth.requireRole("admin"));
  router.use("*", auth.sameOrigin);
  router.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  const adminOf = (c: Parameters<typeof auth.principalOf>[0]) => {
    const p = auth.principalOf(c);
    return p?.kind === "user" && hasAdminPermission(p.role, "admin.read") ? p : null;
  };

  router.get("/overview", async (c) => {
    const me = adminOf(c);
    if (!me) return c.json({ ok: false, reason: "Necesită rolul admin", code: 4403 }, 403);
    const auditInfo = auditLog ? await auditLog.tail(1).then((t) => ({ available: !auditLog.degraded, entries: t.total })) : { available: false, entries: 0 };
    const result: AdminOverview = {
      version: 2,
      currentUser: { id: me.userId, name: me.name, role: me.role },
      users: auth.users.list().map((u) => ({ id: u.id, name: u.name, role: u.role, disabled: !!u.disabled, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt })),
      // Explicit projection: the token never leaves the server, only its opaque id does.
      sessions: auth
        .sessions()
        .map((s) => ({ id: auth.sessionIdOf(s.token), userId: s.userId, name: s.name, role: s.role, createdAt: s.createdAt, expiresAt: s.expiresAt, current: s.token === me.token }))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      permissions: (Object.keys(ADMIN_PERMISSIONS) as AdminPermission[]).filter((p) => hasAdminPermission(me.role, p)),
      audit: auditInfo,
      generatedAt: new Date().toISOString(),
    };
    return c.json(result);
  });

  router.post("/sessions/:id/revoke", async (c) => {
    const me = adminOf(c);
    if (!me || !hasAdminPermission(me.role, "sessions.revoke")) return c.json({ ok: false, reason: "Necesită rolul admin", code: 4403 }, 403);
    const id = c.req.param("id");
    if (!/^[0-9a-f]{24}$/.test(id)) return c.json({ ok: false, reason: "Identificator de sesiune invalid" }, 400);
    if (id === auth.sessionIdOf(me.token)) return c.json({ ok: false, reason: "Sesiunea curentă se închide cu „Ieșire”, nu de aici" }, 400);
    const removed = await auth.revokeById(id, { code: 4401, reason: "Sesiunea a fost închisă de un administrator" });
    const audited = await auth.audit({
      actor: { id: me.userId, name: me.name, role: me.role },
      action: "session.revoke",
      target: removed ? { kind: "session", id, name: removed.name } : { kind: "session", id },
      ok: !!removed,
      detail: removed ? `Sesiunea lui ${removed.name} (${removed.role}) a fost închisă` : "Sesiunea nu mai exista",
      ip: auth.clientIp(c),
    });
    if (!removed) return c.json({ ok: false, reason: "Sesiunea nu mai există (expirată sau deja închisă)" }, 404);
    return c.json({ ok: true, audited });
  });

  router.post("/users/:userId/sessions/revoke", async (c) => {
    const me = adminOf(c);
    if (!me || !hasAdminPermission(me.role, "sessions.revoke")) return c.json({ ok: false, reason: "Necesită rolul admin", code: 4403 }, 403);
    const userId = c.req.param("userId");
    const user = auth.users.get(userId);
    if (!user) return c.json({ ok: false, reason: "Utilizator inexistent" }, 404);
    const count = await auth.revokeUser(userId, { code: 4401, reason: "Sesiunile contului au fost închise de un administrator" }, me.token);
    const audited = await auth.audit({
      actor: { id: me.userId, name: me.name, role: me.role },
      action: "session.revoke-user",
      target: { kind: "user", id: userId, name: user.name },
      ok: true,
      detail: count === 0 ? "Nu existau sesiuni deschise" : `${count} ${count === 1 ? "sesiune închisă" : "sesiuni închise"}`,
      ip: auth.clientIp(c),
    });
    return c.json({ ok: true, count, audited });
  });

  router.get("/audit", async (c) => {
    const me = adminOf(c);
    if (!me || !hasAdminPermission(me.role, "audit.read")) return c.json({ ok: false, reason: "Necesită rolul admin", code: 4403 }, 403);
    if (!auditLog) return c.json({ ok: false, reason: "Jurnalul de audit nu este configurat" }, 503);
    const raw = Number(c.req.query("limit") ?? AUDIT_DEFAULT_LIMIT);
    const limit = Number.isFinite(raw) ? Math.min(AUDIT_MAX_LIMIT, Math.max(1, Math.floor(raw))) : AUDIT_DEFAULT_LIMIT;
    const result: AdminAuditResponse = await auditLog.tail(limit);
    return c.json(result);
  });

  return router;
}
