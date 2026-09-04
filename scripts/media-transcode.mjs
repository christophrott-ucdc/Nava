#!/usr/bin/env node
/**
 * Transcode the SpaceEngine master (HEVC 4:4:4 — not decodable by Chromium) to H.264 High 4:2:0 for the player.
 *
 *   node scripts/media-transcode.mjs --in <src.mp4> --out <dst.mp4> [--proxy] [--cpu] [--overwrite] [--ffmpeg <bin>]
 *
 *   default   3840x2052 (source size), NVENC h264, vbr cq 20, ~45 Mbps (max 70), High@5.2, GOP 120, 2 B-frames,
 *             +faststart, no audio  — exactly the recipe from docs/BRIEF.md.
 *   --proxy   1920x1026, ~15 Mbps H.264 for development on laptops / follower tests.
 *   --cpu     skip NVENC and use libx264 directly. Otherwise libx264 is the automatic fallback when NVENC fails
 *             (no NVIDIA GPU, driver too old, session limit...).
 *
 * Output is written to <out>.tmp.mp4 and renamed on success, so a half-finished file is never mistaken for a
 * finished one. Prints an ffprobe summary of the result.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = { proxy: false, cpu: false, overwrite: false, ffmpeg: "ffmpeg" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--in":
        out.in = next();
        break;
      case "--out":
        out.out = next();
        break;
      case "--proxy":
        out.proxy = true;
        break;
      case "--cpu":
        out.cpu = true;
        break;
      case "--overwrite":
      case "-y":
        out.overwrite = true;
        break;
      case "--ffmpeg":
        out.ffmpeg = next();
        break;
      case "-h":
      case "--help":
        out.help = true;
        break;
      default:
        console.error(`unknown argument: ${a}`);
        out.help = true;
    }
  }
  return out;
}

const TAIL = ["-movflags", "+faststart", "-an"];

const RECIPES = {
  full: {
    nvenc: [
      "-vf", "format=yuv420p",
      "-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", "20",
      "-b:v", "45M", "-maxrate", "70M", "-bufsize", "140M",
      "-profile:v", "high", "-level", "5.2", "-g", "120", "-bf", "2",
    ],
    x264: [
      "-vf", "format=yuv420p",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-maxrate", "70M", "-bufsize", "140M",
      "-profile:v", "high", "-level", "5.2", "-g", "120", "-bf", "2",
    ],
  },
  proxy: {
    nvenc: [
      "-vf", "scale=1920:1026:flags=lanczos,format=yuv420p",
      "-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", "23",
      "-b:v", "15M", "-maxrate", "20M", "-bufsize", "40M",
      "-profile:v", "high", "-level", "4.2", "-g", "120", "-bf", "2",
    ],
    x264: [
      "-vf", "scale=1920:1026:flags=lanczos,format=yuv420p",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-maxrate", "20M", "-bufsize", "40M",
      "-profile:v", "high", "-level", "4.2", "-g", "120", "-bf", "2",
    ],
  },
};

const quote = (s) => (/[\s"']/.test(s) ? JSON.stringify(s) : s);

function runFfmpeg(ffmpeg, input, output, codecArgs) {
  const args = ["-hide_banner", "-y", "-stats", "-stats_period", "5", "-i", input, ...codecArgs, ...TAIL, output];
  console.log(`\n> ${ffmpeg} ${args.map(quote).join(" ")}\n`);
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, args, { stdio: "inherit" });
    child.on("error", (error) => resolve({ code: -1, error }));
    child.on("exit", (code) => resolve({ code: code ?? -1 }));
  });
}

function probe(ffmpeg, file) {
  const ffprobe = ffmpeg.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace(/ffmpeg/i, "ffprobe"));
  const r = spawnSync(
    ffprobe,
    [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,profile,level,width,height,pix_fmt,r_frame_rate,bit_rate:format=duration,size,bit_rate",
      "-of", "json", file,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.in || !args.out) {
    console.log("usage: node scripts/media-transcode.mjs --in <src.mp4> --out <dst.mp4> [--proxy] [--cpu] [--overwrite] [--ffmpeg <bin>]");
    process.exit(args.help ? 0 : 2);
  }
  const input = path.resolve(args.in);
  const output = path.resolve(args.out);
  if (!fs.existsSync(input)) {
    console.error(`input not found: ${input}`);
    process.exit(2);
  }
  if (fs.existsSync(output) && !args.overwrite) {
    console.error(`output exists: ${output}  (use --overwrite to replace it)`);
    process.exit(2);
  }
  if (input === output) {
    console.error("input and output must be different files");
    process.exit(2);
  }
  const version = spawnSync(args.ffmpeg, ["-version"], { encoding: "utf8" });
  if (version.status !== 0) {
    console.error(`cannot run "${args.ffmpeg}" - install ffmpeg (winget install Gyan.FFmpeg) or pass --ffmpeg <path>`);
    process.exit(2);
  }
  console.log(version.stdout.split(/\r?\n/)[0]);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const tmp = `${output}.tmp.mp4`;
  const recipe = RECIPES[args.proxy ? "proxy" : "full"];
  const started = Date.now();
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)} s`;

  let result = { code: 1 };
  let encoder = "";
  if (!args.cpu) {
    encoder = "h264_nvenc";
    result = await runFfmpeg(args.ffmpeg, input, tmp, recipe.nvenc);
    if (result.code !== 0) {
      console.warn(`\nNVENC encode failed (exit ${result.code}${result.error ? `: ${result.error.message}` : ""}) -> falling back to libx264 (slow)\n`);
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
  if (result.code !== 0) {
    encoder = "libx264";
    result = await runFfmpeg(args.ffmpeg, input, tmp, recipe.x264);
  }
  if (result.code !== 0) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    console.error(`\ntranscode FAILED (exit ${result.code}) after ${elapsed()}`);
    process.exit(1);
  }

  // Windows does not replace an existing destination with rename(). Preserve the previous encode
  // until the completed temp file is safely in place, then remove the backup.
  let backup = null;
  if (fs.existsSync(output)) {
    backup = `${output}.previous-${process.pid}`;
    fs.renameSync(output, backup);
  }
  try {
    fs.renameSync(tmp, output);
    if (backup) fs.rmSync(backup, { force: true });
  } catch (err) {
    if (backup && !fs.existsSync(output) && fs.existsSync(backup)) fs.renameSync(backup, output);
    throw err;
  }
  console.log(`\ndone in ${elapsed()} with ${encoder}${args.proxy ? " (proxy 1920x1026)" : ""}: ${output}`);
  const info = probe(args.ffmpeg, output);
  if (info) {
    const s = info.streams?.[0] ?? {};
    const f = info.format ?? {};
    const mbps = f.bit_rate ? (Number(f.bit_rate) / 1e6).toFixed(1) : "?";
    console.log(
      `  ${s.codec_name} ${s.profile}@${s.level ? (s.level / 10).toFixed(1) : "?"} ${s.width}x${s.height} ${s.pix_fmt} ${s.r_frame_rate} fps, ` +
        `${Number(f.duration ?? 0).toFixed(2)} s, ${(Number(f.size ?? 0) / 1e9).toFixed(2)} GB, ${mbps} Mbps`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
