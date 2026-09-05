/**
 * D-03 — text pentru cue-urile `dynamic-voice` (replici compuse la runtime, rostite prin /api/tts).
 *
 * Surse (DynamicVoiceCue.source):
 *   - tablet-messages        : mesajele/raspunsurile trimise de pe tablete (V2 `message`/`answer`, sau V3
 *                              `choice`-uri cand nu exista mesaje) → `{{items}}` = pana la maxItems, unite cu "; ".
 *                              Sanitizare: fara URL-uri, fara caractere de control, max 120 caractere fiecare.
 *   - tablet-choices-summary : "Postul 1 a ales Auriu; Postul 2 a ales Verde și Albastru; Postul 3 a privit"
 *                              pentru cel mai recent cue `paired-choice` cu raspunsuri (sau cel dinaintea cue-ului dinamic).
 *   - live-dialog            : ultimul raspuns al dialogului live (features/dialog.ts, Agent C), passthrough.
 *
 * Sablonul `template.ro` accepta {{items}}, {{count}}, {{posts}}; lipsa datelor → `fallbackText.ro`.
 * Rezultatul este DynamicVoiceMsg pe care directorul il difuzeaza ecranelor (cueId stabil pentru cache-ul TTS).
 *
 * Fara I/O si fara stare: `createDynamicVoiceBuilder` leaga functia pura de registrul tabletelor si de show.
 */

import type { Cue, DynamicVoiceCue, Lang, ShowFile, TabletOption, TabletPost, TabletZone } from "../../shared/types";
import { TABLET_OBSERVE_VALUE } from "../../shared/types";
import type { DynamicVoiceMsg, TabletsMsg } from "../../shared/protocol";
import { shortHash } from "../state";

export type DynamicVoiceAnswer = TabletsMsg["answers"][number];

export interface DynamicVoiceContext {
  lang: Lang;
  /** Raspunsurile tabletelor (TabletRegistry.toMsg().answers) — toate tipurile. */
  answers: readonly DynamicVoiceAnswer[];
  /** Cue-urile show-ului (pentru a gasi cue-ul de tableta la care se refera rezumatul si etichetele optiunilor). */
  cues?: readonly Cue[];
  /** Ultimul raspuns al dialogului live (null daca nu exista). */
  lastDialogReply?: string | null;
  /** Etichetele posturilor (index 0 = postul 1); implicit "Postul N". */
  postLabels?: readonly string[];
}

export const MAX_MESSAGE_CHARS = 120;
const DEFAULT_MAX_ITEMS = 5;
const DEFAULT_SUMMARY_TEMPLATE = "Iată ce ați ales: {{items}}.";
const DEFAULT_MESSAGES_TEMPLATE = "Am primit mesajele voastre: {{items}}.";
const DEFAULT_FALLBACK = "Nu am primit încă niciun mesaj de la echipaj.";
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
// control chars, zero-width/format chars (U+200B..U+200F), line/paragraph separators, NBSP + narrow NBSP
const CONTROL_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu; // control + format (zero-width) + line/paragraph separators; NBSP is folded by \s+

/** Text sigur pentru TTS/subtitrare: fara URL-uri, fara caractere de control, spatii normalizate, max `max` caractere. */
export function sanitizeMessage(text: unknown, max = MAX_MESSAGE_CHARS): string {
  if (typeof text !== "string") return "";
  let t = text.replace(URL_RE, " ").replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
  if (t.length > max) {
    t = t.slice(0, max);
    const cut = t.lastIndexOf(" ");
    if (cut > max * 0.6) t = t.slice(0, cut);
    t = `${t.replace(/[\s,;:.!?…-]+$/, "")}…`;
  }
  return t;
}

/** Lista in limba romana: "a", "a și b", "a, b și c". */
export function joinRo(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} și ${items[items.length - 1]}`;
}

function render(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,;.!?])/g, "$1")
    .trim();
}

function postLabel(post: TabletPost | undefined, labels?: readonly string[]): string {
  if (!post) return "Un post";
  return `Postul ${post}${labels?.[post - 1] ? ` (${labels[post - 1]})` : ""}`;
}

function optionLabel(option: TabletOption): { value: string; label: string } {
  if (typeof option === "string") return { value: option, label: option };
  return { value: option.value, label: option.label };
}

/** Eticheta „umana” a unei valori alese: eticheta optiunii fara sufixul „· SIMBOL”, in litere normale. */
export function humanizeChoice(value: string, options?: readonly TabletOption[]): string {
  const found = options?.map(optionLabel).find((o) => o.value === value);
  const raw = (found?.label ?? value).split("·")[0].trim();
  if (!raw) return value;
  const lower = raw.toLocaleLowerCase("ro");
  return lower.charAt(0).toLocaleUpperCase("ro") + lower.slice(1);
}

/** Cue-ul `paired-choice` la care se refera rezumatul: ultimul cu raspunsuri; altfel cel dinaintea cue-ului dinamic. */
export function pickSummaryCue(cue: DynamicVoiceCue, ctx: DynamicVoiceContext): Extract<Cue, { kind: "tablet" }> | null {
  const tabletCues = (ctx.cues ?? []).filter(
    (c): c is Extract<Cue, { kind: "tablet" }> => c.kind === "tablet" && c.interaction.type === "paired-choice",
  );
  const withAnswers = new Set(ctx.answers.filter((a) => a.kind === "choice").map((a) => a.cueId));
  const answered = tabletCues.filter((c) => withAnswers.has(c.id));
  if (answered.length) {
    // Prefer the most recently answered interaction (by the latest answer time).
    let best: Extract<Cue, { kind: "tablet" }> | null = null;
    let bestAt = -1;
    for (const c of answered) {
      const at = Math.max(...ctx.answers.filter((a) => a.cueId === c.id).map((a) => a.atMs));
      if (at > bestAt) {
        bestAt = at;
        best = c;
      }
    }
    return best;
  }
  const order: Record<Cue["phase"], number> = { preshow: 0, play: 1, epilogue: 2 };
  const before = tabletCues.filter((c) => order[c.phase] < order[cue.phase] || (c.phase === cue.phase && c.at <= cue.at));
  return before.sort((a, b) => order[b.phase] - order[a.phase] || b.at - a.at)[0] ?? null;
}

/** "Postul 1 a ales Auriu; Postul 2 a ales Verde și Albastru; Postul 3 a privit". */
export function summarizeChoices(cueId: string, ctx: DynamicVoiceContext, options?: readonly TabletOption[]): { items: string[]; posts: TabletPost[] } {
  const byPost = new Map<TabletPost, Map<TabletZone, string>>();
  for (const a of ctx.answers) {
    if (a.kind !== "choice" || a.cueId !== cueId || !a.post || !a.zone) continue;
    const zones = byPost.get(a.post) ?? new Map<TabletZone, string>();
    zones.set(a.zone, a.text === "Doar privesc" ? TABLET_OBSERVE_VALUE : a.text);
    byPost.set(a.post, zones);
  }
  const posts = [...byPost.keys()].sort((x, y) => x - y);
  const items = posts.map((post) => {
    const values = [...byPost.get(post)!.values()];
    const expressed = [...new Set(values.filter((v) => v !== TABLET_OBSERVE_VALUE))];
    const who = postLabel(post, ctx.postLabels);
    if (!expressed.length) return `${who} a privit`;
    return `${who} a ales ${joinRo(expressed.map((v) => humanizeChoice(v, options)))}`;
  });
  return { items, posts };
}

/** Construieste mesajul rostit pentru un cue `dynamic-voice`. Pur; nu arunca. */
export function buildDynamicVoice(cue: DynamicVoiceCue, ctx: DynamicVoiceContext): DynamicVoiceMsg {
  const maxItems = Math.max(1, Math.min(20, cue.maxItems ?? DEFAULT_MAX_ITEMS));
  const fallback = sanitizeMessage(cue.fallbackText?.ro ?? DEFAULT_FALLBACK, 400);
  let text = "";

  switch (cue.source) {
    case "tablet-messages": {
      const messages = ctx.answers
        .filter((a) => a.kind === "message" || a.kind === "answer")
        .sort((a, b) => a.atMs - b.atMs)
        .map((a) => sanitizeMessage(a.text))
        .filter(Boolean);
      // V3 has no free text: fall back to the humanised choices so the Captain still has something to read.
      const pool = messages.length
        ? messages
        : ctx.answers
            .filter((a) => a.kind === "choice" && a.text !== "Doar privesc")
            .sort((a, b) => a.atMs - b.atMs)
            .map((a) => sanitizeMessage(humanizeChoice(a.text)))
            .filter(Boolean);
      const unique = [...new Set(pool)].slice(-maxItems);
      if (!unique.length) {
        text = fallback;
        break;
      }
      const posts = [...new Set(ctx.answers.map((a) => a.post).filter((p): p is TabletPost => !!p))].sort((x, y) => x - y);
      text = render(cue.template?.ro ?? DEFAULT_MESSAGES_TEMPLATE, {
        items: unique.join("; "),
        count: String(unique.length),
        posts: joinRo(posts.map((p) => postLabel(p, ctx.postLabels))),
      });
      break;
    }
    case "tablet-choices-summary": {
      const target = pickSummaryCue(cue, ctx);
      const options = target && target.interaction.type === "paired-choice" ? target.interaction.options : undefined;
      const { items, posts } = target ? summarizeChoices(target.id, ctx, options) : { items: [], posts: [] };
      if (!items.length) {
        text = fallback;
        break;
      }
      text = render(cue.template?.ro ?? DEFAULT_SUMMARY_TEMPLATE, {
        items: items.slice(0, maxItems).join("; "),
        count: String(items.length),
        posts: joinRo(posts.map((p) => postLabel(p, ctx.postLabels))),
      });
      break;
    }
    case "live-dialog": {
      const reply = sanitizeMessage(ctx.lastDialogReply ?? "", 600);
      text = reply || fallback;
      break;
    }
    default:
      text = fallback;
  }
  if (!text) text = fallback;
  return {
    type: "dynamicVoice",
    cueId: `dyn-${cue.id}-${shortHash(`${cue.speaker}|${ctx.lang}|${text}`)}`,
    speaker: cue.speaker,
    text,
    lang: ctx.lang,
    subtitle: true,
  };
}

export interface DynamicVoiceDeps {
  getAnswers: () => readonly DynamicVoiceAnswer[];
  getShow: () => ShowFile;
  getDialogReply?: () => string | null;
  getPostLabels?: () => readonly string[];
}

/** Leaga builder-ul de registrul tabletelor si de show: `director.setDynamicVoiceBuilder(createDynamicVoiceBuilder({...}))`. */
export function createDynamicVoiceBuilder(deps: DynamicVoiceDeps): (cue: DynamicVoiceCue, lang: Lang) => DynamicVoiceMsg {
  return (cue, lang) =>
    buildDynamicVoice(cue, {
      lang,
      answers: deps.getAnswers(),
      cues: deps.getShow().cues,
      lastDialogReply: deps.getDialogReply?.() ?? null,
      postLabels: deps.getPostLabels?.(),
    });
}
