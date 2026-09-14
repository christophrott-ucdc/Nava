import {IdentityDatabase,type IdentityProtection} from './identity-db';
import { BUNDLED_ADMIN } from './bundled-admin';
/** Encrypted SQLite identity store; imports legacy JSON once. No default account or password. */

import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import {newTotpSecret,matchTotp,sealSecret,openSecret} from './totp';
import { promises as fs } from "node:fs";
import path from "node:path";
import type { UserRecord, UserRole, UsersFile } from "../shared/types";
import type { LogFn } from "./runlog";

export const ROLE_RANK: Record<UserRole, number> = { viewer: 1, operator: 2, admin: 3 };
const PIN_RE = /^\d{4,8}$/;
const KEY_LEN = 32;
const SCRYPT_OPTS = { N: 131072, r: 8, p: 1, maxmem: 256*1024*1024 };
const LEGACY_SCRYPT_OPTS={N:16384,r:8,p:1};

export interface PublicUser {
  authentication?:'pin'|'password';
  mfaEnabled?:boolean;
  failedAttempts?:number;lockedAt?:string;mustChangeCredential?:boolean;email?:string;provider?:string;
  id: string;
  name: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt?: string;
  disabled?: boolean;
}

export type UsersResult<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

async function hashPin(pin: string, salt: string,legacy=false): Promise<string> {
  return new Promise((resolve,reject)=>scrypt(pin,salt,KEY_LEN,legacy?LEGACY_SCRYPT_OPTS:SCRYPT_OPTS,(error,key)=>error?reject(error):resolve(key.toString("hex"))));
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function toPublicUser(u: UserRecord): PublicUser {
  return { id: u.id, name: u.name, role: u.role, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, disabled: u.disabled,authentication:u.passwordHash?'password':'pin',mfaEnabled:!!u.mfa,failedAttempts:u.failedAttempts??0,lockedAt:u.lockedAt,mustChangeCredential:u.mustChangeCredential,email:u.email,provider:u.googleSub?'google':'local' };
}

export class UsersStore {
  private users: UserRecord[] = [];
  private loaded = false;
  private mutations:Promise<unknown>=Promise.resolve();
  private mutate<T>(operation:()=>Promise<T>):Promise<T>{const result=this.mutations.then(async()=>{const before=structuredClone(this.users);try{const result=await operation();if(result&&typeof result==="object"&&"ok" in result&&result.ok===false&&'status' in result)this.users=before;return result;}catch(error){this.users=before;throw error;}});this.mutations=result.catch(()=>{});return result;}
  private writing: Promise<void> = Promise.resolve();

  readonly database:IdentityDatabase;
  constructor(
    private readonly filePath: string,
    private readonly defaultAdminPin: string,
    private readonly log: LogFn,
    protection?:IdentityProtection,
  ) {this.database=new IdentityDatabase(path.dirname(filePath),protection);}

  get path(): string {
    return this.filePath;
  }

  async load():Promise<void>{
    if(this.loaded)return;this.database.init();
    const saved=this.database.read<UserRecord[]>('users');
    if(saved!==null){if(!Array.isArray(saved)||!saved.every(isUserRecord))throw Error('Invalid identity database');this.users=saved;if(this.users.some(u=>u.mfa||u.mfaPending))await this.credentialKey();await this.cleanupLegacy();this.loaded=true;return;}
    let legacy:UsersFile|null=null;try{legacy=JSON.parse(await fs.readFile(this.filePath,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(legacy){if(!Array.isArray(legacy.users)||!legacy.users.length||!legacy.users.every(isUserRecord))throw Error('Invalid legacy account store');this.users=structuredClone(legacy.users);
      for(const user of this.users)if(!user.passwordHash&&user.credentialVersion!==2&&safeEqualHex(await hashPin('4078',user.salt,true),user.pinHash)){user.disabled=true;user.mustChangeCredential=true;}
    }
    if(legacy){if(this.users.some(u=>u.mfa||u.mfaPending))await this.credentialKey();this.database.write('legacy-users-backup',legacy);}
    await this.save();await this.cleanupLegacy();this.loaded=true;
  }
  private async cleanupLegacy(){const backup=this.database.read<UsersFile>('legacy-users-backup');if(!backup)return;try{const current=JSON.parse(await fs.readFile(this.filePath,'utf8'));if(JSON.stringify(current)===JSON.stringify(backup))await fs.unlink(this.filePath);else this.log('warn','Legacy identity file differs from imported backup; it was preserved and is not active.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  needsSetup(){return !this.users.some(user=>user.role==='admin'&&!user.disabled&&!user.lockedAt);}
  applyBundledAdministrator():Promise<string|null>{return this.mutate(async()=>{
    if(this.database.read('bundled-admin-revision')===BUNDLED_ADMIN.revision)return null;
    let user=this.findByName(BUNDLED_ADMIN.name);
    if(user&&(user.googleSub||user.role!=='admin'))throw Error('Contul Christoph existent nu este administrator local; configurarea necesită rezolvarea conflictului.');
    if(!user){
      user=await this.build(BUNDLED_ADMIN.name,'admin',randomBytes(32).toString('hex'));
      this.users.push(user);
    }
    user.passwordSalt=BUNDLED_ADMIN.salt;user.passwordHash=BUNDLED_ADMIN.hash;
    user.credentialVersion=2;user.mustChangeCredential=false;
    // Existing MFA, disabled state and lockout remain authoritative.
    await this.save();this.database.write('bundled-admin-revision',BUNDLED_ADMIN.revision);
    return user.id;
  });}
  list(): PublicUser[] {
    return this.users.map(toPublicUser);
  }

  get(id: string): UserRecord | undefined {
    return this.users.find((u) => u.id === id);
  }

  /** PIN-only login: returns the (enabled) user whose hash matches. Constant work regardless of outcome. */
  async verifyPin(pin: string): Promise<UserRecord | null> {
    if (!PIN_RE.test(pin)) return null;
    let found: UserRecord | null = null;
    for (const u of this.users) {
      const ok = safeEqualHex(await hashPin(pin, u.salt,u.credentialVersion!==2), u.pinHash);
      if (ok && !u.passwordHash && !u.disabled && !found) found = u;
    }
    return found;
  }

  touchLogin(id: string): Promise<void> {return this.mutate(()=>this.touchLoginUnlocked(id));}
  async verifyPassword(name:string,password:string):Promise<UserRecord|null>{
    if(typeof name!=='string'||typeof password!=='string'||name.length>32||password.length>128)return null;
    const user=this.users.find(u=>u.name.toLowerCase()===name.trim().toLowerCase());
    const hash=await hashPin(password,user?.passwordSalt??'missing-account-salt',!!user&&user.credentialVersion!==2);
    return user?.passwordHash&&!user.disabled&&safeEqualHex(hash,user.passwordHash)?user:null;
  }

  createPasswordAccount(name:string,password:string,role:UserRole='admin'):Promise<UsersResult<PublicUser>> {return this.mutate(async()=>{
    if(!Object.hasOwn(ROLE_RANK,role))return {ok:false,status:400,reason:'Rol invalid.'};
    if(!/^[\p{L}\p{N} ._-]{2,32}$/u.test(name)||typeof password!=='string'||!this.validCredential(password,true))return {ok:false,reason:'Nume de 2–32 caractere și parolă de 15–128 caractere necesare.',status:400};
    if(this.users.some(u=>u.name.toLowerCase()===name.toLowerCase()))return {ok:false,reason:'Contul există deja.',status:409};
    if(this.users.length>=500)return {ok:false,reason:'Limita de conturi a fost atinsă.',status:400};
    const user=await this.build(name,role,randomBytes(32).toString('hex'));
    user.credentialVersion=2;user.passwordSalt=randomBytes(16).toString('hex');user.passwordHash=await hashPin(password,user.passwordSalt);
    this.users.push(user);await this.save();return {ok:true,value:toPublicUser(user)};
  });}


  findByName(name:string){return this.users.find(u=>u.name.toLowerCase()===name.trim().toLowerCase());}
  authenticate(name:string,credential:string,code:string,newCredential?:string):Promise<{ok:boolean;user?:UserRecord;factorRequired?:boolean;changeRequired?:boolean;locked?:boolean}>{return this.mutate(async()=>{
    const user=this.findByName(name);
    if(!user||user.disabled||user.googleSub){await hashPin(credential,'unknown-user');return {ok:false};}
    if(user.lockedAt)return {ok:false,locked:true};
    const valid=safeEqualHex(await hashPin(credential,user.passwordSalt??user.salt,user.credentialVersion!==2),user.passwordHash??user.pinHash);
    const failure=async()=>{user.failedAttempts=(user.failedAttempts??0)+1;if(user.failedAttempts>=5)user.lockedAt=new Date().toISOString();await this.save();return {ok:false,locked:!!user.lockedAt};};
    if(!valid)return failure();
    if(user.credentialVersion!==2&&!this.validCredential(credential,!!user.passwordHash))user.mustChangeCredential=true;
    if(user.mfa&&!code)return {ok:false,factorRequired:true};
    if(user.mustChangeCredential&&newCredential===undefined)return {ok:false,changeRequired:true,factorRequired:!!user.mfa};
    if(newCredential!==undefined&&(newCredential===credential||!this.validCredential(newCredential,!!user.passwordHash)))return {ok:false,changeRequired:true};
    if(user.mfa&&!await this.consumeFactor(user,code))return failure();
    if(newCredential!==undefined||user.credentialVersion!==2){const value=newCredential??credential;user.credentialVersion=2;if(user.passwordHash){user.passwordSalt=randomBytes(16).toString('hex');user.passwordHash=await hashPin(value,user.passwordSalt);}else{user.salt=randomBytes(16).toString('hex');user.pinHash=await hashPin(value,user.salt);}user.mustChangeCredential=false;}
    user.failedAttempts=0;delete user.lockedAt;user.lastLoginAt=new Date().toISOString();await this.save();return {ok:true,user};
  });}
  private validCredential(value:string,password:boolean){return password?value.length>=15&&value.length<=128&&!/^(.)\1+$/.test(value):/^\d{6,8}$/.test(value)&&!['123456','1234567','12345678','87654321','654321'].includes(value)&&!/^(.)\1+$/.test(value);}
  unlock(id:string):Promise<UsersResult<PublicUser>>{return this.mutate(async()=>{const u=this.get(id);if(!u)return {ok:false,status:404,reason:'Cont inexistent.'};u.failedAttempts=0;delete u.lockedAt;await this.save();return {ok:true,value:toPublicUser(u)};});}
  resetCredential(id:string,value:string,kind:'password'|'pin'):Promise<UsersResult<PublicUser>>{return this.mutate(async()=>{const u=this.get(id);if(!u)return {ok:false,status:404,reason:'Cont inexistent.'};if(u.googleSub)return {ok:false,status:400,reason:'Parola Google se gestionează în Google Workspace.'};if(!this.validCredential(value,kind==='password'))return {ok:false,status:400,reason:'Parolă de minimum 15 caractere sau PIN de 6–8 cifre fără secvențe triviale.'};
    u.credentialVersion=2;if(kind==='password'){u.passwordSalt=randomBytes(16).toString('hex');u.passwordHash=await hashPin(value,u.passwordSalt);}else{delete u.passwordHash;delete u.passwordSalt;u.salt=randomBytes(16).toString('hex');u.pinHash=await hashPin(value,u.salt);}u.mustChangeCredential=true;u.failedAttempts=0;delete u.lockedAt;await this.save();return {ok:true,value:toPublicUser(u)};
  });}
  requireCredentialChange(id:string):Promise<void>{return this.mutate(async()=>{const u=this.get(id);if(u){u.mustChangeCredential=true;await this.save();}});}
  provisionGoogle(sub:string,email:string):Promise<UsersResult<UserRecord>>{return this.mutate(async()=>{
    let user=this.users.find(u=>u.googleSub===sub);
    if(!user){if(this.users.some(u=>u.name.toLowerCase()===email.toLowerCase()||u.email?.toLowerCase()===email.toLowerCase()))return {ok:false,status:409,reason:'Un cont local folosește această adresă. Asocierea automată este refuzată.'};if(this.users.length>=500)return {ok:false,status:409,reason:'Limita de conturi a fost atinsă.'};user=await this.build(email,'viewer',randomBytes(32).toString('hex'));user.googleSub=sub;user.email=email;this.users.push(user);}
    if(user.disabled||user.lockedAt)return {ok:false,status:403,reason:'Contul este blocat sau dezactivat.'};user.email=email;user.lastLoginAt=new Date().toISOString();await this.save();return {ok:true,value:user};
  });}
  private async credentialKey():Promise<Buffer>{
    const saved=this.database.read<string>('mfa-key');if(saved){const key=Buffer.from(saved,'base64');if(key.length!==32)throw Error('Credential encryption key is invalid');const oldFile=path.join(path.dirname(this.filePath),'auth.key');try{const old=await fs.readFile(oldFile);if(!old.equals(key))throw Error('Conflicting legacy MFA key; restore a consistent identity backup.');await fs.unlink(oldFile);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}return key;}
    const file=path.join(path.dirname(this.filePath),'auth.key');let key:Buffer;
    try{key=await fs.readFile(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(this.users.some(u=>u.mfa||u.mfaPending))throw Error('Credential encryption key is missing; restore the identity backup.');key=randomBytes(32);}
    if(key.length!==32)throw Error('Credential encryption key is invalid');this.database.write('mfa-key',key.toString('base64'));await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});return key;
  }
  private recoveryHash(code:string):string{return createHash('sha256').update(code.replaceAll('-','').trim().toLowerCase()).digest('hex');}
  private async consumeFactor(user:UserRecord,code:string):Promise<boolean>{
    if(!user.mfa)return true;
    const recoveryHash=this.recoveryHash(code),index=user.mfa.recoveryHashes.findIndex(h=>safeEqualHex(h,recoveryHash));
    if(index>=0){user.mfa.recoveryHashes.splice(index,1);return true;}
    const counter=matchTotp(openSecret(user.mfa.secret,await this.credentialKey()),code,user.mfa.lastCounter);
    if(counter===null)return false;user.mfa.lastCounter=counter;return true;
  }
  verifySecondFactor(id:string,code:string):Promise<boolean>{return this.mutate(async()=>{
    const user=this.get(id);if(!user||user.disabled)return false;
    if(!await this.consumeFactor(user,code))return false;
    if(user.mfa)await this.save();return true;
  });}

  securityStatus(id:string){const user=this.get(id);return {passwordEnabled:!!user?.passwordHash,mfaEnabled:!!user?.mfa,recoveryCodesRemaining:user?.mfa?.recoveryHashes.length??0};}
  beginMfa(id:string,password:string):Promise<UsersResult<{secret:string;uri:string}>>{return this.mutate(async()=>{
    const user=this.get(id);if(!user||!(await this.verifyPassword(user.name,password)))return {ok:false,reason:'Parolă incorectă.',status:401};
    if(user.mfa)return {ok:false,reason:'MFA este deja activ.',status:409};
    const secret=newTotpSecret();user.mfaPending={secret:sealSecret(secret,await this.credentialKey()),expiresAt:Date.now()+600000};await this.save();
    return {ok:true,value:{secret,uri:`otpauth://totp/${encodeURIComponent('EXODUS7:'+user.name)}?secret=${secret}&issuer=EXODUS7&algorithm=SHA1&digits=6&period=30`}};
  });}
  confirmMfa(id:string,code:string):Promise<UsersResult<{recoveryCodes:string[]}>>{return this.mutate(async()=>{
    const user=this.get(id),pending=user?.mfaPending;if(!user||!pending||pending.expiresAt<Date.now()||user.mfa)return {ok:false,reason:'Configurarea MFA a expirat. Reia configurarea.',status:409};
    const counter=matchTotp(openSecret(pending.secret,await this.credentialKey()),code);
    if(counter===null)return {ok:false,reason:'Cod incorect. Verifică ora telefonului.',status:401};
    const recoveryCodes=Array.from({length:8},()=>randomBytes(16).toString('hex').match(/.{8}/g)!.join('-'));
    user.mfa={secret:pending.secret,lastCounter:counter,recoveryHashes:recoveryCodes.map(c=>this.recoveryHash(c))};delete user.mfaPending;await this.save();return {ok:true,value:{recoveryCodes}};
  });}
  changeSecurity(id:string,password:string,code:string,newPassword?:string):Promise<UsersResult<PublicUser>>{return this.mutate(async()=>{
    const user=this.get(id);if(!user||!(await this.verifyPassword(user.name,password)))return {ok:false,reason:'Parolă incorectă.',status:401};
    if(newPassword!==undefined&&(newPassword.length<15||newPassword.length>128))return {ok:false,reason:'Parola trebuie să aibă 12–128 caractere.',status:400};
    if(!await this.consumeFactor(user,code))return {ok:false,reason:'Cod MFA sau cod de recuperare incorect.',status:401};
    if(newPassword!==undefined){user.passwordSalt=randomBytes(16).toString('hex');user.passwordHash=await hashPin(newPassword,user.passwordSalt);}
    else {delete user.mfa;delete user.mfaPending;}
    await this.save();return {ok:true,value:toPublicUser(user)};
  });}
  private async touchLoginUnlocked(id: string): Promise<void> {
    const u = this.get(id);
    if (!u) return;
    u.lastLoginAt = new Date().toISOString();
    await this.save();
  }

  create(name: string, role: UserRole, pin: string): Promise<UsersResult<PublicUser>> {return this.mutate(()=>this.createUnlocked(name,role,pin));}
  private async createUnlocked(name: string, role: UserRole, pin: string): Promise<UsersResult<PublicUser>> {
    const cleanName = String(name ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 32);
    if (!cleanName) return { ok: false, reason: "Numele lipsește", status: 400 };
    if (!(Object.hasOwn(ROLE_RANK,role))) return { ok: false, reason: "Rol invalid (admin | operator | viewer)", status: 400 };
    if (!PIN_RE.test(pin)) return { ok: false, reason: "PIN-ul trebuie să aibă 4–8 cifre", status: 400 };
    if (await this.pinTaken(pin)) return { ok: false, reason: "PIN-ul este deja folosit de alt utilizator", status: 409 };
    if (this.users.some((u) => u.name.toLowerCase() === cleanName.toLowerCase())) {
      return { ok: false, reason: "Există deja un utilizator cu acest nume", status: 409 };
    }
    if (this.users.length >= 500) return { ok: false, reason: "Prea mulți utilizatori (max 500)", status: 400 };
    const user = await this.build(cleanName, role, pin);
    this.users.push(user);
    await this.save();
    this.log("info", `users: created ${role} "${cleanName}"`);
    return { ok: true, value: toPublicUser(user) };
  }

  setPin(id: string, pin: string): Promise<UsersResult<PublicUser>> {return this.mutate(()=>this.setPinUnlocked(id,pin));}
  private async setPinUnlocked(id: string, pin: string): Promise<UsersResult<PublicUser>> {
    const u = this.get(id);
    if (!u) return { ok: false, reason: "Utilizator inexistent", status: 404 };
    if(u.passwordHash)return {ok:false,reason:"Acest cont folosește parolă. Folosește pagina Parolă & MFA.",status:400};
    if (!PIN_RE.test(pin)) return { ok: false, reason: "PIN-ul trebuie să aibă 4–8 cifre", status: 400 };

    if (await this.pinTaken(pin, id)) return { ok: false, reason: "PIN-ul este deja folosit", status: 409 };
    u.credentialVersion=2;u.salt = randomBytes(16).toString("hex");
    u.pinHash = await hashPin(pin, u.salt);
    await this.save();
    this.log("info", `users: PIN changed for "${u.name}"`);
    return { ok: true, value: toPublicUser(u) };
  }

  update(id: string, patch: { name?: string; role?: UserRole; disabled?: boolean }, actorId: string): Promise<UsersResult<PublicUser>> {return this.mutate(()=>this.updateUnlocked(id,patch,actorId));}
  private async updateUnlocked(id: string, patch: { name?: string; role?: UserRole; disabled?: boolean }, actorId: string): Promise<UsersResult<PublicUser>> {
    const u = this.get(id);
    if (!u) return { ok: false, reason: "Utilizator inexistent", status: 404 };
    if (patch.name !== undefined) {
      const cleanName = String(patch.name).replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 32);
      if (!cleanName) return { ok: false, reason: "Numele lipsește", status: 400 };
      if(this.users.some(other=>other.id!==id&&other.name.toLowerCase()===cleanName.toLowerCase()))return {ok:false,reason:"Există deja un utilizator cu acest nume",status:409};
      u.name = cleanName;
    }
    if (patch.role !== undefined) {
      if (!(Object.hasOwn(ROLE_RANK,patch.role))) return { ok: false, reason: "Rol invalid", status: 400 };
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

  remove(id: string, actorId: string): Promise<UsersResult<{ id: string }>> {return this.mutate(()=>this.removeUnlocked(id,actorId));}
  private async removeUnlocked(id: string, actorId: string): Promise<UsersResult<{ id: string }>> {
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

  private async pinTaken(pin: string, exceptId?: string): Promise<boolean> {
    for(const u of this.users)if(u.id!==exceptId&&safeEqualHex(await hashPin(pin,u.salt,u.credentialVersion!==2),u.pinHash))return true;
    return false;
  }

  private async build(name: string, role: UserRole, pin: string): Promise<UserRecord> {
    const salt = randomBytes(16).toString("hex");
    return { id: randomUUID(), name, role, salt, pinHash: await hashPin(pin, salt), credentialVersion:2, createdAt: new Date().toISOString() };
  }

  private save():Promise<void>{this.database.write('users',this.users);return Promise.resolve();}

}

function isUserRecord(x: unknown): x is UserRecord {
  if (!x || typeof x !== "object") return false;
  const u = x as Record<string, unknown>;
  return (
    (u.passwordHash===undefined || (typeof u.passwordHash==='string' && /^[a-f0-9]{64}$/.test(u.passwordHash) && typeof u.passwordSalt==='string')) &&
    (u.mfa===undefined || (!!u.mfa && typeof u.mfa==='object' && typeof (u.mfa as UserRecord['mfa'])!.secret==='string' && Number.isSafeInteger((u.mfa as UserRecord['mfa'])!.lastCounter) && Array.isArray((u.mfa as UserRecord['mfa'])!.recoveryHashes) && (u.mfa as UserRecord['mfa'])!.recoveryHashes.every(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)))) &&
    typeof u.id === "string" &&
    typeof u.name === "string" &&
    typeof u.role === "string" &&
    Object.hasOwn(ROLE_RANK,u.role) &&
    typeof u.pinHash === "string" &&
    typeof u.salt === "string" &&
    typeof u.createdAt === "string"
  );
}
