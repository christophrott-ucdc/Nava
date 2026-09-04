#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const showPath = path.resolve(root, process.argv[2] ?? "assets/show/show.json");
const phases = new Set(["preshow", "play", "epilogue"]);
const kinds = new Set(["voice", "countdown", "sfx", "entity", "tablet", "theme", "marker"]);
const themes = new Set(["prologue", "launch", "light", "nature", "tech", "void", "home", "white"]);
const speakers = new Set(["AVATAR_AI", "CAPITANUL", "LUMINA", "NATURA", "TEHNOLOGIC"]);

const fail = (message) => {
  console.error(`[show] ${message}`);
  process.exitCode = 1;
};

let show;
try {
  show = JSON.parse(fs.readFileSync(showPath, "utf8"));
} catch (error) {
  console.error(`[show] cannot read ${showPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

if (!show || typeof show !== "object" || Array.isArray(show)) fail("root must be an object");
if (!Array.isArray(show.scenes)) fail("scenes must be an array");
if (!Array.isArray(show.cues)) fail("cues must be an array");
if (!Number.isFinite(show.videoDurationSec) || show.videoDurationSec <= 0) fail("videoDurationSec must be positive");
if (!Number.isFinite(show.launchLeadInSec) || show.launchLeadInSec < 0) fail("launchLeadInSec must be non-negative");
if (typeof show.epilogueOnVideoEnd !== "boolean") fail("epilogueOnVideoEnd must be boolean");

const sceneIds = new Set();
const sceneRanges = new Map();
for (const [index, scene] of (show.scenes ?? []).entries()) {
  const where = `scene[${index}]`;
  if (!scene || typeof scene !== "object") {
    fail(`${where} must be an object`);
    continue;
  }
  if (typeof scene.id !== "string" || !scene.id) fail(`${where}.id is required`);
  else if (sceneIds.has(scene.id)) fail(`duplicate scene id: ${scene.id}`);
  else sceneIds.add(scene.id);
  if (!phases.has(scene.phase)) fail(`${where}.phase is invalid`);
  if (!themes.has(scene.theme)) fail(`${where}.theme is invalid`);
  if (!Number.isFinite(scene.start) || !Number.isFinite(scene.end) || scene.end <= scene.start) fail(`${where} has an invalid range`);
  const ranges = sceneRanges.get(scene.phase) ?? [];
  ranges.push({ id: scene.id, start: scene.start, end: scene.end });
  sceneRanges.set(scene.phase, ranges);
}

for (const [phase, ranges] of sceneRanges) {
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) fail(`${phase} scenes overlap: ${ranges[i - 1].id} and ${ranges[i].id}`);
  }
}

const cueIds = new Set();
const lastAt = new Map();
const counts = new Map();
for (const [index, cue] of (show.cues ?? []).entries()) {
  const where = `cue[${index}]`;
  if (!cue || typeof cue !== "object") {
    fail(`${where} must be an object`);
    continue;
  }
  if (typeof cue.id !== "string" || !cue.id) fail(`${where}.id is required`);
  else if (cueIds.has(cue.id)) fail(`duplicate cue id: ${cue.id}`);
  else cueIds.add(cue.id);
  if (!phases.has(cue.phase)) fail(`${where}.phase is invalid`);
  if (!kinds.has(cue.kind)) fail(`${where}.kind is invalid`);
  if (!Number.isFinite(cue.at)) fail(`${where}.at must be finite`);
  const prior = lastAt.get(cue.phase);
  if (prior !== undefined && cue.at < prior) fail(`${where} is out of order in phase ${cue.phase}: ${cue.at} < ${prior}`);
  lastAt.set(cue.phase, cue.at);
  counts.set(cue.kind, (counts.get(cue.kind) ?? 0) + 1);

  if (cue.phase === "play" && cue.at < -show.launchLeadInSec) fail(`${cue.id} occurs before the launch lead-in`);
  if (cue.phase === "play" && cue.at > show.videoDurationSec) fail(`${cue.id} occurs after the video`);
  if (cue.kind === "voice") {
    if (!speakers.has(cue.speaker)) fail(`${cue.id} has an invalid speaker`);
    if (!cue.text || typeof cue.text.ro !== "string" || !cue.text.ro.trim()) fail(`${cue.id} is missing Romanian text`);
  }
  if (cue.kind === "theme" && !themes.has(cue.theme)) fail(`${cue.id} has an invalid theme`);
  if (cue.kind === "entity" && !["LUMINA", "NATURA", "TEHNOLOGIC"].includes(cue.entity)) fail(`${cue.id} has an invalid entity`);
  if (cue.kind === "tablet" && (!cue.interaction || typeof cue.interaction.type !== "string")) fail(`${cue.id} has an invalid interaction`);
}

if (!process.exitCode) {
  const summary = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `${kind}=${count}`)
    .join(", ");
  console.log(`[show] OK ${path.relative(root, showPath)}: ${show.scenes.length} scenes, ${show.cues.length} cues (${summary})`);
}
