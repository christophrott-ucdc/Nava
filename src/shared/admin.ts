import type { UserRole } from "./types";

/**
 * Contract for the admin UI (/admin/). This describes what the page reads and sends; it does NOT
 * replace the server-side guards (auth.requireRole / usersRouter) — every mutation is re-checked there.
 */

export const ADMIN_ROLES: readonly UserRole[] = ["viewer", "operator", "admin"];

export const ROLE_LABELS: Record<UserRole, string> = { viewer: "Observator", operator: "Operator", admin: "Administrator" };

/** One-sentence Romanian explanation per role, shown next to the role selector. */
export const ROLE_HELP: Record<UserRole, string> = {
  viewer: "Poate privi consola, depanarea și analitica, fără să trimită comenzi.",
  operator: "Conduce show-ul: pornire, pauză, repetiție, lumini, replici live.",
  admin: "Tot ce poate operatorul, plus conturi, sesiuni și configurarea instalației.",
};

export const ADMIN_PERMISSIONS = {
  "admin.read": ["admin"],
  "users.manage": ["admin"],
  "sessions.read": ["admin"],
  "sessions.revoke": ["admin"],
  "audit.read": ["admin"],
  "installation.manage": ["admin"],
} as const;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

export function hasAdminPermission(role: UserRole, permission: AdminPermission): boolean {
  return (ADMIN_PERMISSIONS[permission] as readonly string[]).includes(role);
}

export interface AdminUser {
  id: string;
  name: string;
  role: UserRole;
  disabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

/**
 * A session as seen by the admin. `id` is an opaque, server-derived identifier (a hash of the token) —
 * it can be used to revoke the session but can never be turned back into the token.
 */
export interface AdminSession {
  id: string;
  userId: string;
  name: string;
  role: UserRole;
  createdAt: string;
  expiresAt: string;
  /** True for the session that made this request. */
  current: boolean;
}

export type AuditAction =
  | "user.create"
  | "user.update"
  | "user.pin"
  | "user.delete"
  | "session.revoke"
  | "session.revoke-user"
  | "auth.login"
  | "auth.logout";

/** Persistent record of an administrative change. Never contains PINs, hashes or tokens. */
export interface AuditEntry {
  /** ISO timestamp. */
  t: string;
  actor: { id: string; name: string; role: UserRole } | null;
  action: AuditAction;
  target?: { kind: "user" | "session"; id: string; name?: string };
  ok: boolean;
  /** Human-readable outcome, in Romanian, safe to show. */
  detail?: string;
  ip?: string;
}

export interface AdminOverview {
  version: 2;
  currentUser: { id: string; name: string; role: UserRole };
  users: AdminUser[];
  sessions: AdminSession[];
  permissions: AdminPermission[];
  audit: { available: boolean; entries: number };
  /** Server time when the overview was produced; the UI shows it as "actualizat la". */
  generatedAt: string;
}

export interface AdminAuditResponse {
  entries: AuditEntry[];
  total: number;
}
