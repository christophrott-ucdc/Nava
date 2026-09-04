#!/usr/bin/env node
/** Fast, disposable smoke test for the transcode and contact-sheet utilities. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

async function main() {
  const temp = await mkdtemp(path.join(os.tmpdir(), "nava-media-smoke-"));
  try {
    const source = path.join(temp, "source.mp4");
    const encoded = path.join(temp, "encoded.mp4");
    const sheet = path.join(temp, "sheet.png");
    run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30",
      "-t",
      "0.4",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-y",
      source,
    ]);
    const transcode = path.join(ROOT, "scripts", "media-transcode.mjs");
    run(process.execPath, [transcode, "--in", source, "--out", encoded, "--proxy", "--cpu"]);
    run(process.execPath, [transcode, "--in", source, "--out", encoded, "--proxy", "--cpu", "--overwrite"]);
    assert.ok((await stat(encoded)).size > 1000);

    run(process.execPath, [
      path.join(ROOT, "scripts", "media-contact-sheet.mjs"),
      "--in",
      encoded,
      "--out",
      sheet,
      "--every",
      "0.1",
      "--duration",
      "0.4",
      "--cols",
      "4",
      "--rows",
      "1",
      "--width",
      "160",
    ]);
    const png = await readFile(sheet);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    console.log("media smoke: PASS (CPU transcode, Windows-safe overwrite, contact sheet)");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("media smoke: FAIL");
  console.error(err);
  process.exitCode = 1;
});
