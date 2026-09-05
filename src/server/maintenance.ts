/**
 * Housekeeping for runs/: keep the newest N journals of each family, move debug screenshots into
 * runs/debug/, never touch the file currently being written.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { LogFn } from "./runlog";

export interface RotateResult {
  deleted: string[];
  moved: string[];
  kept: { show: number; app: number };
}

export async function rotateRuns(runsDir: string, keep: number, protect: Array<string | null | undefined>, log: LogFn): Promise<RotateResult> {
  const result: RotateResult = { deleted: [], moved: [], kept: { show: 0, app: 0 } };
  let entries: string[];
  try {
    entries = await fs.readdir(runsDir);
  } catch {
    return result;
  }
  const protectedSet = new Set(protect.filter((p): p is string => !!p).map((p) => path.resolve(p)));
  const debugDir = path.join(runsDir, "debug");

  // screenshots / images -> runs/debug
  for (const name of entries) {
    if (/\.(png|jpe?g|webp)$/i.test(name)) {
      await fs.mkdir(debugDir, { recursive: true });
      try {
        await fs.rename(path.join(runsDir, name), path.join(debugDir, name));
        result.moved.push(name);
      } catch {
        /* ignore */
      }
    }
  }

  for (const family of ["show", "app"] as const) {
    const files = entries
      .filter((n) => n.startsWith(`${family}-`) && n.endsWith(".jsonl"))
      .map((n) => path.join(runsDir, n))
      .filter((p) => !protectedSet.has(path.resolve(p)));
    const withTime = await Promise.all(
      files.map(async (p) => {
        try {
          const st = await fs.stat(p);
          return { p, t: st.mtimeMs };
        } catch {
          return { p, t: 0 };
        }
      }),
    );
    withTime.sort((a, b) => b.t - a.t);
    const doomed = withTime.slice(Math.max(0, keep));
    result.kept[family] = withTime.length - doomed.length;
    for (const d of doomed) {
      try {
        await fs.unlink(d.p);
        result.deleted.push(path.basename(d.p));
      } catch {
        /* ignore */
      }
    }
  }
  if (result.deleted.length || result.moved.length) {
    log("info", `runs rotated: deleted ${result.deleted.length}, moved ${result.moved.length}`, { kept: result.kept });
  }
  return result;
}
