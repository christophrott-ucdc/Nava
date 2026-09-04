/**
 * Server-only TTS adapters. Secrets never leave this module/process.
 *
 * ElevenLabs uses the alignment endpoint and is the preferred deterministic
 * source for avatar lip-sync. Gemini returns 16-bit PCM; it is wrapped in a
 * standard WAV container and gets proportional word timings.
 */
import type { Lang, Speaker } from "../shared/types";

export type TtsResult =
  | {
      ok: true;
      audio: Buffer;
      mime: "audio/mpeg" | "audio/wav";
      durationMs: number;
      words: string[];
      wtimes: number[];
      wdurations: number[];
      provider: "elevenlabs" | "gemini";
    }
  | { ok: false; reason: string };

type Provider = "elevenlabs" | "gemini";

export interface ElevenVoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
  use_speaker_boost?: boolean;
}

export interface TtsControls {
  /** Overrides the configured voice for this generated asset. Voice IDs are not secrets. */
  voiceId?: string;
  /** ElevenLabs model override, e.g. eleven_v3 for audio-tag direction. */
  modelId?: string;
  /** Spoken-delivery tags. Applied only by Eleven v3 and never stored as subtitle text. */
  audioTags?: string[];
  voiceSettings?: ElevenVoiceSettings;
  seed?: number;
  outputFormat?: string;
}

const ELEVEN_DEFAULTS: Record<Speaker, string> = {
  // Legacy IDs remain API-compatible and route to their maintained
  // replacements. Production should pin reviewed voices through .env.
  AVATAR_AI: "21m00Tcm4TlvDq8ikWAM", // Rachel -> Janet
  CAPITANUL: "ErXwobaYiN019PkySvjV", // Antoni -> Adam
  LUMINA: "21m00Tcm4TlvDq8ikWAM", // Rachel -> Janet (ethereal FX is applied in the renderer)
  NATURA: "TxGEqnHWrfWFTfGW9XjX", // Josh -> Craig
  TEHNOLOGIC: "pNInz6obpgDQGcFmaJgB", // Adam
};

const GEMINI_DEFAULTS: Record<Speaker, string> = {
  AVATAR_AI: "Sulafat", // warm
  CAPITANUL: "Gacrux", // mature
  LUMINA: "Aoede", // breezy
  NATURA: "Algenib", // gravelly
  TEHNOLOGIC: "Iapetus", // clear
};

const ELEVEN_SETTINGS: Record<Speaker, Required<ElevenVoiceSettings>> = {
  AVATAR_AI: { stability: 0.62, similarity_boost: 0.78, style: 0.18, speed: 0.98, use_speaker_boost: true },
  CAPITANUL: { stability: 0.8, similarity_boost: 0.78, style: 0.08, speed: 0.9, use_speaker_boost: true },
  LUMINA: { stability: 0.56, similarity_boost: 0.7, style: 0.3, speed: 0.9, use_speaker_boost: true },
  NATURA: { stability: 0.75, similarity_boost: 0.76, style: 0.14, speed: 0.88, use_speaker_boost: true },
  TEHNOLOGIC: { stability: 0.9, similarity_boost: 0.8, style: 0.02, speed: 1.02, use_speaker_boost: true },
};

const GEMINI_STYLE: Record<Speaker, string> = {
  AVATAR_AI: "caldă, calmă, luminoasă și ușor zâmbitoare",
  CAPITANUL: "gravă, liniștită, autoritară și fără grabă",
  LUMINA: "eterică, fără vârstă, ca un cor foarte îndepărtat",
  NATURA: "gravă, blândă, veche și liniștitoare",
  TEHNOLOGIC: "clară, precisă, uniformă și aproape muzicală",
};

const LANG_NAME: Record<Lang, string> = { ro: "română", en: "engleză", fr: "franceză" };
const LANG_CODE: Record<Lang, string> = { ro: "ro-RO", en: "en-US", fr: "fr-FR" };
const REQUEST_TIMEOUT_MS = 90_000;
const SPEAKER_IDS = new Set<Speaker>(["AVATAR_AI", "CAPITANUL", "LUMINA", "NATURA", "TEHNOLOGIC"]);
const LANG_IDS = new Set<Lang>(["ro", "en", "fr"]);

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function resolveVoiceId(speaker: Speaker, provider: Provider): string {
  const configured = envValue(`${provider === "elevenlabs" ? "ELEVENLABS" : "GEMINI"}_VOICE_${speaker}`);
  return configured ?? (provider === "elevenlabs" ? ELEVEN_DEFAULTS[speaker] : GEMINI_DEFAULTS[speaker]);
}

function shortProviderError(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 500);
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  if (typeof obj.detail === "string") return shortProviderError(obj.detail);
  if (typeof obj.message === "string") return shortProviderError(obj.message);
  if (obj.error && typeof obj.error === "object") return shortProviderError(obj.error);
  return "";
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const text = (await response.text()).slice(0, 4000);
    if (!text) return "";
    try {
      return shortProviderError(JSON.parse(text));
    } catch {
      return shortProviderError(text);
    }
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function providerFailure(provider: string, status: number, detail: string): TtsResult {
  if (status === 401 || status === 403) return { ok: false, reason: `${provider}: cheia API este invalidă sau nu are acces.` };
  if (status === 429) return { ok: false, reason: `${provider}: limita de trafic sau cota a fost depășită.` };
  return { ok: false, reason: `${provider}: HTTP ${status}${detail ? ` — ${detail}` : ""}` };
}

interface CharacterAlignment {
  characters?: unknown;
  character_start_times_seconds?: unknown;
  character_end_times_seconds?: unknown;
}

/** Character alignment -> word timing arrays in milliseconds. */
export function alignmentToWords(alignment: CharacterAlignment | null | undefined, omitAudioTags = false): {
  words: string[];
  wtimes: number[];
  wdurations: number[];
  durationMs: number;
} {
  const characters = Array.isArray(alignment?.characters) ? alignment.characters.filter((x): x is string => typeof x === "string") : [];
  const starts = Array.isArray(alignment?.character_start_times_seconds)
    ? alignment.character_start_times_seconds.map(Number)
    : [];
  const ends = Array.isArray(alignment?.character_end_times_seconds) ? alignment.character_end_times_seconds.map(Number) : [];
  const count = Math.min(characters.length, starts.length, ends.length);
  const words: string[] = [];
  const wtimes: number[] = [];
  const wdurations: number[] = [];
  let token = "";
  let tokenStart = 0;
  let tokenEnd = 0;
  let insideAudioTag = false;
  const spoken = /[\p{L}\p{N}]/u;
  const connector = /['’\-]/u;
  const flush = () => {
    if (!token || !spoken.test(token)) {
      token = "";
      return;
    }
    words.push(token);
    wtimes.push(Math.max(0, Math.round(tokenStart * 1000)));
    wdurations.push(Math.max(20, Math.round((tokenEnd - tokenStart) * 1000)));
    token = "";
  };

  for (let i = 0; i < count; i++) {
    const chunk = characters[i];
    const start = Number.isFinite(starts[i]) ? Math.max(0, starts[i]) : tokenEnd;
    const end = Number.isFinite(ends[i]) ? Math.max(start, ends[i]) : start;
    for (const char of [...chunk]) {
      if (omitAudioTags && char === "[") {
        flush();
        insideAudioTag = true;
        continue;
      }
      if (omitAudioTags && insideAudioTag) {
        if (char === "]") insideAudioTag = false;
        continue;
      }
      if (spoken.test(char) || (connector.test(char) && token.length > 0)) {
        if (!token) tokenStart = start;
        token += char;
        tokenEnd = end;
      } else {
        flush();
      }
    }
  }
  flush();
  const durationMs = count ? Math.max(0, Math.round(Math.max(...ends.slice(0, count).filter(Number.isFinite), 0) * 1000)) : 0;
  return { words, wtimes, wdurations, durationMs };
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function elevenSettings(speaker: Speaker, controls?: TtsControls): Required<ElevenVoiceSettings> {
  const base = ELEVEN_SETTINGS[speaker];
  const value = controls?.voiceSettings;
  return {
    stability: clamp(value?.stability, base.stability, 0, 1),
    similarity_boost: clamp(value?.similarity_boost, base.similarity_boost, 0, 1),
    style: clamp(value?.style, base.style, 0, 1),
    speed: clamp(value?.speed, base.speed, 0.7, 1.2),
    use_speaker_boost: value?.use_speaker_boost ?? base.use_speaker_boost,
  };
}

function audioTaggedText(text: string, modelId: string, tags: string[] | undefined): string {
  if (modelId !== "eleven_v3" || !tags?.length) return text;
  const safe = tags
    .map((tag) => tag.trim().replace(/^\[|\]$/g, ""))
    .filter((tag) => /^[\p{L}\p{N} ,.'’!?-]{1,48}$/u.test(tag))
    .slice(0, 3);
  return safe.length ? `${safe.map((tag) => `[${tag}]`).join(" ")} ${text}` : text;
}

function outputFormat(value: string | undefined): string {
  const selected = value?.trim() || "mp3_44100_128";
  return /^(?:mp3_\d+_\d+|opus_\d+_\d+|pcm_\d+|ulaw_\d+|alaw_\d+)$/u.test(selected) ? selected : "mp3_44100_128";
}

function estimateWordTimings(text: string, durationMs: number): { words: string[]; wtimes: number[]; wdurations: number[] } {
  const matches = [...text.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)];
  if (!matches.length) return { words: [], wtimes: [], wdurations: [] };
  const lead = Math.min(100, durationMs * 0.025);
  const tail = Math.min(140, durationMs * 0.035);
  const usable = Math.max(1, durationMs - lead - tail);
  const weights = matches.map((match, i) => {
    const nextIndex = matches[i + 1]?.index ?? text.length;
    const gap = text.slice((match.index ?? 0) + match[0].length, nextIndex);
    const pause = /[.!?…]/u.test(gap) ? 1.2 : /[,;:]/u.test(gap) ? 0.55 : 0.18;
    return Math.max(1, Math.pow([...match[0]].length, 0.72) + pause);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = lead;
  const wtimes: number[] = [];
  const wdurations: number[] = [];
  for (const weight of weights) {
    const slice = (usable * weight) / total;
    wtimes.push(Math.round(cursor));
    wdurations.push(Math.max(30, Math.round(slice * 0.82)));
    cursor += slice;
  }
  return { words: matches.map((m) => m[0]), wtimes, wdurations };
}

async function synthesizeElevenLabs(text: string, speaker: Speaker, controls?: TtsControls): Promise<TtsResult> {
  const apiKey = envValue("ELEVENLABS_API_KEY");
  if (!apiKey) return { ok: false, reason: "ElevenLabs indisponibil: lipsește ELEVENLABS_API_KEY." };
  const voiceId = controls?.voiceId?.trim() || resolveVoiceId(speaker, "elevenlabs");
  const modelId = controls?.modelId?.trim() || envValue("ELEVENLABS_MODEL_ID") || "eleven_multilingual_v2";
  const inputText = audioTaggedText(text, modelId, controls?.audioTags);
  const format = outputFormat(controls?.outputFormat ?? envValue("ELEVENLABS_OUTPUT_FORMAT"));
  const body: Record<string, unknown> = {
    text: inputText,
    model_id: modelId,
    voice_settings: elevenSettings(speaker, controls),
  };
  if (typeof controls?.seed === "number" && Number.isInteger(controls.seed) && controls.seed >= 0 && controls.seed <= 4_294_967_295) {
    body.seed = controls.seed;
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${encodeURIComponent(format)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "xi-api-key": apiKey },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    const timeout = err instanceof Error && err.name === "AbortError";
    return { ok: false, reason: timeout ? "ElevenLabs: cererea a expirat." : `ElevenLabs: conexiunea a eșuat (${String(err)}).` };
  }
  if (!response.ok) return providerFailure("ElevenLabs", response.status, await errorDetail(response));

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "ElevenLabs: răspuns JSON invalid." };
  }
  const encoded = typeof payload.audio_base64 === "string" ? payload.audio_base64 : "";
  if (!encoded) return { ok: false, reason: "ElevenLabs: răspunsul nu conține audio." };
  const audio = Buffer.from(encoded, "base64");
  if (!audio.length) return { ok: false, reason: "ElevenLabs: audio gol." };
  const normalized = payload.normalized_alignment as CharacterAlignment | null | undefined;
  const original = payload.alignment as CharacterAlignment | null | undefined;
  const omitAudioTags = modelId === "eleven_v3";
  let timing = alignmentToWords(normalized, omitAudioTags);
  if (!timing.words.length) timing = alignmentToWords(original, omitAudioTags);
  const durationMs = timing.durationMs || Math.max(900, Math.round(text.length * 72));
  const fallback = timing.words.length ? timing : { ...estimateWordTimings(text, durationMs), durationMs };
  return {
    ok: true,
    audio,
    mime: "audio/mpeg",
    durationMs,
    words: fallback.words,
    wtimes: fallback.wtimes,
    wdurations: fallback.wdurations,
    provider: "elevenlabs",
  };
}

function pcm16ToWav(pcm: Buffer, sampleRate: number, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = channels * 2;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function sampleRateFromMime(mime: string): number {
  const match = mime.match(/(?:rate|sample_rate)\s*=\s*(\d+)/i);
  const rate = match ? Number(match[1]) : 24_000;
  return Number.isFinite(rate) && rate >= 8_000 && rate <= 192_000 ? rate : 24_000;
}

function wavDurationMs(wav: Buffer): number {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") return 0;
  const byteRate = wav.readUInt32LE(28);
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data" && byteRate > 0) return Math.round((size / byteRate) * 1000);
    offset += 8 + size + (size % 2);
  }
  return 0;
}

async function synthesizeGemini(text: string, speaker: Speaker, lang: Lang): Promise<TtsResult> {
  const apiKey = envValue("GEMINI_API_KEY");
  if (!apiKey) return { ok: false, reason: "Gemini indisponibil: lipsește GEMINI_API_KEY." };
  const voiceName = resolveVoiceId(speaker, "gemini");
  const model = envValue("GEMINI_TTS_MODEL") ?? "gemini-3.1-flash-tts-preview";
  const prompt = `Rostește exact textul de mai jos în limba ${LANG_NAME[lang]}, cu o voce ${GEMINI_STYLE[speaker]}. Nu adăuga și nu omite cuvinte.\n\n${text}`;
  let response: Response;
  try {
    response = await fetchWithTimeout("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model,
        input: prompt,
        response_format: { type: "audio" },
        generation_config: {
          speech_config: [{ voice: voiceName, language: LANG_CODE[lang] }],
        },
      }),
    });
  } catch (err) {
    const timeout = err instanceof Error && err.name === "AbortError";
    return { ok: false, reason: timeout ? "Gemini: cererea a expirat." : `Gemini: conexiunea a eșuat (${String(err)}).` };
  }
  if (!response.ok) return providerFailure("Gemini", response.status, await errorDetail(response));

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "Gemini: răspuns JSON invalid." };
  }
  const output = (payload.output_audio ?? payload.outputAudio) as
    | { data?: unknown; mime_type?: unknown; mimeType?: unknown }
    | undefined;
  const encoded = typeof output?.data === "string" ? output.data : "";
  const sourceMime =
    typeof output?.mime_type === "string"
      ? output.mime_type
      : typeof output?.mimeType === "string"
        ? output.mimeType
        : "audio/L16;rate=24000";
  if (!encoded) {
    const feedback = payload.promptFeedback as Record<string, unknown> | undefined;
    return { ok: false, reason: `Gemini: răspunsul nu conține audio${feedback ? ` (${shortProviderError(feedback) || "blocat"})` : ""}.` };
  }
  const raw = Buffer.from(encoded, "base64");
  if (!raw.length) return { ok: false, reason: "Gemini: audio gol." };
  const alreadyWav = raw.length >= 12 && raw.toString("ascii", 0, 4) === "RIFF" && raw.toString("ascii", 8, 12) === "WAVE";
  const rate = sampleRateFromMime(sourceMime);
  const audio = alreadyWav ? raw : pcm16ToWav(raw, rate);
  const durationMs = wavDurationMs(audio) || Math.max(900, Math.round(text.length * 72));
  const timing = estimateWordTimings(text, durationMs);
  return { ok: true, audio, mime: "audio/wav", durationMs, ...timing, provider: "gemini" };
}

export async function synthesize(opts: {
  text: string;
  speaker: Speaker;
  lang: Lang;
  provider?: Provider;
  controls?: TtsControls;
}): Promise<TtsResult> {
  if (!SPEAKER_IDS.has(opts.speaker)) return { ok: false, reason: "Vorbitor TTS necunoscut." };
  if (!LANG_IDS.has(opts.lang)) return { ok: false, reason: "Limbă TTS necunoscută." };
  const text = opts.text.trim();
  if (!text) return { ok: false, reason: "Textul TTS este gol." };
  if (text.length > 4000) return { ok: false, reason: "Textul TTS depășește 4000 de caractere." };
  const provider: Provider = opts.provider ?? (process.env.TTS_PROVIDER === "gemini" ? "gemini" : "elevenlabs");
  return provider === "elevenlabs"
    ? synthesizeElevenLabs(text, opts.speaker, opts.controls)
    : synthesizeGemini(text, opts.speaker, opts.lang);
}
