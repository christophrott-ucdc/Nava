/**
 * User store: `data/users.json` (relative to appRoot), PINs hashed with scrypt, roles admin|operator|viewer.
 * On first start (no file) an `admin` user is created with `config.security.operatorPin` (default 4078).
 * Login is PIN-only, so PINs are unique across users (enforced at create/reset time).
 */

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { UserRecord, UserRole, UsersFile } from "../shared/types";
import type { LogFn } from "./runlog";

export const ROLE_RANK: Record<UserRole, number> = { viewer: 1, operator: 2, admin: 3 };
const PIN_RE = /^\d{4,8}$/;
const KEY_LEN = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

export interface PublicUser {
  id: string;
  name: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt?: string;
  disabled?: boolean;
}

export type UsersResult<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, KEY_LEN, SCRYPT_OPTS).toString("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function toPublicUser(u: UserRecord): PublicUser {
  return { id: u.id, name: u.name, role: u.role, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, disabled: u.disabled };
}

export class UsersStore {
  private users: UserRecord[] = [];
  private loaded = false;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly defaultAdminPin: string,
    private readonly log: LogFn,
  ) {}

  get path(): string {
    return this.filePath;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<UsersFile>;
      this.users = Array.isArray(parsed.users) ? parsed.users.filter(isUserRecord) : [];
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") this.log("warn", "users.json unreadable — starting with an empty user list", { err: String(err) });
      this.users = [];
    }
    this.loaded = true;
    if (this.users.filter((u) => u.role === "admin" && !u.disabled).length === 0) {
      const pin = PIN_RE.test(this.defaultAdminPin) ? this.defaultAdminPin : "4078";
      const admin = this.build("admin", "admin", pin);
      this.users = this.users.filter((u) => u.role !== "admin").concat(admin);
      await this.save();
      this.log("warn", `users: created default admin with PIN ${pin} — change it before the first public show (POST /api/users/:id/pin)`, {
        file: this.filePath,
      });
    }
  }

  list(): PublicUser[] {
    return this.users.map(toPublicUser);
  }

  get(id: string): UserRecord | undefined {
    return this.users.find((u) => u.id === id);
  }

  /** PIN-only login: returns the (enabled) user whose hash matches. Constant work regardless of outcome. */
  verifyPin(pin: string): UserRecord | null {
    if (!PIN_RE.test(pin)) return null;
    let found: UserRecord | null = null;
    for (const u of this.users) {
      const ok = safeEqualHex(hashPin(pin, u.salt), u.pinHash);
      if (ok && !u.disabled && !found) found = u;
    }
    return found;
  }

  async touchLogin(id: string): Promise<void> {
    const u = this.get(id);
    if (!u) return;
    u.lastLoginAt = new Date().toISOString();
    await this.save();
  }

  async create(name: string, role: UserRole, pin: string): Promise<UsersResult<PublicUser>> {
    const cleanName = String(name ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 32);
    if (!cleanName) return { ok: false, reason: "Numele lipsește", status: 400 };
    if (!(role in ROLE_RANK)) return { ok: false, reason: "Rol invalid (admin | operator | viewer)", status: 400 };
    if (!PIN_RE.test(pin)) return { ok: false, reason: "PIN-ul trebuie să aibă 4–8 cifre", status: 400 };
    if (this.verifyPin(pin) || this.pinTaken(pin)) return { ok: false, reason: "PIN-ul este deja folosit de alt utilizator", status: 409 };
    if (this.users.some((u) => u.name.toLowerCase() === cleanName.toLowerCase())) {
      return { ok: false, reason: "Există deja un utilizator cu acest nume", status: 409 };
    }
    if (this.users.length >= 50) return { ok: false, reason: "Prea mulți utilizatori (max 50)", status: 400 };
    const user = this.build(cleanName, role, pin);
    this.users.push(user);
    await this.save();
    this.log("info", `users: created ${role} "${cleanName}"`);
    return { ok: true, value: toPublicUser(user) };
  }

  async setPin(id: string, pin: string): Promise<UsersResult<PublicUser>> {
    const u = this.get(id);
    if (!u) return { ok: false, reason: "Utilizator inexistent", status: 404 };
    if (!PIN_RE.test(pin)) return { ok: false, reason: "PIN-ul trebuie să aibă 4–8 cifre", status: 400 };
    const holder = this.verifyPin(pin);
    if ((holder && holder.id !== id) || this.pinTaken(pin, id)) return { ok: false, reason: "PIN-ul este deja folosit", status: 409 };
    u.salt = randomBytes(16).toString("hex");
    u.pinHash = hashPin(pin, u.salt);
    await this.save();
    this.log("info", `users: PIN changed for "${u.name}"`);
    return { ok: true, value: toPublicUser(u) };
  }

  async update(id: string, patch: { name?: string; role?: UserRole; disabled?: boolean }, actorId: string): Promise<UsersResult<PublicUser>> {
    const u = this.get(id);
    if (!u) return { ok: false, reason: "Utilizator inexistent", status: 404 };
    if (patch.name !== undefined) {
      const cleanName = String(patch.name).replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 32);
      if (!cleanName) return { ok: false, reason: "Numele lipsește", status: 400 };
      u.name = cleanName;
    }
    if (patch.role !== undefined) {
      if (!(patch.role in ROLE_RANK)) return { ok: false, reason: "Rol invalid", status: 400 };
      if (u.id === actorId && patch.role !== "admin") return { ok: false, reason: "Nu îți poți retrage propriul rol de admin", status: 400 };
      u.role = patch.role;
    }
    if (patch.disabled !== undefined) {
      if (u.id === actorId && patch.disabled) return { ok: false, reason: "Nu te poți dezactiva pe tine", status: 400 };
      u.disabled = !!patch.disabled;
    }
    if (this.users.filter((x) => x.role === "admin" && !x.disabled).length === 0) {
      return { ok: false, reason: "Trebuie să rămână cel puțin un admin activ", status: 400 };
    }
    await this.save();
    return { ok: true, value: toPublicUser(u) };
  }

  async remove(id: string, actorId: string): Promise<UsersResult<{ id: string }>> {
    const u = this.get(id);
    if (!u) return { ok: false, reason: "Utilizator inexistent", status: 404 };
    if (u.id === actorId) return { ok: false, reason: "Nu te poți șterge pe tine", status: 400 };
    const remaining = this.users.filter((x) => x.id !== id);
    if (!remaining.some((x) => x.role === "admin" && !x.disabled)) {
      return { ok: false, reason: "Trebuie să rămână cel puțin un admin activ", status: 400 };
    }
    this.users = remaining;
    await this.save();
    this.log("info", `users: removed "${u.name}"`);
    return { ok: true, value: { id } };
  }

  private pinTaken(pin: string, exceptId?: string): boolean {
    return this.users.some((u) => u.id !== exceptId && safeEqualHex(hashPin(pin, u.salt), u.pinHash));
  }

  private build(name: string, role: UserRole, pin: string): UserRecord {
    const salt = randomBytes(16).toString("hex");
    return { id: randomUUID(), name, role, salt, pinHash: hashPin(pin, salt), createdAt: new Date().toISOString() };
  }

  private save(): Promise<void> {
    const snapshot: UsersFile = { version: 1, users: this.users.map((u) => ({ ...u })) };
    this.writing = this.writing.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
      await fs.rename(tmp, this.filePath);
    });
    return this.writing;
  }
}

function isUserRecord(x: unknown): x is UserRecord {
  if (!x || typeof x !== "object") return false;
  const u = x as Record<string, unknown>;
  return (
    typeof u.id === "string" &&
    typeof u.name === "string" &&
    typeof u.role === "string" &&
    u.role in ROLE_RANK &&
    typeof u.pinHash === "string" &&
    typeof u.salt === "string" &&
    typeof u.createdAt === "string"
  );
}
