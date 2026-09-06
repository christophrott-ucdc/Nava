/**
 * Persistent audit log for administrative changes (accounts, sessions).
 *
 *   data/audit.jsonl          — one JSON object per line, append-only
 *   data/audit.1.jsonl … .3   — rotated copies (newest = .1) once the active file passes ROTATE_BYTES
 *
 * Retention: the active file plus three rotated files (≈ 4 × 2 MB). Older history is dropped.
 * Persistence failure policy: the administrative change itself is NOT rolled back (it has already been
 * written to users.json / sessions.json); the failure is logged at "error" level and reported to the
 * caller through the boolean result so the UI can warn the administrator. Entries never contain PINs,
 * hashes or session tokens — callers pass only ids, names and roles.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AuditEntry } from "../shared/admin";
import type { LogFn } from "./runlog";

const ROTATE_BYTES = 2 * 1024 * 1024;
const KEEP_ROTATED = 3;

export class AuditLog {
  private queue: Promise<void> = Promise.resolve();
  private failed = false;

  constructor(
    private readonly filePath: string,
    private readonly log: LogFn,
  ) {}

  get path(): string {
    return this.filePath;
  }

  /** True when the last append failed; the overview surfaces this to the admin. */
  get degraded(): boolean {
    return this.failed;
  }

  /** Appends one entry. Resolves true when the line is on disk, false when persistence failed. */
  record(entry: AuditEntry): Promise<boolean> {
    const line = `${JSON.stringify(entry)}\n`;
    const attempt = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await this.rotateIfNeeded();
      await fs.appendFile(this.filePath, line, "utf8");
    });
    // Keep the queue alive even when one write fails.
    this.queue = attempt.catch(() => undefined);
    return attempt.then(
      () => {
        this.failed = false;
        return true;
      },
      (err: unknown) => {
        this.failed = true;
        this.log("error", "audit: could not persist entry", { err: String(err), action: entry.action });
        return false;
      },
    );
  }

  /** Newest entries first, at most `limit`, read from the active file plus rotated files as needed. */
  async tail(limit: number): Promise<{ entries: AuditEntry[]; total: number }> {
    const files = [this.filePath, ...Array.from({ length: KEEP_ROTATED }, (_, i) => this.rotatedPath(i + 1))];
    const entries: AuditEntry[] = [];
    let total = 0;
    for (const file of files) {
      let text: string;
      try {
        text = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      total += lines.length;
      for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
        const parsed = safeParse(lines[i]);
        if (parsed) entries.push(parsed);
      }
    }
    return { entries, total };
  }

  private rotatedPath(n: number): string {
    const ext = path.extname(this.filePath);
    return `${this.filePath.slice(0, -ext.length)}.${n}${ext}`;
  }

  private async rotateIfNeeded(): Promise<void> {
    let size = 0;
    try {
      size = (await fs.stat(this.filePath)).size;
    } catch {
      return;
    }
    if (size < ROTATE_BYTES) return;
    await fs.rm(this.rotatedPath(KEEP_ROTATED), { force: true });
    for (let n = KEEP_ROTATED - 1; n >= 1; n--) {
      await fs.rename(this.rotatedPath(n), this.rotatedPath(n + 1)).catch(() => undefined);
    }
    await fs.rename(this.filePath, this.rotatedPath(1));
  }
}

function safeParse(line: string): AuditEntry | null {
  try {
    const v = JSON.parse(line) as Partial<AuditEntry>;
    if (typeof v.t !== "string" || typeof v.action !== "string" || typeof v.ok !== "boolean") return null;
    return v as AuditEntry;
  } catch {
    return null;
  }
}
