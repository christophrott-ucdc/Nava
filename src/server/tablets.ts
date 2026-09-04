/**
 * Registry of the kids' tablets: identity (id from `hello`, name from `join`), chosen role,
 * answers / votes / messages with timestamps, live aggregates (vote counts, roles taken),
 * and the `tabletView` / `tablets` messages derived from them.
 */

import type { WebSocket } from "ws";
import type { SceneTheme, TabletCue } from "../shared/types";
import type { TabletEventMsg, TabletViewMsg, TabletsMsg } from "../shared/protocol";
import type { Subtitle } from "./cues";

export interface TabletRecord {
  id: string;
  name: string;
  role?: string;
  connected: boolean;
  lastSeenMs: number;
}

export interface TabletAnswer {
  tabletId: string;
  name: string;
  cueId: string;
  kind: "answer" | "vote" | "message";
  text: string;
  atMs: number;
}

export interface TabletViewInput {
  theme: SceneTheme;
  sceneLabel: string;
  subtitle: Subtitle | null;
  /** Current tablet cue (null -> waiting). */
  tabletCue: TabletCue | null;
}

export interface TabletEventResult {
  /** Something visible to the console changed (registry / answers). */
  changed: boolean;
  /** Kind for the run log (null -> not logged, e.g. ping). */
  logKind: string | null;
  error?: string;
}

const MAX_NAME = 16;
const MAX_TEXT_DEFAULT = 200;
const MAX_TABLETS = 64;
const MAX_ANSWERS = 5000;

function cleanText(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export class TabletRegistry {
  readonly tablets = new Map<string, TabletRecord>();
  answers: TabletAnswer[] = [];
  private sockets = new Map<string, Set<WebSocket>>();
  private lastViewJson = "";

  // ---------------------------------------------------------------------------
  // Connections

  connect(id: string, name: string | undefined, ws: WebSocket): TabletRecord {
    let rec = this.tablets.get(id);
    if (!rec) {
      if (this.tablets.size >= MAX_TABLETS) {
        // Drop the oldest disconnected tablet to make room.
        const victim = [...this.tablets.values()]
          .filter((t) => !t.connected)
          .sort((a, b) => a.lastSeenMs - b.lastSeenMs)[0];
        if (victim) this.tablets.delete(victim.id);
      }
      rec = { id, name: cleanText(name, MAX_NAME) || "—", connected: true, lastSeenMs: Date.now() };
      this.tablets.set(id, rec);
    } else {
      rec.connected = true;
      rec.lastSeenMs = Date.now();
      const n = cleanText(name, MAX_NAME);
      if (n) rec.name = n;
    }
    let set = this.sockets.get(id);
    if (!set) {
      set = new Set();
      this.sockets.set(id, set);
    }
    set.add(ws);
    // A reconnecting tablet must get the current view immediately.
    if (this.lastViewJson) this.safeSend(ws, this.lastViewJson);
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
    let n = 0;
    for (const t of this.tablets.values()) if (t.connected) n += 1;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Events

  /** Apply a `tablet` event; the current tablet cue is needed to validate answers/votes. */
  handleEvent(msg: TabletEventMsg, current: TabletCue | null): TabletEventResult {
    const rec = this.tablets.get(msg.tabletId);
    if (!rec) return { changed: false, logKind: null, error: "tabletă necunoscută (trimite hello)" };
    rec.lastSeenMs = Date.now();
    const ev = msg.event;
    if (!ev || typeof ev !== "object" || typeof ev.kind !== "string") {
      return { changed: false, logKind: null, error: "eveniment invalid" };
    }
    switch (ev.kind) {
      case "ping":
        return { changed: false, logKind: null };
      case "join": {
        const n = cleanText(ev.name, MAX_NAME);
        if (n) rec.name = n;
        return { changed: true, logKind: "tablet.join" };
      }
      case "role": {
        const role = cleanText(ev.role, 40);
        if (!role) return { changed: false, logKind: null, error: "rol gol" };
        if (!current || current.interaction.type !== "role-pick") {
          return { changed: false, logKind: null, error: "alegerea rolului nu este activă" };
        }
        if (!current.interaction.roles.includes(role)) {
          return { changed: false, logKind: null, error: "rol necunoscut" };
        }
        rec.role = role;
        return { changed: true, logKind: "tablet.role" };
      }
      case "answer":
      case "message": {
        const cueId = cleanText(ev.cueId, 80);
        const inter = current?.interaction;
        const expectedType = ev.kind === "answer" ? "question" : "message";
        if (!current || current.id !== cueId || inter?.type !== expectedType) {
          return { changed: false, logKind: null, error: "interacțiunea nu mai este activă" };
        }
        const maxLen =
          (inter.type === "question" || inter.type === "message") && inter.maxLen ? inter.maxLen : MAX_TEXT_DEFAULT;
        const text = cleanText(ev.text, Math.min(maxLen, 1000));
        if (!cueId || !text) return { changed: false, logKind: null, error: "răspuns gol" };
        this.upsertAnswer({ tabletId: rec.id, name: rec.name, cueId, kind: ev.kind, text, atMs: Date.now() });
        return { changed: true, logKind: `tablet.${ev.kind}` };
      }
      case "vote": {
        const cueId = cleanText(ev.cueId, 80);
        const option = cleanText(ev.option, 80);
        if (!cueId || !option) return { changed: false, logKind: null, error: "vot gol" };
        if (!current || current.id !== cueId || current.interaction.type !== "vote") {
          return { changed: false, logKind: null, error: "votul nu mai este activ" };
        }
        if (!current.interaction.options.includes(option)) {
          return { changed: false, logKind: null, error: "opțiune necunoscută" };
        }
        this.upsertAnswer({ tabletId: rec.id, name: rec.name, cueId, kind: "vote", text: option, atMs: Date.now() });
        return { changed: true, logKind: "tablet.vote" };
      }
      default:
        return { changed: false, logKind: null, error: "eveniment necunoscut" };
    }
  }

  /** One answer per (tablet, cue, kind): a resend replaces the previous one. */
  private upsertAnswer(a: TabletAnswer): void {
    const idx = this.answers.findIndex((x) => x.tabletId === a.tabletId && x.cueId === a.cueId && x.kind === a.kind);
    if (idx >= 0) this.answers[idx] = a;
    else this.answers.push(a);
    if (this.answers.length > MAX_ANSWERS) this.answers.splice(0, this.answers.length - MAX_ANSWERS);
  }

  clearAnswers(): void {
    this.answers = [];
  }

  /** New session: roles are re-picked in the next preshow. */
  resetRoles(): void {
    for (const t of this.tablets.values()) delete t.role;
  }

  // ---------------------------------------------------------------------------
  // Derived messages

  aggregateFor(cue: TabletCue | null): Record<string, number> | undefined {
    if (!cue) return undefined;
    const inter = cue.interaction;
    if (inter.type === "vote") {
      const agg: Record<string, number> = {};
      for (const o of inter.options) agg[o] = 0;
      for (const a of this.answers) {
        if (a.kind === "vote" && a.cueId === cue.id) agg[a.text] = (agg[a.text] ?? 0) + 1;
      }
      return agg;
    }
    if (inter.type === "role-pick") {
      const agg: Record<string, number> = {};
      for (const r of inter.roles) agg[r] = 0;
      for (const t of this.tablets.values()) {
        if (t.role) agg[t.role] = (agg[t.role] ?? 0) + 1;
      }
      return agg;
    }
    if (inter.type === "question" || inter.type === "message") {
      let n = 0;
      for (const a of this.answers) if (a.cueId === cue.id && a.kind !== "vote") n += 1;
      return { answered: n };
    }
    return undefined;
  }

  buildView(input: TabletViewInput): TabletViewMsg {
    const view: TabletViewMsg = {
      type: "tabletView",
      theme: input.theme,
      sceneLabel: input.sceneLabel,
      subtitle: input.subtitle,
      interaction: input.tabletCue ? input.tabletCue.interaction : null,
    };
    const agg = this.aggregateFor(input.tabletCue);
    if (agg) view.aggregate = agg;
    return view;
  }

  /** Send the view to every connected tablet if it changed since the last push (or `force`). */
  pushView(view: TabletViewMsg, force = false): boolean {
    const json = JSON.stringify(view);
    if (!force && json === this.lastViewJson) return false;
    this.lastViewJson = json;
    for (const set of this.sockets.values()) for (const ws of set) this.safeSend(ws, json);
    return true;
  }

  toMsg(): TabletsMsg {
    return {
      type: "tablets",
      tablets: [...this.tablets.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "ro"))
        .map((t) => ({ id: t.id, name: t.name, role: t.role, connected: t.connected, lastSeenMs: t.lastSeenMs })),
      answers: this.answers.map((a) => ({ ...a })),
    };
  }

  private safeSend(ws: WebSocket, json: string): void {
    // 1 === WebSocket.OPEN
    if (ws.readyState === 1) {
      try {
        ws.send(json);
      } catch {
        /* closed in between */
      }
    }
  }
}
