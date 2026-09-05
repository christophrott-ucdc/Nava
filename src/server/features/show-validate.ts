/**
 * Validarea unui fisier de show (assets/show/show.json) — folosita de editorul de cue-uri (PUT /api/show),
 * de restaurarea backup-urilor si, optional, de server la incarcare (in loc de `loadShowFile` din index.ts).
 *
 * Reproduce verificarile din `scripts/validate-show.mjs` si din `loadShowFile` (src/server/index.ts):
 *   - radacina obiect, `scenes`/`cues` array, `videoDurationSec` > 0, `launchLeadInSec` >= 0;
 *   - scene: id unic, faza/tema valide, interval valid, fara suprapuneri in aceeasi faza;
 *   - cue-uri: id unic (<= 128), `at` finit, faza/kind valide, campuri specifice fiecarui kind
 *     (inclusiv R4: dynamic-voice / ambient / lights / photo), `at` in intervalul fazei `play`;
 *   - ordinea `at` in interiorul unei faze si invariantele V3 (0.5.0-ro-stage) sunt AVERTISMENTE
 *     (editorul reordoneaza cue-urile la salvare; invariantele V3 sunt contractul scriptului `validate:show`).
 *
 * Fara I/O: primeste JSON-ul deja parsat si intoarce erori/avertismente + show-ul normalizat.
 */

import type { Cue, Phase, SceneTheme, ShowFile, Speaker } from "../../shared/types";
import { SPEAKERS } from "../../shared/types";

export const PHASES: readonly Phase[] = ["preshow", "play", "epilogue"];
export const SCENE_THEMES: readonly SceneTheme[] = ["prologue", "launch", "light", "nature", "tech", "void", "home", "white"];
export const CUE_KINDS: readonly Cue["kind"][] = [
  "voice",
  "countdown",
  "sfx",
  "entity",
  "tablet",
  "theme",
  "marker",
  "dynamic-voice",
  "ambient",
  "lights",
  "photo",
];
export const SFX_NAMES: readonly string[] = ["liftoff-rumble", "low-swell", "wormhole-whoosh", "arrival-chime", "rain", "white-fade"];
export const ENTITIES: readonly string[] = ["LUMINA", "NATURA", "TEHNOLOGIC"];
export const DYNAMIC_SOURCES: readonly string[] = ["tablet-messages", "tablet-choices-summary", "live-dialog"];
export const AMBIENT_ACTIONS: readonly string[] = ["start", "stop", "crossfade"];
const PHASE_ORDER: Record<Phase, number> = { preshow: 0, play: 1, epilogue: 2 };
const MAX_ID_LEN = 128;

export interface ShowValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Show-ul normalizat (campuri implicite completate); prezent doar cand `ok`. */
  show?: ShowFile;
}

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isSpeaker = (v: unknown): v is Speaker => typeof v === "string" && v in SPEAKERS;
const isTheme = (v: unknown): v is SceneTheme => typeof v === "string" && (SCENE_THEMES as readonly string[]).includes(v);
const isPhase = (v: unknown): v is Phase => typeof v === "string" && (PHASES as readonly string[]).includes(v);

function optionValid(option: unknown): boolean {
  if (typeof option === "string") return option.trim().length > 0;
  return isRec(option) && nonEmpty(option.value) && nonEmpty(option.label);
}

function roText(v: unknown): v is { ro: string } {
  return isRec(v) && nonEmpty(v.ro);
}

/** Verifica un cue individual; intoarce lista de erori (goala = valid). */
export function validateCue(cue: unknown, where: string, show: { launchLeadInSec: number; videoDurationSec: number }): string[] {
  const errors: string[] = [];
  if (!isRec(cue)) return [`${where} trebuie să fie un obiect`];
  const id = typeof cue.id === "string" ? cue.id : "";
  const label = id ? `cue "${id}"` : where;
  if (!nonEmpty(cue.id)) errors.push(`${where}.id este obligatoriu`);
  else if (id.length > MAX_ID_LEN) errors.push(`${label}: id mai lung de ${MAX_ID_LEN} caractere`);
  if (!isPhase(cue.phase)) errors.push(`${label}: fază invalidă "${String(cue.phase)}"`);
  if (!isFiniteNum(cue.at)) errors.push(`${label}: \`at\` trebuie să fie un număr finit`);
  if (cue.manual !== undefined && typeof cue.manual !== "boolean") errors.push(`${label}: \`manual\` trebuie să fie boolean`);
  if (cue.note !== undefined && typeof cue.note !== "string") errors.push(`${label}: \`note\` trebuie să fie text`);
  if (typeof cue.kind !== "string" || !(CUE_KINDS as readonly string[]).includes(cue.kind)) {
    errors.push(`${label}: tip de cue necunoscut "${String(cue.kind)}"`);
    return errors;
  }
  if (cue.phase === "play" && isFiniteNum(cue.at)) {
    if (cue.at < -show.launchLeadInSec) errors.push(`${label}: \`at\` (${cue.at}) este înaintea lead-in-ului (-${show.launchLeadInSec})`);
    if (show.videoDurationSec > 0 && cue.at > show.videoDurationSec) errors.push(`${label}: \`at\` (${cue.at}) este după finalul filmului (${show.videoDurationSec})`);
  } else if (isFiniteNum(cue.at) && cue.at < 0) {
    errors.push(`${label}: \`at\` negativ este permis doar în faza play`);
  }

  switch (cue.kind) {
    case "voice":
      if (!isSpeaker(cue.speaker)) errors.push(`${label}: vorbitor invalid`);
      if (!roText(cue.text)) errors.push(`${label}: lipsește textul în română (text.ro)`);
      if (cue.fallback !== undefined && cue.fallback !== "browser" && cue.fallback !== "silent") errors.push(`${label}: fallback invalid`);
      if (cue.subtitleHoldMs !== undefined && !isFiniteNum(cue.subtitleHoldMs)) errors.push(`${label}: subtitleHoldMs invalid`);
      if (cue.variants !== undefined) {
        if (!isRec(cue.variants)) errors.push(`${label}: variants trebuie să fie un obiect`);
        else for (const [k, v] of Object.entries(cue.variants)) if (!isRec(v)) errors.push(`${label}: varianta "${k}" invalidă`);
      }
      break;
    case "dynamic-voice":
      if (!isSpeaker(cue.speaker)) errors.push(`${label}: vorbitor invalid`);
      if (typeof cue.source !== "string" || !DYNAMIC_SOURCES.includes(cue.source)) errors.push(`${label}: source invalid`);
      if (cue.template !== undefined && !roText(cue.template)) errors.push(`${label}: template.ro lipsă`);
      if (cue.fallbackText !== undefined && !roText(cue.fallbackText)) errors.push(`${label}: fallbackText.ro lipsă`);
      if (cue.maxItems !== undefined && (!isFiniteNum(cue.maxItems) || cue.maxItems < 1)) errors.push(`${label}: maxItems invalid`);
      break;
    case "countdown":
      if (!isFiniteNum(cue.from) || !isFiniteNum(cue.to)) errors.push(`${label}: from/to invalide`);
      if (cue.durationSec !== undefined && (!isFiniteNum(cue.durationSec) || cue.durationSec <= 0)) errors.push(`${label}: durationSec invalid`);
      break;
    case "sfx":
      if (typeof cue.sfx !== "string" || !SFX_NAMES.includes(cue.sfx)) errors.push(`${label}: sfx necunoscut "${String(cue.sfx)}"`);
      break;
    case "entity":
      if (typeof cue.entity !== "string" || !ENTITIES.includes(cue.entity)) errors.push(`${label}: entitate invalidă`);
      if (cue.action !== "show" && cue.action !== "hide") errors.push(`${label}: action trebuie să fie show/hide`);
      break;
    case "theme":
    case "lights":
      if (!isTheme(cue.theme)) errors.push(`${label}: temă invalidă "${String(cue.theme)}"`);
      if (cue.kind === "lights" && cue.fadeSec !== undefined && (!isFiniteNum(cue.fadeSec) || cue.fadeSec < 0)) errors.push(`${label}: fadeSec invalid`);
      break;
    case "ambient":
      if (typeof cue.action !== "string" || !AMBIENT_ACTIONS.includes(cue.action)) errors.push(`${label}: action invalid`);
      if (cue.bed !== undefined && !isTheme(cue.bed)) errors.push(`${label}: bed invalid`);
      if (cue.gain !== undefined && (!isFiniteNum(cue.gain) || cue.gain < 0 || cue.gain > 1)) errors.push(`${label}: gain în afara 0..1`);
      if (cue.fadeSec !== undefined && (!isFiniteNum(cue.fadeSec) || cue.fadeSec < 0)) errors.push(`${label}: fadeSec invalid`);
      break;
    case "photo":
      if (cue.countdownSec !== undefined && (!isFiniteNum(cue.countdownSec) || cue.countdownSec < 0 || cue.countdownSec > 30)) errors.push(`${label}: countdownSec invalid`);
      if (cue.showSec !== undefined && (!isFiniteNum(cue.showSec) || cue.showSec < 0 || cue.showSec > 600)) errors.push(`${label}: showSec invalid`);
      break;
    case "marker":
      if (!nonEmpty(cue.label)) errors.push(`${label}: marker fără etichetă`);
      break;
    case "tablet": {
      const inter = cue.interaction;
      if (!isRec(inter) || typeof inter.type !== "string") {
        errors.push(`${label}: interacțiune tabletă invalidă`);
        break;
      }
      const type = inter.type;
      let valid = false;
      if (type === "waiting" || type === "thanks") valid = true;
      else if (type === "question" || type === "message") valid = nonEmpty(inter.prompt);
      else if (type === "role-pick") valid = Array.isArray(inter.roles) && inter.roles.length > 0 && inter.roles.every(nonEmpty);
      else if (type === "vote") valid = nonEmpty(inter.prompt) && Array.isArray(inter.options) && inter.options.length > 0 && inter.options.every(nonEmpty);
      else if (type === "post-assign")
        valid = Array.isArray(inter.posts) && inter.posts.length === 5 && inter.posts.every(nonEmpty) && new Set(inter.posts).size === 5;
      else if (type === "paired-choice")
        valid =
          nonEmpty(inter.prompt) &&
          Array.isArray(inter.options) &&
          inter.options.length > 0 &&
          inter.options.every(optionValid) &&
          inter.allowObserve === true &&
          (inter.mode === "color" || inter.mode === "pulse" || inter.mode === "perspective") &&
          (inter.timeoutSec === undefined || (isFiniteNum(inter.timeoutSec) && inter.timeoutSec > 0));
      if (!valid) errors.push(`${label}: interacțiune tabletă "${type}" invalidă`);
      break;
    }
    default:
      break;
  }
  return errors;
}

/** Valideaza si normalizeaza un show. Nu arunca; erorile sunt in `errors`. */
export function validateShowFile(input: unknown): ShowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRec(input)) return { ok: false, errors: ["show.json trebuie să fie un obiect"], warnings };
  const json = input;
  if (!Array.isArray(json.scenes)) errors.push("`scenes` trebuie să fie o listă");
  if (!Array.isArray(json.cues)) errors.push("`cues` trebuie să fie o listă");
  if (!isFiniteNum(json.videoDurationSec) || json.videoDurationSec <= 0) errors.push("`videoDurationSec` trebuie să fie pozitiv");
  if (json.launchLeadInSec !== undefined && (!isFiniteNum(json.launchLeadInSec) || json.launchLeadInSec < 0)) errors.push("`launchLeadInSec` trebuie să fie >= 0");
  if (json.epilogueOnVideoEnd !== undefined && typeof json.epilogueOnVideoEnd !== "boolean") errors.push("`epilogueOnVideoEnd` trebuie să fie boolean");
  if (json.preshowAutoStart !== undefined && typeof json.preshowAutoStart !== "boolean") errors.push("`preshowAutoStart` trebuie să fie boolean");
  if (json.variants !== undefined) {
    if (!isRec(json.variants)) errors.push("`variants` trebuie să fie un obiect");
    else
      for (const [k, v] of Object.entries(json.variants)) {
        if (!isRec(v) || !nonEmpty(v.label) || !nonEmpty(v.ageRange)) errors.push(`varianta "${k}" are nevoie de label și ageRange`);
      }
  }
  if (errors.length) return { ok: false, errors, warnings };

  const launchLeadInSec = isFiniteNum(json.launchLeadInSec) ? json.launchLeadInSec : 10;
  const videoDurationSec = json.videoDurationSec as number;

  // --- scene -------------------------------------------------------------------
  const sceneIds = new Set<string>();
  const ranges = new Map<Phase, Array<{ id: string; start: number; end: number }>>();
  for (const [index, value] of (json.scenes as unknown[]).entries()) {
    const where = `scene[${index}]`;
    if (!isRec(value)) {
      errors.push(`${where} trebuie să fie un obiect`);
      continue;
    }
    const id = typeof value.id === "string" ? value.id : "";
    if (!nonEmpty(value.id)) errors.push(`${where}.id este obligatoriu`);
    else if (sceneIds.has(id)) errors.push(`id de scenă duplicat: ${id}`);
    else sceneIds.add(id);
    if (typeof value.label !== "string") errors.push(`${where}: label lipsă`);
    if (!isPhase(value.phase)) errors.push(`${where}: fază invalidă`);
    if (!isTheme(value.theme)) errors.push(`${where}: temă invalidă`);
    if (!isFiniteNum(value.start) || !isFiniteNum(value.end) || value.end <= value.start) errors.push(`${where}: interval invalid`);
    else if (isPhase(value.phase)) {
      const list = ranges.get(value.phase) ?? [];
      list.push({ id, start: value.start, end: value.end });
      ranges.set(value.phase, list);
    }
  }
  for (const [phase, list] of ranges) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i += 1) {
      if (list[i].start < list[i - 1].end) errors.push(`scenele din ${phase} se suprapun: ${list[i - 1].id} și ${list[i].id}`);
    }
  }

  // --- cue-uri -------------------------------------------------------------------
  const cueIds = new Set<string>();
  const lastAt = new Map<string, number>();
  let outOfOrder = 0;
  for (const [index, value] of (json.cues as unknown[]).entries()) {
    const where = `cue[${index}]`;
    errors.push(...validateCue(value, where, { launchLeadInSec, videoDurationSec }));
    if (!isRec(value)) continue;
    if (typeof value.id === "string" && value.id) {
      if (cueIds.has(value.id)) errors.push(`id de cue duplicat: ${value.id}`);
      cueIds.add(value.id);
    }
    if (typeof value.phase === "string" && isFiniteNum(value.at)) {
      const prior = lastAt.get(value.phase);
      if (prior !== undefined && value.at < prior) outOfOrder += 1;
      lastAt.set(value.phase, value.at);
    }
  }
  if (outOfOrder) warnings.push(`${outOfOrder} cue-uri nu sunt în ordinea \`at\` în faza lor (vor fi reordonate la salvare)`);

  // --- invariante V3 (avertismente) -------------------------------------------------
  if (json.version === "0.5.0-ro-stage" && !errors.length) {
    const cues = json.cues as Rec[];
    const voices = cues.filter((c) => c.kind === "voice");
    if (videoDurationSec !== 465 || launchLeadInSec !== 10 || !json.preshowAutoStart || json.epilogueOnVideoEnd === false) {
      warnings.push("Contractul V3 cere preshowAutoStart + lead-in 10 s + tăietură la 465 s + epilog automat");
    }
    if (voices.length !== 51) warnings.push(`Show-ul V3 are ${voices.length} voci în loc de 51 (validate:show va eșua)`);
    if (voices.some((c) => c.fallback !== "silent")) warnings.push("Toate vocile V3 trebuie să aibă fallback: silent");
    for (const required of ["pre-tablet-roles", "light-tablet-color", "nature-tablet-pulse", "tech-tablet-perspectives", "epi-tablet-thanks", "tech-adaptive-select"]) {
      if (!cueIds.has(required)) warnings.push(`Lipsește cue-ul V3 obligatoriu ${required}`);
    }
  }

  if (errors.length) return { ok: false, errors, warnings };

  const show: ShowFile = {
    title: typeof json.title === "string" ? json.title : "(fără titlu)",
    version: typeof json.version === "string" ? json.version : "0",
    videoDurationSec,
    timingStatus: json.timingStatus === "aligned" ? "aligned" : "provisional",
    preshowAutoStart: !!json.preshowAutoStart,
    launchLeadInSec,
    epilogueOnVideoEnd: json.epilogueOnVideoEnd !== false,
    scenes: json.scenes as ShowFile["scenes"],
    cues: json.cues as Cue[],
    ...(typeof json.$schema === "string" && json.$schema ? { $schema: json.$schema } : {}),
    ...(isRec(json.variants) ? { variants: json.variants as ShowFile["variants"] } : {}),
  };
  return { ok: true, errors, warnings, show };
}

/** Ordinea canonica a cue-urilor: faza (preshow, play, epilogue), apoi `at`, stabil la egalitate. */
export function sortCues<T extends { phase: Phase; at: number }>(cues: readonly T[]): T[] {
  return cues
    .map((c, i) => ({ c, i }))
    .sort((a, b) => PHASE_ORDER[a.c.phase] - PHASE_ORDER[b.c.phase] || a.c.at - b.c.at || a.i - b.i)
    .map((x) => x.c);
}
