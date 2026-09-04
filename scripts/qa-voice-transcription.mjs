#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const voiceDir = path.join(root, "assets", "voice", "ro");
const source = JSON.parse(await fs.readFile(path.join(root, "assets", "show", "voice-script-v3.json"), "utf8"));

function unquoteEnv(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed.replace(/\s+#.*$/, "").trim();
}

async function loadDotEnv() {
  let contents;
  try {
    contents = await fs.readFile(path.join(root, ".env"), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const raw of contents.split(/\r?\n/)) {
    const match = raw.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || raw.trim().startsWith("#") || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = unquoteEnv(match[2]);
  }
}

await loadDotEnv();
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required for transcription QA");

function words(value) {
  return value
    .toLocaleLowerCase("ro")
    .normalize("NFC")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function editDistance(expected, actual) {
  let prior = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let i = 1; i <= expected.length; i++) {
    const next = [i];
    for (let j = 1; j <= actual.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, prior[j] + 1, prior[j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1));
    }
    prior = next;
  }
  return prior[actual.length];
}

async function transcribe(file) {
  const audio = await fs.readFile(file);
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/mpeg" }), path.basename(file));
  form.append("model_id", "scribe_v2");
  form.append("language_code", "ro");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!response.ok) throw new Error(`Scribe HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

for (const [speaker, file, selectCue] of [
  ["CAPITANUL", "preview-capitan-v3.mp3", (cue) => cue.speaker === "CAPITANUL"],
  ["AVATAR_AI", "preview-avatar-v3.mp3", (cue) => cue.speaker === "AVATAR_AI"],
  ["CIVILIZATII", "preview-civilizatii-v3.mp3", (cue) => cue.speaker !== "CAPITANUL" && cue.speaker !== "AVATAR_AI"],
]) {
  const expectedText = source.cues.filter(selectCue).map((cue) => cue.text.ro).join(" ");
  const transcript = await transcribe(path.join(voiceDir, file));
  const expectedWords = words(expectedText);
  const actualWords = words(String(transcript.text ?? ""));
  const errors = editDistance(expectedWords, actualWords);
  const wer = expectedWords.length ? errors / expectedWords.length : 1;
  console.log(`[voice-qa] ${speaker}: language=${transcript.language_code ?? "?"} words=${actualWords.length}/${expectedWords.length} WER=${(wer * 100).toFixed(1)}%`);
  if (actualWords.some((word) => ["thoughtful", "whispers", "warmly", "authoritative", "precise"].includes(word))) {
    throw new Error(`${speaker}: an Eleven v3 audio tag was spoken aloud`);
  }
  if (wer > 0.18) process.exitCode = 1;
}
