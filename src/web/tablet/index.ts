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
import { CERT_H, CERT_W, drawCertificate, type CertificateChoice } from "./certificate";

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
type ChoiceMap = Record<string, Partial<Record<TabletZone, string>>>;
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
const pendingEvents: TabletEvent[] = [];
const optimisticChoices: ChoiceMap = {};
/** D-06 — alegerile confirmate de server pe parcursul misiunii (per cue), cu etichetele opțiunilor. */
const choiceHistory: Record<string, CertificateChoice> = {};
/** D-06 — starea trimiterii certificatului curent (ca să nu-l regenerăm la fiecare `state`). */
let certificateFor: string | null = null;
let lastSubtitleKey = "";
let startRequestPending = false;

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
  dom.connection.dataset.status = status;
  dom.connectionLabel.textContent = label;
}

function showNotice(message: string): void {
  dom.notice.textContent = message;
  dom.notice.classList.add("show");
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => dom.notice.classList.remove("show"), 3600);
}

function connect(): void {
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
  setConnection("connecting", reconnectAttempt ? "Reconectare" : "Conectare");
  const ws = new WebSocket(wsUrl());
  socket = ws;
  ws.addEventListener("open", () => {
    reconnectAttempt = 0;
    postRequestSent = false;
    setConnection("online", "Conectat");
    ws.send(JSON.stringify({ type: "hello", client: "tablet", id: tabletId }));
    if (selectedPost !== null) {
      ws.send(JSON.stringify(tabletMessage({ kind: "set-post", post: selectedPost })));
      postRequestSent = true;
    }
    while (pendingEvents.length) {
      const event = pendingEvents.shift();
      if (event) ws.send(JSON.stringify(tabletMessage(event)));
    }
  });
  ws.addEventListener("message", (event) => {
    try {
      onMessage(JSON.parse(String(event.data)) as ServerMessage);
    } catch {
      showNotice("Am primit un mesaj pe care nu l-am putut citi.");
    }
  });
  ws.addEventListener("close", () => {
    if (socket === ws) socket = null;
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
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(tabletMessage(event)));
    return;
  }
  if (event.kind !== "ping") {
    pendingEvents.push(event);
    if (pendingEvents.length > 24) pendingEvents.shift();
    showNotice("Semnal întrerupt. Alegerea va pleca la reconectare.");
  }
}

function resetRun(): void {
  for (const cueId of Object.keys(optimisticChoices)) delete optimisticChoices[cueId];
  for (const cueId of Object.keys(choiceHistory)) delete choiceHistory[cueId];
  certificateFor = null;
  startRequestPending = false;
  telemetry.clearMemory();
}

function onMessage(message: ServerMessage): void {
  switch (message.type) {
    case "welcome":
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
  if (!msg.cueId || msg.interaction?.type !== "paired-choice") return;
  const zones = Object.keys(msg.zoneChoices) as TabletZone[];
  if (!zones.length) return;
  const entry = (choiceHistory[msg.cueId] ??= { cueId: msg.cueId, prompt: msg.interaction.prompt });
  for (const zone of zones) {
    const choice = msg.zoneChoices[zone];
    if (!choice) continue;
    entry[zone] = choice.observed ? "Doar privesc" : labelForValue(msg.interaction, choice.value);
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
  dom.postGrid.replaceChildren();
  const labels = availablePostLabels();
  for (let index = 0; index < 5; index += 1) {
    const post = (index + 1) as TabletPost;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "post-button";
    const number = document.createElement("strong");
    number.textContent = String(post);
    const copy = document.createElement("span");
    copy.textContent = labels[index] || TABLET_POSTS[post].lens;
    button.append(number, copy);
    button.addEventListener("click", () => {
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
  if (selectedPost === null) return;
  const theme = currentTheme();
  document.body.dataset.theme = theme;
  const phase = state?.state ?? "idle";
  const phaseLabels: Record<ShowState["state"], string> = {
    idle: "MISIUNE ÎN AȘTEPTARE",
    preshow: "ÎMBARCARE ECHIPAJ",
    playing: "MISIUNE ÎN DESFĂȘURARE",
    paused: "MISIUNE ÎN PAUZĂ",
    epilogue: "REINTRARE ÎN ATMOSFERĂ",
    ended: "MISIUNE ÎNCHEIATĂ",
  };
  dom.phaseLabel.textContent = phaseLabels[phase];
  dom.sceneLabel.textContent = view?.sceneLabel || "În așteptare";
  dom.postName.textContent = `POSTUL ${selectedPost}`;
  dom.postLens.textContent = view?.lens || TABLET_POSTS[selectedPost].lens;

  if (view?.subtitle) {
    dom.subtitle.classList.remove("hidden");
    dom.subtitle.style.color = view.subtitle.color;
    dom.subtitleSpeaker.textContent = view.subtitle.speaker;
    dom.subtitleText.textContent = view.subtitle.text;
    const key = `${view.subtitle.speaker}|${view.subtitle.text}`;
    if (key !== lastSubtitleKey) {
      lastSubtitleKey = key;
      telemetry.remember(view.subtitle.speaker, view.subtitle.text);
    }
  } else {
    dom.subtitle.classList.add("hidden");
    dom.subtitleSpeaker.textContent = "";
    dom.subtitleText.textContent = "";
  }
  renderInteraction();
}

function createHead(iconText: string, titleText: string, description?: string): HTMLDivElement {
  const head = document.createElement("div");
  head.className = "interaction-head";
  const icon = document.createElement("span");
  icon.className = "icon";
  icon.textContent = iconText;
  const title = document.createElement("h2");
  title.textContent = titleText;
  head.append(icon, title);
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
  dom.interaction.replaceChildren();
  const interaction = view?.interaction ?? null;
  dom.signal.classList.toggle("hidden", interaction?.type === "thanks");
  const quiet = !interaction || interaction.type === "waiting" || interaction.type === "post-assign";
  // D-07: consola de post este vizibilă între interacțiuni (și în așteptare), ascunsă când copiii aleg / la final.
  telemetry.setVisible(quiet && selectedPost !== null && !canOfferStart());
  if (canOfferStart()) {
    renderStartButton();
    return;
  }
  if (quiet) {
    renderWaiting(interaction?.type === "post-assign");
    return;
  }
  if (interaction.type === "paired-choice") {
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
    "▶",
    "Echipajul este la posturi?",
    ready
      ? "Nava este pregătită. Apăsați o singură dată pentru a porni misiunea pentru toate posturile."
      : "Nava se pregătește. Butonul funcționează când toate ecranele și vocile sunt gata.",
  ));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "start-button";
  button.disabled = startRequestPending;
  const label = document.createElement("strong");
  label.textContent = startRequestPending ? "SE PORNEȘTE…" : "PORNEȘTE MISIUNEA";
  const small = document.createElement("small");
  small.textContent = "POSTUL 1 · NAVIGAȚIE";
  button.append(label, small);
  button.addEventListener("click", () => {
    if (startRequestPending) return;
    startRequestPending = true;
    sendEvent({ kind: "choice", cueId: START_REQUEST_CUE_ID, zone: "A", value: "start" });
    if ("vibrate" in navigator) navigator.vibrate([40, 60, 40]);
    renderInteraction();
    window.setTimeout(() => {
      if (startRequestPending && state?.state === "idle") {
        startRequestPending = false;
        renderInteraction();
      }
    }, 6000);
  });
  wrap.append(button);
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
  wrap.append(createHead(
    "◇",
    showRule ? "Un singur echipaj · cinci posturi" : "Priviți ecranele",
    showRule
      ? "Fiecare folosește jumătatea din fața sa. Puteți alege la fel, diferit sau doar să priviți."
      : "Povestea continuă. Tableta vă va anunța când puteți alege din nou.",
  ));
  const bars = document.createElement("div");
  bars.className = "waiting-bars";
  for (let index = 0; index < 5; index += 1) bars.append(document.createElement("i"));
  wrap.append(bars);
  dom.interaction.append(wrap);
}

function renderLegacyHold(): void {
  dom.interaction.append(createHead(
    "·",
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
  dom.interaction.append(createHead(
    interaction.mode === "color" ? "◈" : interaction.mode === "pulse" ? "◉" : "◇",
    interaction.prompt,
    "Fiecare răspunde în jumătatea din fața sa. Puteți alege la fel, diferit sau doar să priviți.",
  ));
  const zones = document.createElement("div");
  zones.className = "pair-zones";
  for (const zone of ["A", "B"] as TabletZone[]) {
    zones.append(renderZone(zone, cueId, interaction));
  }
  dom.interaction.append(zones);
}

function renderZone(zone: TabletZone, cueId: string | null | undefined, interaction: PairedInteraction): HTMLElement {
  const panel = document.createElement("section");
  panel.className = `zone zone-${zone.toLowerCase()}`;
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
  head.append(seal, title);
  panel.append(head);

  const selected = cueId ? confirmedChoice(cueId, zone) : undefined;
  if (selected) {
    const result = document.createElement("div");
    result.className = "zone-result";
    const observed = selected === TABLET_OBSERVE_VALUE;
    const label = observed ? "RĂMÂN SĂ PRIVESC" : labelForValue(interaction, selected);
    const check = document.createElement("strong");
    check.textContent = "✓";
    const text = document.createElement("span");
    text.textContent = label;
    const small = document.createElement("small");
    small.textContent = observed ? "E în regulă." : "Alegere înregistrată.";
    result.append(check, text, small);
    panel.append(result);
    return panel;
  }

  const grid = document.createElement("div");
  grid.className = `choice-grid mode-${interaction.mode}`;
  for (const rawOption of interaction.options) {
    const option = optionData(rawOption);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    if (option.color) button.style.setProperty("--choice-color", option.color);
    if (option.symbol) {
      const symbol = document.createElement("span");
      symbol.className = "choice-symbol";
      symbol.textContent = option.symbol;
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
    observe.textContent = "DOAR PRIVESC";
    observe.disabled = !cueId;
    observe.addEventListener("click", () => choose(cueId, zone, TABLET_OBSERVE_VALUE));
    grid.append(observe);
  }
  panel.append(grid);
  return panel;
}

function choose(cueId: string | null | undefined, zone: TabletZone, value: string): void {
  if (!cueId || confirmedChoice(cueId, zone)) return;
  optimisticChoices[cueId] ??= {};
  optimisticChoices[cueId][zone] = value;
  sendEvent({ kind: "choice", cueId, zone, value });
  if ("vibrate" in navigator) navigator.vibrate(35);
  renderInteraction();
}

// ---------------------------------------------------------------------------
// D-06 — certificatul de misiune

function certificateChoices(): CertificateChoice[] {
  // Confirmate de server (choiceHistory); completate cu alegerile optimiste pentru zonele fără confirmare.
  const merged: Record<string, CertificateChoice> = {};
  for (const [cueId, entry] of Object.entries(choiceHistory)) merged[cueId] = { ...entry };
  for (const [cueId, zones] of Object.entries(optimisticChoices)) {
    if (cueId === START_REQUEST_CUE_ID) continue;
    const entry = (merged[cueId] ??= { cueId, prompt: cueId.replace(/-/g, " ") });
    for (const zone of ["A", "B"] as TabletZone[]) {
      const v = zones[zone];
      if (v && !entry[zone]) entry[zone] = v === TABLET_OBSERVE_VALUE ? "Doar privesc" : v;
    }
  }
  return Object.values(merged).filter((c) => c.A || c.B);
}

function renderThanks(): void {
  const wrap = document.createElement("div");
  wrap.className = "thanks";
  const earth = document.createElement("div");
  earth.className = "earth";
  earth.setAttribute("aria-hidden", "true");
  const title = document.createElement("h2");
  title.textContent = "Misiunea s-a încheiat.";
  const copy = document.createElement("p");
  copy.textContent = "Postul vostru a făcut parte din semnal până la capăt. Acesta este certificatul echipajului.";
  wrap.append(earth, title, copy);

  const canvas = document.createElement("canvas");
  canvas.className = "certificate";
  canvas.width = CERT_W;
  canvas.height = CERT_H;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Certificat de misiune EXODUS-7");
  const post = selectedPost ?? 1;
  drawCertificate(canvas, {
    post,
    lens: view?.lens || TABLET_POSTS[post].lens,
    choices: certificateChoices(),
    date: new Date(),
    theme: currentTheme(),
  });
  wrap.append(canvas);

  const actions = document.createElement("div");
  actions.className = "certificate-actions";
  const save = document.createElement("a");
  save.className = "choice-button save-button";
  save.textContent = "SALVEAZĂ";
  save.download = `certificat-exodus7-postul-${post}.png`;
  save.href = "#";
  save.addEventListener("click", (event) => {
    try {
      save.href = canvas.toDataURL("image/png");
    } catch {
      event.preventDefault();
      showNotice("Tableta nu permite salvarea imaginii.");
    }
  });
  const status = document.createElement("span");
  status.className = "certificate-status";
  status.textContent = "se trimite operatorului…";
  actions.append(save, status);
  wrap.append(actions);
  dom.interaction.append(wrap);

  const key = `${view?.cueId ?? "thanks"}:${post}`;
  if (certificateFor !== key) {
    certificateFor = key;
    void uploadCertificate(canvas, post, status);
  } else {
    status.textContent = "trimis operatorului";
  }
}

async function uploadCertificate(canvas: HTMLCanvasElement, post: TabletPost, status: HTMLElement): Promise<void> {
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch {
    status.textContent = "nu am putut genera imaginea";
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
      status.textContent = "trimis operatorului";
      status.classList.add("ok");
      return;
    }
    certificateFor = null; // allow a retry on the next render
    status.textContent = res.status === 401 || res.status === 403 ? "salvat pe tabletă · operatorul îl poate tipări din consolă" : `netrimis (eroare ${res.status}) · folosiți SALVEAZĂ`;
  } catch {
    certificateFor = null;
    status.textContent = "fără legătură · folosiți SALVEAZĂ";
  }
}

// ---------------------------------------------------------------------------

window.setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) sendEvent({ kind: "ping" });
}, 10_000);

// D-07 — 10 fps: instrumentele se mișcă între cele două eșantioane `state` de 1 Hz.
window.setInterval(() => {
  if (selectedPost === null || dom.telemetry.classList.contains("hidden")) return;
  telemetry.update({ state, phaseTime: phaseTimeNow(), theme: currentTheme(), post: selectedPost, sceneLabel: view?.sceneLabel ?? "" });
}, 100);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && (!socket || socket.readyState === WebSocket.CLOSED)) connect();
});

renderShell();
renderMission();
connect();
