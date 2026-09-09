/**
 * Clipurile zidului — cele cinci fisiere de panou (`<screenId>.mp4`, 3840x2160) tiate din
 * masterul panoramic randat in SpaceEngine. Vezi `GitHub/Video/split-wall.ps1`.
 *
 * De ce exista ruta asta: rendererul Electron incarca filmul prin `file://` (src/main/main.ts,
 * `videoUrl: toFileUrl(video.abs)`), deci nu exista nicio cale HTTP catre media. O pagina de
 * test in browser are nevoie de HTTP **cu Range**, altfel `<video>` nu poate derula: Chromium
 * cere byte-range pentru seek si refuza sa considere sursa seekable fara `Accept-Ranges`.
 *
 * Router (montat de orchestrator: `app.route("/api/clips", createClipsRouter({...}))`):
 *   GET /            → { ok, dir, panels: ClipInfo[], issues[] }   metadate, probate cu ffprobe
 *   GET /:id/media   → fisierul mp4, cu suport Range (206 + Content-Range) si HEAD
 *
 * `:id` se valideaza STRICT contra id-urilor de ecran din config: numele ajunge in `path.join`,
 * deci orice altceva ar fi traversare de directoare.
 */

import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Hono, type Context } from "hono";
import type { LogFn } from "../runlog";

export interface ClipInfo {
  screenId: string;
  file: string;
  exists: boolean;
  bytes?: number;
  width?: number;
  height?: number;
  durationSec?: number;
  bitrateKbps?: number;
  codec?: string;
  /** Ordinea fizica pe zid, stanga -> dreapta, din geometria videoWall. */
  order: number;
}

export interface ClipsDeps {
  /** Folderul cu `<screenId>.mp4`. Absolut, rezolvat de orchestrator din config. */
  dir: () => string | undefined;
  /** Id-urile ecranelor, deja sortate stanga -> dreapta dupa geometria fizica. */
  screenIds: () => string[];
  log: LogFn;
}

const MIME = "video/mp4";

/** ffprobe pe un fisier; null daca ffprobe lipseste sau iese cu eroare. */
function probe(file: string): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const args = [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,codec_name",
      "-show_entries", "format=duration,bit_rate",
      "-of", "default=noprint_wrappers=1",
      file,
    ];
    const p = spawn("ffprobe", args, { windowsHide: true });
    let out = "";
    p.stdout.on("data", (b) => { out += b; });
    p.on("error", () => resolve(null));
    p.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const rec: Record<string, string> = {};
      for (const line of out.split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i > 0) rec[line.slice(0, i)] = line.slice(i + 1);
      }
      resolve(rec);
    });
  });
}

/** Cache pe (mtime, size): ffprobe porneste un proces, nu-l repetam la fiecare cerere. */
type CacheEntry = { key: string; info: ClipInfo };
const cache = new Map<string, CacheEntry>();

async function describe(dir: string, screenId: string, order: number): Promise<ClipInfo> {
  const file = path.join(dir, `${screenId}.mp4`);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(file);
  } catch {
    return { screenId, file, exists: false, order };
  }
  const key = `${stat.mtimeMs}:${stat.size}`;
  const hit = cache.get(file);
  if (hit && hit.key === key) return { ...hit.info, order };

  const p = await probe(file);
  const num = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const info: ClipInfo = {
    screenId,
    file,
    exists: true,
    bytes: stat.size,
    order,
    width: num(p?.width),
    height: num(p?.height),
    durationSec: num(p?.duration),
    bitrateKbps: p?.bit_rate ? Math.round(Number(p.bit_rate) / 1000) : undefined,
    codec: p?.codec_name,
  };
  cache.set(file, { key, info });
  return info;
}

export function createClipsRouter(deps: ClipsDeps): Hono {
  const r = new Hono();

  r.get("/", async (c) => {
    const dir = deps.dir();
    if (!dir) {
      return c.json({
        ok: false,
        reason: "config.video.panelsDir nu este setat",
        hint: "Adaugă în config.json: \"video\": { …, \"panelsDir\": \"C:/Users/…/Video/panels\" }",
        panels: [] as ClipInfo[],
      }, 200);
    }
    const ids = deps.screenIds();
    const panels = await Promise.all(ids.map((id, i) => describe(dir, id, i)));
    const issues: string[] = [];

    const present = panels.filter((p) => p.exists);
    for (const p of panels) if (!p.exists) issues.push(`lipsește ${path.basename(p.file)}`);
    for (const p of present) {
      if (p.width !== 3840 || p.height !== 2160) {
        issues.push(`${p.screenId}: ${p.width}x${p.height}, așteptat 3840x2160`);
      }
    }
    // Durate diferite = panourile nu au fost tiate in aceeasi trecere; playbackul ar diverge.
    const durs = present.map((p) => p.durationSec ?? 0).filter((d) => d > 0);
    if (durs.length > 1) {
      const spread = Math.max(...durs) - Math.min(...durs);
      if (spread > 0.5) issues.push(`durate diferite: interval de ${spread.toFixed(2)} s între panouri`);
    }

    return c.json({ ok: present.length > 0, dir, panels, issues });
  });

  // Range-ul e obligatoriu: fara el <video> nu deruleaza. HEAD raspunde doar cu headerele,
  // ca Chromium sa poata afla lungimea inainte de a cere primul range.
  const stream = async (c: Context, headOnly: boolean) => {
    const dir = deps.dir();
    if (!dir) return c.text("panelsDir nu este setat", 503);

    const id = c.req.param("id");
    // Whitelist strict: numele intra in path.join, deci nu se accepta nimic din afara configului.
    if (!id || !deps.screenIds().includes(id)) return c.text("ecran necunoscut", 404);

    const file = path.join(dir, `${id}.mp4`);
    let size: number;
    try {
      size = (await fs.stat(file)).size;
    } catch {
      return c.text("clipul nu există", 404);
    }

    const base = {
      "Content-Type": MIME,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    };
    if (headOnly) return c.body(null, 200, { ...base, "Content-Length": String(size) });

    const range = c.req.header("range");
    if (!range) {
      return c.body(createReadStream(file) as unknown as ReadableStream, 200, {
        ...base,
        "Content-Length": String(size),
      });
    }

    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === "" && m[2] === "")) {
      return c.body(null, 416, { ...base, "Content-Range": `bytes */${size}` });
    }
    // Sufix ("bytes=-N") = ultimii N octeti.
    let start: number, end: number;
    if (m[1] === "") {
      const n = Number(m[2]);
      start = Math.max(0, size - n);
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      return c.body(null, 416, { ...base, "Content-Range": `bytes */${size}` });
    }

    return c.body(createReadStream(file, { start, end }) as unknown as ReadableStream, 206, {
      ...base,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    });
  };

  // Un singur handler pentru ambele metode: in Hono un `get` raspunde si la HEAD, deci o ruta
  // HEAD separata inregistrata DUPA ea nu ar fi atinsa niciodata, iar handlerul GET ar deschide
  // inutil un stream pe care nimeni nu-l citeste.
  r.on(["GET", "HEAD"], "/:id/media", (c) => stream(c, c.req.method === "HEAD"));

  return r;
}
