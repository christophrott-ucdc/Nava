/**
 * Run log: one JSONL file per show run in `runsDir/show-<YYYYMMDD-HHmmss>.jsonl`.
 * Every command, state transition, fired cue and tablet event is appended as one line:
 *   { "t": "<ISO time>", "kind": "<event kind>", "data": { ... } }
 * A new file is opened at server start and again on every `start` command.
 */

import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";

export type LogFn = (level: "info" | "warn" | "error", msg: string, data?: unknown) => void;

export interface RunLogEvent {
  t: string;
  kind: string;
  data?: unknown;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local-time stamp `YYYYMMDD-HHmmss` used in run file names. */
export function runStamp(d = new Date()): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

export class RunLog {
  private stream: WriteStream | null = null;
  private filePath: string | null = null;
  private tailBuf: RunLogEvent[] = [];
  private seq = 0;

  constructor(
    private readonly runsDir: string,
    private readonly log: LogFn,
    private readonly tailMax = 400,
  ) {}

  /** Absolute path of the current run file (null if the directory could not be created). */
  get currentPath(): string | null {
    return this.filePath;
  }

  /** Open a new JSONL file. Safe to call repeatedly (closes the previous one). */
  startRun(reason: string): string | null {
    this.closeStream();
    try {
      mkdirSync(this.runsDir, { recursive: true });
      // Avoid clobbering a file created in the same second (e.g. rapid start/restart).
      this.seq += 1;
      const suffix = this.seq > 1 ? `-${this.seq}` : "";
      const file = path.join(this.runsDir, `show-${runStamp()}${suffix}.jsonl`);
      this.stream = createWriteStream(file, { flags: "a" });
      this.stream.on("error", (err) => this.log("warn", "runlog write error", { err: String(err) }));
      this.filePath = file;
      this.write("run.open", { reason });
      return file;
    } catch (err) {
      this.log("warn", "runlog: cannot open run file", { err: String(err) });
      this.stream = null;
      this.filePath = null;
      return null;
    }
  }

  /** Append one event (also kept in the in-memory tail). */
  write(kind: string, data?: unknown): void {
    const ev: RunLogEvent = { t: new Date().toISOString(), kind, data };
    this.tailBuf.push(ev);
    if (this.tailBuf.length > this.tailMax) this.tailBuf.splice(0, this.tailBuf.length - this.tailMax);
    if (!this.stream) return;
    try {
      this.stream.write(`${JSON.stringify(ev)}\n`);
    } catch (err) {
      this.log("warn", "runlog write failed", { err: String(err) });
    }
  }

  /** Last `n` events (newest last). */
  tail(n = 50): RunLogEvent[] {
    return this.tailBuf.slice(-Math.max(0, n));
  }

  private closeStream(): void {
    if (this.stream) {
      try {
        this.stream.end();
      } catch {
        /* ignore */
      }
    }
    this.stream = null;
  }

  async close(): Promise<void> {
    const s = this.stream;
    this.stream = null;
    if (!s) return;
    await new Promise<void>((resolve) => {
      s.end(() => resolve());
    });
  }
}
