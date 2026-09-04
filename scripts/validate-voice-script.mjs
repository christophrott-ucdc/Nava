#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "assets", "show", "voice-script-v3.json");
const screenplayPath = path.join(root, "docs", "SCENARIU-REGIZORAL-10-MIN.md");
const manifestPath = path.join(root, "assets", "voice", "ro", "manifest.json");
const showPath = path.join(root, "assets", "show", "show.json");
const speakerNames = {
  "CĂPITANUL": "CAPITANUL",
  "AVATARUL NAVEI": "AVATAR_AI",
  LUMINA: "LUMINA",
  NATURA: "NATURA",
  TEHNOLOGICA: "TEHNOLOGIC",
  "ECOURILE CELOR TREI LUMI": "LUMINA",
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fail(message) {
  console.error(`[voices] ${message}`);
  process.exitCode = 1;
}

function expectedPhaseAndAt(publicAtSec) {
  if (publicAtSec < 50) return { phase: "preshow", at: publicAtSec };
  if (publicAtSec < 525) return { phase: "play", at: publicAtSec - 60 };
  return { phase: "epilogue", at: publicAtSec - 525 };
}

function screenplayCues() {
  const document = fs.readFileSync(screenplayPath, "utf8");
  const main = document.split("# SCENARIUL COMPLET")[1]?.split("# TEXTUL INTEGRAL")[0] ?? "";
  const cues = [];
  const pattern = /^### (\d+):(\d+)(?:–\d+:\d+)? · ([^\n]+)\n([\s\S]*?)(?=^### |^## )/gm;
  for (const match of main.matchAll(pattern)) {
    const label = match[3].split(" — ")[0].trim();
    const publicAtSec = Number(match[1]) * 60 + Number(match[2]);
    if (label === "TEHNOLOGICA" && match[3].includes("REPLICĂ ADAPTIVĂ")) {
      const variants = [...match[4].matchAll(/^- .*?: \*\*„(.+?)”\*\*$/gm)].map((variant) => variant[1]);
      for (const text of variants) cues.push({ publicAtSec, speaker: "TEHNOLOGIC", text });
      continue;
    }
    if (label === "ECOURILE CELOR TREI LUMI") {
      const timings = [500, 503.8, 506.4];
      const echoes = [...match[4].matchAll(/\*\*(LUMINA|NATURA|TEHNOLOGICA)\*\*\s*\n\s*> (.+)$/gm)];
      echoes.forEach((echo, index) => cues.push({ publicAtSec: timings[index], speaker: speakerNames[echo[1]], text: echo[2] }));
      continue;
    }
    const speaker = speakerNames[label];
    if (!speaker) continue;
    const quote = match[4].match(/^> (.+)$/m)?.[1];
    if (quote) cues.push({ publicAtSec, speaker, text: quote });
  }
  return cues;
}

const source = readJson(sourcePath);
const cues = Array.isArray(source.cues) ? source.cues : [];
const expected = screenplayCues();
const ids = new Set();

if (source.version !== "3.2.0-adaptive-complete") fail(`unexpected source version: ${source.version}`);
if (source.tts?.provider !== "elevenlabs") fail("provider must be elevenlabs");
if (source.tts?.modelId !== "eleven_v3") fail("model must be eleven_v3");
if (cues.length !== expected.length) fail(`source has ${cues.length} cues, screenplay has ${expected.length}`);

for (const [index, cue] of cues.entries()) {
  const where = `cue[${index}]`;
  const fromScript = expected[index];
  if (!cue.id || ids.has(cue.id)) fail(`${where} has a missing or duplicate id`);
  ids.add(cue.id);
  if (cue.kind !== "voice") fail(`${cue.id} is not a voice cue`);
  if (!Number.isFinite(cue.maxDurationSec) || cue.maxDurationSec <= 0) fail(`${cue.id} has invalid maxDurationSec`);
  if (!Array.isArray(cue.tts?.audioTags)) fail(`${cue.id} has invalid audio direction tags`);
  if (!cue.tts.audioTags.length && !Number.isFinite(cue.tts.speed)) fail(`${cue.id} has no TTS performance control`);
  if (cue.publicAtSec !== fromScript?.publicAtSec || cue.speaker !== fromScript?.speaker || cue.text?.ro !== fromScript?.text) {
    fail(`${cue.id} does not match the screenplay at index ${index}`);
  }
  const timing = expectedPhaseAndAt(cue.publicAtSec);
  if (cue.phase !== timing.phase || cue.at !== timing.at) fail(`${cue.id} has invalid phase/at mapping`);
}

if (fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  const manifestIds = Object.keys(manifest.clips ?? {});
  if (manifestIds.length !== cues.length) fail(`manifest has ${manifestIds.length} clips, source has ${cues.length}`);
  for (const cue of cues) {
    const clip = manifest.clips?.[cue.id];
    if (!clip) {
      fail(`${cue.id} is missing from the manifest`);
      continue;
    }
    const audio = path.join(path.dirname(manifestPath), clip.file ?? "");
    if (!fs.existsSync(audio) || fs.statSync(audio).size === 0) fail(`${cue.id} audio is missing or empty`);
    if (!Number.isFinite(clip.durationMs) || clip.durationMs <= 0) fail(`${cue.id} has invalid duration`);
    if (clip.durationMs > cue.maxDurationSec * 1000) {
      fail(`${cue.id} is ${(clip.durationMs / 1000).toFixed(2)}s, over its ${cue.maxDurationSec.toFixed(2)}s window`);
    }
    if (clip.text !== cue.text.ro || clip.speaker !== cue.speaker) fail(`${cue.id} manifest metadata does not match source`);
    const tagWords = new Set(cue.tts.audioTags.flatMap((tag) => tag.toLowerCase().match(/[a-z]+/g) ?? []));
    const leaked = (clip.words ?? []).find((word) => tagWords.has(String(word).toLowerCase()));
    if (leaked) fail(`${cue.id} leaked audio tag ${JSON.stringify(leaked)} into lip-sync words`);
  }
}

const adaptiveIds = ["v3-tech-0635-diverse", "v3-tech-0635-same", "v3-tech-0635-observe"];
for (const id of adaptiveIds) {
  const cue = cues.find((candidate) => candidate.id === id);
  if (!cue?.manual) fail(`${id} must remain manual; the server selects exactly one adaptive branch`);
}

if (fs.existsSync(showPath)) {
  const show = readJson(showPath);
  const executableVoices = (show.cues ?? []).filter((cue) => cue.kind === "voice");
  if (executableVoices.length !== cues.length) fail(`show.json has ${executableVoices.length} voice cues, source has ${cues.length}`);
  const executableById = new Map(executableVoices.map((cue) => [cue.id, cue]));
  for (const cue of cues) {
    const executable = executableById.get(cue.id);
    if (
      executable?.id !== cue.id ||
      executable?.phase !== cue.phase ||
      executable?.at !== cue.at ||
      executable?.speaker !== cue.speaker ||
      executable?.text?.ro !== cue.text.ro
    ) {
      fail(`${cue.id} does not match its executable show voice`);
    }
    if (executable?.fallback !== "silent") fail(`${cue.id} must block browser TTS in the executable show`);
    if (Boolean(executable?.manual) !== Boolean(cue.manual)) fail(`${cue.id} manual policy differs between source and show`);
  }
}

if (!process.exitCode) {
  const captain = cues.filter((cue) => cue.speaker === "CAPITANUL").length;
  const avatar = cues.filter((cue) => cue.speaker === "AVATAR_AI").length;
  const other = cues.length - captain - avatar;
  console.log(`[voices] OK: ${cues.length} assets match screenplay V3 (${captain} Captain, ${avatar} Ship Avatar, ${other} civilisation/echo; one of three adaptive assets plays)`);
}
