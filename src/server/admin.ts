import {validGoogleSettings,type GoogleSettings} from './google-identity';
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
import QRCode from 'qrcode';
import {createAdminDashboard,type AdminDashboardOptions} from './admin-dashboard';
import type { Auth, AuthEnv } from "./auth";
import type { AuditLog } from "./audit";
import { ADMIN_PERMISSIONS, hasAdminPermission, type AdminAuditResponse, type AdminOverview, type AdminPermission } from "../shared/admin";

const AUDIT_DEFAULT_LIMIT = 100;
const AUDIT_MAX_LIMIT = 500;

export function createAdminRouter(auth: Auth, auditLog?: AuditLog, dashboard?:AdminDashboardOptions) {
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


  router.get('/identity',c=>{const google=auth.users.database.read<GoogleSettings>('google');return c.json({storage:'SQLite + AES-256-GCM',protection:auth.users.database.protectionMode,lockoutAttempts:5,google:{enabled:!!google?.enabled,clientId:google?.clientId??'',redirectUri:google?.redirectUri??'',secretConfigured:!!google?.clientSecret,domain:'ucdc.ro',defaultRole:'viewer'},devices:auth.users.database.read('devices')??[]});});
  router.post('/identity/google',async c=>{const body=await c.req.json().catch(()=>null),old=auth.users.database.read<GoogleSettings>('google');if(!body||typeof body.enabled!=='boolean')return c.json({ok:false,reason:'Date invalide.'},400);const config:GoogleSettings={enabled:body.enabled,clientId:String(body.clientId??''),redirectUri:String(body.redirectUri??''),clientSecret:typeof body.clientSecret==='string'&&body.clientSecret?body.clientSecret:old?.clientSecret??''};try{if(config.enabled&&!validGoogleSettings(config))throw Error();}catch{return c.json({ok:false,reason:'Client OAuth și redirect HTTPS valide necesare (HTTP numai localhost).'},400);}auth.users.database.write('google',config);const me=adminOf(c)!;await auth.audit({actor:{id:me.userId,name:me.name,role:me.role},action:'user.update',ok:true,detail:'Google identity configuration changed',ip:auth.clientIp(c)});return c.json({ok:true});});
  const securityAttempts=new Map<string,{count:number;until:number}>();
  router.use('/security/*',async(c,next)=>{
    if(c.req.method==='GET')return next();const id=adminOf(c)?.userId??'';const now=Date.now();
    for(const [key,bucket] of securityAttempts)if(bucket.until<=now)securityAttempts.delete(key);
    const bucket=securityAttempts.get(id)??{count:0,until:now+300000};securityAttempts.set(id,bucket);
    if(++bucket.count>10)return c.json({ok:false,reason:'Prea multe încercări. Așteaptă 5 minute.'},429);
    return next();
  });
  router.get('/security',c=>c.json({...auth.users.securityStatus(adminOf(c)!.userId),christophExists:auth.users.list().some(u=>u.name.toLowerCase()==='christoph'),user:auth.users.list().find(u=>u.id===adminOf(c)!.userId)}));
  router.post('/security/:action',async c=>{
    const me=adminOf(c)!;let body:Record<string,unknown>;try{body=await c.req.json();if(!body||typeof body!=='object')throw Error();}catch{return c.json({ok:false,reason:'Corp invalid'},400);}
    const password=typeof body.password==='string'?body.password:'',code=typeof body.code==='string'?body.code.slice(0,64):'';
    if(password.length>128)return c.json({ok:false,reason:'Parolă prea lungă'},400);
    const action=c.req.param('action');
    if(action==='mfa-start'){
      const result=await auth.users.beginMfa(me.userId,password);
      await auth.audit({actor:{id:me.userId,name:me.name,role:me.role},action:'user.update',target:{kind:'user',id:me.userId},ok:result.ok,detail:'Account security: mfa-start',ip:auth.clientIp(c)});
      if(!result.ok)return c.json(result,result.status as 400);
      return c.json({ok:true,...result.value,qr:await QRCode.toDataURL(result.value.uri,{width:256,margin:2})});
    }
    const result=action==='create-christoph'?await auth.users.createPasswordAccount('Christoph',password):action==='mfa-confirm'?await auth.users.confirmMfa(me.userId,code):action==='mfa-disable'?await auth.users.changeSecurity(me.userId,password,code):action==='password'?await auth.users.changeSecurity(me.userId,password,code,typeof body.newPassword==='string'?body.newPassword:'') : null;
    if(!result)return c.json({ok:false,reason:'Acțiune necunoscută'},400);
    await auth.audit({actor:{id:me.userId,name:me.name,role:me.role},action:action==='create-christoph'?'user.create':'user.update',target:{kind:'user',id:action==='create-christoph'&&result.ok&&'id' in result.value?result.value.id:me.userId},ok:result.ok,detail:`Account security: ${action}`,ip:auth.clientIp(c)});
    if(!result.ok)return c.json(result,result.status as 400);
    if(action!=='create-christoph')await auth.revokeUser(me.userId,{code:4401,reason:'Securitatea contului s-a schimbat'},me.token);
    return c.json({ok:true,...result.value});
  });

  router.get("/overview", async (c) => {
    const me = adminOf(c);
    if (!me) return c.json({ ok: false, reason: "Necesită rolul admin", code: 4403 }, 403);
    const auditInfo = auditLog ? await auditLog.tail(1).then((t) => ({ available: !auditLog.degraded, entries: t.total })) : { available: false, entries: 0 };
    const result: AdminOverview = {
      version: 2,
      currentUser: { id: me.userId, name: me.name, role: me.role },
      users: auth.users.list().map((u) => ({ id: u.id, name: u.name, role: u.role, disabled: !!u.disabled, authentication:u.authentication,mfaEnabled:u.mfaEnabled,failedAttempts:u.failedAttempts,lockedAt:u.lockedAt,mustChangeCredential:u.mustChangeCredential,email:u.email,provider:u.provider, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt })),
      // Explicit projection: the token never leaves the server, only its opaque id does.
      sessions: auth
        .sessions()
        .map((s) => ({ id: auth.sessionIdOf(s.token), userId: s.userId, name: s.name, role: s.role, createdAt: s.createdAt, expiresAt: s.expiresAt, current: s.token === me.token,deviceId:s.deviceId,userAgent:s.userAgent,ip:s.ip,lastSeenAt:s.lastSeenAt,authMethod:s.authMethod }))
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

  if(dashboard)router.route('/',createAdminDashboard(dashboard));
  return router;
}
