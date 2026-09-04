/**
 * Renderer logger: mirrors to the DevTools console and to the main process
 * (window.nava.log -> runs/<run>.jsonl). Never throws.
 */

export type LogLevel = "info" | "warn" | "error";
export type Logger = (level: LogLevel, msg: string, data?: unknown) => void;

export function createLogger(scope: string): Logger {
  return (level, msg, data) => {
    const line = `[${scope}] ${msg}`;
    try {
      const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
      if (data === undefined) fn(line);
      else fn(line, data);
    } catch {
      /* ignore */
    }
    try {
      window.nava?.log(level, line, data);
    } catch {
      /* bridge unavailable (plain browser) */
    }
  };
}

/** Compact error description for banners / logs. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
