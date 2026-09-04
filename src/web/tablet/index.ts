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

const STORAGE = {
  id: "nava.tablet.id.v3",
  post: "nava.tablet.post.v3",
} as const;

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
  interaction: byId<HTMLElement>("interaction"),
  notice: byId<HTMLDivElement>("notice"),
};

type TabletEvent = TabletEventMsg["event"];
type ChoiceMap = Record<string, Partial<Record<TabletZone, string>>>;

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;
let state: ShowState | null = null;
let view: TabletViewMsg | null = null;
let selectedPost: TabletPost | null = configuredPost();
let postRequestSent = false;
let noticeTimer: number | null = null;
const pendingEvents: TabletEvent[] = [];
const optimisticChoices: ChoiceMap = {};

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

function onMessage(message: ServerMessage): void {
  switch (message.type) {
    case "welcome":
      state = message.state;
      renderMission();
      break;
    case "state":
      if (message.state.state === "idle" && state?.state !== "idle") {
        for (const cueId of Object.keys(optimisticChoices)) delete optimisticChoices[cueId];
      }
      state = message.state;
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
      showNotice(message.reason);
      break;
    case "clock":
    case "applyCmd":
    case "cueFired":
    case "tablets":
      break;
  }
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

function renderMission(): void {
  if (selectedPost === null) return;
  const theme: SceneTheme = view?.theme ?? state?.theme ?? "prologue";
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

function renderInteraction(): void {
  dom.interaction.replaceChildren();
  const interaction = view?.interaction ?? null;
  dom.signal.classList.toggle("hidden", interaction?.type === "thanks");
  if (!interaction || interaction.type === "waiting" || interaction.type === "post-assign") {
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

function renderWaiting(showRule = false): void {
  const wrap = document.createElement("div");
  wrap.className = "waiting";
  wrap.append(createHead(
    "◇",
    showRule ? "Două perspective, același post" : "Priviți semnalul",
    showRule
      ? "Fiecare folosește propria jumătate. Puteți răspunde la fel sau diferit."
      : "Tableta păstrează ambele urme până la următoarea instrucțiune.",
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

function renderPairedChoice(interaction: Extract<NonNullable<TabletViewMsg["interaction"]>, { type: "paired-choice" }>): void {
  const cueId = view?.cueId;
  dom.interaction.append(createHead(
    interaction.mode === "color" ? "◈" : interaction.mode === "pulse" ? "◉" : "◇",
    interaction.prompt,
    "Fiecare alege în jumătatea sa. Răspunsurile pot fi la fel sau diferite.",
  ));
  const zones = document.createElement("div");
  zones.className = "pair-zones";
  for (const zone of ["A", "B"] as TabletZone[]) {
    zones.append(renderZone(zone, cueId, interaction));
  }
  dom.interaction.append(zones);
}

function renderZone(
  zone: TabletZone,
  cueId: string | null | undefined,
  interaction: Extract<NonNullable<TabletViewMsg["interaction"]>, { type: "paired-choice" }>,
): HTMLElement {
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
  title.textContent = `PERSPECTIVA ${zone}`;
  head.append(seal, title);
  panel.append(head);

  const selected = cueId ? confirmedChoice(cueId, zone) : undefined;
  if (selected) {
    const result = document.createElement("div");
    result.className = "zone-result";
    const label = selected === TABLET_OBSERVE_VALUE
      ? "DOAR OBSERV"
      : interaction.options.map(optionData).find((option) => option.value === selected)?.label ?? selected;
    result.innerHTML = `<strong>✓</strong><span>${escapeHtml(label)}</span><small>A intrat în semnal.</small>`;
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
    observe.textContent = "DOAR OBSERV";
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

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function renderThanks(): void {
  const wrap = document.createElement("div");
  wrap.className = "thanks";
  const earth = document.createElement("div");
  earth.className = "earth";
  earth.setAttribute("aria-hidden", "true");
  const title = document.createElement("h2");
  title.textContent = "Misiune încheiată, echipaj.";
  const copy = document.createElement("p");
  copy.textContent = "Cele două perspective ale postului vostru au rămas în semnal.";
  wrap.append(earth, title, copy);
  dom.interaction.append(wrap);
}

window.setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) sendEvent({ kind: "ping" });
}, 10_000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && (!socket || socket.readyState === WebSocket.CLOSED)) connect();
});

renderShell();
renderMission();
connect();
