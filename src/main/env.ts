/**
 * Minimal .env loader (no `dotenv` package): KEY=VALUE per line, `#` comments, blank lines ignored,
 * optional `export ` prefix, optional single/double quotes (double quotes unescape \n \r \t \").
 * Existing process.env values are NEVER overridden. Values are never logged (they may be secrets).
 */
import fs from "node:fs";

export interface DotEnvResult {
  /** Keys set from the file. */
  loaded: string[];
  /** Keys present in the file but already defined in process.env (left untouched). */
  skipped: string[];
}

export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    const first = value[0];
    const quoted = value.length >= 2 && (first === '"' || first === "'") && value[value.length - 1] === first;
    if (quoted) {
      value = value.slice(1, -1);
      if (first === '"') {
        value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"');
      }
    } else {
      // Unquoted: strip a trailing inline comment ("VALUE   # comment").
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

/** Loads `filePath` into process.env. Returns null when the file does not exist / cannot be read. */
export function loadDotEnv(filePath: string): DotEnvResult | null {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const result: DotEnvResult = { loaded: [], skipped: [] };
  for (const [key, value] of Object.entries(parseDotEnv(text))) {
    if (process.env[key] !== undefined) {
      result.skipped.push(key);
      continue;
    }
    process.env[key] = value;
    result.loaded.push(key);
  }
  return result;
}
