import { createPresentation } from "./presentation";
import { createMissionControl } from "./mission-control";
import { createExperienceControl } from "./experience-control";
import { applyTheme, icon, mascotPath } from "../shared/glass";
import { SPEAKERS, type Cue, type PerfSample, type Phase, type PlaybackState, type Readiness, type SceneTheme, type ShowFile, type ShowState, type Speaker } from "@shared/types";
import type { ClockMsg, Command, ServerMessage, TabletsMsg } from "@shared/protocol";
import { createTimelineEditor } from "./editor";

type CueStatus = "pending" | "fired" | "skipped";

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element lipsă: #${id}`);
  return node as T;
};

const dom = {
  connection: byId<HTMLDivElement>("connection"),
  connectionLabel: byId<HTMLSpanElement>("connection-label"),
  logout: byId<HTMLButtonElement>("logout"),
  showTitle: byId<HTMLHeadingElement>("show-title"),
  showVersion: byId<HTMLParagraphElement>("show-version"),
  sceneLabel: byId<HTMLParagraphElement>("scene-label"),
  playbackState: byId<HTMLSpanElement>("playback-state"),
  mainClock: byId<HTMLTimeElement>("main-clock"),
  durationLabel: byId<HTMLSpanElement>("duration-label"),
  screensCount: byId<HTMLElement>("screens-count"),
  tabletsCount: byId<HTMLElement>("tablets-count"),
  videoStatus: byId<HTMLElement>("video-status"),
  themeLabel: byId<HTMLElement>("theme-label"),
  variantLabel: byId<HTMLElement>("variant-label"),
  autorunLabel: byId<HTMLElement>("autorun-label"),
  ambientLabel: byId<HTMLElement>("ambient-label"),
  lightsLabel: byId<HTMLElement>("lights-label"),
  commandNote: byId<HTMLSpanElement>("command-note"),
  // readiness (D-10)
  readiness: byId<HTMLDivElement>("readiness"),
  readinessBadge: byId<HTMLSpanElement>("readiness-badge"),
  readinessSummary: byId<HTMLSpanElement>("readiness-summary"),
  readinessScreens: byId<HTMLElement>("readiness-screens"),
  readinessMissing: byId<HTMLElement>("readiness-missing"),
  readinessTablets: byId<HTMLElement>("readiness-tablets"),
  readinessVideo: byId<HTMLElement>("readiness-video"),
  readinessAssets: byId<HTMLElement>("readiness-assets"),
  readinessReasons: byId<HTMLUListElement>("readiness-reasons"),
  startHint: byId<HTMLElement>("start-hint"),
  timeline: byId<HTMLInputElement>("timeline"),
  timelineStart: byId<HTMLSpanElement>("timeline-start"),
  timelineCurrent: byId<HTMLElement>("timeline-current"),
  timelineEnd: byId<HTMLSpanElement>("timeline-end"),
  sceneSelect: byId<HTMLSelectElement>("scene-select"),
  sceneGo: byId<HTMLButtonElement>("scene-go"),
  language: byId<HTMLSelectElement>("language"),
  voiceVolume: byId<HTMLInputElement>("voice-volume"),
  voiceOutput: byId<HTMLOutputElement>("voice-output"),
  sfxVolume: byId<HTMLInputElement>("sfx-volume"),
  sfxOutput: byId<HTMLOutputElement>("sfx-output"),
  // R4 controls (D-10)
  rehearseX4: byId<HTMLButtonElement>("rehearse-x4"),
  rateNormal: byId<HTMLButtonElement>("rate-normal"),
  rateNote: byId<HTMLSpanElement>("rate-note"),
  ambientToggle: byId<HTMLButtonElement>("ambient-toggle"),
  tabletSfxToggle: byId<HTMLButtonElement>("tablet-sfx-toggle"),
  autorunToggle: byId<HTMLButtonElement>("autorun-toggle"),
  lightsTheme: byId<HTMLSelectElement>("lights-theme"),
  lightsApply: byId<HTMLButtonElement>("lights-apply"),
  variantSelect: byId<HTMLSelectElement>("variant-select"),
  variantApply: byId<HTMLButtonElement>("variant-apply"),
  saySpeaker: byId<HTMLSelectElement>("say-speaker"),
  sayText: byId<HTMLInputElement>("say-text"),
  saySend: byId<HTMLButtonElement>("say-send"),
  photoButton: byId<HTMLButtonElement>("photo-button"),
  preflightButton: byId<HTMLButtonElement>("preflight-button"),
  // cues / tablets
  cueSearch: byId<HTMLInputElement>("cue-search"),
  cuePhase: byId<HTMLSelectElement>("cue-phase"),
  cueCount: byId<HTMLSpanElement>("cue-count"),
  cueList: byId<HTMLDivElement>("cue-list"),
  perfCount: byId<HTMLElement>("perf-count"),
  perfTable: byId<HTMLTableElement>("perf-table"),
  tabletLiveCount: byId<HTMLElement>("tablet-live-count"),
  tabletQr: byId<HTMLImageElement>("tablet-qr"),
  tabletUrl: byId<HTMLAnchorElement>("tablet-url"),
  copyUrl: byId<HTMLButtonElement>("copy-url"),
  tabletList: byId<HTMLDivElement>("tablet-list"),
  answerCount: byId<HTMLSpanElement>("answer-count"),
  answerList: byId<HTMLDivElement>("answer-list"),
  clearAnswers: byId<HTMLButtonElement>("clear-answers"),
  // users (admin)
  usersPanel: byId<HTMLElement>("users-panel"),
  usersNote: byId<HTMLSpanElement>("users-note"),
  usersList: byId<HTMLDivElement>("users-list"),
  usersForm: byId<HTMLFormElement>("users-form"),
  userName: byId<HTMLInputElement>("user-name"),
  userRole: byId<HTMLSelectElement>("user-role"),
  userPin: byId<HTMLInputElement>("user-pin"),
  toast: byId<HTMLDivElement>("toast"),
  playButton: byId<HTMLButtonElement>("play-button"),
  pauseButton: byId<HTMLButtonElement>("pause-button"),
  startExperience: byId<HTMLButtonElement>("start-experience"),
  focusPlayer: byId<HTMLButtonElement>("focus-player"),
};

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;
let show: ShowFile | null = null;
let state: ShowState | null = null;
let clock: ClockMsg | null = null;
let tablets: TabletsMsg = { type: "tablets", tablets: [], answers: [] };
let cueStatuses: Record<string, CueStatus> = {};
let lastFiredCueId: string | null = null;
let timelineDragging = false;
let toastTimer: number | null = null;
let volumeTimer: number | null = null;
let perfSamples: PerfSample[] = [];
let perfSeenAt = 0;

const stateLabels: Record<PlaybackState, string> = {
  idle: "IDLE",
  preshow: "PRE-SHOW",
  playing: "ÎN REDARE",
  paused: "PAUZĂ",
  epilogue: "EPILOG",
  ended: "ÎNCHEIAT",
};

function wsUrl(): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/ws`;
}

function setConnection(status: "connecting" | "online" | "offline", label: string): void {
  dom.connection.dataset.status = status;
  dom.connectionLabel.textContent = label;
}

function notify(message: string, error = false): void {
  dom.toast.textContent = message;
  dom.toast.className = `toast show${error ? " error" : ""}`;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (dom.toast.className = "toast"), 3500);
}

function setCommandNote(message: string, error = false): void {
  dom.commandNote.textContent = message;
  dom.commandNote.classList.toggle("error", error);
}

/** R4 — session token for the WS hello (the cookie is HttpOnly, so /api/auth/me hands it back). */
let sessionToken: string | null = null;
let sessionUser: { name: string; role: string } | null = null;

function goToLogin(): void {
  location.assign(`/login/?next=${encodeURIComponent(location.pathname + location.search)}`);
}

async function ensureSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
    if (res.status === 401) {
      goToLogin();
      return false;
    }
    if (!res.ok) return true; // auth endpoint unavailable (older server) — try connecting anyway
    const data = (await res.json()) as { authenticated?: boolean; token?: string; user?: { name: string; role: string } };
    if (!data.authenticated) {
      goToLogin();
      return false;
    }
    sessionToken = data.token ?? null;
    sessionUser = data.user ?? null;
    applyRole();
    return true;
  } catch {
    return true;
  }
}

function applyRole(): void {
  const admin = sessionUser?.role === "admin";
  dom.usersPanel.hidden = !admin;
  if (admin) void loadUsers();
  const viewer = sessionUser?.role === "viewer";
  document.body.classList.toggle("is-viewer", viewer);
}

function connect(): void {
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
  setConnection("connecting", reconnectAttempt ? "Reconectare…" : "Conectare…");
  void ensureSession().then((ok) => {
    if (!ok) return;
    const ws = new WebSocket(wsUrl());
    socket = ws;

    ws.addEventListener("open", () => {
      reconnectAttempt = 0;
      setConnection("online", sessionUser ? `Conectat · ${sessionUser.name} (${sessionUser.role})` : "Conectat");
      ws.send(JSON.stringify({ type: "hello", client: "control", id: "control", ...(sessionToken ? { token: sessionToken } : {}) }));
    });
    attachSocketHandlers(ws);
  });
}

function attachSocketHandlers(ws: WebSocket): void {
  ws.addEventListener("message", (event) => {
    try {
      onMessage(JSON.parse(String(event.data)) as ServerMessage);
    } catch {
      notify("Serverul a trimis un mesaj invalid.", true);
    }
  });
  ws.addEventListener("close", (ev) => {
    if (socket === ws) socket = null;
    if (ev.code === 4401 || ev.code === 4403) {
      setConnection("offline", ev.code === 4401 ? "Sesiune expirată · autentificare…" : "Rol insuficient");
      if (ev.code === 4401) {
        goToLogin();
        return;
      }
    }
    reconnectAttempt += 1;
    const delay = Math.min(10_000, 700 * 1.7 ** Math.min(reconnectAttempt, 7));
    setConnection("offline", `Deconectat · reîncerc în ${Math.ceil(delay / 1000)}s`);
    reconnectTimer = window.setTimeout(connect, delay);
  });
  ws.addEventListener("error", () => ws.close());
}

function onMessage(message: ServerMessage): void {
  switch (message.type) {
    case "welcome":
      show = message.show;
      state = message.state;
      clock = null;
      dom.language.value = message.config.lang;
      renderShow();
      renderState();
      editor.setShow(show);
      void refreshCueStatuses();
      break;
    case "state":
      if (clock && clock.state !== message.state.state) clock = null;
      state = message.state;
      renderState();
      break;
    case "clock":
      clock = message;
      if (state && state.state !== message.state) {
        state = { ...state, state: message.state, phaseTime: message.phaseTime, serverTimeMs: message.serverTimeMs, rate: message.rate };
        renderState();
      }
      break;
    case "cueFired":
      lastFiredCueId = message.cue.id;
      cueStatuses[message.cue.id] = "fired";
      renderCues();
      window.setTimeout(() => void refreshCueStatuses(), 80);
      break;
    case "tablets":
      tablets = message;
      renderTablets();
      break;
    case "perfSummary":
      perfSamples = message.samples;
      perfSeenAt = Date.now();
      renderPerf();
      break;
    case "dynamicVoice":
      setCommandNote(`${SPEAKERS[message.speaker]?.label ?? message.speaker}: „${message.text.slice(0, 80)}${message.text.length > 80 ? "…" : ""}”`);
      break;
    case "photo":
      if (message.action === "countdown") setCommandNote(`Fotografie de echipaj în ${message.countdownSec ?? 3} s…`);
      else if (message.action === "show") setCommandNote("Fotografia de echipaj a fost capturată");
      break;
    case "error":
      setCommandNote(message.reason, true);
      notify(message.reason, true);
      break;
    case "applyCmd":
    case "tabletView":
    case "entityParams":
      break;
  }
}

async function dispatch(cmd: Command): Promise<void> {
  if (cmd.action === "restart" && !window.confirm("Resetezi show-ul la început? Rolurile tabletelor vor fi eliberate.")) return;
  const label = commandLabel(cmd.action);
  setCommandNote(`${label} trimis…`);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "cmd", cmd }));
    setCommandNote(`${label} · ${new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
    if (cmd.action === "seek" || cmd.action === "skipToScene" || cmd.action === "restart") {
      window.setTimeout(() => void refreshCueStatuses(), 250);
    }
    return;
  }
  try {
    const response = await fetch("/api/cmd", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd }),
    });
    if (response.status === 401) {
      goToLogin();
      return;
    }
    const result = (await response.json()) as { ok?: boolean; reason?: string; state?: ShowState };
    if (!response.ok || !result.ok) throw new Error(result.reason ?? "Comanda a fost respinsă.");
    if (result.state) {
      state = result.state;
      renderState();
    }
    setCommandNote(`${label} · trimis prin conexiunea de rezervă`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    setCommandNote(reason, true);
    notify(reason, true);
  }
}

async function focusPlayer(): Promise<void> {
  dom.focusPlayer.disabled = true;
  try {
    const response = await fetch("/api/player/focus", { method: "POST", credentials: "same-origin" });
    const result = (await response.json()) as { ok?: boolean; reason?: string };
    if (!response.ok || !result.ok) throw new Error(result.reason ?? "Playerul nu a putut fi adus în față.");
    setCommandNote("Playerul a fost adus în față");
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error), true);
  } finally {
    dom.focusPlayer.disabled = false;
  }
}

function commandLabel(action: Command["action"]): string {
  const labels: Record<Command["action"], string> = {
    preshow: "Pre-show", start: "Start", play: "Redare", pause: "Pauză", seek: "Salt pe timeline",
    skipToScene: "Salt la scenă", restart: "Restart", epilogue: "Epilog", fireCue: "Cue manual",
    stopVoice: "Voce oprită", setVolume: "Volum", setLang: "Limbă", reloadShow: "Scenariu reîncărcat",
    testAvatar: "Test avatar", identifyScreens: "Identificare ecrane",
    // R4
    rehearse: "Repetiție accelerată", setRate: "Viteză", autoRun: "Mod operator absent", lights: "Lumini",
    tabletSfx: "Sunete tablete", ambient: "Ambianță", say: "Spune", setVariant: "Variantă scenariu", photo: "Fotografie echipaj", preflight: "Preflight",
  };
  return labels[action];
}

function phaseFor(playback: PlaybackState): Phase | null {
  if (playback === "preshow") return "preshow";
  if (playback === "playing" || playback === "paused") return "play";
  if (playback === "epilogue" || playback === "ended") return "epilogue";
  return null;
}

function phaseRange(phase: Phase | null): { min: number; max: number } {
  if (!show) return { min: 0, max: 0 };
  const target = phase ?? "play";
  const ends = show.scenes.filter((scene) => scene.phase === target).map((scene) => scene.end);
  const max = target === "play" ? Math.max(show.videoDurationSec, ...ends, 0) : Math.max(...ends, 0);
  return { min: target === "play" ? -show.launchLeadInSec : 0, max };
}

function phaseTime(): number {
  if (clock && (clock.state === "playing" || clock.state === "preshow" || clock.state === "epilogue")) {
    return clock.phaseTime + ((Date.now() - clock.serverTimeMs) / 1000) * clock.rate;
  }
  return state?.phaseTime ?? 0;
}

export function formatTime(seconds: number, showTenths = false): string {
  const negative = seconds < 0;
  const absolute = Math.max(0, Math.abs(seconds));
  const minutes = Math.floor(absolute / 60);
  const secs = Math.floor(absolute % 60);
  const suffix = showTenths ? `.${Math.floor((absolute % 1) * 10)}` : "";
  const value = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${suffix}`;
  return negative ? `T−${value}` : value;
}

function renderClock(): void {
  const t = phaseTime();
  const phase = phaseFor(state?.state ?? "idle");
  const range = phaseRange(phase);
  dom.mainClock.textContent = formatTime(t);
  dom.mainClock.dateTime = `PT${Math.max(0, t)}S`;
  dom.timelineCurrent.textContent = formatTime(t, true);
  if (!timelineDragging) dom.timeline.value = String(Math.min(range.max, Math.max(range.min, t)));
  renderVideoStatus(t);
  editor.setPlayhead(phase, t);
}

function renderVideoStatus(currentPhaseTime: number): void {
  if (!state?.videoReady) {
    dom.videoStatus.textContent = "NEÎNCĂRCAT";
    dom.videoStatus.style.color = "var(--amber)";
    return;
  }
  if (state.state === "playing" && currentPhaseTime < 0) {
    dom.videoStatus.textContent = "T−10 · ÎNCĂRCAT";
    dom.videoStatus.style.color = "var(--cyan)";
    return;
  }
  const liveRate = clock?.state === state.state ? clock.rate : state.rate;
  if (state.state === "playing" && currentPhaseTime >= 0) {
    dom.videoStatus.textContent = liveRate > 0 ? "RULEAZĂ" : "BLOCAT";
    dom.videoStatus.style.color = liveRate > 0 ? "var(--green)" : "var(--red)";
    return;
  }
  dom.videoStatus.textContent = "ÎNCĂRCAT";
  dom.videoStatus.style.color = "var(--cyan)";
}

function renderShow(): void {
  if (!show) return;
  dom.showTitle.textContent = show.title;
  dom.showVersion.textContent = `SHOW ${show.version} · ${show.timingStatus === "aligned" ? "TIMPI ALINIAȚI" : "TIMPI PROVIZORII"}`;
  renderScenes();
  renderVariants();
  renderCues();
}

function renderScenes(): void {
  if (!show) return;
  const selected = dom.sceneSelect.value;
  dom.sceneSelect.replaceChildren();
  for (const scene of show.scenes) {
    const option = document.createElement("option");
    option.value = scene.id;
    option.textContent = `${formatTime(scene.start)} · ${scene.label}`;
    dom.sceneSelect.append(option);
  }
  if (show.scenes.some((scene) => scene.id === selected)) dom.sceneSelect.value = selected;
}

function renderVariants(): void {
  const current = state?.variant ?? "";
  dom.variantSelect.replaceChildren();
  const base = document.createElement("option");
  base.value = "";
  base.textContent = "Text de bază";
  dom.variantSelect.append(base);
  for (const [key, meta] of Object.entries(show?.variants ?? {})) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${meta.label} (${meta.ageRange})`;
    dom.variantSelect.append(option);
  }
  dom.variantSelect.value = current && show?.variants && current in show.variants ? current : "";
  dom.variantApply.disabled = !show?.variants || Object.keys(show.variants).length === 0;
}

function renderSpeakers(): void {
  dom.saySpeaker.replaceChildren();
  for (const profile of Object.values(SPEAKERS)) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label;
    dom.saySpeaker.append(option);
  }
  dom.saySpeaker.value = "CAPITANUL";
}

function renderReadiness(readiness: Readiness | undefined, idle: boolean): void {
  if (!readiness) {
    dom.readiness.dataset.ready = "unknown";
    dom.readinessBadge.textContent = "PREGĂTIRE NECUNOSCUTĂ";
    dom.readinessSummary.textContent = "Serverul nu raportează încă starea de pregătire.";
    dom.readinessReasons.replaceChildren();
    dom.startExperience.classList.remove("not-ready");
    return;
  }
  dom.readiness.dataset.ready = readiness.ready ? "yes" : "no";
  dom.readinessBadge.innerHTML = icon(readiness.ready ? "check" : "warning") + (readiness.ready ? " Nava este pregătită" : " Nava nu este pregătită");
  dom.readinessSummary.textContent = readiness.ready
    ? "Toate ecranele cerute sunt conectate, filmul este încărcat și vocile au trecut verificarea."
    : `${readiness.reasons.length} ${readiness.reasons.length === 1 ? "problemă" : "probleme"} · pornirea manuală rămâne permisă.`;
  dom.readinessScreens.textContent = readiness.screensConnected.length ? readiness.screensConnected.join(", ") : "—";
  dom.readinessMissing.textContent = readiness.screensMissing.length ? readiness.screensMissing.join(", ") : "niciunul";
  dom.readinessMissing.className = readiness.screensMissing.length ? "bad" : "ok";
  dom.readinessTablets.textContent = `${readiness.tabletsConnected}${readiness.tabletsRequired ? ` / ${readiness.tabletsRequired}` : ""}`;
  dom.readinessTablets.className = readiness.tabletsConnected < readiness.tabletsRequired ? "bad" : "ok";
  dom.readinessVideo.textContent = readiness.videoReady ? "ÎNCĂRCAT" : "NEÎNCĂRCAT";
  dom.readinessVideo.className = readiness.videoReady ? "ok" : "bad";
  dom.readinessAssets.textContent = readiness.assetsOk === null ? "NEVERIFICATE" : readiness.assetsOk ? "OK" : "PROBLEME";
  dom.readinessAssets.className = readiness.assetsOk === null ? "warn" : readiness.assetsOk ? "ok" : "bad";
  dom.readinessReasons.replaceChildren();
  for (const reason of readiness.reasons) {
    const li = document.createElement("li");
    li.textContent = reason;
    dom.readinessReasons.append(li);
  }
  const warn = !readiness.ready && idle;
  dom.startExperience.classList.toggle("not-ready", warn);
  dom.startHint.textContent = warn
    ? `Atenție: ${readiness.reasons[0] ?? "nava nu este pregătită"} — START pornește oricum.`
    : "Începe numărătoarea de 10 secunde, apoi filmul.";
}

function renderR4Header(): void {
  if (!state) return;
  const variantMeta = state.variant && show?.variants ? show.variants[state.variant] : undefined;
  dom.variantLabel.textContent = state.variant ? (variantMeta?.label ?? state.variant).toUpperCase() : "BAZĂ";
  dom.autorunLabel.textContent = state.autoRun === undefined ? "—" : state.autoRun ? "ON" : "OFF";
  dom.autorunLabel.style.color = state.autoRun ? "var(--green)" : "";
  dom.ambientLabel.textContent = state.ambientEnabled === undefined ? "—" : state.ambientEnabled ? "ON" : "OFF";
  dom.ambientLabel.style.color = state.ambientEnabled ? "var(--green)" : "";
  dom.lightsLabel.textContent = (state.lightsDriver ?? "—").toUpperCase();

  dom.ambientToggle.textContent = `AMBIANȚĂ · ${state.ambientEnabled === undefined ? "—" : state.ambientEnabled ? "ON" : "OFF"}`;
  dom.ambientToggle.setAttribute("aria-pressed", String(!!state.ambientEnabled));
  dom.ambientToggle.disabled = state.ambientEnabled === undefined;
  dom.autorunToggle.textContent = `AUTO-RUN · ${state.autoRun === undefined ? "—" : state.autoRun ? "ON" : "OFF"}`;
  dom.autorunToggle.setAttribute("aria-pressed", String(!!state.autoRun));
  dom.autorunToggle.disabled = state.autoRun === undefined;
  dom.lightsApply.disabled = state.lightsDriver === "none";
  dom.lightsApply.title = state.lightsDriver === "none" ? "lights.driver = none în config.json — adaptorul de lumini este dezactivat" : "";
  dom.lightsTheme.value = state.theme;

  const liveRate = clock?.state === state.state ? clock.rate : state.rate;
  const advancing = state.state === "playing" || state.state === "preshow" || state.state === "epilogue";
  dom.rateNote.textContent = advancing ? `rată ${liveRate}×` : "rată 1× (la pornire)";
  dom.rateNote.classList.toggle("warn", advancing && liveRate > 1);
  if (show?.variants && dom.variantSelect.value !== (state.variant ?? "") && document.activeElement !== dom.variantSelect) {
    dom.variantSelect.value = state.variant && state.variant in show.variants ? state.variant : "";
  }
}

function renderState(): void {
  if (!state) return;
  applyTheme(state.theme);
  dom.tabletSfxToggle.innerHTML = icon("speaker") + ` Sunete tablete · ${state.tabletSfx !== false ? "pornite" : "oprite"}`;
  dom.tabletSfxToggle.setAttribute("aria-pressed", String(state.tabletSfx !== false));
  dom.tabletSfxToggle.disabled = sessionUser?.role === "viewer" || !sessionUser;
  dom.playbackState.textContent = stateLabels[state.state];
  dom.playbackState.dataset.state = state.state;
  const currentScene = show?.scenes.find((scene) => scene.id === state?.sceneId);
  dom.sceneLabel.textContent = currentScene?.label ?? (state.state === "idle" ? "În așteptare" : "Fără scenă activă");
  dom.screensCount.textContent = String(state.screensConnected);
  dom.tabletsCount.textContent = String(state.tabletsConnected);
  dom.themeLabel.textContent = state.theme.toUpperCase();
  dom.language.value = state.lang;

  const phase = phaseFor(state.state);
  const range = phaseRange(phase);
  dom.timeline.min = String(range.min);
  dom.timeline.max = String(range.max);
  dom.timelineStart.textContent = formatTime(range.min);
  dom.timelineEnd.textContent = formatTime(range.max);
  dom.durationLabel.textContent = `/ ${formatTime(range.max)}`;
  dom.timeline.disabled = phase === null || state.state === "ended";
  dom.playButton.disabled = state.state !== "paused";
  dom.pauseButton.disabled = state.state !== "playing";
  dom.startExperience.disabled = state.state !== "idle" && state.state !== "preshow";
  const restart = document.querySelector<HTMLButtonElement>('[data-command="restart"]');
  if (restart) restart.disabled = state.state === "idle";
  if (currentScene) dom.sceneSelect.value = currentScene.id;
  renderReadiness(state.readiness, state.state === "idle" || state.state === "preshow");
  renderR4Header();
  renderClock();
}

export function cueDescription(cue: Cue, lang: string = state?.lang ?? "ro"): { title: string; detail: string } {
  switch (cue.kind) {
    case "voice":
      return { title: cue.text[lang as "ro"] ?? cue.text.ro, detail: SPEAKERS[cue.speaker].label };
    case "theme": return { title: `Temă: ${cue.theme}`, detail: cue.note ?? "Schimbare atmosferă" };
    case "tablet": return { title: `Tabletă: ${cue.interaction.type}`, detail: "prompt" in cue.interaction ? cue.interaction.prompt : cue.note ?? "Interacțiune echipaj" };
    case "entity": return { title: `${cue.action === "show" ? "Afișează" : "Ascunde"} ${cue.entity}`, detail: cue.note ?? "Entitate vizuală" };
    case "sfx": return { title: `SFX: ${cue.sfx}`, detail: cue.note ?? `${cue.durationSec ?? 0}s` };
    case "countdown": return { title: `Numărătoare ${cue.from} → ${cue.to}`, detail: cue.note ?? `${cue.durationSec ?? cue.from - cue.to}s` };
    case "marker": return { title: cue.label, detail: cue.note ?? "Reper regie" };
    // R4
    case "dynamic-voice": return { title: `Replică dinamică (${cue.source})`, detail: `${SPEAKERS[cue.speaker].label} · text compus de server` };
    case "ambient": return { title: `Ambianță: ${cue.action}${cue.bed ? ` · ${cue.bed}` : ""}`, detail: cue.note ?? "Pat sonor procedural" };
    case "lights": return { title: `Lumini: ${cue.theme}`, detail: cue.note ?? `fade ${cue.fadeSec ?? 0}s` };
    case "photo": return { title: "Fotografie de echipaj", detail: cue.note ?? `numărătoare ${cue.countdownSec ?? 3}s` };
    default: return { title: (cue as { id: string }).id, detail: (cue as { kind: string }).kind };
  }
}

function renderCues(): void {
  if (!show) return;
  const query = dom.cueSearch.value.trim().toLocaleLowerCase("ro");
  const phase = dom.cuePhase.value;
  const visible = show.cues.filter((cue) => {
    if (phase !== "all" && cue.phase !== phase) return false;
    if (!query) return true;
    const desc = cueDescription(cue);
    return `${cue.id} ${cue.kind} ${desc.title} ${desc.detail}`.toLocaleLowerCase("ro").includes(query);
  });
  dom.cueCount.textContent = `(${visible.length}/${show.cues.length})`;
  dom.cueList.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Niciun cue nu corespunde filtrului.";
    dom.cueList.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const cue of visible) {
    const row = document.createElement("article");
    row.className = `cue-row${lastFiredCueId === cue.id ? " is-last" : ""}`;
    row.dataset.status = cueStatuses[cue.id] ?? "pending";
    row.dataset.cueId = cue.id;

    const time = document.createElement("div");
    time.className = "cue-time";
    const statusDot = document.createElement("span");
    statusDot.className = "cue-status";
    time.append(statusDot, document.createTextNode(formatTime(cue.at, true)));

    const id = document.createElement("div");
    id.className = "cue-id";
    id.textContent = cue.id;

    const description = cueDescription(cue);
    const copy = document.createElement("div");
    copy.className = "cue-description";
    const title = document.createElement("strong");
    title.textContent = description.title;
    const detail = document.createElement("span");
    detail.textContent = `${cue.phase.toUpperCase()} · ${cue.kind.toUpperCase()}${cue.manual ? " · MANUAL" : ""}${description.detail ? ` · ${description.detail}` : ""}`;
    copy.append(title, detail);

    const fire = document.createElement("button");
    fire.className = "button subtle cue-fire";
    fire.type = "button";
    fire.textContent = "DECLANȘEAZĂ";
    fire.title = `Declanșează ${cue.id} acum`;
    fire.addEventListener("click", () => void dispatch({ action: "fireCue", cueId: cue.id }));
    row.append(time, id, copy, fire);
    fragment.append(row);
  }
  dom.cueList.append(fragment);
}

function renderPerf(): void {
  const body = dom.perfTable.tBodies[0];
  if (!body) return;
  const stale = Date.now() - perfSeenAt > 5000;
  dom.perfCount.textContent = perfSamples.length && !stale ? `${perfSamples.length} raportează` : "0 raportează";
  dom.perfCount.style.color = perfSamples.length && !stale ? "" : "var(--muted)";
  body.replaceChildren();
  if (!perfSamples.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty";
    cell.textContent = "Niciun ecran nu a trimis încă măsurători.";
    row.append(cell);
    body.append(row);
    return;
  }
  const cell = (text: string, cls?: string): HTMLTableCellElement => {
    const td = document.createElement("td");
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  };
  for (const s of [...perfSamples].sort((a, b) => a.screenId.localeCompare(b.screenId))) {
    const row = document.createElement("tr");
    const droppedPct = s.videoTotal > 0 ? (100 * s.videoDropped) / s.videoTotal : null;
    const drift = s.driftSec;
    row.append(
      cell(s.screenId, "perf-screen"),
      cell(droppedPct === null ? "—" : `${droppedPct.toFixed(1)}% (${s.videoDropped})`, droppedPct === null ? "" : droppedPct > 2 ? "bad" : droppedPct > 0.5 ? "warn" : "ok"),
      cell(`${s.videoFps === null ? "—" : Math.round(s.videoFps)} / ${s.avatarFps === null ? "—" : Math.round(s.avatarFps)}`),
      cell(drift === null ? "—" : `${(drift * 1000).toFixed(0)} ms`, drift === null ? "" : Math.abs(drift) > 0.25 ? "bad" : Math.abs(drift) > 0.08 ? "warn" : "ok"),
      cell(s.lipsyncLatencyMs === null ? "—" : `${Math.round(s.lipsyncLatencyMs)} ms`, s.lipsyncLatencyMs === null ? "" : s.lipsyncLatencyMs > 120 ? "warn" : "ok"),
      cell(s.audioOutput ?? "—", "perf-audio"),
    );
    row.title = `heap ${s.heapMb ?? "—"} MB · zgomot sală ${s.roomLevel === null ? "—" : s.roomLevel.toFixed(2)} · ${new Date(s.atMs).toLocaleTimeString("ro-RO")}`;
    body.append(row);
  }
}

function renderTablets(): void {
  const connected = tablets.tablets.filter((tablet) => tablet.connected).length;
  dom.tabletLiveCount.textContent = `${connected} online`;
  dom.tabletList.replaceChildren();
  if (!tablets.tablets.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nicio tabletă conectată.";
    // The five waiting post cards below provide the empty state.
  } else {
    for (const tablet of [...tablets.tablets].sort((a, b) => Number(b.connected) - Number(a.connected))) {
      const item = document.createElement("div");
      item.className = `tablet-item${tablet.connected ? " online" : ""}`;
      const dot = document.createElement("span");
      dot.className = "presence";
      const copy = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = tablet.name || "—";
      const role = document.createElement("span");
      role.className = "tablet-role";
      role.textContent = tablet.role ?? "Rol neales";
      copy.append(name, role);
      const status = document.createElement("span");
      status.textContent = tablet.connected ? "LIVE" : "OFFLINE";
      if (tablet.post) {
        const mascot = document.createElement("img"); mascot.src = mascotPath(tablet.post, true); mascot.alt = ""; mascot.className = "post-mascot"; item.append(mascot);
      } else { item.append(dot); }
      item.append(copy, status);
      dom.tabletList.append(item);
    }
  }

  // Keep all five physical posts visible, including tablets still to connect.
  const postNames = ["NAVIGAȚIE", "PROPULSIE", "COMUNICAȚII", "BIOSEMNALE", "MEMORIE"];
  for (const post of [1, 2, 3, 4, 5] as const) {
    if (tablets.tablets.some(tablet => tablet.post === post)) continue;
    const item = document.createElement("div");
    item.className = "tablet-item awaiting";
    const mascot = document.createElement("img");
    mascot.src = mascotPath(post, true); mascot.alt = ""; mascot.className = "post-mascot";
    const copy = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = `${post} · ${postNames[post - 1]}`;
    const subtitle = document.createElement("span"); subtitle.textContent = "Așteaptă echipajul";
    copy.append(title, subtitle);
    const status = document.createElement("span"); status.textContent = "Neconectat";
    item.append(mascot, copy, status); dom.tabletList.append(item);
  }

  dom.answerCount.textContent = `(${tablets.answers.length})`;
  dom.answerList.replaceChildren();
  if (!tablets.answers.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Răspunsurile copiilor vor apărea aici.";
    dom.answerList.append(empty);
    return;
  }
  for (const answer of [...tablets.answers].sort((a, b) => b.atMs - a.atMs)) {
    const item = document.createElement("article");
    item.className = "answer-item";
    const meta = document.createElement("div");
    meta.className = "answer-meta";
    const author = document.createElement("strong");
    const tablet = tablets.tablets.find((entry) => entry.id === answer.tabletId);
    author.textContent = `${answer.name || "—"}${tablet?.role ? ` · ${tablet.role}` : ""}`;
    const when = document.createElement("time");
    when.textContent = new Date(answer.atMs).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
    when.title = `${answer.kind} · ${answer.cueId}`;
    meta.append(author, when);
    const text = document.createElement("p");
    text.textContent = answer.text;
    item.append(meta, text);
    dom.answerList.append(item);
  }
}

async function refreshCueStatuses(): Promise<void> {
  try {
    const response = await fetch("/api/cues", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return;
    const result = (await response.json()) as { statuses?: Record<string, CueStatus>; lastVoiceCueId?: string | null };
    if (result.statuses) cueStatuses = result.statuses;
    renderCues();
  } catch {
    // WebSocket remains the primary live path; this status decoration is optional.
  }
}

async function loadAuxiliaryData(): Promise<void> {
  try {
    const [urlsResponse, configResponse, tabletResponse] = await Promise.all([
      fetch("/api/urls", { cache: "no-store", credentials: "same-origin" }),
      fetch("/api/config", { cache: "no-store", credentials: "same-origin" }),
      fetch("/api/tablets", { cache: "no-store", credentials: "same-origin" }),
    ]);
    if (urlsResponse.ok) {
      const urls = (await urlsResponse.json()) as { tablet?: string };
      if (urls.tablet) {
        dom.tabletUrl.href = urls.tablet;
        dom.tabletUrl.textContent = urls.tablet;
        dom.tabletQr.src = `/api/qr?size=320&url=${encodeURIComponent(urls.tablet)}`;
      }
    }
    if (configResponse.ok) {
      const config = (await configResponse.json()) as { audio?: { voiceVolume?: number; sfxVolume?: number }; lang?: string };
      if (typeof config.audio?.voiceVolume === "number") dom.voiceVolume.value = String(config.audio.voiceVolume);
      if (typeof config.audio?.sfxVolume === "number") dom.sfxVolume.value = String(config.audio.sfxVolume);
      if (config.lang) dom.language.value = config.lang;
      updateVolumeOutputs();
    }
    if (tabletResponse.ok) {
      tablets = (await tabletResponse.json()) as TabletsMsg;
      renderTablets();
    }
  } catch {
    // The reconnecting socket will still populate the critical state.
  }
}

// ---------------------------------------------------------------------------
// Users (admin only) — /api/users

interface UserRow {
  id: string;
  name: string;
  role: string;
  createdAt: string;
  lastLoginAt?: string;
  disabled?: boolean;
}

async function usersApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  if (res.status === 401) {
    goToLogin();
    throw new Error("Sesiune expirată");
  }
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; reason?: string };
  if (!res.ok || data.ok === false) throw new Error(data.reason ?? `Eroare ${res.status}`);
  return data;
}

async function loadUsers(): Promise<void> {
  if (sessionUser?.role !== "admin") return;
  try {
    const data = await usersApi<{ users: UserRow[] }>("/api/users");
    dom.usersList.replaceChildren();
    for (const user of data.users) {
      const row = document.createElement("div");
      row.className = `user-row${user.disabled ? " disabled" : ""}`;
      const copy = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = user.name;
      const meta = document.createElement("span");
      meta.textContent = `${user.role}${user.disabled ? " · dezactivat" : ""}${user.lastLoginAt ? ` · ultimul login ${new Date(user.lastLoginAt).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}`;
      copy.append(name, meta);
      const actions = document.createElement("div");
      actions.className = "user-actions";
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "text-button";
      pin.textContent = "PIN";
      pin.title = "Schimbă PIN-ul";
      pin.addEventListener("click", () => void changePin(user));
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "text-button";
      toggle.textContent = user.disabled ? "Activează" : "Dezactivează";
      toggle.addEventListener("click", () => void toggleUser(user));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "text-button danger";
      del.textContent = "Șterge";
      del.addEventListener("click", () => void deleteUser(user));
      actions.append(pin, toggle, del);
      row.append(copy, actions);
      dom.usersList.append(row);
    }
    dom.usersNote.textContent = `${data.users.length} ${data.users.length === 1 ? "utilizator" : "utilizatori"}`;
    dom.usersNote.classList.remove("error");
  } catch (error) {
    dom.usersNote.textContent = error instanceof Error ? error.message : String(error);
    dom.usersNote.classList.add("error");
  }
}

async function changePin(user: UserRow): Promise<void> {
  const pin = window.prompt(`PIN nou pentru ${user.name} (4–8 cifre):`);
  if (!pin) return;
  try {
    await usersApi(`/api/users/${encodeURIComponent(user.id)}/pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    notify(`PIN schimbat pentru ${user.name}.`);
    await loadUsers();
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error), true);
  }
}

async function toggleUser(user: UserRow): Promise<void> {
  try {
    await usersApi(`/api/users/${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disabled: !user.disabled }) });
    await loadUsers();
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error), true);
  }
}

async function deleteUser(user: UserRow): Promise<void> {
  if (!window.confirm(`Ștergi utilizatorul „${user.name}”?`)) return;
  try {
    await usersApi(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
    notify(`Utilizatorul ${user.name} a fost șters.`);
    await loadUsers();
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error), true);
  }
}

dom.usersForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await usersApi("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: dom.userName.value.trim(), role: dom.userRole.value, pin: dom.userPin.value }),
    });
    dom.userName.value = "";
    dom.userPin.value = "";
    notify("Utilizator creat.");
    await loadUsers();
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error), true);
  }
});

dom.logout.addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    /* the redirect below still ends the local session */
  }
  location.assign("/login/?next=%2Fcontrol%2F");
});

// ---------------------------------------------------------------------------
// Volume / transport wiring

function updateVolumeOutputs(): void {
  dom.voiceOutput.value = `${Math.round(Number(dom.voiceVolume.value) * 100)}%`;
  dom.sfxOutput.value = `${Math.round(Number(dom.sfxVolume.value) * 100)}%`;
}

function scheduleVolume(): void {
  updateVolumeOutputs();
  if (volumeTimer !== null) window.clearTimeout(volumeTimer);
  volumeTimer = window.setTimeout(() => {
    void dispatch({ action: "setVolume", voice: Number(dom.voiceVolume.value), sfx: Number(dom.sfxVolume.value) });
  }, 180);
}

document.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.command as Command["action"] | undefined;
    if (!action) return;
    const sent = dispatch({ action } as Command);
    if (action === "preshow" || action === "start") void sent.then(focusPlayer);
    else void sent;
  });
});

dom.startExperience.addEventListener("click", () => {
  if (dom.startExperience.classList.contains("not-ready")) {
    const reasons = state?.readiness?.reasons.join("\n") ?? "";
    if (!window.confirm(`Nava nu este pregătită:\n${reasons}\n\nPornești oricum?`)) return;
  }
  void dispatch({ action: "start" }).then(focusPlayer);
});
dom.focusPlayer.addEventListener("click", () => void focusPlayer());

dom.timeline.addEventListener("pointerdown", () => (timelineDragging = true));
dom.timeline.addEventListener("input", () => {
  timelineDragging = true;
  dom.timelineCurrent.textContent = formatTime(Number(dom.timeline.value), true);
});
dom.timeline.addEventListener("change", () => {
  timelineDragging = false;
  void dispatch({ action: "seek", time: Number(dom.timeline.value) });
});
dom.timeline.addEventListener("pointerup", () => (timelineDragging = false));
dom.sceneGo.addEventListener("click", () => {
  if (dom.sceneSelect.value) void dispatch({ action: "skipToScene", sceneId: dom.sceneSelect.value });
});
dom.language.addEventListener("change", () => void dispatch({ action: "setLang", lang: dom.language.value as "ro" | "en" | "fr" }));
dom.voiceVolume.addEventListener("input", scheduleVolume);
dom.sfxVolume.addEventListener("input", scheduleVolume);
dom.cueSearch.addEventListener("input", renderCues);
dom.cuePhase.addEventListener("change", renderCues);

// --- R4 controls (D-10) -------------------------------------------------------------
dom.rehearseX4.addEventListener("click", () => void dispatch({ action: "rehearse", rate: 4 }));
dom.rateNormal.addEventListener("click", () => void dispatch({ action: "setRate", rate: 1 }));
dom.tabletSfxToggle.addEventListener("click", () => { if (sessionUser && sessionUser.role !== "viewer") void dispatch({ action: "tabletSfx", enabled: state?.tabletSfx === false }); });
dom.ambientToggle.addEventListener("click", () => void dispatch({ action: "ambient", enabled: !state?.ambientEnabled }));
dom.autorunToggle.addEventListener("click", () => {
  const next = !state?.autoRun;
  if (next && !window.confirm("Activezi modul operator absent? Show-ul va porni singur când nava este pregătită (după configurația autoRun).")) return;
  void dispatch({ action: "autoRun", enabled: next });
});
dom.lightsApply.addEventListener("click", () => void dispatch({ action: "lights", theme: dom.lightsTheme.value as SceneTheme }));
dom.variantApply.addEventListener("click", () => void dispatch({ action: "setVariant", variant: dom.variantSelect.value || null }));
const sendSay = (): void => {
  const text = dom.sayText.value.trim();
  if (!text) {
    dom.sayText.focus();
    return;
  }
  void dispatch({ action: "say", speaker: dom.saySpeaker.value as Speaker, text }).then(() => {
    dom.sayText.value = "";
  });
};
dom.saySend.addEventListener("click", sendSay);
dom.sayText.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendSay();
  }
});
dom.photoButton.addEventListener("click", () => void dispatch({ action: "photo" }));
dom.preflightButton.addEventListener("click", () => {
  dom.preflightButton.disabled = true;
  void dispatch({ action: "preflight" }).finally(() => {
    window.setTimeout(() => (dom.preflightButton.disabled = false), 1500);
  });
});

dom.copyUrl.addEventListener("click", async () => {
  const value = dom.tabletUrl.href;
  try {
    await navigator.clipboard.writeText(value);
    notify("Adresa tabletelor a fost copiată.");
  } catch {
    const temp = document.createElement("textarea");
    temp.value = value;
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    document.body.append(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
    notify("Adresa tabletelor a fost copiată.");
  }
});

dom.clearAnswers.addEventListener("click", async () => {
  if (!tablets.answers.length || !window.confirm("Ștergi toate răspunsurile și mesajele din consola curentă?")) return;
  try {
    const response = await fetch("/api/tablets/clear", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error("Răspunsurile nu au putut fi șterse.");
    tablets = { ...tablets, answers: [] };
    renderTablets();
    notify("Răspunsurile au fost șterse.");
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error), true);
  }
});

window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, select, textarea, button")) return;
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();
    if (state?.state === "idle" || state?.state === "preshow") void dispatch({ action: "start" }).then(focusPlayer);
    else if (state?.state === "playing") void dispatch({ action: "pause" });
    else if (state?.state === "paused") void dispatch({ action: "play" });
  }
});

// --- D-04 timeline editor -------------------------------------------------------------
const editor = createTimelineEditor({
  formatTime,
  describe: (cue) => cueDescription(cue),
  notify,
  onUnauthorized: goToLogin,
  onSaved: (saved) => {
    show = saved;
    renderShow();
    void refreshCueStatuses();
  },
});

createPresentation({
  snapshot: () => ({ state, show, tablets, statuses: cueStatuses, time: phaseTime(), role: sessionUser?.role ?? null }),
  dispatch, focusPlayer, describe: cueDescription, formatTime,
});
createMissionControl({snapshot:()=>({state,role:sessionUser?.role??null}),dispatch});
createExperienceControl({snapshot:()=>({state,role:sessionUser?.role??null})});

renderSpeakers();
window.setInterval(renderClock, 100);
window.setInterval(renderPerf, 5000);
void loadAuxiliaryData();
connect();

// Shared visual symbols stay separate from labels updated by the live state.
document.querySelectorAll<HTMLElement>("[data-icon]").forEach(el => { el.innerHTML = icon(el.dataset.icon!); });
