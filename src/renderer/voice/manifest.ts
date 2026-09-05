/**
 * Pre-generated voice manifest (assets/voice/<lang>/manifest.json, file://)
 * and the optional live TTS endpoint on the master server.
 *
 * R4 (Agent C):
 *  - C-03 language availability: getAvailableLangs(), createLangGuard() — a language is usable
 *    only when its manifest has at least one clip; otherwise the previous language is kept.
 *  - C-06 age variants: resolveClipMeta() looks up `<cueId>.<variant>` before `<cueId>`;
 *    variantText() picks the cue text for the active variant; getBootVariant() reads boot.variant.
 */
import type { Lang, Speaker, VoiceClipMeta, VoiceCue, VoiceManifest } from "../../shared/types";

export const ALL_LANGS: readonly Lang[] = ["ro", "en", "fr"];

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

// ---------------------------------------------------------------------------
// C-03 — which languages actually have voices
// ---------------------------------------------------------------------------

export function manifestClipCount(manifest: VoiceManifest | null | undefined): number {
  return manifest?.clips ? Object.keys(manifest.clips).length : 0;
}

/** Languages whose manifest exists and contains at least one clip (order of `langs`). */
export async function getAvailableLangs(voiceBaseUrl: string, langs: readonly Lang[] = ALL_LANGS): Promise<Lang[]> {
  const counts = await Promise.all(langs.map(async (lang) => ({ lang, n: manifestClipCount(await loadManifest(voiceBaseUrl, lang)) })));
  return counts.filter((c) => c.n > 0).map((c) => c.lang);
}

export interface LangGuard {
  /** Current (last accepted) language. */
  current(): Lang;
  /**
   * Accept `requested` only if its manifest has clips; otherwise warn and keep the current one.
   * The player calls this before VoiceEngine.prepare()/setLang().
   */
  resolve(requested: Lang): Promise<Lang>;
  /** Cached availability (first call loads every manifest once). */
  available(): Promise<Lang[]>;
  /** Re-read the manifests (after `npm run tts -- --lang en`). */
  refresh(): Promise<Lang[]>;
}

export function createLangGuard(
  voiceBaseUrl: string,
  initial: Lang,
  log: (level: "info" | "warn", msg: string) => void = (level, msg) => (level === "warn" ? console.warn(msg) : console.info(msg)),
): LangGuard {
  let current = initial;
  let cache: Promise<Lang[]> | null = null;
  const refresh = (): Promise<Lang[]> => {
    cache = getAvailableLangs(voiceBaseUrl).then((langs) => {
      const missing = ALL_LANGS.filter((l) => !langs.includes(l));
      if (missing.length) log("info", `[voice] limbi fără voci pre-generate: ${missing.join(", ")} (generați cu: node scripts/tts-generate.mjs --lang <en|fr>)`);
      return langs;
    });
    return cache;
  };
  return {
    current: () => current,
    available: () => cache ?? refresh(),
    refresh,
    async resolve(requested: Lang): Promise<Lang> {
      const langs = await (cache ?? refresh());
      if (langs.includes(requested)) {
        current = requested;
        return requested;
      }
      log("warn", `[voice] limba "${requested}" nu are niciun clip în assets/voice/${requested}/manifest.json — rămân pe "${current}"`);
      return current;
    },
  };
}

// ---------------------------------------------------------------------------
// C-06 — age variants
// ---------------------------------------------------------------------------

/** Manifest key of a variant clip: "<cueId>.<variant>" (or the base id when no variant). */
export function variantClipKey(cueId: string, variant: string | null | undefined): string {
  return variant ? `${cueId}.${variant}` : cueId;
}

/** File-name-safe token for a variant key ("13+" -> "13plus"); mirrors scripts/tts-generate.mjs. */
export function variantFileToken(variant: string): string {
  return variant.replace(/\+/g, "plus").replace(/[^A-Za-z0-9._-]/g, "-");
}

/** Text to speak/subtitle for a cue under `variant` (falls back to the base text). */
export function variantText(
  cue: Pick<VoiceCue, "text" | "variants">,
  variant: string | null | undefined,
  lang: Lang,
): { text: string; variant: string | null } {
  const specific = variant ? cue.variants?.[variant]?.[lang] : undefined;
  if (typeof specific === "string" && specific.trim()) return { text: specific, variant: variant ?? null };
  return { text: cue.text[lang] ?? cue.text.ro, variant: null };
}

/**
 * getClip lookup order: clips["<cueId>.<variant>"] (when a variant is active), then clips[cueId].
 * Returns the key that matched so the caller validates `meta.cueId === key` and `meta.text` against
 * the matching (variant or base) text.
 */
export function resolveClipMeta(
  manifest: VoiceManifest | null | undefined,
  cueId: string,
  variant: string | null | undefined,
): { key: string; meta: VoiceClipMeta; variant: string | null } | null {
  if (!manifest?.clips) return null;
  if (variant) {
    const key = variantClipKey(cueId, variant);
    const meta = manifest.clips[key];
    if (meta) return { key, meta, variant };
  }
  const base = manifest.clips[cueId];
  return base ? { key: cueId, meta: base, variant: null } : null;
}

let bootVariantPromise: Promise<string | null> | null = null;

/** Active scenario variant from boot (boot.variant, else config.variant); cached; null outside Electron. */
export function getBootVariant(): Promise<string | null> {
  if (bootVariantPromise) return bootVariantPromise;
  bootVariantPromise = (async () => {
    try {
      const bridge = (window as unknown as { nava?: { getBoot?: () => Promise<{ variant?: string | null; config?: { variant?: string } }> } }).nava;
      if (!bridge?.getBoot) return null;
      const boot = await bridge.getBoot();
      const v = boot.variant ?? boot.config?.variant ?? null;
      return typeof v === "string" && v.trim() ? v : null;
    } catch {
      return null;
    }
  })();
  return bootVariantPromise;
}

/** Test/setVariant hook: forget the cached boot variant (next getBootVariant() re-reads). */
export function resetBootVariantCache(): void {
  bootVariantPromise = null;
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

let ttsAuthToken: string | null = null;

/**
 * R4 — screens authenticate to the master's /api/tts with `Authorization: Bearer <security.screenToken>`
 * (the same token they send in `hello`). null/empty = no header (unauthenticated server).
 */
export function setTtsAuthToken(token: string | null | undefined): void {
  ttsAuthToken = token && token.trim() ? token.trim() : null;
}

export function ttsHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (ttsAuthToken) h.Authorization = `Bearer ${ttsAuthToken}`;
  return h;
}

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
      headers: ttsHeaders(),
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
