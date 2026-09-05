/**
 * On-screen diagnostics: small top-left panel (dev / identify), big "identify" card,
 * error banner (e.g. missing video), buffering spinner.
 * All user-visible strings are Romanian.
 */

import type { PlaybackState, ScreenConfig } from "../../shared/types";

export interface OsdInfo {
  state: PlaybackState;
  phaseTime: number;
  sceneId: string | null;
  sync: { connected: boolean; driftSec: number | null; isClockSource: boolean; reconnecting?: boolean };
  video: { ready: boolean; rate: number; readyState: number; buffering: boolean };
  lastCueId: string | null;
  fps?: number;
  /** R4 / B-06 — nominal rate; != 1 shows the "REPETIȚIE ×N" badge (always, not only in dev). */
  nominalRate?: number;
  /** R4 / B-02 — compact perf line (perf.formatPerfLine). */
  perf?: string | null;
}

export interface Osd {
  update(info: OsdInfo): void;
  /** Big centred screen id for `ms` milliseconds (also reveals the panel). */
  identify(ms?: number): void;
  setError(title: string | null, detail?: string): void;
  setSpinner(on: boolean): void;
  /** Transient note line in the panel (markers, warnings); cleared after `ms`. */
  note(text: string, ms?: number): void;
  setVisible(visible: boolean): void;
}

export interface OsdElements {
  panel: HTMLElement;
  identify: HTMLElement;
  spinner: HTMLElement;
  error: HTMLElement;
  /** R4 / B-06 — rehearse badge (optional). */
  rehearse?: HTMLElement | null;
}

export function formatClock(sec: number): string {
  if (!Number.isFinite(sec)) return "--:--.-";
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, "0")}:${r.toFixed(1).padStart(4, "0")}`;
}

const STATE_LABEL: Record<PlaybackState, string> = {
  idle: "așteptare",
  preshow: "pre-show",
  playing: "redare",
  paused: "pauză",
  epilogue: "epilog",
  ended: "final (așteaptă operatorul)",
};

export function createOsd(els: OsdElements, opts: { screen: ScreenConfig; alwaysVisible: boolean }): Osd {
  const field = (name: string) => els.panel.querySelector<HTMLElement>(`[data-f="${name}"]`);
  const fScreen = field("screen");
  const fState = field("state");
  const fTime = field("time");
  const fScene = field("scene");
  const fSync = field("sync");
  const fVideo = field("video");
  const fCue = field("cue");
  const fPerf = field("perf");
  const fNote = field("note");
  const idEl = els.identify.querySelector<HTMLElement>(".id");
  const labelEl = els.identify.querySelector<HTMLElement>(".label");
  const errTitle = els.error.querySelector<HTMLElement>(".title");
  const errDetail = els.error.querySelector<HTMLElement>(".detail");

  let visible = opts.alwaysVisible;
  let identifyTimer: ReturnType<typeof setTimeout> | null = null;
  let noteTimer: ReturnType<typeof setTimeout> | null = null;

  if (fScreen) fScreen.textContent = `${opts.screen.id}${opts.screen.roleLabel ? " · " + opts.screen.roleLabel : ""}`;
  if (idEl) idEl.textContent = opts.screen.id;
  if (labelEl) labelEl.textContent = opts.screen.roleLabel ?? "";
  els.panel.hidden = !visible;

  const setClass = (el: HTMLElement | null, cls: "good" | "warn" | "bad" | null) => {
    if (!el) return;
    el.classList.remove("good", "warn", "bad");
    if (cls) el.classList.add(cls);
  };

  return {
    update(info) {
      const badge = els.rehearse;
      if (badge) {
        const r = info.nominalRate ?? 1;
        const on = Math.abs(r - 1) > 1e-3;
        if (on) badge.textContent = `REPETIȚIE ×${Number.isInteger(r) ? r : r.toFixed(2)}`;
        badge.hidden = !on;
      }
      if (els.panel.hidden) return;
      const rehearse = info.nominalRate !== undefined && Math.abs(info.nominalRate - 1) > 1e-3 ? ` · REPETIȚIE ×${info.nominalRate}` : "";
      if (fState) fState.textContent = `${STATE_LABEL[info.state] ?? info.state}${rehearse}`;
      if (fTime) fTime.textContent = `${formatClock(info.phaseTime)}  ×${info.video.rate.toFixed(3)}`;
      if (fPerf) fPerf.textContent = info.perf ?? "—";
      if (fScene) fScene.textContent = info.sceneId ?? "—";
      if (fSync) {
        const s = info.sync;
        if (!s.connected) {
          fSync.textContent = s.reconnecting ? "deconectat · reconectare…" : "deconectat";
          setClass(fSync, "bad");
        } else if (s.isClockSource) {
          fSync.textContent = "sursă de ceas";
          setClass(fSync, "good");
        } else if (s.driftSec === null) {
          fSync.textContent = "conectat · fără ceas";
          setClass(fSync, "warn");
        } else {
          const ms = Math.round(s.driftSec * 1000);
          fSync.textContent = `drift ${ms >= 0 ? "+" : ""}${ms} ms`;
          setClass(fSync, Math.abs(ms) > 250 ? "bad" : Math.abs(ms) > 80 ? "warn" : "good");
        }
      }
      if (fVideo) {
        const v = info.video;
        fVideo.textContent = v.ready ? (v.buffering ? "buffering…" : `gata (rs ${v.readyState})`) : "neîncărcat";
        setClass(fVideo, v.ready ? (v.buffering ? "warn" : "good") : "bad");
      }
      if (fCue) fCue.textContent = info.lastCueId ?? "—";
    },
    identify(ms = 3000) {
      els.identify.hidden = false;
      // Force a reflow so the CSS fade runs.
      void els.identify.offsetWidth;
      els.identify.classList.add("on");
      els.panel.hidden = false;
      if (identifyTimer !== null) clearTimeout(identifyTimer);
      identifyTimer = setTimeout(() => {
        identifyTimer = null;
        els.identify.classList.remove("on");
        setTimeout(() => {
          if (!els.identify.classList.contains("on")) els.identify.hidden = true;
        }, 300);
        els.panel.hidden = !visible;
      }, ms);
    },
    setError(title, detail) {
      if (!title) {
        els.error.hidden = true;
        return;
      }
      if (errTitle) errTitle.textContent = title;
      if (errDetail) errDetail.textContent = detail ?? "";
      els.error.hidden = false;
    },
    setSpinner(on) {
      els.spinner.hidden = !on;
    },
    note(text, ms = 4000) {
      if (!fNote) return;
      fNote.textContent = text;
      if (noteTimer !== null) clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        noteTimer = null;
        fNote.textContent = "";
      }, ms);
    },
    setVisible(v) {
      visible = v;
      els.panel.hidden = !v && identifyTimer === null;
    },
  };
}
