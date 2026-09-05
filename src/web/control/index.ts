import { SPEAKERS, type Cue, type Phase, type PlaybackState, type ShowFile, type ShowState } from "@shared/types";
import type { ClockMsg, Command, ServerMessage, TabletsMsg } from "@shared/protocol";

type CueStatus = "pending" | "fired" | "skipped";

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element lipsă: #${id}`);
  return node as T;
};

const dom = {
  connection: byId<HTMLDivElement>("connection"),
  connectionLabel: byId<HTMLSpanElement>("connection-label"),
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
  commandNote: byId<HTMLSpanElement>("command-note"),
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
  cueSearch: byId<HTMLInputElement>("cue-search"),
  cuePhase: byId<HTMLSelectElement>("cue-phase"),
  cueCount: byId<HTMLSpanElement>("cue-count"),
  cueList: byId<HTMLDivElement>("cue-list"),
  tabletLiveCount: byId<HTMLElement>("tablet-live-count"),
  tabletQr: byId<HTMLImageElement>("tablet-qr"),
  tabletUrl: byId<HTMLAnchorElement>("tablet-url"),
  copyUrl: byId<HTMLButtonElement>("copy-url"),
  tabletList: byId<HTMLDivElement>("tablet-list"),
  answerCount: byId<HTMLSpanElement>("answer-count"),
  answerList: byId<HTMLDivElement>("answer-list"),
  clearAnswers: byId<HTMLButtonElement>("clear-answers"),
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
    return true;
  } catch {
    return true;
  }
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
    case "error":
      setCommandNote(message.reason, true);
      notify(message.reason, true);
      break;
    case "applyCmd":
    case "tabletView":
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd }),
    });
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
    const response = await fetch("/api/player/focus", { method: "POST" });
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
    ambient: "Ambianță", say: "Spune", setVariant: "Variantă scenariu", photo: "Fotografie echipaj", preflight: "Preflight",
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

function formatTime(seconds: number, showTenths = false): string {
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

function renderState(): void {
  if (!state) return;
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
  renderClock();
}

function cueDescription(cue: Cue): { title: string; detail: string } {
  switch (cue.kind) {
    case "voice":
      return { title: cue.text[state?.lang ?? "ro"] ?? cue.text.ro, detail: SPEAKERS[cue.speaker].label };
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

function renderTablets(): void {
  const connected = tablets.tablets.filter((tablet) => tablet.connected).length;
  dom.tabletLiveCount.textContent = `${connected} online`;
  dom.tabletList.replaceChildren();
  if (!tablets.tablets.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nicio tabletă conectată.";
    dom.tabletList.append(empty);
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
      item.append(dot, copy, status);
      dom.tabletList.append(item);
    }
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
    const response = await fetch("/api/cues", { cache: "no-store" });
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
      fetch("/api/urls", { cache: "no-store" }),
      fetch("/api/config", { cache: "no-store" }),
      fetch("/api/tablets", { cache: "no-store" }),
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
    const response = await fetch("/api/tablets/clear", { method: "POST" });
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

window.setInterval(renderClock, 100);
void loadAuxiliaryData();
connect();
