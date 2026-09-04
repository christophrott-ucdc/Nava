#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const showPath = path.join(root, "assets", "show", "show.json");
const outputPath = path.join(root, "docs", "CUE-SHEET.md");
const show = JSON.parse(fs.readFileSync(showPath, "utf8"));

function clock(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const sign = seconds < 0 ? "−" : "";
  const absolute = Math.abs(seconds);
  const minutes = Math.floor(absolute / 60);
  const remainder = absolute - minutes * 60;
  const rendered = Number.isInteger(remainder) ? String(remainder).padStart(2, "0") : remainder.toFixed(1).padStart(4, "0");
  return `${sign}${minutes}:${rendered}`;
}

function publicAt(cue) {
  if (cue.phase === "preshow") return cue.at;
  if (cue.phase === "play") return 60 + cue.at;
  return 525 + cue.at;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function content(cue) {
  if (cue.kind === "voice") {
    return `${cue.speaker} — ${cue.text?.ro ?? ""}${cue.fallback === "silent" ? " · asset local obligatoriu" : ""}`;
  }
  if (cue.kind === "theme") return cue.theme;
  if (cue.kind === "tablet") {
    const interaction = cue.interaction ?? {};
    const roles = Array.isArray(interaction.roles) ? ` · ${interaction.roles.join(", ")}` : "";
    return `${interaction.type ?? "interaction"}${roles}${cue.note ? ` · ${cue.note}` : ""}`;
  }
  if (cue.kind === "sfx") return `${cue.effect ?? cue.sfx ?? "efect"}${cue.durationSec ? ` · ${cue.durationSec} s` : ""}`;
  if (cue.kind === "entity") return `${cue.entity ?? "entitate"} · ${cue.action ?? ""}`;
  if (cue.kind === "countdown") return `${cue.from ?? 10}→${cue.to ?? 0}`;
  if (cue.kind === "marker") return cue.note ?? cue.label ?? "marker";
  const details = Object.entries(cue)
    .filter(([key]) => !["id", "phase", "at", "kind", "note"].includes(key))
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
  return [...details, cue.note].filter(Boolean).join(" · ") || "—";
}

const lines = [
  `# Cue sheet — ${show.title} · ${show.version}`,
  "",
  "> Generat din `assets/show/show.json` cu `npm run docs:cues`. Nu editați manual tabelul.",
  "",
  `Flux public: pre-show 0:00–0:50 · lead-in 0:50–1:00 · film 1:00–8:45 · epilog 8:45–10:00. Masterul fizic poate fi mai lung, dar playerul se oprește determinist la ${show.videoDurationSec} s.`,
  "",
  "| Cue | Fază | Timp fază | Timp public | Tip | Conținut |",
  "|---|---|---:|---:|---|---|",
];

for (const cue of show.cues ?? []) {
  lines.push(`| \`${escapeCell(cue.id)}\` | ${escapeCell(cue.phase)} | ${clock(cue.at)} | ${clock(publicAt(cue))} | ${escapeCell(cue.kind)} | ${escapeCell(content(cue))} |`);
}

lines.push(
  "",
  "## Editare sigură",
  "",
  "Dialogurile și timpii V3 se modifică în `assets/show/voice-script-v3.json`, apoi se rulează `npm run sync:voices`, `npm run docs:cues` și `npm run check`. Cele 51 de asset-uri vocale de producție trebuie să rămână cu `fallback: silent`; la 6:35 se redă exact una dintre cele trei ramuri adaptive. Nu se activează TTS Windows/browser pentru spectacol.",
  "",
  "La seek înainte, vocile/SFX-urile trecute se marchează fără redare, iar ultima temă și stare de entitate se aplică. La seek înapoi, cue-urile viitoare se rearmează.",
  "",
);

fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
console.log(`[docs] ${show.cues?.length ?? 0} cues written to ${path.relative(root, outputPath)}`);
