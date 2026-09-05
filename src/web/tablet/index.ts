import {
  TABLET_OBSERVE_VALUE,
  TABLET_POSTS,
  type SceneTheme,
  type ShowState,
  type TabletOption,
  type TabletPost,
  type TabletZone,
} from "@shared/types";
import type { ServerMessage, TabletEventMsg, TabletViewMsg } from "@shared/protocol";
import { createTelemetry } from "./telemetry";
import { CERT_H, CERT_W, drawCertificate, preloadCertificateArtwork, type CertificateChoice } from "./certificate";
import { applyTheme, icon, mascotPath, EffectGate, confetti, createTabletAudio } from "../shared/glass";
import { rememberChoice, reconcileChoices, type PendingChoices } from "./choice-delivery";
import type { MissionSnapshot } from "@shared/mission";
import { createMissionUI } from "./mission-ui";
import { hasChildIllustrations, illustrationPath } from "../shared/illustrations";

const effects = new EffectGate();
const audio = createTabletAudio();
void preloadCertificateArtwork();
document.getElementById("rotate-icon")!.innerHTML = icon("tablet");

const STORAGE = {
  id: "nava.tablet.id.v3",
  post: "nava.tablet.post.v3",
} as const;

/** D-09 — pseudo-cue trimis de tableta postului 1 pentru pornirea misiunii în modul operator absent. */
const START_REQUEST_CUE_ID = "__start__";

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element lipsă: #${id}`);
  return node as T;
};

const dom = {
  connection: byId<HTMLDivElement>("connection"),
  connectionLabel: byId<HTMLElement>("connection-label"),
  postCard: byId<HTMLElement>("post-card"),
  postGrid: byId<HTMLDivElement>("post-grid"),
  experience: byId<HTMLElement>("experience"),
  phaseLabel: byId<HTMLParagraphElement>("phase-label"),
  sceneLabel: byId<HTMLHeadingElement>("scene-label"),
  postName: byId<HTMLSpanElement>("post-name"),
  postLens: byId<HTMLElement>("post-lens"),
  signal: byId<HTMLDivElement>("signal"),
  subtitle: byId<HTMLElement>("subtitle"),
  subtitleSpeaker: byId<HTMLElement>("subtitle-speaker"),
  subtitleText: byId<HTMLParagraphElement>("subtitle-text"),
  telemetry: byId<HTMLElement>("telemetry"),
  interaction: byId<HTMLElement>("interaction"),
  notice: byId<HTMLDivElement>("notice"),
};

type TabletEvent = TabletEventMsg["event"];
type PairedInteraction = Extract<NonNullable<TabletViewMsg["interaction"]>, { type: "paired-choice" }>;

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;
let state: ShowState | null = null;
/** Diferența ceas server − ceas local (ms), estimată la fiecare `state`. */
let clockOffsetMs = 0;
let view: TabletViewMsg | null = null;
let selectedPost: TabletPost | null = configuredPost();
let postRequestSent = false;
let noticeTimer: number | null = null;
let photoTimer: number | null = null;
const optimisticChoices: PendingChoices = {};
let connectionStatus: "connecting" | "online" | "offline" = "connecting";
let awaitingFreshView = true;
/** D-06 — alegerile confirmate de server pe parcursul misiunii (per cue), cu etichetele opțiunilor. */
const choiceHistory: Record<string, CertificateChoice> = {};
/** D-06 — starea trimiterii certificatului curent (ca să nu-l regenerăm la fiecare `state`). */
let certificateFor: string | null = null;
let certificateStatus = "se trimite operatorului…";
let certificateStatusOk = false;
let certificatePending = true;
let lastSubtitleKey = "";
let startRequestPending = false;
let lastInteractionKey = "";
let lastPickerKey = "";
let choiceOpenedAt = 0;
let choiceOpenedCue: string | null = null;
let lastPairedStructureKey = "";
let runGeneration = 0;
let missionSnapshot: MissionSnapshot | null = null;
const missionUI = createMissionUI({
  host: dom.interaction,
  send: (event) => { if (socket?.readyState !== WebSocket.OPEN) return false; socket.send(JSON.stringify(event)); return true; },
  notice: showNotice,
  onConfirmed: (value) => {
    if (missionSnapshot?.accessibility.sfxEnabled !== false && !missionSnapshot?.accessibility.reducedStimuli) audio.play("confirm");
    if (missionSnapshot?.scenarioId === 'age-5-10' && value === 'link' && !missionSnapshot.accessibility.reducedMotion && !missionSnapshot.accessibility.reducedStimuli) confetti(dom.interaction, "var(--mint)");
  },
});
const cueEffectVersions: Record<string, number> = {};

function effectKey(cueId: string, action: string): string {
  return `${cueId}:${cueEffectVersions[cueId] ?? 0}:${action}`;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

const telemetry = createTelemetry(dom.telemetry);

const tabletId = (() => {
  const existing = storageGet(STORAGE.id);
  if (existing) return existing;
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tablet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  storageSet(STORAGE.id, id);
  return id;
})();

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode may deny storage */ }
}

function parsePost(value: string | null): TabletPost | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed as TabletPost : null;
}

function configuredPost(): TabletPost | null {
  const fromUrl = parsePost(new URLSearchParams(location.search).get("post"));
  if (fromUrl) {
    storageSet(STORAGE.post, String(fromUrl));
    return fromUrl;
  }
  return parsePost(storageGet(STORAGE.post));
}

function wsUrl(): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;
}

function setConnection(status: "connecting" | "online" | "offline", label: string): void {
  const changed = connectionStatus !== status;
  connectionStatus = status;
  missionUI.connection(status === "online");
  dom.connection.dataset.status = status;
  if (dom.connectionLabel.textContent !== label) dom.connectionLabel.textContent = label;
  setText(byId("connection-help"), status === "online" ? "" : "Legătura revine singură.");
  if (changed && selectedPost !== null) renderInteraction();
}

function showNotice(message: string): void {
  if (!message) { dom.notice.textContent = ''; dom.notice.classList.remove('show'); if (noticeTimer !== null) window.clearTimeout(noticeTimer); noticeTimer = null; return; }
  if (dom.notice.classList.contains("show") && dom.notice.textContent === message) return;
  dom.notice.textContent = message;
  dom.notice.classList.add("show");
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => dom.notice.classList.remove("show"), 3600);
}

function connect(): void {
  if (socket && socket.readyState < WebSocket.CLOSING) return;
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
  setConnection("connecting", reconnectAttempt ? "Reconectare" : "Conectare");
  const ws = new WebSocket(wsUrl());
  socket = ws;
  ws.addEventListener("open", () => {
    reconnectAttempt = 0;
    postRequestSent = false;
    awaitingFreshView = true;
    setConnection("connecting", "Conectăm postul…");
    ws.send(JSON.stringify({ type: "hello", client: "tablet", id: tabletId }));
    if (selectedPost !== null) {
      ws.send(JSON.stringify(tabletMessage({ kind: "set-post", post: selectedPost })));
      postRequestSent = true;
    }
  });
  ws.addEventListener("message", (event) => {
    if (socket !== ws) return;
    try {
      onMessage(JSON.parse(String(event.data)) as ServerMessage);
    } catch {
      showNotice("Am primit un mesaj pe care nu l-am putut citi.");
    }
  });
  ws.addEventListener("close", () => {
    if (socket !== ws) return;
    socket = null;
    awaitingFreshView = true;
    reconnectAttempt += 1;
    const delay = Math.min(10_000, 700 * 1.7 ** Math.min(reconnectAttempt, 7));
    setConnection("offline", "Reconectare…");
    reconnectTimer = window.setTimeout(connect, delay);
  });
  ws.addEventListener("error", () => ws.close());
}

function tabletMessage(event: TabletEvent): TabletEventMsg {
  return { type: "tablet", tabletId, event };
}

function sendEvent(event: TabletEvent): void {
  if (socket?.readyState === WebSocket.OPEN && (event.kind !== "choice" || !awaitingFreshView)) {
    socket.send(JSON.stringify(tabletMessage(event)));
    return;
  }
  // Local choices already live in optimisticChoices. Reconcile them only with the next fresh view.
  // Post selection persists in storage and is sent by the handshake; never queue START offline.
}

function resetRun(): void {
  runGeneration += 1;
  lastSubtitleKey = "";
  lastPairedStructureKey = "";
  if (photoTimer !== null) window.clearTimeout(photoTimer);
  photoTimer = null;
  byId("photo-frame").classList.add("hidden");
  effects.reset();
  lastInteractionKey = "";
  choiceOpenedCue = null;
  certificateStatus = "se trimite operatorului…";
  certificateStatusOk = false;
  certificatePending = true;
  for (const cueId of Object.keys(optimisticChoices)) delete optimisticChoices[cueId];
  for (const cueId of Object.keys(choiceHistory)) delete choiceHistory[cueId];
  for (const cueId of Object.keys(cueEffectVersions)) delete cueEffectVersions[cueId];
  certificateFor = null;
  startRequestPending = false;
  telemetry.clearMemory();
  view = null;
}

function onMessage(message: ServerMessage): void {
  switch (message.type) {
    case "mission":
      missionSnapshot = message.snapshot;
      if (message.snapshot.scenarioId === 'legacy-v3'&&!message.snapshot.experience?.active&&!message.snapshot.experience?.finaleActive) { missionUI.hide(); lastInteractionKey = ''; }
      else if (message.snapshot.post) {
        selectedPost = message.snapshot.post;
        state = message.snapshot.state;
        awaitingFreshView = false;
        setConnection("online", "La bord");
      }
      renderShell();
      renderMission();
      break;
    case "missionAck":
      missionUI.ack(message.eventId, message.ok, message.reason || message.status);
      break;
    case "welcome":
      if (message.state.state === "idle") resetRun();
      state = message.state;
      clockOffsetMs = message.serverTimeMs - Date.now();
      renderMission();
      break;
    case "state":
      if (message.state.state === "idle" && state?.state !== "idle") resetRun();
      if (message.state.state !== "idle") startRequestPending = false;
      state = message.state;
      clockOffsetMs = message.state.serverTimeMs - Date.now();
      renderMission();
      break;
    case "tabletView":
      view = message;
      if (message.post !== null) {
        selectedPost = message.post;
        storageSet(STORAGE.post, String(message.post));
        postRequestSent = false;
      } else if (selectedPost !== null && !postRequestSent) {
        sendEvent({ kind: "set-post", post: selectedPost });
        postRequestSent = true;
      }
      if (message.post !== null || selectedPost === null) {
        const resend = awaitingFreshView;
        awaitingFreshView = false;
        for (const event of reconcileChoices(optimisticChoices, message, resend)) sendEvent(event);
        setConnection("online", "La bord");
      }
      recordConfirmedChoices(message);
      renderShell();
      renderMission();
      break;
    case "error":
      if (/postul \d este deja conectat|post invalid/i.test(message.reason)) {
        selectedPost = null;
        storageSet(STORAGE.post, "");
        postRequestSent = false;
        renderShell();
        byId("post-title").focus({ preventScroll: true });
      }
      if (/opțiune necunoscută|a răspuns deja|interacțiunea în pereche/i.test(message.reason) && view?.cueId) {
        delete optimisticChoices[view.cueId];
        renderMission();
      }
      if (startRequestPending) {
        startRequestPending = false;
        renderInteraction();
      }
      showNotice(message.reason);
      break;
    case "photo":
      if (message.action === "countdown") showNotice(`Fotografie de echipaj în ${message.countdownSec ?? 3} secunde — priviți spre ecranul central!`);
      if (message.action === "show" && message.dataUrl) {
        if (photoTimer !== null) window.clearTimeout(photoTimer);
        byId<HTMLImageElement>("crew-photo").src = message.dataUrl;
        byId("photo-frame").classList.remove("hidden");
        photoTimer = window.setTimeout(() => byId("photo-frame").classList.add("hidden"), Math.max(0, message.showSec ?? 12) * 1000);
      }
      if (message.action === "hide") { if (photoTimer !== null) window.clearTimeout(photoTimer); photoTimer = null; byId("photo-frame").classList.add("hidden"); }
      break;
    case "clock":
    case "applyCmd":
    case "cueFired":
    case "tablets":
    case "entityParams":
    case "dynamicVoice":
    case "perfSummary":
      break;
  }
}

/** Timpul de fază extrapolat local din ultimul `state` (1 Hz) — același pe toate tabletele. */
function phaseTimeNow(): number {
  if (!state) return 0;
  const advancing = state.state === "playing" || state.state === "preshow" || state.state === "epilogue";
  if (!advancing) return state.phaseTime;
  const serverNow = Date.now() + clockOffsetMs;
  return state.phaseTime + ((serverNow - state.serverTimeMs) / 1000) * state.rate;
}

function recordConfirmedChoices(msg: TabletViewMsg): void {
  if (missionSnapshot && missionSnapshot.scenarioId !== 'legacy-v3') return;
  if (!msg.cueId || msg.interaction?.type !== "paired-choice") return;
  const zones = Object.keys(msg.zoneChoices) as TabletZone[];
  if (!zones.length) {
    if (choiceHistory[msg.cueId]) cueEffectVersions[msg.cueId] = (cueEffectVersions[msg.cueId] ?? 0) + 1;
    delete choiceHistory[msg.cueId];
    return;
  }
  const entry: CertificateChoice = { cueId: msg.cueId, prompt: msg.interaction.prompt };
  choiceHistory[msg.cueId] = entry;
  for (const zone of zones) {
    const choice = msg.zoneChoices[zone];
    if (!choice) continue;
    entry[zone] = choice.observed ? "Doar privesc" : labelForValue(msg.interaction, choice.value);
  }
  if (msg.zoneChoices.A && msg.zoneChoices.B && effects.once(effectKey(msg.cueId, "confirm"))) {
    audio.play("confirm");
    confetti(dom.interaction, "var(--mint)");
  }
}

function labelForValue(interaction: PairedInteraction, value: string): string {
  return interaction.options.map(optionData).find((option) => option.value === value)?.label ?? value;
}

function availablePostLabels(): string[] {
  if (view?.interaction?.type === "post-assign") return view.interaction.posts;
  return ([1, 2, 3, 4, 5] as TabletPost[]).map((post) => TABLET_POSTS[post].lens);
}

function renderPostPicker(): void {
  const labels = availablePostLabels();
  const key = JSON.stringify(labels);
  if (lastPickerKey === key) return;
  lastPickerKey = key;
  dom.postGrid.replaceChildren();
  for (let index = 0; index < 5; index += 1) {
    const post = (index + 1) as TabletPost;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `post-button glass post-${post}`;
    const mascot = createMascot(post);
    const number = document.createElement("strong");
    number.textContent = labels[index] || TABLET_POSTS[post].lens;
    const copy = document.createElement("span");
    copy.textContent = TABLET_POSTS[post].perspectives.join(" · ");
    button.append(mascot, number, copy);
    button.addEventListener("click", () => {
      if (effects.once(`post:${post}`)) { audio.play("pick"); confetti(button); }
      selectedPost = post;
      storageSet(STORAGE.post, String(post));
      postRequestSent = true;
      sendEvent({ kind: "set-post", post });
      renderShell();
      renderMission();
    });
    dom.postGrid.append(button);
  }
}

function renderShell(): void {
  const ready = selectedPost !== null;
  dom.postCard.classList.toggle("hidden", ready);
  dom.experience.classList.toggle("hidden", !ready);
  if (!ready) renderPostPicker();
}

function currentTheme(): SceneTheme {
  return view?.theme ?? state?.theme ?? "prologue";
}

function renderMission(): void {
  audio.setEnabled((state?.tabletSfx ?? true) && (missionSnapshot?.accessibility.sfxEnabled ?? true) && !missionSnapshot?.accessibility.reducedStimuli);
  applyTheme(currentTheme());
  if (selectedPost === null) return;
  const theme = currentTheme();
  applyTheme(theme);
  const phase = state?.state ?? "idle";
  const phaseLabels: Record<ShowState["state"], string> = {
    idle: "MISIUNE ÎN AȘTEPTARE",
    preshow: "ÎMBARCARE ECHIPAJ",
    playing: "MISIUNE ÎN DESFĂȘURARE",
    paused: "MISIUNE ÎN PAUZĂ",
    epilogue: "REINTRARE ÎN ATMOSFERĂ",
    ended: "MISIUNE ÎNCHEIATĂ",
  };
  setText(dom.phaseLabel, phaseLabels[phase]);
  setText(dom.sceneLabel, missionSnapshot && missionSnapshot.scenarioId !== 'legacy-v3' ? missionSnapshot.summary.title : view?.sceneLabel || "În așteptare");
  setText(dom.postName, TABLET_POSTS[selectedPost].label);
  setText(dom.postLens, view?.lens || TABLET_POSTS[selectedPost].lens);
  setText(byId("mission-status"), `${view?.sceneLabel || "La bord"} · ${phaseLabels[phase]}`);

  if (view?.subtitle) {
    dom.subtitle.classList.remove("hidden");
    const key = `${view.subtitle.speaker}|${view.subtitle.text}`;
    if (key !== lastSubtitleKey) {
      lastSubtitleKey = key;
      dom.subtitleSpeaker.textContent = view.subtitle.speaker;
      dom.subtitleSpeaker.dataset.ai = String(view.subtitle.speaker === "AVATARUL AI");
      if (view.subtitle.speaker === "AVATARUL AI") dom.subtitleSpeaker.prepend(createMascot("ai", true));
      dom.subtitleText.textContent = view.subtitle.text;
      telemetry.remember(view.subtitle.speaker, view.subtitle.text);
    }
  } else {
    dom.subtitle.classList.add("hidden");
    lastSubtitleKey = "";
    setText(dom.subtitleSpeaker, "");
    setText(dom.subtitleText, "");
  }
  renderInteraction();
}

function createMascot(post: TabletPost | "ai", small = false): HTMLImageElement {
  const image = document.createElement("img");
  image.className = "post-mascot";
  image.src = mascotPath(post, small);
  image.alt = "";
  image.draggable = false;
  return image;
}

function createHead(iconText: string, titleText: string, description?: string): HTMLDivElement {
  const head = document.createElement("div");
  head.className = "interaction-head";
  const glyph = document.createElement("span");
  glyph.className = "head-icon";
  glyph.innerHTML = icon(iconText);
  const title = document.createElement("h2");
  title.textContent = titleText;
  head.append(glyph, title);
  if (description) {
    const copy = document.createElement("p");
    copy.textContent = description;
    head.append(copy);
  }
  return head;
}

/** D-09 — butonul mare de start apare doar pe postul 1, în idle, cu autoRun activ. */
function canOfferStart(): boolean {
  return selectedPost === 1 && state?.state === "idle" && state.autoRun === true;
}

function renderInteraction(): void {
  if (missionSnapshot && (missionSnapshot.scenarioId !== 'legacy-v3'||missionSnapshot.experience?.active||missionSnapshot.experience?.finaleActive) && selectedPost !== null) {
    telemetry.setVisible(false);
    dom.signal.classList.add("hidden");
    missionUI.update(missionSnapshot, connectionStatus === "online");
    return;
  }
  // Preserve focus and nodes across 1 Hz state updates; effects are keyed separately.
  const countdownValue = state?.state === "playing" && phaseTimeNow() < 0 ? Math.ceil(-phaseTimeNow()) : null;
  const key = JSON.stringify([selectedPost, currentTheme(), view?.interaction, view?.cueId, view?.zoneChoices, optimisticChoices[view?.cueId ?? ""], state?.state, state?.autoRun, canOfferStart() ? state?.readiness : null, startRequestPending, countdownValue, connectionStatus]);
  if (key === lastInteractionKey) return;
  lastInteractionKey = key;
  const pairedStructure = JSON.stringify([selectedPost, view?.cueId, view?.interaction]);
  if (view?.interaction?.type === "paired-choice" && countdownValue === null && !canOfferStart() && lastPairedStructureKey === pairedStructure && dom.interaction.querySelector(".pair-zones")) {
    updatePairedZones(view.interaction);
    return;
  }
  const hadFocus = dom.interaction.contains(document.activeElement);
  dom.interaction.replaceChildren();
  if (hadFocus) queueMicrotask(() => {
    if (document.activeElement !== document.body) return;
    const heading = dom.interaction.querySelector<HTMLElement>("h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  });
  dom.interaction.dataset.view = view?.interaction?.type ?? "waiting";
  const interaction = view?.interaction ?? null;
  dom.signal.classList.toggle("hidden", interaction?.type === "thanks");
  const quiet = !interaction || interaction.type === "waiting" || interaction.type === "post-assign";
  // D-07: consola de post este vizibilă între interacțiuni (și în așteptare), ascunsă când copiii aleg / la final.
  telemetry.setVisible(quiet && selectedPost !== null && !canOfferStart());
  if (state?.state === "playing" && phaseTimeNow() < 0) {
    telemetry.setVisible(false);
    dom.interaction.dataset.view = "countdown";
    const countdown = document.createElement("div");
    countdown.className = "countdown";
    countdown.innerHTML = `<p>Pregătiți de decolare</p><div class="countdown-ring" style="--countdown-progress:${Math.max(0,Math.min(100,(10+phaseTimeNow())*10))}%"><strong>${Math.ceil(-phaseTimeNow())}</strong></div><p>Aventura începe împreună</p>`;
    dom.interaction.append(countdown);
    return;
  }
  if (canOfferStart()) {
    renderStartButton();
    return;
  }
  if (quiet) {
    renderWaiting(interaction?.type === "post-assign");
    return;
  }
  if (interaction.type === "paired-choice") {
    lastPairedStructureKey = pairedStructure;
    renderPairedChoice(interaction);
    return;
  }
  if (interaction.type === "thanks") {
    renderThanks();
    return;
  }
  // Cue-urile V2 nu mai cer copiilor text, vot unic sau alegerea unui rol comun.
  renderLegacyHold();
}

function renderStartButton(): void {
  const wrap = document.createElement("div");
  wrap.className = "start-mission";
  const readiness = state?.readiness;
  const ready = readiness?.ready ?? true;
  wrap.append(createHead(
    "rocket",
    "Echipajul este la posturi?",
    ready
      ? "Nava este pregătită. Apăsați o singură dată pentru a porni misiunea pentru toate posturile."
      : "Nava se pregătește. Butonul funcționează când toate ecranele și vocile sunt gata.",
  ));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "start-button";
  button.disabled = startRequestPending || !ready || connectionStatus !== "online";
  const label = document.createElement("strong");
  label.textContent = startRequestPending ? "SE PORNEȘTE…" : "PORNEȘTE MISIUNEA";
  const small = document.createElement("small");
  small.textContent = "POSTUL 1 · NAVIGAȚIE";
  button.append(label, small);
  button.addEventListener("click", () => {
    if (startRequestPending) return;
    if (effects.once("start")) audio.play("start");
    startRequestPending = true;
    sendEvent({ kind: "choice", cueId: START_REQUEST_CUE_ID, zone: "A", value: "start" });
    if ("vibrate" in navigator) navigator.vibrate([40, 60, 40]);
    renderInteraction();
    const requestGeneration = runGeneration;
    window.setTimeout(() => {
      if (requestGeneration === runGeneration && startRequestPending && state?.state === "idle") {
        startRequestPending = false;
        renderInteraction();
      }
    }, 6000);
  });
  wrap.append(button);
  if (ready) {
    const readyBadge = document.createElement("p");
    readyBadge.className = "ready-badge";
    readyBadge.innerHTML = `${icon("check")} Ecranele și vocile sunt pregătite`;
    wrap.append(readyBadge);
  }
  if (readiness && !ready && readiness.reasons.length) {
    const reasons = document.createElement("ul");
    reasons.className = "start-reasons";
    for (const reason of readiness.reasons) {
      const li = document.createElement("li");
      li.textContent = reason;
      reasons.append(li);
    }
    wrap.append(reasons);
  }
  dom.interaction.append(wrap);
}

function renderWaiting(showRule = false): void {
  const wrap = document.createElement("div");
  wrap.className = "waiting";
  const art = document.createElement('div'); art.className = 'waiting-expedition-art';
  const ship = document.createElement('img'); ship.className = 'waiting-expedition-ship'; ship.alt = ''; ship.draggable = false;
  ship.src = illustrationPath(!state || state.state === 'idle' || state.state === 'preshow' || showRule ? 'ship-boarding-v1' : 'ship-cruise-v1');
  ship.addEventListener('error', () => { ship.remove(); art.classList.add('illustration-unavailable'); }, { once: true });
  const mascot = createMascot(selectedPost ?? 1); mascot.classList.add('waiting-post-identity');
  art.append(ship, mascot); wrap.append(art);
  wrap.append(createHead(
    "star",
    showRule ? "Un singur echipaj · cinci posturi" : state?.state === "paused" ? "O mică pauză…" : state?.state === "idle" || state?.state === "preshow" ? "Așteptăm decolarea…" : "Priviți ecranele",
    showRule
      ? "A în stânga, B în dreapta. Fiecare alege în jumătatea sa."
      : state?.state === "paused" ? "Rămâneți la posturi. Continuăm împreună." : state?.state === "idle" || state?.state === "preshow" ? "Așezați-vă alături. Fiecare are locul său." : "Povestea continuă. Vă anunțăm când puteți alege.",
  ));
  dom.interaction.append(wrap);
}

function renderLegacyHold(): void {
  dom.interaction.append(createHead(
    "signal",
    "Priviți semnalul",
    "Această instrucțiune veche nu cere un răspuns. Misiunea continuă.",
  ));
}

function optionData(option: TabletOption): { value: string; label: string; symbol?: string; color?: string } {
  if (typeof option === "string") {
    const visual = [
      { match: "AURIU", color: "#ffd166", symbol: "●" },
      { match: "ALBASTRU", color: "#64c8ff", symbol: "≋" },
      { match: "VERDE", color: "#72df9a", symbol: "❧" },
      { match: "VIOLET", color: "#bd92ff", symbol: "★" },
      { match: "ATINGE", color: "var(--accent)", symbol: "◉" },
    ].find((candidate) => option.toLocaleUpperCase("ro").includes(candidate.match));
    return { value: option, label: option, ...visual };
  }
  return option;
}

function confirmedChoice(cueId: string, zone: TabletZone): string | undefined {
  return view?.cueId === cueId
    ? view.zoneChoices[zone]?.value ?? optimisticChoices[cueId]?.[zone]
    : optimisticChoices[cueId]?.[zone];
}

function renderPairedChoice(interaction: PairedInteraction): void {
  const cueId = view?.cueId;
  if (choiceOpenedCue !== cueId) { choiceOpenedCue = cueId ?? null; choiceOpenedAt = phaseTimeNow(); }
  dom.interaction.append(createHead(
    interaction.mode === "color" ? "light" : interaction.mode === "pulse" ? "pulse" : "planet",
    interaction.prompt,
    "Fiecare alege în locul său. La fel, diferit sau doar priviți — toate sunt în regulă.",
  ));
  const zones = document.createElement("div");
  zones.className = "pair-zones";
  for (const zone of ["A", "B"] as TabletZone[]) {
    zones.append(renderZone(zone, cueId, interaction));
  }
  dom.interaction.append(zones);
  if (interaction.timeoutSec) {
    const timer = document.createElement("span");
    timer.className = "choice-timer";
    timer.setAttribute("aria-label", "Timp pentru alegere");
    timer.innerHTML = `${icon("timer")}<b></b>`;
    dom.interaction.append(timer);
    updateChoiceTimer();
  }
}

function zoneRenderKey(zone: TabletZone): string {
  const cueId = view?.cueId ?? "";
  return JSON.stringify([view?.zoneChoices[zone], optimisticChoices[cueId]?.[zone], connectionStatus]);
}

function updatePairedZones(interaction: PairedInteraction): void {
  for (const zone of ["A", "B"] as const) {
    const previous = dom.interaction.querySelector<HTMLElement>(`.zone-${zone.toLowerCase()}`);
    if (!previous || previous.dataset.renderKey === zoneRenderKey(zone)) continue;
    // When only connection changes, untouched option grids remain stable for the other child.
    const selected = view?.cueId ? confirmedChoice(view.cueId, zone) : undefined;
    if (!selected && previous.querySelector(".choice-grid")) { previous.dataset.renderKey = zoneRenderKey(zone); continue; }
    const hadFocus = previous.contains(document.activeElement);
    const next = renderZone(zone, view?.cueId, interaction);
    previous.replaceWith(next);
    if (hadFocus) {
      const result = next.querySelector<HTMLElement>(".zone-result") ?? next.querySelector<HTMLElement>("h3");
      result?.setAttribute("tabindex", "-1");
      result?.focus({ preventScroll: true });
    }
  }
}

function updateChoiceTimer(): void {
  const interaction = view?.interaction;
  const timer = dom.interaction.querySelector<HTMLElement>(".choice-timer b");
  if (!timer || interaction?.type !== "paired-choice" || !interaction.timeoutSec) return;
  timer.textContent = `${Math.max(0, Math.ceil(interaction.timeoutSec - (phaseTimeNow() - choiceOpenedAt)))} s`;
}

function renderZone(zone: TabletZone, cueId: string | null | undefined, interaction: PairedInteraction): HTMLElement {
  const panel = document.createElement("section");
  panel.className = `zone glass zone-${zone.toLowerCase()}`;
  panel.dataset.renderKey = zoneRenderKey(zone);
  panel.setAttribute("aria-labelledby", `zone-${zone}-title`);
  const head = document.createElement("div");
  head.className = "zone-head";
  const seal = document.createElement("span");
  seal.className = "half-seal";
  seal.textContent = zone;
  const title = document.createElement("h3");
  title.id = `zone-${zone}-title`;
  const perspectiveIndex = zone === "A" ? 0 : 1;
  title.textContent = selectedPost ? TABLET_POSTS[selectedPost].perspectives[perspectiveIndex] : `JUMĂTATEA ${zone}`;
  const side = document.createElement("span");
  side.className = "zone-side";
  side.textContent = zone === "A" ? "LOCUL DIN STÂNGA" : "LOCUL DIN DREAPTA";
  head.append(seal, title, side);
  panel.append(head);

  const selected = cueId ? confirmedChoice(cueId, zone) : undefined;
  if (selected) {
    const result = document.createElement("div");
    result.className = "zone-result";
    const confirmed = Boolean(view?.zoneChoices[zone]);
    result.dataset.delivery = confirmed ? "confirmed" : "pending";
    const observed = selected === TABLET_OBSERVE_VALUE;
    const label = observed ? "RĂMÂN SĂ PRIVESC" : labelForValue(interaction, selected);
    const check = document.createElement("strong");
    check.innerHTML = icon(confirmed ? (observed ? "eye" : "check") : "signal");
    const text = document.createElement("span");
    text.textContent = label;
    const small = document.createElement("small");
    small.textContent = confirmed ? (observed ? "Mulțumim! E în regulă să privești." : "Alegerea ta a ajuns la navă.") : connectionStatus === "online" ? "Trimitem alegerea…" : "Păstrată aici. O trimitem când revine legătura.";
    result.setAttribute("role", "status");
    result.append(check, text, small);
    panel.append(result);
    return panel;
  }

  const grid = document.createElement("div");
  grid.className = `choice-grid mode-${interaction.mode}`;
  const count = interaction.options.length + (interaction.allowObserve ? 1 : 0);
  grid.style.setProperty("--option-columns", String(count > 4 ? 3 : count));
  grid.dataset.rows = count > 4 ? "2" : "1";
  for (const rawOption of interaction.options) {
    const option = optionData(rawOption);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.setAttribute("aria-pressed", "false");
    if (option.color) button.style.setProperty("--choice-color", option.color);
    {
      const symbol = document.createElement("span");
      symbol.className = "choice-symbol";
      const names = ["light", "wave", "heart", "star", "hand"];
      symbol.innerHTML = icon(interaction.mode === "pulse" ? "hand" : names[interaction.options.indexOf(rawOption) % names.length]);
      button.append(symbol);
    }
    const label = document.createElement("span");
    label.textContent = option.label;
    button.append(label);
    button.disabled = !cueId;
    button.addEventListener("click", () => choose(cueId, zone, option.value));
    grid.append(button);
  }
  if (interaction.allowObserve) {
    const observe = document.createElement("button");
    observe.type = "button";
    observe.className = "choice-button observe-button";
    observe.setAttribute("aria-pressed", "false");
    observe.innerHTML = `${icon("eye")}<span>DOAR PRIVESC</span>`;
    observe.disabled = !cueId;
    observe.addEventListener("click", () => choose(cueId, zone, TABLET_OBSERVE_VALUE));
    grid.append(observe);
  }
  panel.append(grid);
  return panel;
}

function choose(cueId: string | null | undefined, zone: TabletZone, value: string): void {
  if (!cueId || !rememberChoice(optimisticChoices, view, cueId, zone, value)) return;
  if (effects.once(effectKey(cueId, `pick:${zone}`))) {
    audio.play("pick");
    confetti(dom.interaction.querySelector(`.zone-${zone.toLowerCase()}`) as HTMLElement || dom.interaction, zone === "A" ? "var(--coral)" : "var(--sky)");
  }
  sendEvent({ kind: "choice", cueId, zone, value });
  if ("vibrate" in navigator) navigator.vibrate(35);
  renderInteraction();
}

// ---------------------------------------------------------------------------
// D-06 — certificatul de misiune

function certificateChoices(): CertificateChoice[] {
  // A local pending tap is not a server-confirmed mission result.
  return Object.values(choiceHistory).filter((c) => c.A || c.B);
}

function renderThanks(): void {
  const wrap = document.createElement("div");
  wrap.className = "thanks";
  const earth = createMascot(selectedPost ?? 1);
  const title = document.createElement("h2");
  title.textContent = "Misiunea s-a încheiat.";
  const copy = document.createElement("p");
  copy.textContent = "Ați călătorit împreună. Păstrați o amintire a misiunii.";
  wrap.append(earth, title, copy);

  const canvas = document.createElement("canvas");
  canvas.className = "certificate";
  canvas.width = CERT_W;
  canvas.height = CERT_H;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Certificat de misiune EXODUS-7");
  const post = selectedPost ?? 1;
  const generation = runGeneration;
  const input = {
    post,
    lens: view?.lens || TABLET_POSTS[post].lens,
    choices: certificateChoices(),
    date: new Date(),
    theme: currentTheme(),
  };
  drawCertificate(canvas, input);
  const journalScenario = missionSnapshot?.scenarioId ?? 'legacy-v3';
  const illustratedJournal = journalScenario === 'legacy-v3' || hasChildIllustrations(journalScenario);
  const artworkReady = preloadCertificateArtwork().then(artwork => {
    if (generation !== runGeneration) return false;
    drawCertificate(canvas, input, { ...artwork, emblem: illustratedJournal ? artwork.emblem : null });
    return true;
  });
  wrap.append(canvas);

  const actions = document.createElement("div");
  actions.className = "certificate-actions";
  const save = document.createElement("a");
  save.className = "choice-button save-button";
  save.innerHTML = `${icon("download")} SALVEAZĂ`;
  save.download = `certificat-exodus7-postul-${post}.png`;
  save.href = "#";
  let saving = false;
  save.addEventListener("click", async (event) => {
    event.preventDefault(); if (saving) return; saving = true;
    try {
      if (!await artworkReady || generation !== runGeneration || !canvas.isConnected) return;
      const link = document.createElement('a'); link.download = save.download; link.href = canvas.toDataURL("image/png"); link.click();
      audio.play("tap");
    } catch {
      showNotice("Tableta nu permite salvarea imaginii.");
    } finally { saving = false; }
  });
  const status = document.createElement("span");
  status.className = "certificate-status";
  status.textContent = certificateStatus;
  status.classList.toggle("ok", certificateStatusOk);
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = `certificate-retry${certificatePending || certificateStatusOk ? " hidden" : ""}`;
  retry.textContent = "REÎNCEARCĂ TRIMITEREA";
  retry.addEventListener("click", async () => {
    retry.classList.add("hidden");
    status.textContent = "se trimite operatorului…";
    if (!await artworkReady || generation !== runGeneration || !canvas.isConnected) return;
    void uploadCertificate(canvas, post, status);
  });
  actions.append(save, status, retry);
  wrap.append(actions);
  dom.interaction.append(wrap);

  const key = `${view?.cueId ?? "thanks"}:${post}`;
  if (effects.once(`thanks:${key}`)) { audio.play("thanks"); confetti(wrap); }
  if (certificateFor !== key) {
    void artworkReady.then(ready => {
      if (!ready || generation !== runGeneration || !canvas.isConnected || certificateFor === key) return;
      certificateFor = key;
      void uploadCertificate(canvas, post, status);
    });
  }
}

async function uploadCertificate(canvas: HTMLCanvasElement, post: TabletPost, status: HTMLElement): Promise<void> {
  const generation = runGeneration;
  certificatePending = true;
  const setStatus = (text: string, ok = false): void => {
    if (generation !== runGeneration) return;
    certificatePending = false;
    certificateStatus = text;
    certificateStatusOk = ok;
    const current = dom.interaction.querySelector<HTMLElement>(".certificate-status") ?? status;
    current.textContent = text;
    current.classList.toggle("ok", ok);
    dom.interaction.querySelector(".certificate-retry")?.classList.toggle("hidden", ok);
  };
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch {
    setStatus("nu am putut genera imaginea");
    return;
  }
  try {
    const res = await fetch("/api/certificates", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post, dataUrl }),
    });
    if (res.ok) {
      setStatus("TRIMIS OPERATORULUI", true);
      return;
    }
    setStatus(res.status === 401 || res.status === 403 ? "Salvați certificatul pe tabletă" : `Netrimis (eroare ${res.status}) · folosiți SALVEAZĂ`);
  } catch {
    setStatus("Fără legătură · folosiți SALVEAZĂ");
  }
}

// ---------------------------------------------------------------------------

window.setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) sendEvent({ kind: "ping" });
}, 10_000);

// D-07 — 10 fps: instrumentele se mișcă între cele două eșantioane `state` de 1 Hz.
window.setInterval(() => {
  updateChoiceTimer();
  if (dom.interaction.dataset.view === "countdown") renderInteraction();
  if (selectedPost === null || dom.telemetry.classList.contains("hidden")) return;
  telemetry.update({ state, phaseTime: phaseTimeNow(), theme: currentTheme(), post: selectedPost, sceneLabel: view?.sceneLabel ?? "" });
}, 100);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && (!socket || socket.readyState === WebSocket.CLOSED)) connect();
});

renderShell();
renderMission();
connect();
