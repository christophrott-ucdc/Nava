/**
 * Minimal static file serving for the web apps (dist/web/control, dist/web/tablet).
 * Written by hand instead of `@hono/node-server/serve-static` because that helper resolves `root`
 * relative to process.cwd() (unusable from a packaged Electron app), and we need an index.html
 * fallback per app.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Context } from "hono";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export interface StaticApp {
  /** URL prefix, e.g. "/control". */
  prefix: string;
  /** Absolute directory, e.g. <webDir>/control. */
  dir: string;
}

async function statFile(p: string): Promise<{ size: number } | null> {
  try {
    const st = await fs.stat(p);
    return st.isFile() ? { size: st.size } : null;
  } catch {
    return null;
  }
}

/**
 * Serve `GET <prefix>/*` from `dir` with `index.html` fallback (client-side paths, trailing slashes,
 * missing files). Path traversal outside `dir` is rejected.
 */
export function createStaticHandler(app: StaticApp) {
  const root = path.resolve(app.dir);
  return async (c: Context): Promise<Response> => {
    const url = new URL(c.req.url);
    let rel: string;
    try {
      rel = decodeURIComponent(url.pathname.slice(app.prefix.length));
    } catch {
      return c.json({ ok: false, reason: "Cale URL invalidă" }, 400);
    }
    rel = rel.replace(/^\/+/, "");
    let filePath = rel ? path.resolve(root, rel) : path.join(root, "index.html");
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      return c.json({ ok: false, reason: "Forbidden" }, 403);
    }
    let st = await statFile(filePath);
    if (!st) {
      // A missing asset must stay a 404. Returning index.html as JavaScript/CSS hides broken builds
      // behind confusing browser syntax errors. Only extensionless paths use the SPA fallback.
      if (rel && path.extname(rel)) return c.json({ ok: false, reason: "Fișier inexistent" }, 404);
      filePath = path.join(root, "index.html");
      st = await statFile(filePath);
      if (!st) {
        return c.html(
          `<!doctype html><meta charset="utf-8"><title>Nava</title>` +
            `<body style="background:#0b1220;color:#9ad8f0;font-family:Segoe UI,sans-serif;padding:2rem">` +
            `<h2>Aplicația web lipsește</h2><p>Nu găsesc <code>${app.dir.replace(/</g, "&lt;")}/index.html</code>. ` +
            `Rulează <code>npm run build</code>.</p></body>`,
          404,
        );
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    const data = await fs.readFile(filePath);
    return c.body(new Uint8Array(data), 200, {
      "Content-Type": mime,
      "Content-Length": String(st.size),
      // Kiosk/LAN: always revalidate so a rebuild is picked up on the next reload.
      "Cache-Control": "no-cache",
    });
  };
}
