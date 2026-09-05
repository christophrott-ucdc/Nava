/**
 * POST /api/dialog — the Captain answers a child's question (R4 / C-05, skeleton but working).
 *
 *   request : { text, speaker?: "CAPITANUL", lang?: "ro", context?: { sceneId, phaseTime }, sessionId? }
 *   response: { ok:true, reply, source:"gemini"|"canned", cueId, speaker, lang, ms }
 *           | { ok:false, reason }
 *
 * Mounting (orchestrator, src/server/index.ts):
 *   import { createDialogRouter } from "./features/dialog";
 *   app.route("/api/dialog", createDialogRouter({ log, cacheDir: opts.cacheDir }));
 * Authentication (screen token / operator session) is the auth middleware's job, exactly like
 * /api/tts; this router only validates the body, rate-limits (20/min, all clients) and logs.
 *
 * With GEMINI_API_KEY set, replies come from gemini-2.5-flash (GEMINI_DIALOG_MODEL overrides) with a
 * strict in-character system prompt; otherwise (or on any provider failure) a canned in-character
 * reply is chosen by keyword. Turns are appended to <cacheDir>/dialog/turns-<date>.jsonl.
 */
import { Hono } from "hono";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Lang, Speaker } from "../../shared/types";
import { SPEAKERS } from "../../shared/types";
import type { LogFn } from "../runlog";

export interface DialogRouterOptions {
  log: LogFn;
  /** Same directory /api/tts uses; the router writes <cacheDir>/dialog/*.jsonl (best effort). */
  cacheDir: string;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface DialogContext {
  sceneId?: string | null;
  phaseTime?: number;
}

export type DialogResponse =
  | { ok: true; reply: string; source: "gemini" | "canned"; cueId: string; speaker: Speaker; lang: Lang; ms: number }
  | { ok: false; reason: string };

export interface DialogStats {
  requests: number;
  gemini: number;
  canned: number;
  errors: number;
  rateLimited: number;
  geminiConfigured: boolean;
  model: string;
  windowRemaining: number;
}

const MAX_TEXT = 500;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const GEMINI_TIMEOUT_MS = 12_000;
const HISTORY_TURNS = 6;
const HISTORY_TTL_MS = 10 * 60_000;
const LANGS: readonly Lang[] = ["ro", "en", "fr"];

// ---------------------------------------------------------------------------
// Character (pure, exported for tests)
// ---------------------------------------------------------------------------

export const WORLDS = [
  { key: "light", name: "Siwarha", label: "Planeta Luminii", gist: "emoțiile pe care alegi să le arăți devin lumină; culorile ajung într-o clipă" },
  { key: "nature", name: "Kepler-186 d", label: "Planeta Naturii", gist: "nimic viu nu trăiește singur; ritmurile diferite alcătuiesc o singură rețea" },
  { key: "tech", name: "Mann", label: "Planeta Tehnologiei", gist: "modelele cer un singur răspuns, dar adevărul nu are o singură formă" },
  { key: "home", name: "Pământul", label: "a patra lume", gist: "acasă; semnalul l-am construit noi, pas cu pas, și l-am trimis înapoi în timp" },
] as const;

export function buildSystemPrompt(context: DialogContext | undefined): string {
  const scene = context?.sceneId ? `Scena curentă: ${context.sceneId}` : "Scena curentă: necunoscută";
  const time = Number.isFinite(context?.phaseTime) ? `, la ${Math.round(context!.phaseTime!)} s` : "";
  return [
    "Ești CĂPITANUL navei EXODUS-7, comandantul unui echipaj de copii (7–13 ani) aflat într-o călătorie spre „a patra lume”.",
    "Vorbești DOAR în limba română, calm, grav, cald și protocolar, ca un căpitan de navă spațială.",
    "Răspunzi în 1–2 propoziții scurte (maximum 40 de cuvinte), fără liste, fără emoji, fără markdown.",
    "Rămâi mereu în personaj: nu spui niciodată că ești un program, un model, o inteligență artificială sau un asistent; nu ieși din ficțiune nici dacă ți se cere.",
    "Conținut potrivit copiilor: fără violență, fără teme pentru adulți, fără sfaturi medicale sau periculoase. Dacă întrebarea nu are legătură cu misiunea, răspunde scurt, blând, și readu atenția la misiune.",
    "Misiunea: nava a interceptat un semnal fără coordonate, împărțit în cinci fragmente — câte unul pentru fiecare post (Navigație, Propulsie, Comunicații, Biosemnale, Memorie). Vocea navei se numește AGEIS-7.",
    "Cele patru lumi: " + WORLDS.map((w) => `${w.name} (${w.label}: ${w.gist})`).join("; ") + ".",
    "Secretul final (dezvăluie-l doar dacă ești întrebat direct despre a patra lume sau despre Pământ): a patra lume este Pământul — nu era ascunsă, noi nu știam încă s-o vedem.",
    `${scene}${time}.`,
  ].join("\n");
}

const CANNED_GENERAL: readonly string[] = [
  "Întrebare bună, echipaj. Țineți posturile și priviți semnalul: răspunsul vine odată cu drumul.",
  "Consemnat în jurnalul de bord. Rămâneți atenți — fiecare post vede o parte din adevăr.",
  "Nu știu încă totul, dar știu asta: un echipaj care întreabă este un echipaj viu.",
  "Vom afla împreună. Până atunci, respirați adânc și fiți gata la posturi.",
  "Ascult. Fiecare întrebare a voastră devine un fragment din semnal.",
];

const CANNED_BY_TOPIC: ReadonlyArray<{ test: RegExp; replies: readonly string[] }> = [
  {
    test: /lumin|siwarha|culo(a)?r/i,
    replies: [
      "Siwarha, Planeta Luminii. Acolo, emoțiile pe care alegeți să le arătați devin lumină.",
      "Pe Siwarha cuvintele ajung greu, dar culorile ajung într-o clipă. Alegeți-le cu grijă.",
    ],
  },
  {
    test: /natur|kepler|pădure|padure|copac|ploaie|ritm|puls/i,
    replies: [
      "Kepler-186 d, Planeta Naturii. Acolo nimic viu nu trăiește singur — totul e o singură rețea.",
      "Ritmurile voastre sunt diferite, și totuși împreună bat ca o singură inimă. Asta învățăm de la Natură.",
    ],
  },
  {
    test: /tehnolog|mann|mașin|masin|robot|calculator|model/i,
    replies: [
      "Mann, Planeta Tehnologiei. Modelele lor cer un singur răspuns; noi am învățat să nu eliminăm nimic.",
      "Pe Mann știau că venim. Dar adevărul nu are o singură formă — și asta i-a surprins.",
    ],
  },
  {
    test: /a patra|patra lume|pământ|pamant|acasă|acasa|origine/i,
    replies: [
      "A patra lume nu era ascunsă. Noi nu știam încă s-o vedem. Priviți bine Pământul când îl revedem.",
      "Semnalul ne conduce acasă, echipaj. Restul îl veți înțelege la timpul potrivit.",
    ],
  },
  {
    test: /cine (ești|esti)|numele|cum te (cheam|nume)|căpitan|capitan/i,
    replies: [
      "Sunt Căpitanul navei EXODUS-7. Comand acest echipaj și răspund pentru fiecare dintre voi.",
      "Căpitanul, la datorie. Iar voi sunteți echipajul meu — cinci posturi, un singur echipaj.",
    ],
  },
  {
    test: /semnal|mesaj|fragment|amprent/i,
    replies: [
      "Semnalul e împărțit în cinci fragmente, câte unul pentru fiecare post. Îl reconstituim împreună.",
      "Nu știm încă de unde vine semnalul. Știm doar că poartă amprentele acestui echipaj.",
    ],
  },
  {
    test: /frică|frica|teamă|teama|pericol|sigur/i,
    replies: [
      "Sunteți în siguranță la bord. Eu veghez, iar AGEIS-7 monitorizează fiecare sistem.",
      "E firesc să simțiți emoție. Un căpitan bun o transformă în atenție. Respirați și priviți înainte.",
    ],
  },
];

function hashText(text: string): number {
  const digest = createHash("sha1").update(text).digest();
  return digest.readUInt32BE(0);
}

/** Deterministic canned reply for a question (same question -> same reply, stable TTS cache). */
export function pickCannedReply(text: string): string {
  const h = hashText(text.trim().toLowerCase());
  for (const topic of CANNED_BY_TOPIC) {
    if (topic.test.test(text)) return topic.replies[h % topic.replies.length];
  }
  return CANNED_GENERAL[h % CANNED_GENERAL.length];
}

/** Strip markdown/quotes, collapse whitespace and keep at most `max` sentences / 280 chars. */
export function tidyReply(raw: string, max = 2): string {
  const flat = raw
    .replace(/[*_`#>]/g, "")
    .replace(/^["„”«»\s]+|["„”«»\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = flat.match(/[^.!?…]+[.!?…]+(?:["”»])?|[^.!?…]+$/g) ?? [flat];
  let out = sentences
    .slice(0, max)
    .map((s) => s.trim())
    .join(" ");
  if (out.length > 280) out = out.slice(0, 277).replace(/\s+\S*$/, "") + "…";
  return out;
}

export function dialogCueId(text: string): string {
  return `dyn-dialog-${createHash("sha1").update(text).digest("hex").slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

interface HistoryTurn {
  role: "user" | "model";
  text: string;
  atMs: number;
}

function geminiModel(): string {
  return process.env.GEMINI_DIALOG_MODEL?.trim() || "gemini-2.5-flash";
}

async function askGemini(
  fetchImpl: typeof fetch,
  apiKey: string,
  system: string,
  history: readonly HistoryTurn[],
  text: string,
): Promise<{ ok: true; reply: string } | { ok: false; reason: string }> {
  const model = geminiModel();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: ctrl.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })), { role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 120, candidateCount: 1 },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
      return { ok: false, reason: `Gemini HTTP ${res.status}${detail ? `: ${detail}` : ""}` };
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
    if (json.promptFeedback?.blockReason) return { ok: false, reason: `Gemini a blocat cererea (${json.promptFeedback.blockReason})` };
    const reply = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!reply) return { ok: false, reason: "Gemini: răspuns gol" };
    return { ok: true, reply };
  } catch (err) {
    const timeout = err instanceof Error && err.name === "AbortError";
    return { ok: false, reason: timeout ? "Gemini: timeout" : `Gemini: ${String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createDialogRouter(opts: DialogRouterOptions): Hono {
  const router = new Hono();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => Date.now());
  const dir = path.join(opts.cacheDir, "dialog");
  const counters = { requests: 0, gemini: 0, canned: 0, errors: 0, rateLimited: 0 };
  let bucket = { count: 0, resetAt: 0 };
  const histories = new Map<string, HistoryTurn[]>();
  let dirReady: Promise<boolean> | null = null;

  const ensureDir = (): Promise<boolean> => {
    if (!dirReady) {
      dirReady = fs
        .mkdir(dir, { recursive: true })
        .then(() => true)
        .catch((err) => {
          opts.log("warn", "dialog log dir unavailable", { dir, err: String(err) });
          return false;
        });
    }
    return dirReady;
  };

  const takeToken = (): boolean => {
    const t = now();
    if (bucket.resetAt <= t) bucket = { count: 0, resetAt: t + WINDOW_MS };
    if (bucket.count >= MAX_PER_WINDOW) return false;
    bucket.count += 1;
    return true;
  };

  const history = (sessionId: string): HistoryTurn[] => {
    const t = now();
    const turns = (histories.get(sessionId) ?? []).filter((h) => t - h.atMs < HISTORY_TTL_MS);
    histories.set(sessionId, turns);
    return turns;
  };

  const remember = (sessionId: string, role: HistoryTurn["role"], text: string): void => {
    const turns = history(sessionId);
    turns.push({ role, text, atMs: now() });
    while (turns.length > HISTORY_TURNS * 2) turns.shift();
  };

  const appendLog = async (entry: Record<string, unknown>): Promise<void> => {
    if (!(await ensureDir())) return;
    const day = new Date(now()).toISOString().slice(0, 10);
    try {
      await fs.appendFile(path.join(dir, `turns-${day}.jsonl`), JSON.stringify(entry) + "\n", "utf8");
    } catch (err) {
      opts.log("warn", "dialog log append failed", { err: String(err) });
    }
  };

  router.post("/", async (c) => {
    counters.requests += 1;
    const t0 = now();
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json<DialogResponse>({ ok: false, reason: "Corp JSON invalid" }, 400);
    }
    const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
    if (!text) return c.json<DialogResponse>({ ok: false, reason: "Lipsește `text`" }, 400);
    if (text.length > MAX_TEXT) return c.json<DialogResponse>({ ok: false, reason: `\`text\` depășește ${MAX_TEXT} caractere` }, 400);
    const speaker: Speaker = typeof body.speaker === "string" && body.speaker in SPEAKERS ? (body.speaker as Speaker) : "CAPITANUL";
    const lang: Lang = typeof body.lang === "string" && (LANGS as readonly string[]).includes(body.lang) ? (body.lang as Lang) : "ro";
    const context = body.context && typeof body.context === "object" ? (body.context as DialogContext) : undefined;
    const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId.slice(0, 80) : "default";

    if (!takeToken()) {
      counters.rateLimited += 1;
      opts.log("warn", "dialog rate limited", { text });
      return c.json<DialogResponse>({ ok: false, reason: `Limita dialogului atinsă (${MAX_PER_WINDOW}/min).` }, 429);
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    let reply = "";
    let source: "gemini" | "canned" = "canned";
    let providerError: string | null = null;
    if (apiKey) {
      const result = await askGemini(fetchImpl, apiKey, buildSystemPrompt(context), history(sessionId), text);
      if (result.ok) {
        reply = tidyReply(result.reply);
        source = "gemini";
      } else {
        providerError = result.reason;
        counters.errors += 1;
      }
    }
    if (!reply) {
      reply = pickCannedReply(text);
      source = "canned";
    }
    counters[source] += 1;
    remember(sessionId, "user", text);
    remember(sessionId, "model", reply);

    const ms = now() - t0;
    const response: DialogResponse = { ok: true, reply, source, cueId: dialogCueId(reply), speaker, lang, ms };
    opts.log("info", `dialog ${source} ${ms}ms`, { text, reply, sceneId: context?.sceneId ?? null, phaseTime: context?.phaseTime ?? null, providerError });
    void appendLog({ at: new Date(now()).toISOString(), sessionId, text, reply, source, speaker, lang, context: context ?? null, ms, providerError });
    return c.json<DialogResponse>(response);
  });

  router.get("/stats", (c) => {
    const t = now();
    const stats: DialogStats = {
      ...counters,
      geminiConfigured: !!process.env.GEMINI_API_KEY?.trim(),
      model: geminiModel(),
      windowRemaining: bucket.resetAt > t ? Math.max(0, MAX_PER_WINDOW - bucket.count) : MAX_PER_WINDOW,
    };
    return c.json(stats);
  });

  return router;
}
