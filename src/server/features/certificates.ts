/**
 * D-06 (server) — certificatele de misiune desenate pe tablete (canvas 1200×1700 → PNG).
 *
 *   POST /            { post: 1..5, dataUrl: "data:image/png;base64,..." } → runs/certificates/<run>/post-<n>.png
 *   GET  /            lista rularilor cu certificatele salvate (pentru consola: tiparire)
 *   GET  /:run/:file  PNG-ul (Content-Type image/png)
 *
 * `<run>` = numele rularii curente (runlog.currentPath fara extensie), sau "fara-rulare". O tableta care
 * retrimite suprascrie fisierul postului sau. Router montat de orchestrator la `/api/certificates`
 * (POST poate ramane public — tabletele nu au token; GET-urile pot sta in spatele autentificarii).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import type { LogFn } from "../runlog";

export interface CertificatesDeps {
  runsDir: string;
  /** Numele rularii curente (ex. "show-20260904-221003-2") sau null. */
  currentRunId: () => string | null;
  log: LogFn;
  /** Limita PNG-ului decodat (implicit 4 MB). */
  maxBytes?: number;
}

const PNG_RE = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/;
const RUN_RE = /^[\w.-]{1,80}$/;
const FILE_RE = /^post-[1-5]\.png$/;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

export function certificatesDir(runsDir: string): string {
  return path.join(runsDir, "certificates");
}

export function createCertificatesRouter(deps: CertificatesDeps): Hono {
  const root = certificatesDir(deps.runsDir);
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
  const router = new Hono();

  router.post("/", async (c) => {
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > maxBytes * 1.4) return c.json({ ok: false, reason: "Certificat prea mare" }, 413);
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const post = Number(body.post);
    if (!Number.isInteger(post) || post < 1 || post > 5) return c.json({ ok: false, reason: "post invalid (1–5)" }, 400);
    const m = typeof body.dataUrl === "string" ? PNG_RE.exec(body.dataUrl) : null;
    if (!m) return c.json({ ok: false, reason: "dataUrl trebuie să fie un PNG base64" }, 400);
    const png = Buffer.from(m[1].replace(/\s+/g, ""), "base64");
    if (png.length < 8 || png.readUInt32BE(0) !== 0x89504e47) return c.json({ ok: false, reason: "PNG invalid" }, 400);
    if (png.length > maxBytes) return c.json({ ok: false, reason: "Certificat prea mare" }, 413);
    const run = (deps.currentRunId() ?? "fara-rulare").replace(/[^\w.-]/g, "_").slice(0, 80) || "fara-rulare";
    const dir = path.join(root, run);
    const file = `post-${post}.png`;
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, file), png);
    } catch (err) {
      deps.log("error", "certificates: write failed", { err: String(err) });
      return c.json({ ok: false, reason: "Nu am putut salva certificatul" }, 500);
    }
    deps.log("info", `certificate saved: ${run}/${file}`, { bytes: png.length });
    return c.json({ ok: true, run, file, bytes: png.length, url: `/api/certificates/${encodeURIComponent(run)}/${file}` }, 201);
  });

  router.get("/", async (c) => {
    const runs: Array<{ run: string; files: Array<{ file: string; post: number; bytes: number; mtime: string; url: string }> }> = [];
    try {
      const names = (await fs.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
      for (const run of names.sort().reverse()) {
        const files = (await fs.readdir(path.join(root, run))).filter((f) => FILE_RE.test(f)).sort();
        const infos = await Promise.all(
          files.map(async (file) => {
            const st = await fs.stat(path.join(root, run, file));
            return { file, post: Number(file.slice(5, 6)), bytes: st.size, mtime: st.mtime.toISOString(), url: `/api/certificates/${encodeURIComponent(run)}/${file}` };
          }),
        );
        if (infos.length) runs.push({ run, files: infos });
      }
    } catch {
      /* no certificates yet */
    }
    return c.json({ dir: root, runs });
  });

  router.get("/:run/:file", async (c) => {
    const run = c.req.param("run");
    const file = c.req.param("file");
    if (!RUN_RE.test(run) || !FILE_RE.test(file)) return c.json({ ok: false, reason: "Cale invalidă" }, 400);
    try {
      const data = await fs.readFile(path.join(root, run, file));
      return c.body(new Uint8Array(data), 200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
    } catch {
      return c.json({ ok: false, reason: "Certificat inexistent" }, 404);
    }
  });

  return router;
}
