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
    if (cue.fallback !== undefined && !["browser", "silent"].includes(cue.fallback)) fail(`${cue.id} has an invalid fallback policy`);
  }
  if (cue.kind === "theme" && !themes.has(cue.theme)) fail(`${cue.id} has an invalid theme`);
  if (cue.kind === "entity" && !["LUMINA", "NATURA", "TEHNOLOGIC"].includes(cue.entity)) fail(`${cue.id} has an invalid entity`);
  if (cue.kind === "tablet") {
    const interaction = cue.interaction;
    if (!interaction || typeof interaction.type !== "string") {
      fail(`${cue.id} has an invalid interaction`);
    } else if (interaction.type === "post-assign") {
      if (
        !Array.isArray(interaction.posts) ||
        interaction.posts.length !== 5 ||
        new Set(interaction.posts).size !== 5 ||
        !interaction.posts.every((post) => typeof post === "string" && post.trim())
      ) fail(`${cue.id} must assign five unique posts`);
    } else if (interaction.type === "paired-choice") {
      const validOption = (option) =>
        (typeof option === "string" && option.trim()) ||
        (option && typeof option === "object" && !Array.isArray(option) && typeof option.value === "string" && option.value.trim() && typeof option.label === "string" && option.label.trim());
      if (
        !["color", "pulse", "perspective"].includes(interaction.mode) ||
        typeof interaction.prompt !== "string" ||
        !interaction.prompt.trim() ||
        !Array.isArray(interaction.options) ||
        !interaction.options.length ||
        !interaction.options.every(validOption) ||
        interaction.allowObserve !== true
      ) fail(`${cue.id} has an invalid paired-choice interaction`);
    } else if (!['waiting', 'thanks'].includes(interaction.type)) {
      fail(`${cue.id} uses retired tablet interaction type ${JSON.stringify(interaction.type)}`);
    }
  }
}

if (show.version === "0.4.0-v3-complete") {
  const voices = show.cues.filter((cue) => cue.kind === "voice");
  const adaptive = voices.filter((cue) => cue.id.startsWith("v3-tech-0635-"));
  if (show.videoDurationSec !== 465 || show.launchLeadInSec !== 10 || !show.preshowAutoStart || !show.epilogueOnVideoEnd) {
    fail("V3 timing contract must be preshow auto-start + 10s lead-in + 465s film cut + automatic epilogue");
  }
  if (voices.length !== 51) fail(`V3 show must contain 51 voice assets, found ${voices.length}`);
  if (voices.some((cue) => cue.fallback !== "silent")) fail("every V3 voice must block browser/Windows TTS");
  if (adaptive.length !== 3 || adaptive.some((cue) => !cue.manual)) fail("the three V3 adaptive voices must exist and remain manual");
  if (!cueIds.has("tech-adaptive-select")) fail("V3 show is missing the adaptive selection marker");
  for (const retired of ["tech-tablet-question", "rev-tablet-message"]) {
    if (cueIds.has(retired)) fail(`V3 show still contains retired cue ${retired}`);
  }
  for (const required of ["pre-tablet-roles", "light-tablet-color", "nature-tablet-pulse", "tech-tablet-perspectives", "epi-tablet-thanks"]) {
    if (!cueIds.has(required)) fail(`V3 show is missing tablet cue ${required}`);
  }
}

if (!process.exitCode) {
  const summary = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `${kind}=${count}`)
    .join(", ");
  console.log(`[show] OK ${path.relative(root, showPath)}: ${show.scenes.length} scenes, ${show.cues.length} cues (${summary})`);
}
