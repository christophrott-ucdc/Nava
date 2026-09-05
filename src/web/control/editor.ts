/**
 * D-04 — TIMELINE EDITOR panel of the operator console.
 *
 * One horizontal track per phase (preshow / play with the negative lead-in / epilogue). Cue markers are
 * draggable (pointer events, snapped to 0.1 s, clamped to the phase range); the selected cue's `at` can
 * also be typed. Nothing is sent while editing: SALVEAZĂ does `PUT /api/show` with the WHOLE ShowFile
 * (server: validation → backup → atomic write → reload → `welcome` to everyone), ANULEAZĂ reloads the
 * show from the server, and the backups list (GET /api/show/backups) can restore a file
 * (POST /api/show/restore/:file). Frame previews come from `/api/frame?t=<sec>&w=480` (hidden on 404).
 */

import type { Cue, Phase, ShowFile } from "@shared/types";

export interface EditorDeps {
  formatTime(seconds: number, tenths?: boolean): string;
  describe(cue: Cue): { title: string; detail: string };
  notify(message: string, error?: boolean): void;
  onUnauthorized(): void;
  /** The server accepted the show (already reloaded there); the console adopts it locally. */
  onSaved(show: ShowFile): void;
}

export interface TimelineEditor {
  setShow(show: ShowFile): void;
  /** Live playhead of the running show (null phase = idle → hidden). */
  setPlayhead(phase: Phase | null, t: number): void;
}

interface SaveOk {
  ok: true;
  warnings: string[];
  backup: string | null;
  cues: number;
  version: string;
}
interface SaveErr {
  ok: false;
  reason: string;
  errors?: string[];
  warnings?: string[];
}
interface BackupInfo {
  file: string;
  bytes: number;
  mtime: string;
}

const PHASES: readonly Phase[] = ["preshow", "play", "epilogue"];
const PHASE_LABELS: Record<Phase, string> = { preshow: "PRE-SHOW", play: "FILM (cu lead-in T−)", epilogue: "EPILOG" };
const SNAP = 0.1;
/** Glass markers are 32px wide; reserve an 8px gap at every viewport width. */
const STACK_GAP_PX = 40;
const FRAME_WIDTH = 480;

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element lipsă: #${id}`);
  return node as T;
};

function snap(t: number): number {
  return Math.round(t / SNAP) * SNAP;
}

function round1(t: number): number {
  return Math.round(t * 10) / 10;
}

export function createTimelineEditor(deps: EditorDeps): TimelineEditor {
  const dom = {
    dirty: byId<HTMLElement>("editor-dirty"),
    save: byId<HTMLButtonElement>("editor-save"),
    cancel: byId<HTMLButtonElement>("editor-cancel"),
    backupsToggle: byId<HTMLButtonElement>("editor-backups-toggle"),
    errors: byId<HTMLDivElement>("editor-errors"),
    tracks: byId<HTMLDivElement>("editor-tracks"),
    detail: byId<HTMLDivElement>("editor-detail"),
    detailId: byId<HTMLElement>("editor-detail-id"),
    detailDesc: byId<HTMLElement>("editor-detail-desc"),
    at: byId<HTMLInputElement>("editor-at"),
    frame: byId<HTMLImageElement>("editor-frame"),
    backups: byId<HTMLDivElement>("editor-backups"),
    backupsList: byId<HTMLDivElement>("editor-backups-list"),
    backupsRefresh: byId<HTMLButtonElement>("editor-backups-refresh"),
  };

  let working: ShowFile | null = null;
  let pristine = "";
  let selectedId: string | null = null;
  let saving = false;
  let frameTimer: number | null = null;
  let frameToken = 0;
  const playhead: { phase: Phase | null; t: number } = { phase: null, t: 0 };
  const laneByPhase = new Map<Phase, HTMLDivElement>();
  const playheadByPhase = new Map<Phase, HTMLDivElement>();

  // ---------------------------------------------------------------------------
  // Model helpers

  const clone = (show: ShowFile): ShowFile => JSON.parse(JSON.stringify(show)) as ShowFile;

  function range(phase: Phase): { min: number; max: number } {
    if (!working) return { min: 0, max: 1 };
    const ends = working.scenes.filter((s) => s.phase === phase).map((s) => s.end);
    const cueMax = working.cues.filter((c) => c.phase === phase).map((c) => c.at);
    let max = Math.max(0, ...ends, ...cueMax);
    if (phase === "play") max = Math.max(max, working.videoDurationSec);
    if (max <= 0) max = 60;
    const min = phase === "play" ? -Math.max(0, working.launchLeadInSec ?? 10) : 0;
    return { min, max };
  }

  function isDirty(): boolean {
    return working !== null && JSON.stringify(working) !== pristine;
  }

  function updateDirty(): void {
    const dirty = isDirty();
    dom.dirty.hidden = !dirty;
    dom.save.disabled = !dirty || saving;
  }

  function findCue(id: string | null): Cue | null {
    if (!working || !id) return null;
    return working.cues.find((c) => c.id === id) ?? null;
  }

  function clampAt(cue: Cue, t: number): number {
    const r = range(cue.phase);
    return round1(Math.min(r.max, Math.max(r.min, snap(t))));
  }

  // ---------------------------------------------------------------------------
  // Rendering

  function render(): void {
    dom.tracks.replaceChildren();
    laneByPhase.clear();
    playheadByPhase.clear();
    if (!working) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Aștept scenariul de la server…";
      dom.tracks.append(empty);
      return;
    }
    for (const phase of PHASES) dom.tracks.append(renderTrack(phase));
    renderDetail();
    updateDirty();
    positionPlayhead();
  }

  function renderTrack(phase: Phase): HTMLElement {
    const show = working!;
    const r = range(phase);
    const span = r.max - r.min || 1;
    const pct = (t: number): number => ((t - r.min) / span) * 100;

    const track = document.createElement("section");
    track.className = "ed-track";
    track.dataset.phase = phase;

    const head = document.createElement("div");
    head.className = "ed-track-head";
    const label = document.createElement("strong");
    label.textContent = PHASE_LABELS[phase];
    const count = document.createElement("span");
    const cues = show.cues.filter((c) => c.phase === phase);
    count.textContent = `${cues.length} cue-uri · ${deps.formatTime(r.min)} → ${deps.formatTime(r.max)}`;
    head.append(label, count);

    const lane = document.createElement("div");
    lane.className = "ed-lane";
    laneByPhase.set(phase, lane);

    // Scene bands.
    for (const scene of show.scenes.filter((s) => s.phase === phase)) {
      const band = document.createElement("div");
      band.className = `ed-scene theme-${scene.theme}`;
      band.style.left = `${pct(scene.start)}%`;
      band.style.width = `${Math.max(0.3, pct(scene.end) - pct(scene.start))}%`;
      band.title = `${scene.label} · ${deps.formatTime(scene.start)} → ${deps.formatTime(scene.end)}`;
      const name = document.createElement("span");
      name.textContent = scene.label;
      band.append(name);
      lane.append(band);
    }
    // Zero line for the negative lead-in.
    if (r.min < 0) {
      const zero = document.createElement("div");
      zero.className = "ed-zero";
      zero.style.left = `${pct(0)}%`;
      zero.title = "T 0 · filmul pornește";
      lane.append(zero);
    }
    // Ticks every 30 s (or 10 s on short phases).
    const step = span > 240 ? 60 : span > 90 ? 30 : 10;
    for (let t = Math.ceil(r.min / step) * step; t <= r.max; t += step) {
      const tick = document.createElement("div");
      tick.className = "ed-tick";
      tick.style.left = `${pct(t)}%`;
      tick.textContent = deps.formatTime(t);
      lane.append(tick);
    }

    // Markers, stacked by proximity.
    const sorted = [...cues].sort((a, b) => a.at - b.at);
    const rowLastPct: number[] = [];
    const stackGapPct = STACK_GAP_PX / Math.max(320, dom.tracks.clientWidth) * 100;
    for (const cue of sorted) {
      const p = pct(cue.at);
      let row = rowLastPct.findIndex((last) => p - last > stackGapPct);
      if (row < 0) row = rowLastPct.length;
      rowLastPct[row] = p;
      lane.append(renderMarker(cue, p, row));
    }
    lane.style.setProperty("--ed-rows", String(Math.max(1, rowLastPct.length)));

    const ph = document.createElement("div");
    ph.className = "ed-playhead";
    ph.hidden = true;
    lane.append(ph);
    playheadByPhase.set(phase, ph);

    track.append(head, lane);
    return track;
  }

  function renderMarker(cue: Cue, leftPct: number, row: number): HTMLElement {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `ed-marker kind-${cue.kind}${cue.manual ? " manual" : ""}${cue.id === selectedId ? " selected" : ""}`;
    marker.style.left = `${leftPct}%`;
    marker.style.setProperty("--ed-row", String(row));
    marker.dataset.cueId = cue.id;
    const desc = deps.describe(cue);
    marker.title = `${cue.id} · ${deps.formatTime(cue.at, true)} · ${desc.title}`;
    marker.setAttribute("aria-label", `${cue.id} la ${deps.formatTime(cue.at, true)}`);
    const tag = document.createElement("span");
    tag.textContent = cue.kind === "voice" ? "V" : cue.kind === "tablet" ? "T" : cue.kind === "theme" ? "Θ" : cue.kind === "marker" ? "M" : cue.kind.slice(0, 1).toUpperCase();
    marker.append(tag);
    attachDrag(marker, cue.id);
    marker.addEventListener("mouseenter", () => scheduleFrame(cue, 180));
    marker.addEventListener("mouseleave", () => {
      const sel = findCue(selectedId);
      if (sel) scheduleFrame(sel, 250);
    });
    return marker;
  }

  function attachDrag(marker: HTMLButtonElement, cueId: string): void {
    let dragging = false;
    let moved = false;
    let startX = 0;
    let lane: HTMLDivElement | null = null;

    const timeFromX = (clientX: number, cue: Cue): number => {
      if (!lane) return cue.at;
      const rect = lane.getBoundingClientRect();
      const r = range(cue.phase);
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
      return clampAt(cue, r.min + frac * (r.max - r.min));
    };

    marker.addEventListener("pointerdown", (event) => {
      const cue = findCue(cueId);
      if (!cue) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      lane = marker.parentElement as HTMLDivElement | null;
      marker.setPointerCapture(event.pointerId);
      marker.classList.add("dragging");
      select(cueId, false);
      event.preventDefault();
    });
    marker.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const cue = findCue(cueId);
      if (!cue || !lane) return;
      if (Math.abs(event.clientX - startX) > 2) moved = true;
      if (!moved) return;
      const t = timeFromX(event.clientX, cue);
      if (t !== cue.at) {
        cue.at = t;
        const r = range(cue.phase);
        marker.style.left = `${((t - r.min) / (r.max - r.min || 1)) * 100}%`;
        marker.title = `${cue.id} · ${deps.formatTime(t, true)}`;
        dom.at.value = String(t);
        updateDirty();
      }
    });
    const finish = (event: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      marker.classList.remove("dragging");
      try {
        marker.releasePointerCapture(event.pointerId);
      } catch {
        /* capture already released */
      }
      if (moved) {
        const cue = findCue(cueId);
        if (cue) {
          working!.cues = sortCues(working!.cues);
          render();
          scheduleFrame(cue, 80);
        }
      } else {
        select(cueId, true);
      }
    };
    marker.addEventListener("pointerup", finish);
    marker.addEventListener("pointercancel", finish);
    marker.addEventListener("keydown", (event) => {
      const cue = findCue(cueId);
      if (!cue) return;
      const delta = event.key === "ArrowLeft" ? -SNAP : event.key === "ArrowRight" ? SNAP : 0;
      if (!delta) return;
      event.preventDefault();
      cue.at = clampAt(cue, cue.at + (event.shiftKey ? delta * 10 : delta));
      working!.cues = sortCues(working!.cues);
      select(cueId, true);
    });
  }

  function sortCues(cues: Cue[]): Cue[] {
    const order: Record<Phase, number> = { preshow: 0, play: 1, epilogue: 2 };
    return cues
      .map((c, i) => ({ c, i }))
      .sort((a, b) => order[a.c.phase] - order[b.c.phase] || a.c.at - b.c.at || a.i - b.i)
      .map((x) => x.c);
  }

  function select(cueId: string | null, rerender: boolean): void {
    selectedId = cueId;
    if (rerender) render();
    else {
      dom.tracks.querySelectorAll<HTMLElement>(".ed-marker.selected").forEach((el) => el.classList.remove("selected"));
      dom.tracks.querySelector<HTMLElement>(`.ed-marker[data-cue-id="${cssEscape(cueId ?? "")}"]`)?.classList.add("selected");
      renderDetail();
    }
    const cue = findCue(cueId);
    if (cue) scheduleFrame(cue, 60);
  }

  function cssEscape(value: string): string {
    return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
  }

  function renderDetail(): void {
    const cue = findCue(selectedId);
    dom.detail.hidden = !cue;
    if (!cue) {
      hideFrame();
      return;
    }
    const desc = deps.describe(cue);
    dom.detailId.textContent = `${cue.id} · ${cue.phase.toUpperCase()} · ${cue.kind.toUpperCase()}${cue.manual ? " · MANUAL" : ""}`;
    dom.detailDesc.textContent = `${desc.title}${desc.detail ? ` — ${desc.detail}` : ""}`;
    const r = range(cue.phase);
    dom.at.min = String(r.min);
    dom.at.max = String(r.max);
    if (document.activeElement !== dom.at) dom.at.value = String(cue.at);
  }

  // ---------------------------------------------------------------------------
  // Frame preview

  function scheduleFrame(cue: Cue, delayMs: number): void {
    if (frameTimer !== null) window.clearTimeout(frameTimer);
    frameTimer = window.setTimeout(() => {
      frameTimer = null;
      showFrame(cue);
    }, delayMs);
  }

  function showFrame(cue: Cue): void {
    if (cue.phase !== "play" || cue.at < 0) {
      hideFrame();
      return;
    }
    const token = ++frameToken;
    const img = dom.frame;
    const url = `/api/frame?t=${encodeURIComponent(round1(cue.at))}&w=${FRAME_WIDTH}`;
    if (img.dataset.url === url && !img.hidden) return;
    img.dataset.url = url;
    img.onload = () => {
      if (token === frameToken) img.hidden = false;
    };
    img.onerror = () => {
      if (token === frameToken) hideFrame();
    };
    img.src = url;
  }

  function hideFrame(): void {
    dom.frame.hidden = true;
    dom.frame.removeAttribute("src");
    delete dom.frame.dataset.url;
  }

  // ---------------------------------------------------------------------------
  // Playhead

  function positionPlayhead(): void {
    for (const phase of PHASES) {
      const ph = playheadByPhase.get(phase);
      if (!ph) continue;
      if (playhead.phase !== phase) {
        ph.hidden = true;
        continue;
      }
      const r = range(phase);
      const t = Math.min(r.max, Math.max(r.min, playhead.t));
      ph.hidden = false;
      ph.style.left = `${((t - r.min) / (r.max - r.min || 1)) * 100}%`;
    }
  }

  // ---------------------------------------------------------------------------
  // Server round-trips

  function showErrors(errors: string[], reason?: string): void {
    dom.errors.replaceChildren();
    if (!errors.length && !reason) {
      dom.errors.hidden = true;
      return;
    }
    dom.errors.hidden = false;
    if (reason) {
      const head = document.createElement("strong");
      head.textContent = reason;
      dom.errors.append(head);
    }
    const list = document.createElement("ul");
    for (const e of errors.slice(0, 20)) {
      const li = document.createElement("li");
      li.textContent = e;
      list.append(li);
    }
    dom.errors.append(list);
  }

  async function api<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
    const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
    if (res.status === 401) {
      deps.onUnauthorized();
      throw new Error("Sesiune expirată");
    }
    const data = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, data };
  }

  async function save(): Promise<void> {
    if (!working || saving) return;
    saving = true;
    dom.save.disabled = true;
    dom.save.textContent = "SE SALVEAZĂ…";
    try {
      const { status, data } = await api<SaveOk | SaveErr>("/api/show", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(working),
      });
      if (status === 403) {
        deps.notify("Rolul tău nu poate modifica scenariul (necesită operator).", true);
        return;
      }
      if (!data.ok) {
        showErrors(data.errors ?? [], data.reason);
        deps.notify(data.reason || "Scenariul a fost respins de server.", true);
        return;
      }
      showErrors([]);
      pristine = JSON.stringify(working);
      deps.onSaved(clone(working));
      deps.notify(
        `Scenariu salvat (${data.cues} cue-uri${data.backup ? `, backup ${data.backup}` : ""})${data.warnings.length ? ` · ${data.warnings.length} avertismente` : ""}.`,
      );
      if (data.warnings.length) showErrors(data.warnings, "Avertismente (salvarea a reușit):");
      if (!dom.backups.hidden) void loadBackups();
    } catch (error) {
      deps.notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      saving = false;
      dom.save.textContent = "SALVEAZĂ";
      updateDirty();
    }
  }

  async function reloadFromServer(): Promise<void> {
    try {
      const { status, data } = await api<ShowFile | { ok: false; reason?: string }>("/api/show");
      if (status !== 200 || !("cues" in data)) throw new Error(("reason" in data && data.reason) || `Eroare ${status}`);
      setShow(data);
      showErrors([]);
      deps.notify("Modificările au fost anulate; scenariul a fost reîncărcat de pe server.");
    } catch (error) {
      deps.notify(error instanceof Error ? error.message : String(error), true);
    }
  }

  async function loadBackups(): Promise<void> {
    dom.backupsList.replaceChildren();
    try {
      const { data } = await api<{ backups?: BackupInfo[]; reason?: string }>("/api/show/backups");
      const backups = data.backups ?? [];
      if (!backups.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = data.reason ?? "Niciun backup încă. Primul apare la prima salvare.";
        dom.backupsList.append(empty);
        return;
      }
      for (const b of backups) {
        const row = document.createElement("div");
        row.className = "ed-backup";
        const copy = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = b.file;
        const meta = document.createElement("span");
        meta.textContent = `${new Date(b.mtime).toLocaleString("ro-RO")} · ${(b.bytes / 1024).toFixed(1)} kB`;
        copy.append(name, meta);
        const restore = document.createElement("button");
        restore.type = "button";
        restore.className = "button compact subtle";
        restore.textContent = "RESTAUREAZĂ";
        restore.addEventListener("click", () => void restoreBackup(b.file));
        row.append(copy, restore);
        dom.backupsList.append(row);
      }
    } catch (error) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = error instanceof Error ? error.message : String(error);
      dom.backupsList.append(p);
    }
  }

  async function restoreBackup(file: string): Promise<void> {
    if (!window.confirm(`Restaurezi ${file}? Show-ul curent este salvat automat ca backup înainte.`)) return;
    try {
      const { data } = await api<SaveOk | SaveErr>(`/api/show/restore/${encodeURIComponent(file)}`, { method: "POST" });
      if (!data.ok) {
        showErrors(data.errors ?? [], data.reason);
        deps.notify(data.reason || "Restaurarea a eșuat.", true);
        return;
      }
      deps.notify(`Backup restaurat (${data.cues} cue-uri, versiunea ${data.version}).`);
      await reloadFromServer();
      await loadBackups();
    } catch (error) {
      deps.notify(error instanceof Error ? error.message : String(error), true);
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring

  dom.save.addEventListener("click", () => void save());
  let tracksWidth = 0;
  new ResizeObserver(() => {
    const width = dom.tracks.clientWidth;
    if (width === tracksWidth) return;
    tracksWidth = width;
    render();
  }).observe(dom.tracks);
  dom.cancel.addEventListener("click", () => {
    if (isDirty() && !window.confirm("Renunți la modificările nesalvate?")) return;
    void reloadFromServer();
  });
  dom.backupsToggle.addEventListener("click", () => {
    dom.backups.hidden = !dom.backups.hidden;
    if (!dom.backups.hidden) void loadBackups();
  });
  dom.backupsRefresh.addEventListener("click", () => void loadBackups());
  dom.at.addEventListener("change", () => {
    const cue = findCue(selectedId);
    if (!cue || !working) return;
    const v = Number(dom.at.value);
    if (!Number.isFinite(v)) {
      dom.at.value = String(cue.at);
      return;
    }
    cue.at = clampAt(cue, v);
    working.cues = sortCues(working.cues);
    render();
    scheduleFrame(cue, 60);
  });
  dom.at.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      dom.at.dispatchEvent(new Event("change"));
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (isDirty()) event.preventDefault();
  });

  function setShow(show: ShowFile): void {
    // A `welcome` after someone else's save must not wipe unsaved local edits silently.
    if (working && isDirty() && JSON.stringify(show) !== pristine) {
      deps.notify("Scenariul s-a schimbat pe server; modificările tale locale rămân nesalvate (ANULEAZĂ pentru a le renunța).", true);
      pristine = JSON.stringify(show);
      updateDirty();
      return;
    }
    working = clone(show);
    pristine = JSON.stringify(working);
    if (selectedId && !working.cues.some((c) => c.id === selectedId)) selectedId = null;
    render();
  }

  render();

  return {
    setShow,
    setPlayhead(phase, t) {
      playhead.phase = phase;
      playhead.t = t;
      positionPlayhead();
    },
  };
}
