/**
 * D-07 — „consola de post”: 3–4 instrumente fictive per post, animate local la 10 fps din starea 1 Hz a
 * serverului (interpolare phaseTime + rate) și din tema scenei. Afișată între interacțiuni; nu cere nimic
 * serverului. Pur decorativă, dar coerentă cu timpul misiunii (aceeași valoare pe toate tabletele).
 *
 *  POSTUL 1 NAVIGAȚIE   — busolă (heading), traseu (progres în misiune), distanță
 *  POSTUL 2 PROPULSIE   — energie (bare), stabilitate, impuls
 *  POSTUL 3 COMUNICAȚII — semnal (bare), undă (canvas), frecvență
 *  POSTUL 4 BIOSEMNALE  — puls (ECG canvas), bpm, legătură cu nava
 *  POSTUL 5 MEMORIE     — jurnalul replicilor auzite, memorie ocupată, marcaj temporal
 */

import { TABLET_POSTS, type SceneTheme, type ShowState, type TabletPost } from "@shared/types";

export interface TelemetryInput {
  state: ShowState | null;
  /** Phase time extrapolated locally (seconds; negative in the lead-in). */
  phaseTime: number;
  theme: SceneTheme;
  post: TabletPost;
  sceneLabel: string;
}

export interface Telemetry {
  update(input: TelemetryInput): void;
  /** MEMORIE: remember a subtitle that was shown (deduplicated by text). */
  remember(speaker: string, text: string): void;
  clearMemory(): void;
  setVisible(visible: boolean): void;
}

const THEME_PROFILE: Record<SceneTheme, { bpm: number; energy: number; signal: number; headingDrift: number; label: string }> = {
  prologue: { bpm: 62, energy: 0.35, signal: 0.55, headingDrift: 2, label: "PĂMÂNT · ORBITĂ JOASĂ" },
  launch: { bpm: 88, energy: 0.95, signal: 0.7, headingDrift: 14, label: "LANSARE · ACCELERAȚIE" },
  light: { bpm: 70, energy: 0.6, signal: 0.85, headingDrift: 5, label: "PLANETA LUMINII" },
  nature: { bpm: 58, energy: 0.5, signal: 0.75, headingDrift: 3, label: "PLANETA NATURII" },
  tech: { bpm: 74, energy: 0.8, signal: 0.95, headingDrift: 6, label: "PLANETA TEHNOLOGIEI" },
  void: { bpm: 96, energy: 0.3, signal: 0.15, headingDrift: 40, label: "GARGANTUA · TUNEL" },
  home: { bpm: 66, energy: 0.55, signal: 0.9, headingDrift: 2, label: "ÎNTOARCERE · SATURN" },
  white: { bpm: 60, energy: 0.2, signal: 1, headingDrift: 0, label: "ACASĂ" },
};

const MISSION_LENGTH_SEC = 475;
const MEMORY_MAX = 6;

function fmtClock(t: number): string {
  const neg = t < 0;
  const a = Math.abs(t);
  const m = Math.floor(a / 60);
  const s = Math.floor(a % 60);
  return `${neg ? "T−" : "T+"}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function instrument(title: string): { root: HTMLElement; body: HTMLElement; value: HTMLElement } {
  const root = el("div", "inst");
  const head = el("div", "inst-head");
  head.append(el("span", "inst-title", title));
  const value = el("strong", "inst-value", "—");
  head.append(value);
  const body = el("div", "inst-body");
  root.append(head, body);
  return { root, body, value };
}

function accent(): string {
  return getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#6ee7ff";
}

/** Smooth deterministic noise from time (sum of sines) in [-1, 1]. */
function wobble(t: number, seed: number): number {
  return (Math.sin(t * 0.9 + seed) + Math.sin(t * 2.3 + seed * 1.7) * 0.5 + Math.sin(t * 0.17 + seed * 3.1) * 0.8) / 2.3;
}

export function createTelemetry(container: HTMLElement): Telemetry {
  let builtFor: TabletPost | null = null;
  let visible = true;
  let memory: Array<{ speaker: string; text: string; at: string }> = [];
  let nodes: Record<string, HTMLElement> = {};
  let canvases: Record<string, HTMLCanvasElement> = {};
  let ecgPhase = 0;
  let lastFrame = performance.now();

  function build(post: TabletPost): void {
    builtFor = post;
    nodes = {};
    canvases = {};
    container.replaceChildren();
    const head = el("div", "telemetry-head");
    head.append(el("span", "eyebrow", `CONSOLĂ DE POST · ${TABLET_POSTS[post].lens}`));
    nodes.clock = el("strong", "telemetry-clock", "T+00:00");
    head.append(nodes.clock);
    container.append(head);
    const grid = el("div", "inst-grid");
    container.append(grid);
    nodes.status = el("p", "telemetry-status", "");
    container.append(nodes.status);

    const add = (title: string, key: string, kind: "bars" | "dial" | "canvas" | "meter" | "list" | "text"): void => {
      const inst = instrument(title);
      nodes[`${key}-value`] = inst.value;
      switch (kind) {
        case "bars": {
          const bars = el("div", "inst-bars");
          for (let i = 0; i < 10; i += 1) bars.append(el("i"));
          inst.body.append(bars);
          nodes[key] = bars;
          break;
        }
        case "dial": {
          const dial = el("div", "inst-dial");
          const needle = el("i", "needle");
          dial.append(el("span", "n", "N"), el("span", "e", "E"), el("span", "s", "S"), el("span", "w", "W"), needle);
          inst.body.append(dial);
          nodes[key] = needle;
          break;
        }
        case "canvas": {
          const canvas = document.createElement("canvas");
          canvas.className = "inst-canvas";
          canvas.width = 320;
          canvas.height = 90;
          inst.body.append(canvas);
          canvases[key] = canvas;
          break;
        }
        case "meter": {
          const meter = el("div", "inst-meter");
          const fill = el("i");
          meter.append(fill);
          inst.body.append(meter);
          nodes[key] = fill;
          break;
        }
        case "list": {
          const list = el("ol", "inst-list");
          inst.body.append(list);
          nodes[key] = list;
          break;
        }
        case "text": {
          const text = el("p", "inst-text", "—");
          inst.body.append(text);
          nodes[key] = text;
          break;
        }
      }
      grid.append(inst.root);
    };

    switch (post) {
      case 1:
        add("DIRECȚIE", "heading", "dial");
        add("TRASEU", "route", "meter");
        add("DISTANȚĂ", "distance", "text");
        add("VITEZĂ", "speed", "bars");
        break;
      case 2:
        add("ENERGIE", "energy", "bars");
        add("STABILITATE", "stability", "meter");
        add("IMPULS", "thrust", "canvas");
        add("TEMPERATURĂ MOTOARE", "temp", "text");
        break;
      case 3:
        add("SEMNAL", "signal", "bars");
        add("UNDĂ", "wave", "canvas");
        add("FRECVENȚĂ", "freq", "text");
        add("CUVINTE RECEPȚIONATE", "words", "meter");
        break;
      case 4:
        add("PULS ECHIPAJ", "ecg", "canvas");
        add("BĂTĂI / MINUT", "bpm", "text");
        add("OXIGEN", "oxygen", "meter");
        add("LEGĂTURĂ CU NAVA", "link", "bars");
        break;
      case 5:
        add("JURNAL DE BORD", "log", "list");
        add("MEMORIE OCUPATĂ", "mem", "meter");
        add("MARCAJ TEMPORAL", "stamp", "text");
        add("AMINTIRI SALVATE", "count", "bars");
        break;
    }
  }

  function setBars(key: string, level: number): void {
    const bars = nodes[key];
    if (!bars) return;
    const lit = Math.round(Math.max(0, Math.min(1, level)) * 10);
    bars.querySelectorAll("i").forEach((bar, i) => bar.classList.toggle("on", i < lit));
  }

  function setMeter(key: string, level: number): void {
    const fill = nodes[key];
    if (fill) fill.style.width = `${Math.round(Math.max(0, Math.min(1, level)) * 100)}%`;
  }

  function setValue(key: string, text: string): void {
    const v = nodes[`${key}-value`];
    if (v) v.textContent = text;
  }

  function setText(key: string, text: string): void {
    const n = nodes[key];
    if (n) n.textContent = text;
  }

  function drawWave(key: string, t: number, amp: number, freq: number, noise: number): void {
    const canvas = canvases[key];
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.strokeStyle = accent();
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const p = x / w;
      const y = h / 2 + Math.sin((p * freq + t * 1.6) * Math.PI * 2) * amp * h * 0.36 * (0.7 + 0.3 * Math.sin(p * 9 + t)) + wobble(t * 3 + p * 30, 4) * noise * h * 0.1;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawEcg(key: string, dtSec: number, bpm: number): void {
    const canvas = canvases[key];
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ecgPhase = (ecgPhase + dtSec * (bpm / 60)) % 1;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    ctx.lineTo(w, h * 0.62);
    ctx.stroke();
    ctx.strokeStyle = accent();
    ctx.lineWidth = 2;
    ctx.beginPath();
    const beats = 3;
    for (let x = 0; x <= w; x += 2) {
      const p = ((x / w) * beats + ecgPhase) % 1;
      let y = h * 0.62;
      if (p > 0.1 && p < 0.16) y -= Math.sin(((p - 0.1) / 0.06) * Math.PI) * h * 0.08; // P
      else if (p > 0.2 && p < 0.23) y += ((p - 0.2) / 0.03) * h * 0.1; // Q
      else if (p >= 0.23 && p < 0.27) y -= ((p - 0.23) / 0.04) * h * 0.55 - h * 0.1; // R up
      else if (p >= 0.27 && p < 0.31) y -= (1 - (p - 0.27) / 0.04) * h * 0.55 - h * 0.1 - ((p - 0.27) / 0.04) * h * 0.14; // R down / S
      else if (p >= 0.31 && p < 0.34) y += (1 - (p - 0.31) / 0.03) * h * 0.14; // S back
      else if (p > 0.42 && p < 0.56) y -= Math.sin(((p - 0.42) / 0.14) * Math.PI) * h * 0.14; // T
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // sweep cursor
    const cx = ((1 - ecgPhase) % 1) * (w / beats);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(cx, 0, 2, h);
  }

  function renderLog(): void {
    const list = nodes.log;
    if (!list) return;
    list.replaceChildren();
    if (!memory.length) {
      list.append(el("li", "dim", "Nicio replică înregistrată încă."));
      return;
    }
    for (const m of memory) {
      const li = el("li");
      li.append(el("span", "who", `${m.at} · ${m.speaker}`), el("span", "what", m.text));
      list.append(li);
    }
  }

  return {
    update(input) {
      if (!visible) return;
      if (builtFor !== input.post) {
        build(input.post);
        renderLog();
      }
      const nowMs = performance.now();
      const dt = Math.min(0.5, (nowMs - lastFrame) / 1000);
      lastFrame = nowMs;
      const t = input.phaseTime;
      const st = input.state?.state ?? "idle";
      const active = st === "playing" || st === "preshow" || st === "epilogue" || st === "paused";
      const prof = THEME_PROFILE[input.theme] ?? THEME_PROFILE.prologue;
      const progress = st === "idle" ? 0 : st === "epilogue" || st === "ended" ? 1 : Math.max(0, Math.min(1, (t + 10) / MISSION_LENGTH_SEC));
      nodes.clock.textContent = active ? fmtClock(t) : st === "ended" ? "MISIUNE ÎNCHEIATĂ" : "ÎN AȘTEPTARE";
      const scene = input.sceneLabel.toUpperCase();
      nodes.status.textContent = `${prof.label}${scene && !prof.label.includes(scene) ? ` · ${scene}` : ""}${st === "paused" ? " · PAUZĂ" : ""}`;
      const tt = t * (st === "paused" ? 0 : 1) + performance.now() / 1000;

      switch (input.post) {
        case 1: {
          const heading = (t * prof.headingDrift * 0.4 + wobble(tt, 1) * 6 + 300) % 360;
          if (nodes.heading) nodes.heading.style.transform = `rotate(${heading}deg)`;
          setValue("heading", `${String(Math.round(heading)).padStart(3, "0")}°`);
          setMeter("route", progress);
          setValue("route", `${Math.round(progress * 100)}%`);
          const au = progress * 9.54;
          setText("distance", active ? `${au.toFixed(3)} UA de Pământ · ${(au * 149.6).toFixed(1)} mil. km` : "Ancorați pe orbită.");
          setValue("distance", active ? `${au.toFixed(2)} UA` : "0 UA");
          const speed = active ? prof.energy * (0.7 + 0.3 * wobble(tt, 2)) : 0.05;
          setBars("speed", speed);
          setValue("speed", `${Math.round(speed * 41 + (active ? 7 : 0))} km/s`);
          break;
        }
        case 2: {
          const energy = active ? Math.max(0.05, prof.energy + wobble(tt, 3) * 0.12) : 0.12;
          setBars("energy", energy);
          setValue("energy", `${Math.round(energy * 100)}%`);
          const stability = active ? 0.55 + 0.4 * (1 - Math.abs(wobble(tt * 0.6, 5))) * (input.theme === "void" ? 0.5 : 1) : 0.98;
          setMeter("stability", stability);
          setValue("stability", stability > 0.8 ? "STABIL" : stability > 0.5 ? "OSCILAȚII" : "TURBULENȚE");
          drawWave("thrust", tt, energy, 2.5, input.theme === "void" ? 1 : 0.3);
          setValue("thrust", `${(energy * 12.4).toFixed(1)} MN`);
          const temp = 280 + energy * 900 + wobble(tt, 7) * 20;
          setText("temp", `${Math.round(temp)} K · răcire ${energy > 0.85 ? "activă" : "nominală"}`);
          setValue("temp", `${Math.round(temp - 273)} °C`);
          break;
        }
        case 3: {
          const signal = active ? Math.max(0.03, prof.signal + wobble(tt * 1.4, 9) * 0.15) : 0.4;
          setBars("signal", signal);
          setValue("signal", input.theme === "void" ? "PIERDUT" : `${Math.round(signal * 100)}%`);
          drawWave("wave", tt, signal, 4 + (1 - signal) * 6, 1 - signal);
          setValue("wave", signal > 0.5 ? "CLAR" : signal > 0.2 ? "PARAZIȚI" : "TĂCERE");
          const freq = 1420.4 + wobble(tt * 0.3, 11) * 0.8 + progress * 3;
          setText("freq", `${freq.toFixed(2)} MHz · bandă ${input.theme === "tech" ? "cristal" : "hidrogen"}`);
          setValue("freq", `${freq.toFixed(1)} MHz`);
          setMeter("words", Math.min(1, memory.length / MEMORY_MAX));
          setValue("words", `${memory.length}`);
          break;
        }
        case 4: {
          const bpm = active ? prof.bpm + wobble(tt * 0.5, 13) * 4 : 58;
          drawEcg("ecg", dt, bpm);
          setValue("ecg", active ? "SINUSAL" : "REPAUS");
          setText("bpm", `${Math.round(bpm)} bătăi pe minut · ${bpm > 85 ? "emoție" : bpm > 68 ? "atenție" : "calm"}`);
          setValue("bpm", `${Math.round(bpm)}`);
          const oxygen = 0.95 + 0.04 * (1 - prof.energy) + wobble(tt, 15) * 0.01;
          setMeter("oxygen", oxygen);
          setValue("oxygen", `${(oxygen * 100).toFixed(1)}%`);
          const link = active ? prof.signal : 0.5;
          setBars("link", link);
          setValue("link", link > 0.4 ? "CONECTAT" : "SLAB");
          break;
        }
        case 5: {
          setValue("log", `${memory.length} ${memory.length === 1 ? "replică" : "replici"}`);
          setMeter("mem", Math.min(1, 0.08 + progress * 0.7 + memory.length * 0.03));
          setValue("mem", `${Math.round((0.08 + progress * 0.7 + memory.length * 0.03) * 100)}%`);
          setText("stamp", active ? `${fmtClock(t)} din misiune · ${new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })} ora sălii` : "Cronometrul pornește la lansare.");
          setValue("stamp", active ? fmtClock(t) : "—");
          setBars("count", memory.length / MEMORY_MAX);
          setValue("count", `${memory.length}/${MEMORY_MAX}`);
          break;
        }
      }
    },
    remember(speaker, text) {
      const clean = text.trim();
      if (!clean) return;
      if (memory.some((m) => m.text === clean)) return;
      memory.unshift({ speaker, text: clean.length > 90 ? `${clean.slice(0, 88)}…` : clean, at: new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }) });
      if (memory.length > MEMORY_MAX) memory = memory.slice(0, MEMORY_MAX);
      renderLog();
    },
    clearMemory() {
      memory = [];
      renderLog();
    },
    setVisible(v) {
      visible = v;
      container.classList.toggle("hidden", !v);
    },
  };
}
