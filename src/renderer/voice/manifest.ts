/**
 * Pre-generated voice manifest (assets/voice/<lang>/manifest.json, file://)
 * and the optional live TTS endpoint on the master server.
 */
import type { Lang, Speaker, VoiceClipMeta, VoiceManifest } from "../../shared/types";

export function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url : url + "/";
}

export function manifestUrl(voiceBaseUrl: string, lang: Lang): string {
  return `${normalizeBaseUrl(voiceBaseUrl)}${lang}/manifest.json`;
}

export function clipFileUrl(voiceBaseUrl: string, lang: Lang, file: string): string {
  return `${normalizeBaseUrl(voiceBaseUrl)}${lang}/${file}`;
}

function isManifest(x: unknown): x is VoiceManifest {
  if (!x || typeof x !== "object") return false;
  const m = x as Partial<VoiceManifest>;
  return typeof m.lang === "string" && !!m.clips && typeof m.clips === "object";
}

/** Returns null when the manifest is missing or malformed (caller warns once). */
export async function loadManifest(voiceBaseUrl: string, lang: Lang): Promise<VoiceManifest | null> {
  const url = manifestUrl(voiceBaseUrl, lang);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!isManifest(json)) {
      console.warn(`[voice] manifest at ${url} is not a VoiceManifest`);
      return null;
    }
    return json;
  } catch {
    // file:// fetch of a missing file rejects (net::ERR_FILE_NOT_FOUND)
    return null;
  }
}

export async function fetchClipBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.arrayBuffer();
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Shape returned by POST /api/tts (Agent D, built on src/server/tts-providers). */
export type ServerTtsResponse =
  | {
      ok: true;
      audioBase64: string;
      mime: "audio/mpeg" | "audio/wav";
      durationMs: number;
      words: string[];
      wtimes: number[];
      wdurations: number[];
      provider: "elevenlabs" | "gemini";
      cached?: boolean;
    }
  | { ok: false; reason: string };

export async function requestServerTts(
  serverHttpUrl: string,
  body: { cueId: string; speaker: Speaker; text: string; lang: Lang },
  timeoutMs = 25_000,
): Promise<ServerTtsResponse> {
  const base = serverHttpUrl.replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { reason?: string };
        if (j?.reason) reason = j.reason;
      } catch {
        /* non-JSON */
      }
      return { ok: false, reason };
    }
    const value = (await res.json()) as unknown;
    if (!value || typeof value !== "object" || !("ok" in value)) return { ok: false, reason: "Răspuns TTS invalid" };
    const result = value as Partial<Extract<ServerTtsResponse, { ok: true }>> & { ok: unknown; reason?: unknown };
    if (result.ok !== true) return { ok: false, reason: typeof result.reason === "string" ? result.reason : "TTS indisponibil" };
    if (
      typeof result.audioBase64 !== "string" ||
      (result.mime !== "audio/mpeg" && result.mime !== "audio/wav") ||
      !Number.isFinite(result.durationMs) ||
      (result.provider !== "elevenlabs" && result.provider !== "gemini") ||
      !Array.isArray(result.words) || result.words.some((word) => typeof word !== "string") ||
      !Array.isArray(result.wtimes) || result.wtimes.some((time) => !Number.isFinite(time)) ||
      !Array.isArray(result.wdurations) || result.wdurations.some((duration) => !Number.isFinite(duration))
    ) {
      return { ok: false, reason: "Răspuns TTS incomplet" };
    }
    return result as Extract<ServerTtsResponse, { ok: true }>;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Build the VoiceClipMeta for a server-generated clip (kept in memory only). */
export function metaFromServer(
  r: Extract<ServerTtsResponse, { ok: true }>,
  cueId: string,
  lang: Lang,
  speaker: Speaker,
  text: string,
): VoiceClipMeta {
  return {
    cueId,
    lang,
    speaker,
    text,
    file: "",
    mime: r.mime,
    durationMs: r.durationMs,
    words: r.words ?? [],
    wtimes: r.wtimes ?? [],
    wdurations: r.wdurations ?? [],
    provider: r.provider,
    generatedAt: new Date().toISOString(),
  };
}
