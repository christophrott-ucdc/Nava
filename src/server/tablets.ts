/**
 * Registrul celor cinci tablete de post. Identitatea este anonimă și fizică:
 * o tabletă aparține unui post, iar zonele A/B păstrează răspunsuri independente.
 */

import type { WebSocket } from "ws";
import {
  SPEAKERS,
  TABLET_OBSERVE_VALUE,
  TABLET_POSTS,
  type EntityParams,
  type SceneTheme,
  type TabletCue,
  type TabletOption,
  type TabletPost,
  type TabletZone,
} from "../shared/types";
import type { EntityParamsMsg, TabletEventMsg, TabletViewMsg, TabletsMsg } from "../shared/protocol";
import type { Subtitle } from "./cues";

type PairedInteraction = Extract<TabletCue["interaction"], { type: "paired-choice" }>;
type PairedMode = PairedInteraction["mode"];
export type PerspectiveBranch = "diverse" | "same" | "observe";

/**
 * R4 (D-09) — pseudo-cue id used by the post-1 tablet to ask for the mission start in autoRun mode
 * (`{kind:"choice", cueId:"__start__", zone:"A", value:"start"}`). Never stored as an answer.
 */
export const START_REQUEST_CUE_ID = "__start__";

/** R4 — which procedural entity reacts to which paired-choice mode. */
export const MODE_ENTITY: Record<PairedMode, EntityParamsMsg["entity"]> = {
  color: "LUMINA",
  pulse: "NATURA",
  perspective: "TEHNOLOGIC",
};

/** Colour keywords in option labels/values → hex (used when an option has no explicit `color`). */
const COLOR_KEYWORDS: Array<{ match: RegExp; hex: string }> = [
  { match: /AURIU|GALBEN|GOLD/i, hex: "#ffd166" },
  { match: /ALBASTRU|BLUE/i, hex: "#64c8ff" },
  { match: /VERDE|GREEN/i, hex: "#72df9a" },
  { match: /VIOLET|MOV|PURPLE/i, hex: "#bd92ff" },
  { match: /RO[SȘ]U|RED/i, hex: "#ff6b6b" },
  { match: /PORTOCALIU|ORANGE/i, hex: "#ffa94d" },
  { match: /ALB|WHITE/i, hex: "#f8fafc" },
  { match: /ROZ|PINK/i, hex: "#f9a8d4" },
];
const PULSE_KEYWORDS: Array<{ match: RegExp; bpm: number }> = [
  { match: /LENT|SLOW|RAR/i, bpm: 40 },
  { match: /MEDIU|NORMAL|MEDIUM/i, bpm: 60 },
  { match: /RAPID|FAST|ALERT/i, bpm: 90 },
];
const PULSE_MIN_BPM = 40;
const PULSE_MAX_BPM = 100;
/** intensity = votes / 5 (five posts), clamped to 1. */
const INTENSITY_VOTES_FULL = 5;

export interface TabletRecord {
  id: string;
  post?: TabletPost;
  connected: boolean;
  lastSeenMs: number;
}

export interface TabletAnswer {
  tabletId: string;
  post: TabletPost;
  zone: TabletZone;
  cueId: string;
  kind: "choice";
  interactionType: PairedInteraction["mode"];
  value: string;
  atMs: number;
}

export interface TabletViewInput {
  theme: SceneTheme;
  sceneLabel: string;
  subtitle: Subtitle | null;
  tabletCue: TabletCue | null;
}

export interface TabletEventResult {
  changed: boolean;
  logKind: string | null;
  error?: string;
  /** R4 — the tablet asked to start the mission (autoRun, startTrigger "tablet"); call director.requestStart(). */
  startRequest?: boolean;
  /** R4 — the aggregate for the entity of this interaction changed; broadcast to screens. */
  entityParams?: EntityParamsMsg;
}

const MAX_TABLETS = 64;
const MAX_ANSWERS = 5000;
const VALID_POSTS = new Set<number>([1, 2, 3, 4, 5]);
const VALID_ZONES = new Set<string>(["A", "B"]);

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function isPost(value: unknown): value is TabletPost {
  return typeof value === "number" && Number.isInteger(value) && VALID_POSTS.has(value);
}

function isZone(value: unknown): value is TabletZone {
  return typeof value === "string" && VALID_ZONES.has(value);
}

function normalizeOption(option: TabletOption): { value: string; label: string; color?: string } {
  if (typeof option === "string") {
    const value = cleanText(option, 80);
    return { value, label: value };
  }
  const out: { value: string; label: string; color?: string } = { value: cleanText(option.value, 80), label: cleanText(option.label, 120) };
  if (typeof option.color === "string" && /^#[0-9a-f]{3,8}$/i.test(option.color.trim())) out.color = option.color.trim();
  return out;
}

/** Hex colour for a colour option: explicit `color`, else a keyword in label/value, else LUMINA's colour. */
export function optionColor(option: { value: string; label: string; color?: string }): string {
  if (option.color) return option.color;
  const hay = `${option.label} ${option.value}`;
  return COLOR_KEYWORDS.find((k) => k.match.test(hay))?.hex ?? SPEAKERS.LUMINA.color;
}

/**
 * BPM for a pulse option: keyword (lent 40 / mediu 60 / rapid 90) or, for custom options, an even spread
 * over 40..100 by position (a single option maps to the middle, 70).
 */
export function optionBpm(index: number, options: ReadonlyArray<{ value: string; label: string }>): number {
  const option = options[index];
  if (!option) return 60;
  const kw = PULSE_KEYWORDS.find((k) => k.match.test(`${option.label} ${option.value}`));
  if (kw) return kw.bpm;
  const n = options.length;
  if (n <= 1) return Math.round((PULSE_MIN_BPM + PULSE_MAX_BPM) / 2);
  return Math.round(PULSE_MIN_BPM + ((PULSE_MAX_BPM - PULSE_MIN_BPM) * index) / (n - 1));
}

/**
 * Aggregate the expressed answers of one paired-choice cue into EntityParams (D-02):
 *  color → most-voted colour, pulse → BPM of the most-voted option, perspective → most-voted value;
 *  intensity = votes/5 (clamped), votes = number of expressed (non-observe) answers.
 * Ties are resolved by option order. Returns null when nobody has expressed a choice yet.
 */
export function aggregateEntityParams(
  interaction: PairedInteraction,
  values: readonly string[],
): EntityParams | null {
  const options = interaction.options.map(normalizeOption).filter((o) => o.value);
  const expressed = values.filter((v) => v !== TABLET_OBSERVE_VALUE);
  if (!expressed.length) return null;
  const counts = new Map<string, number>();
  for (const v of expressed) counts.set(v, (counts.get(v) ?? 0) + 1);
  let bestIndex = -1;
  let bestCount = 0;
  options.forEach((o, i) => {
    const c = counts.get(o.value) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      bestIndex = i;
    }
  });
  if (bestIndex < 0) return null;
  const winner = options[bestIndex];
  const votes = expressed.length;
  const params: EntityParams = { intensity: Math.min(1, votes / INTENSITY_VOTES_FULL), votes };
  switch (interaction.mode) {
    case "color":
      params.color = optionColor(winner);
      break;
    case "pulse":
      params.pulseBpm = optionBpm(bestIndex, options);
      break;
    case "perspective":
      params.perspective = winner.value;
      break;
  }
  return params;
}

function defaultPostLabels(): string[] {
  return ([1, 2, 3, 4, 5] as TabletPost[]).map((post) => TABLET_POSTS[post].lens);
}

export class TabletRegistry {
  readonly tablets = new Map<string, TabletRecord>();
  answers: TabletAnswer[] = [];
  private sockets = new Map<string, Set<WebSocket>>();
  private lastView: TabletViewMsg | null = null;
  private lastViewKey = "";
  private postLabels = defaultPostLabels();
  /** R4 — last aggregate per interaction mode (re-sent to screens that connect late). */
  private entityParamsByMode = new Map<PairedMode, EntityParamsMsg>();
  /** R4 — set by index.ts: `tablets.onEntityParams = (msg) => broadcast(["screen"], msg)`. */
  onEntityParams: ((msg: EntityParamsMsg) => void) | null = null;

  // ---------------------------------------------------------------------------
  // Connections

  connect(id: string, ws: WebSocket, configuredPost?: unknown): TabletRecord {
    let rec = this.tablets.get(id);
    if (!rec) {
      if (this.tablets.size >= MAX_TABLETS) {
        const victim = [...this.tablets.values()]
          .filter((tablet) => !tablet.connected)
          .sort((a, b) => a.lastSeenMs - b.lastSeenMs)[0];
        if (victim) this.tablets.delete(victim.id);
      }
      rec = { id, connected: true, lastSeenMs: Date.now() };
      this.tablets.set(id, rec);
    } else {
      rec.connected = true;
      rec.lastSeenMs = Date.now();
    }

    if (isPost(configuredPost)) this.claimPost(rec, configuredPost);

    let set = this.sockets.get(id);
    if (!set) {
      set = new Set();
      this.sockets.set(id, set);
    }
    set.add(ws);
    if (this.lastView) this.safeSend(ws, JSON.stringify(this.personalize(this.lastView, rec)));
    return rec;
  }

  disconnect(id: string, ws: WebSocket): void {
    const set = this.sockets.get(id);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.sockets.delete(id);
    }
    const rec = this.tablets.get(id);
    if (rec && !(this.sockets.get(id)?.size)) {
      rec.connected = false;
      rec.lastSeenMs = Date.now();
    }
  }

  connectedCount(): number {
    let count = 0;
    for (const tablet of this.tablets.values()) if (tablet.connected) count += 1;
    return count;
  }

  // ---------------------------------------------------------------------------
  // Events

  handleEvent(msg: TabletEventMsg, current: TabletCue | null): TabletEventResult {
    const rec = this.tablets.get(msg.tabletId);
    if (!rec) return { changed: false, logKind: null, error: "tabletă necunoscută (trimite hello)" };
    rec.lastSeenMs = Date.now();
    const event = msg.event;
    if (!event || typeof event !== "object" || typeof event.kind !== "string") {
      return { changed: false, logKind: null, error: "eveniment invalid" };
    }

    switch (event.kind) {
      case "ping":
        return { changed: false, logKind: null };
      case "set-post": {
        if (!isPost(event.post)) return { changed: false, logKind: null, error: "post invalid (alege 1–5)" };
        if (rec.post === event.post) return { changed: false, logKind: null };
        if (rec.post !== undefined) {
          return { changed: false, logKind: null, error: `tableta este deja fixată la postul ${rec.post}` };
        }
        const error = this.claimPost(rec, event.post);
        if (error) return { changed: false, logKind: null, error };
        return { changed: true, logKind: "tablet.post" };
      }
      case "choice":
        return this.handleChoice(rec, event, current);
      case "join":
      case "role":
      case "answer":
      case "vote":
      case "message":
        return { changed: false, logKind: null, error: "interacțiune V2 dezactivată; folosește postul și zonele A/B" };
    }
  }

  private handleChoice(
    rec: TabletRecord,
    event: Extract<TabletEventMsg["event"], { kind: "choice" }>,
    current: TabletCue | null,
  ): TabletEventResult {
    if (rec.post === undefined) return { changed: false, logKind: null, error: "alege mai întâi postul tabletei" };
    const cueId = cleanText(event.cueId, 80);
    if (!cueId || !isZone(event.zone)) return { changed: false, logKind: null, error: "zonă sau cue invalid" };
    if (cueId === START_REQUEST_CUE_ID) {
      // D-09: the "PORNEȘTE MISIUNEA" button (post 1 tablet, autoRun/tablet trigger). Not an answer.
      return { changed: false, logKind: "tablet.start-request", startRequest: true };
    }
    if (!current || current.id !== cueId || current.interaction.type !== "paired-choice") {
      return { changed: false, logKind: null, error: "interacțiunea în pereche nu mai este activă" };
    }

    const value = cleanText(event.value, 80);
    const options = current.interaction.options.map(normalizeOption).filter((option) => option.value);
    const allowed = new Set(options.map((option) => option.value));
    if (current.interaction.allowObserve) allowed.add(TABLET_OBSERVE_VALUE);
    if (!value || !allowed.has(value)) return { changed: false, logKind: null, error: "opțiune necunoscută" };

    const existing = this.answers.find(
      (answer) => answer.tabletId === rec.id && answer.cueId === cueId && answer.zone === event.zone,
    );
    if (existing) {
      if (existing.value === value) return { changed: false, logKind: null };
      return { changed: false, logKind: null, error: `zona ${event.zone} a răspuns deja` };
    }

    this.answers.push({
      tabletId: rec.id,
      post: rec.post,
      zone: event.zone,
      cueId,
      kind: "choice",
      interactionType: current.interaction.mode,
      value,
      atMs: Date.now(),
    });
    if (this.answers.length > MAX_ANSWERS) this.answers.splice(0, this.answers.length - MAX_ANSWERS);
    const result: TabletEventResult = { changed: true, logKind: "tablet.choice" };
    const entityParams = this.refreshEntityParams(current.id, current.interaction);
    if (entityParams) result.entityParams = entityParams;
    return result;
  }

  /** Recompute the entity aggregate of a paired-choice cue; emits `onEntityParams` when it changed. */
  private refreshEntityParams(cueId: string, interaction: PairedInteraction): EntityParamsMsg | null {
    const values = this.answers.filter((a) => a.cueId === cueId).map((a) => a.value);
    const params = aggregateEntityParams(interaction, values);
    if (!params) return null;
    const msg: EntityParamsMsg = { type: "entityParams", entity: MODE_ENTITY[interaction.mode], params };
    const prev = this.entityParamsByMode.get(interaction.mode);
    if (prev && JSON.stringify(prev.params) === JSON.stringify(params)) return null;
    this.entityParamsByMode.set(interaction.mode, msg);
    this.onEntityParams?.(msg);
    return msg;
  }

  /** R4 — current entity aggregates (one per mode), e.g. to re-send to a screen that just connected. */
  entityParams(): EntityParamsMsg[] {
    return [...this.entityParamsByMode.values()];
  }

  private claimPost(rec: TabletRecord, post: TabletPost): string | null {
    const occupant = [...this.tablets.values()].find(
      (tablet) => tablet.id !== rec.id && tablet.post === post && tablet.connected,
    );
    if (occupant) return `postul ${post} este deja conectat`;

    // O sesiune locală pierdută nu ține postul blocat pentru tableta fizică înlocuitoare.
    for (const tablet of this.tablets.values()) {
      if (tablet.id !== rec.id && tablet.post === post && !tablet.connected) delete tablet.post;
    }
    rec.post = post;
    return null;
  }

  clearAnswers(): void {
    this.answers = [];
    this.entityParamsByMode.clear();
  }

  /** Postul este o proprietate fizică persistentă; restartul resetează doar răspunsurile. */
  resetRoles(): void {
    // API de compatibilitate pentru server/index.ts.
  }

  /**
   * Ramura vocală deterministică pentru un cue `paired-choice` în modul `perspective`.
   * Lipsa răspunsului este observație: fără alegeri exprimate => `observe`.
   */
  perspectiveBranch(cueId: string): PerspectiveBranch {
    const expressed = this.answers
      .filter(
        (answer) =>
          answer.cueId === cueId &&
          answer.interactionType === "perspective" &&
          answer.value !== TABLET_OBSERVE_VALUE,
      )
      .map((answer) => answer.value);
    if (expressed.length === 0) return "observe";
    return new Set(expressed).size > 1 ? "diverse" : "same";
  }

  // ---------------------------------------------------------------------------
  // Derived messages

  buildView(input: TabletViewInput): TabletViewMsg {
    if (input.tabletCue?.interaction.type === "post-assign") {
      this.postLabels = input.tabletCue.interaction.posts.slice(0, 5).map((post) => cleanText(post, 80));
    }
    return {
      type: "tabletView",
      theme: input.theme,
      sceneLabel: input.sceneLabel,
      subtitle: input.subtitle,
      cueId: input.tabletCue?.id ?? null,
      interaction: input.tabletCue?.interaction ?? null,
      post: null,
      lens: null,
      zoneChoices: {},
    };
  }

  /** Trimite fiecărei tablete numai propriul post și propriile răspunsuri A/B. */
  pushView(view: TabletViewMsg, force = false): boolean {
    const key = JSON.stringify({
      theme: view.theme,
      sceneLabel: view.sceneLabel,
      subtitle: view.subtitle,
      cueId: view.cueId,
      interaction: view.interaction,
    });
    if (!force && key === this.lastViewKey) return false;
    this.lastView = view;
    this.lastViewKey = key;
    for (const [id, set] of this.sockets) {
      const rec = this.tablets.get(id);
      if (!rec) continue;
      const json = JSON.stringify(this.personalize(view, rec));
      for (const ws of set) this.safeSend(ws, json);
    }
    return true;
  }

  private personalize(view: TabletViewMsg, rec: TabletRecord): TabletViewMsg {
    const zoneChoices: TabletViewMsg["zoneChoices"] = {};
    if (view.cueId) {
      for (const answer of this.answers) {
        if (answer.tabletId === rec.id && answer.cueId === view.cueId) {
          zoneChoices[answer.zone] = {
            value: answer.value,
            observed: answer.value === TABLET_OBSERVE_VALUE,
          };
        }
      }
    }
    return {
      ...view,
      post: rec.post ?? null,
      lens: rec.post ? this.postLabels[rec.post - 1] || TABLET_POSTS[rec.post].lens : null,
      zoneChoices,
      aggregate: undefined,
    };
  }

  toMsg(): TabletsMsg {
    return {
      type: "tablets",
      tablets: [...this.tablets.values()]
        .sort((a, b) => (a.post ?? 99) - (b.post ?? 99) || a.id.localeCompare(b.id))
        .map((tablet) => ({
          id: tablet.id,
          name: tablet.post ? `Postul ${tablet.post}` : "Tabletă nealocată",
          role: tablet.post ? this.postLabels[tablet.post - 1] || TABLET_POSTS[tablet.post].lens : undefined,
          post: tablet.post,
          connected: tablet.connected,
          lastSeenMs: tablet.lastSeenMs,
        })),
      answers: this.answers.map((answer) => ({
        tabletId: answer.tabletId,
        name: `Postul ${answer.post} · Zona ${answer.zone}`,
        cueId: answer.cueId,
        kind: answer.kind,
        text: answer.value === TABLET_OBSERVE_VALUE ? "Doar privesc" : answer.value,
        atMs: answer.atMs,
        post: answer.post,
        zone: answer.zone,
        interactionType: answer.interactionType,
      })),
    };
  }

  private safeSend(ws: WebSocket, json: string): void {
    if (ws.readyState === 1) {
      try {
        ws.send(json);
      } catch {
        /* socket closed between check and send */
      }
    }
  }
}
