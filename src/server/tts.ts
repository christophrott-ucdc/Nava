/**
 * POST /api/tts — live TTS with a disk cache, on top of `synthesize()` from ./tts-providers (Agent C).
 *
 *   request : { cueId, speaker, text, lang, provider? }
 *   response: { ok:true, audioBase64, mime, durationMs, words, wtimes, wdurations, provider, cached }
 *           | { ok:false, reason }
 *
 * Cache layout: <cacheDir>/tts/<sha256(provider|speaker|lang|text)>.{mp3|wav} + .json (metadata).
 * Identical concurrent requests (5 screens asking for the same line) share one synthesis.
 * Global rate limit on cache misses: 30/min. Text <= 4000 chars.
 */

import { Hono } from "hono";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Lang, Speaker } from "../shared/types";
import { SPEAKERS } from "../shared/types";
import { synthesize } from "./tts-providers";
import type { LogFn } from "./runlog";

type Provider = "elevenlabs" | "gemini";

export interface TtsCacheMeta {
  cueId: string;
  speaker: Speaker;
  lang: Lang;
  text: string;
  provider: Provider;
  mime: "audio/mpeg" | "audio/wav";
  file: string;
  durationMs: number;
  words: string[];
  wtimes: number[];
  wdurations: number[];
  generatedAt: string;
}

export type TtsResponse =
  | {
      ok: true;
      audioBase64: string;
      mime: "audio/mpeg" | "audio/wav";
      durationMs: number;
      words: string[];
      wtimes: number[];
      wdurations: number[];
      provider: Provider;
      cached: boolean;
    }
  | { ok: false; reason: string };

export interface TtsStats {
  requests: number;
  hits: number;
  misses: number;
  errors: number;
  rateLimited: number;
  inflightShared: number;
  cacheDir: string;
  cacheFiles: number;
  cacheBytes: number;
  windowRemaining: number;
  provider: Provider;
}

const MAX_TEXT = 4000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const LANGS: readonly string[] = ["ro", "en", "fr"];

function defaultProvider(): Provider {
  return process.env.TTS_PROVIDER === "gemini" ? "gemini" : "elevenlabs";
}

export function ttsCacheKey(provider: Provider, speaker: Speaker, lang: Lang, text: string): string {
  return createHash("sha256").update(`${provider}|${speaker}|${lang}|${text}`).digest("hex");
}

export function createTtsRouter(opts: { cacheDir: string; log: LogFn }): { router: Hono; stats: () => Promise<TtsStats> } {
  const dir = path.join(opts.cacheDir, "tts");
  const router = new Hono();
  const inflight = new Map<string, Promise<TtsResponse>>();
  const counters = { requests: 0, hits: 0, misses: 0, errors: 0, rateLimited: 0, inflightShared: 0 };
  let bucket = { count: 0, resetAt: 0 };
  let dirReady: Promise<boolean> | null = null;

  const ensureDir = (): Promise<boolean> => {
    if (!dirReady) {
      dirReady = fs
        .mkdir(dir, { recursive: true })
        .then(() => true)
        .catch((err) => {
          opts.log("warn", "tts cache dir unavailable", { dir, err: String(err) });
          return false;
        });
    }
    return dirReady;
  };

  const readCached = async (key: string): Promise<TtsResponse | null> => {
    try {
      const meta = JSON.parse(await fs.readFile(path.join(dir, `${key}.json`), "utf8")) as TtsCacheMeta;
      const audio = await fs.readFile(path.join(dir, meta.file));
      return {
        ok: true,
        audioBase64: audio.toString("base64"),
        mime: meta.mime,
        durationMs: meta.durationMs,
        words: meta.words ?? [],
        wtimes: meta.wtimes ?? [],
        wdurations: meta.wdurations ?? [],
        provider: meta.provider,
        cached: true,
      };
    } catch {
      return null;
    }
  };

  const takeToken = (): boolean => {
    const now = Date.now();
    if (bucket.resetAt <= now) bucket = { count: 0, resetAt: now + WINDOW_MS };
    if (bucket.count >= MAX_PER_WINDOW) return false;
    bucket.count += 1;
    return true;
  };

  const generate = async (
    key: string,
    req: { cueId: string; speaker: Speaker; lang: Lang; text: string; provider: Provider },
  ): Promise<TtsResponse> => {
    if (!takeToken()) {
      counters.rateLimited += 1;
      return { ok: false, reason: "Limita TTS atinsă (30/min). Încearcă din nou în curând." };
    }
    let result: Awaited<ReturnType<typeof synthesize>>;
    try {
      result = await synthesize({ text: req.text, speaker: req.speaker, lang: req.lang, provider: req.provider });
    } catch (err) {
      counters.errors += 1;
      opts.log("error", "tts synthesize threw", { err: String(err) });
      return { ok: false, reason: `Eroare TTS: ${String(err)}` };
    }
    if (!result.ok) {
      counters.errors += 1;
      return { ok: false, reason: result.reason };
    }
    const ext = result.mime === "audio/wav" ? "wav" : "mp3";
    const meta: TtsCacheMeta = {
      cueId: req.cueId,
      speaker: req.speaker,
      lang: req.lang,
      text: req.text,
      provider: result.provider,
      mime: result.mime,
      file: `${key}.${ext}`,
      durationMs: result.durationMs,
      words: result.words,
      wtimes: result.wtimes,
      wdurations: result.wdurations,
      generatedAt: new Date().toISOString(),
    };
    if (await ensureDir()) {
      try {
        await fs.writeFile(path.join(dir, meta.file), result.audio);
        await fs.writeFile(path.join(dir, `${key}.json`), JSON.stringify(meta));
      } catch (err) {
        opts.log("warn", "tts cache write failed", { err: String(err) });
      }
    }
    return {
      ok: true,
      audioBase64: Buffer.from(result.audio).toString("base64"),
      mime: result.mime,
      durationMs: result.durationMs,
      words: result.words,
      wtimes: result.wtimes,
      wdurations: result.wdurations,
      provider: result.provider,
      cached: false,
    };
  };

  router.post("/", async (c) => {
    counters.requests += 1;
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json<TtsResponse>({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return c.json<TtsResponse>({ ok: false, reason: "Lipsește `text`" }, 400);
    if (text.length > MAX_TEXT) return c.json<TtsResponse>({ ok: false, reason: `\`text\` depășește ${MAX_TEXT} caractere` }, 400);
    const speaker = typeof body.speaker === "string" && body.speaker in SPEAKERS ? (body.speaker as Speaker) : null;
    if (!speaker) return c.json<TtsResponse>({ ok: false, reason: "`speaker` necunoscut" }, 400);
    const lang: Lang = typeof body.lang === "string" && LANGS.includes(body.lang) ? (body.lang as Lang) : "ro";
    const provider: Provider = body.provider === "gemini" || body.provider === "elevenlabs" ? body.provider : defaultProvider();
    const cueId = typeof body.cueId === "string" ? body.cueId.slice(0, 80) : "";

    const key = ttsCacheKey(provider, speaker, lang, text);
    if (await ensureDir()) {
      const hit = await readCached(key);
      if (hit) {
        counters.hits += 1;
        return c.json<TtsResponse>(hit);
      }
    }
    counters.misses += 1;
    let p = inflight.get(key);
    if (p) {
      counters.inflightShared += 1;
    } else {
      p = generate(key, { cueId, speaker, lang, text, provider }).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    const res = await p;
    return c.json<TtsResponse>(res, res.ok ? 200 : 502);
  });

  const stats = async (): Promise<TtsStats> => {
    let cacheFiles = 0;
    let cacheBytes = 0;
    if (await ensureDir()) {
      try {
        for (const name of await fs.readdir(dir)) {
          if (name.endsWith(".json")) continue;
          const st = await fs.stat(path.join(dir, name)).catch(() => null);
          if (st?.isFile()) {
            cacheFiles += 1;
            cacheBytes += st.size;
          }
        }
      } catch {
        /* ignore */
      }
    }
    const now = Date.now();
    return {
      ...counters,
      cacheDir: dir,
      cacheFiles,
      cacheBytes,
      windowRemaining: bucket.resetAt > now ? Math.max(0, MAX_PER_WINDOW - bucket.count) : MAX_PER_WINDOW,
      provider: defaultProvider(),
    };
  };

  router.get("/stats", async (c) => c.json(await stats()));

  return { router, stats };
}
