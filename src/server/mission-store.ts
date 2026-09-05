import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { MissionRecord } from '../shared/mission';

/** One transaction commits the accepted state and its ACK. No network work inside it. */
export class MissionStore {
  private db: DatabaseSync;
  constructor(file: string) {
    mkdirSync(path.dirname(file), {recursive: true});
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
      INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_version);
      CREATE TABLE IF NOT EXISTS missions(run_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mission_events(run_id TEXT NOT NULL, event_id TEXT NOT NULL, payload TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(run_id,event_id));
      CREATE TABLE IF NOT EXISTS mission_artifacts(run_id TEXT NOT NULL, artifact_id TEXT NOT NULL, hash TEXT NOT NULL, path TEXT NOT NULL, PRIMARY KEY(run_id,artifact_id));`);
    const row = this.db.prepare('SELECT version FROM schema_version').get();
    if (row?.version !== 1) throw new Error('Versiune SQLite incompatibilă; datele sunt păstrate.');
  }
  save(record: MissionRecord): void {
    this.db.prepare('INSERT INTO missions VALUES(?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET updated_at=excluded.updated_at,status=excluded.status,body=excluded.body')
      .run(record.runId,new Date().toISOString(),record.status,JSON.stringify(record));
  }
  get(id: string): MissionRecord | null {
    const row=this.db.prepare('SELECT body FROM missions WHERE run_id=?').get(id);
    return row ? JSON.parse(String(row.body)) as MissionRecord : null;
  }
  list(limit=100): MissionRecord[] {
    return this.db.prepare('SELECT body FROM missions ORDER BY updated_at DESC LIMIT ?').all(limit).map(r=>JSON.parse(String(r.body)) as MissionRecord);
  }
  recoverable(): MissionRecord | null { return this.list().find(r=>r.status==='active') ?? null; }
  event(run: string, id: string): {payload:string;response:unknown}|null {
    const r=this.db.prepare('SELECT payload,response FROM mission_events WHERE run_id=? AND event_id=?').get(run,id);
    return r ? {payload:String(r.payload),response:JSON.parse(String(r.response))} : null;
  }
  accept(record: MissionRecord, id: string, payload: string, response: unknown): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO mission_events VALUES(?,?,?,?)').run(record.runId,id,payload,JSON.stringify(response));
      this.save(record); this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  artifact(run:string,id:string,hash:string,file:string):'accepted'|'duplicate'|'conflict' {
    const previous=this.db.prepare('SELECT hash FROM mission_artifacts WHERE run_id=? AND artifact_id=?').get(run,id);
    if(previous)return previous.hash===hash?'duplicate':'conflict';
    this.db.prepare('INSERT INTO mission_artifacts VALUES(?,?,?,?)').run(run,id,hash,file);return 'accepted';
  }
  close():void {this.db.close();}
}
