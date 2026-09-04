/**
 * JSONL logger for the main process: runs/app-<YYYYMMDD-HHmmss>.jsonl (under appRoot/runs) + console.
 * One line per entry: {"ts","level","src","msg","data"?}. Lines logged before initLogger() are buffered.
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
  stream = fs.createWriteStream(filePath, { flags: "a" });
  stream.on("error", (err) => {
    console.error(`[logger] cannot write ${filePath}: ${err.message}`);
    stream = null;
  });
  for (const line of pending) stream.write(line);
  pending.length = 0;
  return filePath;
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
