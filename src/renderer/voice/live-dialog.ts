/**
 * Live dialog skeleton (R4 / C-05): children speak -> STT -> POST /api/dialog -> the Captain
 * answers through the dynamic-voice path.
 *
 *   const dialog = new LiveDialog({
 *     serverHttpUrl, screenToken,
 *     getContext: () => ({ sceneId: player.sceneId(), phaseTime: player.phaseTime() }),
 *     onReply: (voice) => timeline.speakDynamic(voice),   // same handler as the `dynamicVoice` WS message
 *   });
 *   dialog.start();            // webkitSpeechRecognition, ro-RO, continuous + interim
 *   dialog.pause()/resume();   // ignore the room while the Captain is speaking
 *   await dialog.ask("Ce este a patra lume?");   // manual path (console / tests / typed input)
 *
 * Notes
 *  - Web Speech API in Chromium needs Google's speech service; inside Electron it is usually
 *    unavailable (isSupported() false or "network" errors). The class degrades to the manual
 *    ask() path; the server route works regardless. A server-side STT is the planned upgrade.
 *  - This module does not import Agent B's files; B wires the callbacks.
 */
import type { DynamicVoiceMsg } from "../../shared/protocol";
import type { Lang, Speaker } from "../../shared/types";

export type LiveDialogStatus = "unsupported" | "idle" | "listening" | "thinking" | "paused" | "error";

export interface DialogContext {
  sceneId: string | null;
  phaseTime: number;
}

export type DialogServerResponse =
  | { ok: true; reply: string; source: "gemini" | "canned"; cueId: string; speaker: Speaker; lang: Lang; ms?: number }
  | { ok: false; reason: string };

export interface LiveDialogOptions {
  /** http://host:port of the master (boot.serverHttpUrl); null disables the network path. */
  serverHttpUrl: string | null;
  /** boot.screenToken — sent as `Authorization: Bearer <token>`. */
  screenToken?: string | null;
  /** Character that answers (default CAPITANUL). */
  speaker?: Speaker;
  /** BCP-47 tag for recognition (default "ro-RO"). */
  recognitionLang?: string;
  /** Language of the reply/TTS (default "ro"). */
  lang?: Lang;
  getContext: () => DialogContext;
  /** Called with a ready-to-speak DynamicVoiceMsg (feed it to the dynamicVoice handler). */
  onReply: (voice: DynamicVoiceMsg, meta: { transcript: string; source: "gemini" | "canned"; ms: number }) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onStatus?: (status: LiveDialogStatus, detail?: string) => void;
  log?: (level: "info" | "warn" | "error", msg: string, data?: unknown) => void;
  /** Ignore final transcripts shorter than this (default 3 chars). */
  minChars?: number;
  requestTimeoutMs?: number;
  /** Delay before restarting a recognition session that ended on its own (default 800 ms). */
  restartDelayMs?: number;
}

// Minimal structural typings for the (prefixed) Web Speech API so this compiles under strict TS
// without relying on lib.dom's optional declarations.
interface RecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface RecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternativeLike;
}
interface RecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResultLike };
}
interface RecognitionErrorLike {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: RecognitionErrorLike) => void) | null;
  onresult: ((ev: RecognitionEventLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { webkitSpeechRecognition?: RecognitionCtor; SpeechRecognition?: RecognitionCtor };
  return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null;
}

/** Stable id for the TTS cache of a reply ("dyn-dialog-<hash>"); mirrors the server's fallback. */
export function dialogCueId(text: string): string {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `dyn-dialog-${h.toString(16).padStart(8, "0")}`;
}

/** Errors after which Chromium will not recover by restarting (permission / policy). */
const FATAL_ERRORS: ReadonlySet<string> = new Set(["not-allowed", "service-not-allowed", "language-not-supported", "audio-capture"]);

export class LiveDialog {
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;
  private paused = false;
  private busy = false;
  private status: LiveDialogStatus = "idle";
  private restartTimer: number | null = null;
  private consecutiveErrors = 0;
  private readonly opts: Required<Pick<LiveDialogOptions, "speaker" | "recognitionLang" | "lang" | "minChars" | "requestTimeoutMs" | "restartDelayMs">> & LiveDialogOptions;

  constructor(opts: LiveDialogOptions) {
    this.opts = {
      speaker: "CAPITANUL",
      recognitionLang: "ro-RO",
      lang: "ro",
      minChars: 3,
      requestTimeoutMs: 15_000,
      restartDelayMs: 800,
      ...opts,
    };
    if (!LiveDialog.isSupported()) this.status = "unsupported";
  }

  static isSupported(): boolean {
    return recognitionCtor() !== null;
  }

  getStatus(): LiveDialogStatus {
    return this.status;
  }

  isListening(): boolean {
    return this.active && this.status === "listening";
  }

  /** Start continuous recognition. Returns false when the API is unavailable. */
  start(): boolean {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      this.setStatus("unsupported", "webkitSpeechRecognition indisponibil în acest runtime");
      return false;
    }
    if (this.active) return true;
    this.active = true;
    this.consecutiveErrors = 0;
    this.spawn(Ctor);
    return true;
  }

  stop(): void {
    this.active = false;
    this.clearRestart();
    const rec = this.recognition;
    this.recognition = null;
    if (rec) {
      rec.onresult = rec.onend = rec.onerror = rec.onstart = null;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
    this.setStatus(LiveDialog.isSupported() ? "idle" : "unsupported");
  }

  /** Keep the microphone open but ignore transcripts (while the Captain speaks). */
  pause(): void {
    this.paused = true;
    if (this.active) this.setStatus("paused");
  }

  resume(): void {
    this.paused = false;
    if (this.active && !this.busy) this.setStatus("listening");
  }

  /**
   * Send a transcript (or typed text) to /api/dialog and hand the reply to onReply.
   * Resolves null when the server is unreachable/declines (already logged).
   */
  async ask(text: string): Promise<DynamicVoiceMsg | null> {
    const transcript = text.trim();
    if (!transcript) return null;
    if (!this.opts.serverHttpUrl) {
      this.log("warn", "live-dialog: serverHttpUrl lipsește; nu pot întreba Căpitanul");
      return null;
    }
    if (this.busy) {
      this.log("info", "live-dialog: o întrebare este deja în curs; ignor", { transcript });
      return null;
    }
    this.busy = true;
    const previous = this.status;
    this.setStatus("thinking");
    const t0 = performance.now();
    try {
      const response = await this.post(transcript);
      const ms = Math.round(performance.now() - t0);
      if (!response.ok) {
        this.log("warn", `live-dialog: răspuns refuzat: ${response.reason}`, { transcript });
        return null;
      }
      const voice: DynamicVoiceMsg = {
        type: "dynamicVoice",
        cueId: response.cueId || dialogCueId(response.reply),
        speaker: response.speaker ?? this.opts.speaker,
        text: response.reply,
        lang: response.lang ?? this.opts.lang,
        subtitle: true,
      };
      this.log("info", `live-dialog: ${response.source} în ${ms} ms`, { transcript, reply: response.reply });
      try {
        this.opts.onReply(voice, { transcript, source: response.source, ms });
      } catch (err) {
        this.log("error", "live-dialog: onReply a eșuat", { err: String(err) });
      }
      return voice;
    } catch (err) {
      this.log("warn", "live-dialog: cererea a eșuat", { err: String(err), transcript });
      return null;
    } finally {
      this.busy = false;
      if (this.active) this.setStatus(this.paused ? "paused" : "listening");
      else if (previous !== "unsupported") this.setStatus("idle");
    }
  }

  // ---- internals -------------------------------------------------------------

  private spawn(Ctor: RecognitionCtor): void {
    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch (err) {
      this.active = false;
      this.setStatus("error", `nu pot crea recunoașterea vocală: ${String(err)}`);
      return;
    }
    rec.lang = this.opts.recognitionLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      this.consecutiveErrors = 0;
      this.setStatus(this.paused ? "paused" : "listening");
    };
    rec.onresult = (ev) => this.handleResult(ev);
    rec.onerror = (ev) => {
      const code = ev?.error ?? "unknown";
      if (FATAL_ERRORS.has(code)) {
        this.log("error", `live-dialog: recunoașterea vocală a eșuat definitiv (${code})`, { message: ev?.message });
        this.active = false;
        this.setStatus("error", code);
        return;
      }
      // no-speech / aborted / network: onend follows and we restart with backoff.
      this.consecutiveErrors += 1;
      if (code !== "no-speech") this.log("warn", `live-dialog: eroare STT (${code}), reîncerc`, { attempt: this.consecutiveErrors });
    };
    rec.onend = () => {
      if (this.recognition !== rec) return;
      this.recognition = null;
      if (!this.active) return;
      if (this.consecutiveErrors >= 6) {
        this.active = false;
        this.setStatus("error", "STT indisponibil (prea multe erori consecutive)");
        return;
      }
      const delay = this.opts.restartDelayMs * Math.min(8, 1 + this.consecutiveErrors);
      this.clearRestart();
      this.restartTimer = window.setTimeout(() => {
        this.restartTimer = null;
        if (this.active) this.spawn(Ctor);
      }, delay);
    };
    this.recognition = rec;
    try {
      rec.start();
    } catch (err) {
      // "already started" or a synchronous failure: let onend/restart handle it.
      this.log("warn", "live-dialog: start() a aruncat", { err: String(err) });
    }
  }

  private handleResult(ev: RecognitionEventLike): void {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      const alt = result?.[0];
      const text = alt?.transcript?.trim() ?? "";
      if (!text) continue;
      try {
        this.opts.onTranscript?.(text, result.isFinal);
      } catch (err) {
        this.log("warn", "live-dialog: onTranscript a eșuat", { err: String(err) });
      }
      if (!result.isFinal) continue;
      if (this.paused || this.busy || text.length < this.opts.minChars) continue;
      void this.ask(text);
    }
  }

  private async post(text: string): Promise<DialogServerResponse> {
    const base = (this.opts.serverHttpUrl ?? "").replace(/\/+$/, "");
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), this.opts.requestTimeoutMs);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.opts.screenToken) headers.Authorization = `Bearer ${this.opts.screenToken}`;
      const res = await fetch(`${base}/api/dialog`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, speaker: this.opts.speaker, lang: this.opts.lang, context: this.opts.getContext() }),
        signal: ctrl.signal,
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        /* non-JSON error page */
      }
      if (!res.ok) {
        const reason = json && typeof json === "object" && typeof (json as { reason?: unknown }).reason === "string" ? (json as { reason: string }).reason : `HTTP ${res.status}`;
        return { ok: false, reason };
      }
      const value = json as Partial<Extract<DialogServerResponse, { ok: true }>> | null;
      if (!value || value.ok !== true || typeof value.reply !== "string" || !value.reply.trim()) return { ok: false, reason: "Răspuns /api/dialog invalid" };
      return {
        ok: true,
        reply: value.reply.trim(),
        source: value.source === "gemini" ? "gemini" : "canned",
        cueId: typeof value.cueId === "string" ? value.cueId : dialogCueId(value.reply),
        speaker: value.speaker ?? this.opts.speaker,
        lang: value.lang ?? this.opts.lang,
        ms: value.ms,
      };
    } finally {
      window.clearTimeout(timer);
    }
  }

  private clearRestart(): void {
    if (this.restartTimer !== null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private setStatus(status: LiveDialogStatus, detail?: string): void {
    if (this.status === status && !detail) return;
    this.status = status;
    try {
      this.opts.onStatus?.(status, detail);
    } catch (err) {
      this.log("warn", "live-dialog: onStatus a eșuat", { err: String(err) });
    }
  }

  private log(level: "info" | "warn" | "error", msg: string, data?: unknown): void {
    if (this.opts.log) this.opts.log(level, msg, data);
    else if (level === "error") console.error(msg, data ?? "");
    else if (level === "warn") console.warn(msg, data ?? "");
    else console.info(msg, data ?? "");
  }
}
