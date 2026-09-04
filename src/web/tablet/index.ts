import type { SceneTheme, ShowFile, ShowState, TabletCue } from "@shared/types";
import type { ServerMessage, TabletEventMsg, TabletViewMsg } from "@shared/protocol";

const STORAGE = {
  id: "nava.tablet.id",
  name: "nava.tablet.name",
  role: "nava.tablet.role",
  submissions: "nava.tablet.submissions",
} as const;

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element lipsă: #${id}`);
  return node as T;
};

const dom = {
  connection: byId<HTMLDivElement>("connection"),
  connectionLabel: byId<HTMLElement>("connection-label"),
  joinCard: byId<HTMLElement>("join-card"),
  joinForm: byId<HTMLFormElement>("join-form"),
  name: byId<HTMLInputElement>("name"),
  experience: byId<HTMLElement>("experience"),
  phaseLabel: byId<HTMLParagraphElement>("phase-label"),
  sceneLabel: byId<HTMLHeadingElement>("scene-label"),
  identity: byId<HTMLButtonElement>("identity"),
  identityName: byId<HTMLSpanElement>("identity-name"),
  identityRole: byId<HTMLElement>("identity-role"),
  signal: byId<HTMLDivElement>("signal"),
  subtitle: byId<HTMLElement>("subtitle"),
  subtitleSpeaker: byId<HTMLElement>("subtitle-speaker"),
  subtitleText: byId<HTMLParagraphElement>("subtitle-text"),
  interaction: byId<HTMLElement>("interaction"),
  notice: byId<HTMLDivElement>("notice"),
};

type TabletEvent = TabletEventMsg["event"];

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;
let show: ShowFile | null = null;
let state: ShowState | null = null;
let view: TabletViewMsg | null = null;
let joined = false;
let name = storageGet(STORAGE.name) ?? "";
let role = storageGet(STORAGE.role) ?? "";
let submissions = storageJson<Record<string, string>>(STORAGE.submissions, {});
let editingCueId: string | null = null;
let currentCueId: string | null = null;
const drafts: Record<string, string> = {};
const pendingEvents: TabletEvent[] = [];
let noticeTimer: number | null = null;

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
  try { localStorage.setItem(key, value); } catch { /* Private browsing may deny storage. */ }
}

function storageJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
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
    setConnection("online", "Conectat");
    ws.send(JSON.stringify({ type: "hello", client: "tablet", id: tabletId, ...(name ? { name } : {}) }));
    if (name) ws.send(JSON.stringify(tabletMessage({ kind: "join", name })));
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
  return { type: "tablet", tabletId, ...(name ? { name } : {}), event };
}

function sendEvent(event: TabletEvent): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(tabletMessage(event)));
    return;
  }
  if (event.kind !== "ping") {
    pendingEvents.push(event);
    if (pendingEvents.length > 20) pendingEvents.shift();
    showNotice("Semnalul este întrerupt. Răspunsul va pleca la reconectare.");
  }
}

function onMessage(message: ServerMessage): void {
  switch (message.type) {
    case "welcome":
      show = message.show;
      state = message.state;
      if (message.state.state === "idle") {
        role = "";
        storageSet(STORAGE.role, "");
      }
      currentCueId = view ? resolveCueId(view) : null;
      joined = Boolean(name);
      renderShell();
      renderMission();
      break;
    case "state":
      if (message.state.state === "idle" && state?.state !== "idle") {
        role = "";
        storageSet(STORAGE.role, "");
      }
      state = message.state;
      currentCueId = view ? resolveCueId(view) : null;
      renderMission();
      break;
    case "tabletView":
      view = message;
      currentCueId = resolveCueId(message);
      renderMission();
      break;
    case "error":
      showNotice(message.reason);
      break;
    case "clock":
    case "applyCmd":
    case "cueFired":
    case "tablets":
      break;
  }
}

function resolveCueId(message: TabletViewMsg): string | null {
  if (!show || !message.interaction) return null;
  const signature = JSON.stringify(message.interaction);
  const candidates = show.cues.filter((cue): cue is TabletCue => cue.kind === "tablet" && JSON.stringify(cue.interaction) === signature);
  if (!candidates.length) return null;
  const phase = state?.state === "preshow" ? "preshow" : state?.state === "epilogue" || state?.state === "ended" ? "epilogue" : "play";
  const t = state?.phaseTime ?? Number.POSITIVE_INFINITY;
  const crossed = candidates.filter((cue) => cue.phase === phase && cue.at <= t + 2).sort((a, b) => b.at - a.at);
  return crossed[0]?.id ?? candidates.find((cue) => cue.phase === phase)?.id ?? candidates[0].id;
}

function renderShell(): void {
  dom.joinCard.classList.toggle("hidden", joined);
  dom.experience.classList.toggle("hidden", !joined);
  dom.name.value = name;
  dom.identityName.textContent = name || "—";
  dom.identityRole.textContent = role || "Explorator";
}

function renderMission(): void {
  if (!joined) return;
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
  dom.identityName.textContent = name;
  dom.identityRole.textContent = role || "Explorator";

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
  renderInteraction(view?.interaction ?? null, view?.aggregate);
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

function renderInteraction(interaction: TabletCue["interaction"] | null, aggregate?: Record<string, number>): void {
  dom.interaction.replaceChildren();
  dom.signal.classList.toggle("hidden", interaction?.type === "thanks");
  if (!interaction || interaction.type === "waiting") {
    renderWaiting();
    return;
  }
  switch (interaction.type) {
    case "role-pick":
      renderRolePick(interaction.roles, aggregate);
      break;
    case "question":
      renderComposer("?", interaction.prompt, interaction.maxLen ?? 200, "answer", aggregate);
      break;
    case "message":
      renderComposer("↗", interaction.prompt, interaction.maxLen ?? 200, "message", aggregate);
      break;
    case "vote":
      renderVote(interaction.prompt, interaction.options, aggregate);
      break;
    case "thanks":
      renderThanks();
      break;
  }
}

function renderWaiting(): void {
  const wrap = document.createElement("div");
  wrap.className = "waiting";
  wrap.append(createHead("·", "Rămâi aproape", role ? `Postul tău: ${role}` : "Căpitanul va trimite în curând următoarea instrucțiune."));
  const bars = document.createElement("div");
  bars.className = "waiting-bars";
  for (let i = 0; i < 5; i += 1) bars.append(document.createElement("i"));
  const copy = document.createElement("p");
  copy.className = "waiting-copy";
  copy.textContent = "Recepționăm semnalul navei…";
  wrap.append(bars, copy);
  dom.interaction.append(wrap);
}

function renderRolePick(roles: string[], aggregate?: Record<string, number>): void {
  dom.interaction.append(createHead("I", "Alege-ți rolul", "Fiecare explorator are un loc important în echipaj."));
  const grid = document.createElement("div");
  grid.className = "role-grid";
  for (const option of roles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `role-button${role === option ? " selected" : ""}`;
    button.setAttribute("aria-pressed", String(role === option));
    button.append(document.createTextNode(option));
    const count = document.createElement("span");
    count.textContent = String(aggregate?.[option] ?? 0);
    count.title = "membri în acest rol";
    button.append(count);
    button.addEventListener("click", () => {
      role = option;
      storageSet(STORAGE.role, role);
      sendEvent({ kind: "role", role });
      renderShell();
      renderRoleSelectionOnly();
    });
    grid.append(button);
  }
  dom.interaction.append(grid);
}

function renderRoleSelectionOnly(): void {
  dom.interaction.querySelectorAll<HTMLButtonElement>(".role-button").forEach((button) => {
    const selected = button.firstChild?.textContent === role;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function renderComposer(icon: string, prompt: string, maxLen: number, kind: "answer" | "message", aggregate?: Record<string, number>): void {
  const cueId = currentCueId;
  const saved = cueId ? submissions[cueId] : undefined;
  if (saved && editingCueId !== cueId) {
    const sent = document.createElement("div");
    sent.className = "sent";
    const mark = document.createElement("div");
    mark.className = "sent-mark";
    mark.textContent = "✓";
    const title = document.createElement("h2");
    title.textContent = kind === "message" ? "Mesaj transmis Pământului" : "Răspuns transmis Căpitanului";
    const quote = document.createElement("blockquote");
    quote.textContent = saved;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-button";
    edit.textContent = "Modifică răspunsul";
    edit.addEventListener("click", () => {
      editingCueId = cueId;
      renderInteraction(view?.interaction ?? null, view?.aggregate);
    });
    sent.append(mark, title, quote, edit);
    if (typeof aggregate?.answered === "number") {
      const count = document.createElement("p");
      count.className = "aggregate";
      count.textContent = `${aggregate.answered} ${aggregate.answered === 1 ? "răspuns primit" : "răspunsuri primite"} de navă`;
      sent.append(count);
    }
    dom.interaction.append(sent);
    return;
  }

  dom.interaction.append(createHead(icon, prompt, kind === "message" ? "Mesajul tău va ajunge în consola Căpitanului." : "Nu există răspuns greșit. Scrie ce simți."));
  const form = document.createElement("form");
  form.className = "composer";
  const textarea = document.createElement("textarea");
  textarea.maxLength = maxLen;
  textarea.placeholder = kind === "message" ? "Mesajul meu pentru Pământ…" : "Eu cred că…";
  textarea.setAttribute("aria-label", kind === "message" ? "Mesaj pentru Pământ" : "Răspuns");
  const draftKey = cueId ?? `${kind}:pending`;
  textarea.value = drafts[draftKey] ?? saved ?? "";
  const meta = document.createElement("div");
  meta.className = "composer-meta";
  const hint = document.createElement("span");
  hint.textContent = socket?.readyState === WebSocket.OPEN ? "Conexiune securizată cu nava" : "Va fi trimis după reconectare";
  const counter = document.createElement("span");
  counter.textContent = `${textarea.value.length}/${maxLen}`;
  meta.append(hint, counter);
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "action-button";
  submit.textContent = kind === "message" ? "TRANSMITE MESAJUL" : "TRIMITE RĂSPUNSUL";
  submit.disabled = !textarea.value.trim() || !cueId;
  textarea.addEventListener("input", () => {
    drafts[draftKey] = textarea.value;
    counter.textContent = `${textarea.value.length}/${maxLen}`;
    submit.disabled = !textarea.value.trim() || !cueId;
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = textarea.value.replace(/\s+/g, " ").trim().slice(0, maxLen);
    if (!text || !cueId) return;
    submissions[cueId] = text;
    drafts[draftKey] = text;
    storageSet(STORAGE.submissions, JSON.stringify(submissions));
    editingCueId = null;
    sendEvent(kind === "message" ? { kind: "message", cueId, text } : { kind: "answer", cueId, text });
    renderInteraction(view?.interaction ?? null, view?.aggregate);
  });
  form.append(textarea, meta, submit);
  dom.interaction.append(form);
  window.setTimeout(() => textarea.focus(), 0);
}

function renderVote(prompt: string, options: string[], aggregate?: Record<string, number>): void {
  const cueId = currentCueId;
  const selected = cueId ? submissions[cueId] : undefined;
  dom.interaction.append(createHead("V", prompt, "Alege varianta care ți se potrivește."));
  const grid = document.createElement("div");
  grid.className = "role-grid";
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `vote-button${selected === option ? " selected" : ""}`;
    button.disabled = !cueId;
    button.setAttribute("aria-pressed", String(selected === option));
    button.append(document.createTextNode(option));
    const count = document.createElement("span");
    count.textContent = String(aggregate?.[option] ?? 0);
    button.append(count);
    button.addEventListener("click", () => {
      if (!cueId) return;
      submissions[cueId] = option;
      storageSet(STORAGE.submissions, JSON.stringify(submissions));
      sendEvent({ kind: "vote", cueId, option });
      renderInteraction(view?.interaction ?? null, view?.aggregate);
    });
    grid.append(button);
  }
  dom.interaction.append(grid);
}

function renderThanks(): void {
  const wrap = document.createElement("div");
  wrap.className = "thanks";
  const earth = document.createElement("div");
  earth.className = "earth";
  earth.setAttribute("aria-hidden", "true");
  const title = document.createElement("h2");
  title.textContent = `Misiune îndeplinită, ${name}.`;
  const copy = document.createElement("p");
  copy.textContent = "Ai plecat să descoperi alte lumi. Te-ai întors privind-o pe a ta pentru prima dată.";
  wrap.append(earth, title, copy);
  dom.interaction.append(wrap);
}

dom.joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const clean = dom.name.value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 16);
  if (!clean) {
    dom.name.focus();
    return;
  }
  name = clean;
  joined = true;
  storageSet(STORAGE.name, name);
  sendEvent({ kind: "join", name });
  renderShell();
  renderMission();
});

dom.identity.addEventListener("click", () => {
  joined = false;
  renderShell();
  dom.name.focus();
  dom.name.select();
});

window.setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) sendEvent({ kind: "ping" });
}, 10_000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && (!socket || socket.readyState === WebSocket.CLOSED)) connect();
});

joined = Boolean(name);
renderShell();
renderMission();
connect();
