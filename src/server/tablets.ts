/**
 * Registrul celor cinci tablete de post. Identitatea este anonimă și fizică:
 * o tabletă aparține unui post, iar zonele A/B păstrează răspunsuri independente.
 */

import type { WebSocket } from "ws";
import {
  TABLET_OBSERVE_VALUE,
  TABLET_POSTS,
  type SceneTheme,
  type TabletCue,
  type TabletOption,
  type TabletPost,
  type TabletZone,
} from "../shared/types";
import type { TabletEventMsg, TabletViewMsg, TabletsMsg } from "../shared/protocol";
import type { Subtitle } from "./cues";

type PairedInteraction = Extract<TabletCue["interaction"], { type: "paired-choice" }>;
export type PerspectiveBranch = "diverse" | "same" | "observe";

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

function normalizeOption(option: TabletOption): { value: string; label: string } {
  if (typeof option === "string") {
    const value = cleanText(option, 80);
    return { value, label: value };
  }
  return { value: cleanText(option.value, 80), label: cleanText(option.label, 120) };
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
    return { changed: true, logKind: "tablet.choice" };
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
        text: answer.value === TABLET_OBSERVE_VALUE ? "Doar observ" : answer.value,
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
