/**
 * JSONL logger for the main process: runs/app-<YYYYMMDD-HHmmss>.jsonl (under appRoot/runs) + console.
 * One line per entry: {"ts","level","src","msg","data"?}. Lines logged before initLogger() are buffered.
 *
 * Rotation (rotateRunLogs): only the newest KEEP_APP_LOGS `app-*.jsonl` files directly in runs/ are kept; older
 * ones are deleted at startup. `show-*.jsonl` (written by the server), PNGs and anything under runs/debug/ are
 * never touched (the server rotates its own files — P-05).
 */
import fs from "node:fs";
import path from "node:path";

export type LogLevel = "info" | "warn" | "error";
export type LogFn = (level: LogLevel, msg: string, data?: unknown) => void;

interface LogEntry {
  ts: string;
  level: LogLevel;
  src: string;
  msg: string;
  data?: unknown;
}

export const KEEP_APP_LOGS = 20;
/** app-20260904-183601.jsonl (an optional "-N" suffix is tolerated). */
const APP_LOG_RE = /^app-\d{8}-\d{6}(?:-\d+)?\.jsonl$/;

let stream: fs.WriteStream | null = null;
let filePath: string | null = null;
const pending: string[] = [];
const MAX_PENDING = 1000;

function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Errors are not JSON-serializable by default; keep name/message/stack. */
export function serializeData(data: unknown): unknown {
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack };
  }
  return data;
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, v: unknown) => {
      if (v instanceof Error) return serializeData(v);
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    });
  } catch (err) {
    return JSON.stringify({ unserializable: String(err) });
  }
}

/** Creates runsDir (if needed) and opens the run file. Returns the absolute log file path. */
export function initLogger(runsDir: string): string {
  fs.mkdirSync(runsDir, { recursive: true });
  filePath = path.join(runsDir, `app-${stamp()}.jsonl`);
  // createWriteStream opens the file asynchronously; create it now so rotateRunLogs() (called right after) sees it.
  try {
    fs.closeSync(fs.openSync(filePath, "a"));
  } catch {
    /* the stream's own error handler reports unwritable paths */
  }
  stream = fs.createWriteStream(filePath, { flags: "a" });
  stream.on("error", (err) => {
    console.error(`[logger] cannot write ${filePath}: ${err.message}`);
    stream = null;
  });
  for (const line of pending) stream.write(line);
  pending.length = 0;
  return filePath;
}

export interface RotationResult {
  /** app-*.jsonl files still present after rotation (the current run included). */
  kept: number;
  /** Absolute paths deleted. */
  deleted: string[];
  /** Files that could not be deleted (path -> error message). */
  failed: Array<{ file: string; error: string }>;
}

/**
 * Deletes the oldest `app-*.jsonl` files in `runsDir` so that at most `keep` remain (newest by file name, which
 * embeds the timestamp; the current run's file counts as one of them). Non-recursive; nothing else is touched.
 */
export function rotateRunLogs(runsDir: string, keep = KEEP_APP_LOGS): RotationResult {
  const result: RotationResult = { kept: 0, deleted: [], failed: [] };
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch (err) {
    result.failed.push({ file: runsDir, error: err instanceof Error ? err.message : String(err) });
    return result;
  }
  const current = filePath ? path.basename(filePath) : null;
  const names = new Set(entries.filter((e) => e.isFile() && APP_LOG_RE.test(e.name)).map((e) => e.name));
  if (current) names.add(current); // the current run counts as one of the `keep` files even if not flushed yet
  const appLogs = [...names].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // newest first (timestamps sort lexicographically)
  const victims = appLogs.slice(Math.max(0, keep)).filter((name) => name !== current);
  for (const name of victims) {
    const file = path.join(runsDir, name);
    try {
      fs.unlinkSync(file);
      result.deleted.push(file);
    } catch (err) {
      result.failed.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }
  result.kept = appLogs.length - result.deleted.length;
  return result;
}

export function getLogFilePath(): string | null {
  return filePath;
}

export function log(level: LogLevel, msg: string, data?: unknown, src = "main"): void {
  const entry: LogEntry = { ts: new Date().toISOString(), level, src, msg };
  if (data !== undefined) entry.data = serializeData(data);
  const line = `${safeStringify(entry)}\n`;
  if (stream) stream.write(line);
  else if (pending.length < MAX_PENDING) pending.push(line);

  const text = `[${entry.ts.slice(11, 19)}] ${level.toUpperCase().padEnd(5)} [${src}] ${msg}${
    data !== undefined ? ` ${safeStringify(entry.data)}` : ""
  }`;
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export function closeLogger(): Promise<void> {
  return new Promise((resolve) => {
    if (!stream) {
      resolve();
      return;
    }
    const s = stream;
    stream = null;
    s.end(() => resolve());
  });
}
