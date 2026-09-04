#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await fs.readFile(path.join(root, "assets", "show", "voice-script-v3.json"), "utf8"));
const voiceDir = path.join(root, "assets", "voice", "ro");
const manifest = JSON.parse(await fs.readFile(path.join(voiceDir, "manifest.json"), "utf8"));
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "nava-voice-reels-"));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${code}): ${Buffer.concat(stderr).toString("utf8").slice(0, 800)}`));
    });
  });
}

function concatPath(file) {
  return file.replaceAll("\\", "/").replaceAll("'", "'\\''");
}

async function buildReel(name, selectCue, outputName, title) {
  const cues = source.cues.filter(selectCue);
  const silence = path.join(tempDir, `silence-${name}.mp3`);
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=mono",
    "-t",
    "0.75",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    "-y",
    silence,
  ]);
  const lines = [];
  for (const cue of cues) {
    const clip = manifest.clips?.[cue.id];
    if (!clip) throw new Error(`Missing manifest entry for ${cue.id}`);
    const audio = path.join(voiceDir, clip.file);
    await fs.access(audio);
    lines.push(`file '${concatPath(audio)}'`, `file '${concatPath(silence)}'`);
  }
  const list = path.join(tempDir, `${name}.txt`);
  await fs.writeFile(list, `${lines.join("\n")}\n`, "utf8");
  const output = path.join(voiceDir, outputName);
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    "-metadata",
    `title=${title}`,
    "-y",
    output,
  ]);
  const stat = await fs.stat(output);
  console.log(`[reel] ${path.relative(root, output)} (${cues.length} cues, ${Math.round(stat.size / 1024)} KiB)`);
}

try {
  await buildReel("CAPITANUL", (cue) => cue.speaker === "CAPITANUL", "preview-capitan-v3.mp3", "Protocolul Acasă — Căpitanul — V3.3");
  await buildReel("AVATAR_AI", (cue) => cue.speaker === "AVATAR_AI", "preview-avatar-v3.mp3", "Protocolul Acasă — Vocea Navei — V3.3");
  await buildReel(
    "CIVILIZATII",
    (cue) => cue.speaker !== "CAPITANUL" && cue.speaker !== "AVATAR_AI",
    "preview-civilizatii-v3.mp3",
    "Protocolul Acasă — Civilizațiile — V3.3",
  );
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
