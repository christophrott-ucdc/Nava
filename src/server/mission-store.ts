import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { MissionRecord } from '../shared/mission';

const SCHEMA_VERSION = 2;

/** One transaction commits the accepted state and its ACK. No network work inside it. */
export class MissionStore {
  private readonly db: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();

  constructor(file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    try {
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;');
      this.migrate();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  /** Ordered migrations, committed together; old v1 data and event IDs remain untouched. */
  private migrate(): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL)');
      const versions = this.db.prepare('SELECT version FROM schema_version').all();
      let version = versions.length === 0 ? 0 : Number(versions[0].version);
      if (versions.length > 1 || !Number.isInteger(version) || version < 0 || version > SCHEMA_VERSION) {
        throw new Error('Versiune SQLite incompatibilă; datele sunt păstrate.');
      }
      if (version === 0) {
        this.db.exec(
          'CREATE TABLE IF NOT EXISTS missions(run_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL);' +
          'CREATE TABLE IF NOT EXISTS mission_events(run_id TEXT NOT NULL, event_id TEXT NOT NULL, payload TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(run_id,event_id));' +
          'CREATE TABLE IF NOT EXISTS mission_artifacts(run_id TEXT NOT NULL, artifact_id TEXT NOT NULL, hash TEXT NOT NULL, path TEXT NOT NULL, PRIMARY KEY(run_id,artifact_id));'
        );
        version = 1;
      }
      if (version === 1) {
        this.db.exec('CREATE INDEX IF NOT EXISTS missions_status_updated ON missions(status, updated_at DESC); CREATE INDEX IF NOT EXISTS missions_updated ON missions(updated_at DESC);');
        version = 2;
      }
      this.db.exec('DELETE FROM schema_version');
      this.db.prepare('INSERT INTO schema_version(version) VALUES(?)').run(version);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) { statement = this.db.prepare(sql); this.statements.set(sql, statement); }
    return statement;
  }

  save(record: MissionRecord): void {
    this.statement('INSERT INTO missions(run_id,updated_at,status,body) VALUES(?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET updated_at=excluded.updated_at,status=excluded.status,body=excluded.body')
      .run(record.runId, new Date().toISOString(), record.status, JSON.stringify(record));
  }
  get(id: string): MissionRecord | null {
    const row = this.statement('SELECT body FROM missions WHERE run_id=?').get(id);
    return row ? JSON.parse(String(row.body)) as MissionRecord : null;
  }
  list(limit = 100): MissionRecord[] {
    const bounded = Number.isFinite(limit) ? Math.min(10000, Math.max(0, Math.floor(limit))) : 100;
    return this.statement('SELECT body FROM missions ORDER BY updated_at DESC LIMIT ?').all(bounded).map(row => JSON.parse(String(row.body)) as MissionRecord);
  }
  recoverable(): MissionRecord | null {
    const row = this.statement("SELECT body FROM missions WHERE status='active' ORDER BY updated_at DESC LIMIT 1").get();
    return row ? JSON.parse(String(row.body)) as MissionRecord : null;
  }
  event(run: string, id: string): { payload: string; response: unknown } | null {
    const row = this.statement('SELECT payload,response FROM mission_events WHERE run_id=? AND event_id=?').get(run, id);
    return row ? { payload: String(row.payload), response: JSON.parse(String(row.response)) } : null;
  }
  accept(record: MissionRecord, id: string, payload: string, response: unknown): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.statement('INSERT INTO mission_events(run_id,event_id,payload,response) VALUES(?,?,?,?)').run(record.runId, id, payload, JSON.stringify(response));
      this.save(record);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  artifact(run: string, id: string, hash: string, file: string): 'accepted' | 'duplicate' | 'conflict' {
    const previous = this.statement('SELECT hash FROM mission_artifacts WHERE run_id=? AND artifact_id=?').get(run, id);
    if (previous) return previous.hash === hash ? 'duplicate' : 'conflict';
    this.statement('INSERT INTO mission_artifacts(run_id,artifact_id,hash,path) VALUES(?,?,?,?)').run(run, id, hash, file);
    return 'accepted';
  }
  close(): void { this.statements.clear(); this.db.close(); }
}
