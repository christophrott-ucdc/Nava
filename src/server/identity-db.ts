import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { sealSecret, openSecret } from './totp';
export interface IdentityProtection {
    seal(value: string): Buffer;
    open(value: Buffer): string;
}
/** SQLite contains authenticated encrypted records; the wrapping key is DPAPI protected in Electron. */
export class IdentityDatabase {
    readonly file: string;
    readonly keyFile: string;
    private key!: Buffer;
    constructor(directory: string, private protection?: IdentityProtection) { this.file = path.join(directory, 'identity.sqlite'); this.keyFile = path.join(directory, 'identity.key'); }
    init() {
        mkdirSync(path.dirname(this.file), { recursive: true });
        if (existsSync(this.keyFile)) {
            const envelope = JSON.parse(readFileSync(this.keyFile, 'utf8'));
            if (envelope.mode === 'os') {
                if (!this.protection)
                    throw Error('Identitatea necesită profilul Windows/Electron care a creat cheia.');
                this.key = Buffer.from(this.protection.open(Buffer.from(envelope.key, 'base64')), 'base64');
            }
            else if (envelope.mode === 'file') {
                this.key = Buffer.from(envelope.key, 'base64');
                if (this.protection)
                    this.writeKey();
            }
            else
                throw Error('Format cheie identitate invalid.');
        }
        else {
            if (existsSync(this.file))
                throw Error('Cheia identității lipsește. Restaurează backupul; baza nu va fi recreată.');
            this.key = randomBytes(32);
            this.writeKey();
        }
        if (this.key.length !== 32)
            throw Error('Cheie identitate invalidă.');
        this.withDb(db => { db.exec('CREATE TABLE IF NOT EXISTS identity_records (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version=1'); });
    }
    private writeKey() {
        if (this.key.length !== 32) throw Error('Cheie identitate invalidă.');
        const value = this.key.toString('base64');
        const payload = JSON.stringify({ mode: this.protection ? 'os' : 'file', key: this.protection ? this.protection.seal(value).toString('base64') : value });
        const temporary = `${this.keyFile}.${randomBytes(8).toString('hex')}.tmp`;
        const descriptor = openSync(temporary, 'wx', 0o600);
        try { writeFileSync(descriptor, payload); fsyncSync(descriptor); }
        finally { closeSync(descriptor); }
        renameSync(temporary, this.keyFile);
    }
    private withDb<T>(fn: (db: DatabaseSync) => T): T { const db = new DatabaseSync(this.file); try {
        db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;');
        return fn(db);
    }
    finally {
        db.close();
        try {
            chmodSync(this.file, 0o600);
        }
        catch { }
    } }
    read<T>(id: string): T | null { return this.withDb(db => { const row = db.prepare('SELECT payload FROM identity_records WHERE id=?').get(id) as {
        payload: string;
    } | undefined; return row ? JSON.parse(openSecret(row.payload, this.key)) as T : null; }); }
    write(id: string, value: unknown) { const sealed = sealSecret(JSON.stringify(value), this.key); this.withDb(db => db.prepare('INSERT INTO identity_records(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(id, sealed, new Date().toISOString())); }
    get protectionMode() { return this.protection ? 'OS protected' : 'File key — restrict OS access'; }
}
