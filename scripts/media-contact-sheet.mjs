#!/usr/bin/env node
/**
 * Contact sheet (grid of timestamped frames) for aligning show.json cues to the real video.
 *
 *   node scripts/media-contact-sheet.mjs --in media/cinema_4k_h264.mp4 --out media/analysis/sheet.png
 *        [--every 10] [--start 0] [--duration <sec>] [--cols 6] [--rows 8] [--width 480] [--ffmpeg <bin>]
 *
 *   --every     seconds between sampled frames (default 10; use 1-2 for fine alignment of a short window)
 *   --start     first sampled timestamp in seconds (default 0)
 *   --duration  window length in seconds (default every*cols*rows, i.e. exactly one full grid)
 *   --cols/--rows  grid size (default 6x8 = 48 tiles); --width = tile width in px (default 480)
 *
 * Each tile is stamped with its ABSOLUTE video timestamp (HH:MM:SS.mmm) via drawtext `%{pts:hms:<start>}`
 * (input seeking with -ss resets pts to 0, so the offset restores the real time). Uses Windows' Arial
 * (fontfile 'C\:/Windows/Fonts/arial.ttf'); on other platforms falls back to fontconfig's default.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = { every: 10, start: 0, cols: 6, rows: 8, width: 480, ffmpeg: "ffmpeg" };
  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`--${name} expects a number, got "${v}"`);
    return n;
  };
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
      case "--every":
        out.every = num(next(), "every");
        break;
      case "--start":
        out.start = num(next(), "start");
        break;
      case "--duration":
        out.duration = num(next(), "duration");
        break;
      case "--cols":
        out.cols = num(next(), "cols");
        break;
      case "--rows":
        out.rows = num(next(), "rows");
        break;
      case "--width":
        out.width = num(next(), "width");
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

const quote = (s) => (/[\s"]/.test(s) ? JSON.stringify(s) : s);

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.in || !args.out) {
    console.log(
      "usage: node scripts/media-contact-sheet.mjs --in <video> --out <sheet.png> [--every 10] [--start 0] [--duration <s>] [--cols 6] [--rows 8] [--width 480]",
    );
    process.exit(args.help ? 0 : 2);
  }
  const input = path.resolve(args.in);
  const output = path.resolve(args.out);
  if (!fs.existsSync(input)) {
    console.error(`input not found: ${input}`);
    process.exit(2);
  }
  if (
    args.every <= 0 ||
    args.start < 0 ||
    (args.duration !== undefined && args.duration <= 0) ||
    !Number.isInteger(args.cols) ||
    !Number.isInteger(args.rows) ||
    !Number.isInteger(args.width) ||
    args.cols < 1 ||
    args.rows < 1 ||
    args.width < 32
  ) {
    console.error("invalid --every/--cols/--rows/--width");
    process.exit(2);
  }
  if (spawnSync(args.ffmpeg, ["-version"], { encoding: "utf8" }).status !== 0) {
    console.error(`cannot run "${args.ffmpeg}" - install ffmpeg or pass --ffmpeg <path>`);
    process.exit(2);
  }

  const tiles = args.cols * args.rows;
  const duration = args.duration ?? args.every * tiles;
  const fontsize = Math.max(14, Math.round(args.width / 16));
  // Windows: Arial. The colon in the drive letter must be escaped inside the filtergraph ('C\:/...').
  const fontfile = process.platform === "win32" ? "fontfile='C\\:/Windows/Fonts/arial.ttf':" : "";
  const vf = [
    `fps=1/${args.every}`,
    `scale=${args.width}:-2`,
    `drawtext=${fontfile}text='%{pts\\:hms\\:${args.start}}':x=12:y=10:fontsize=${fontsize}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8`,
    `tile=${args.cols}x${args.rows}:padding=4:margin=4:color=black`,
  ].join(",");

  const ffArgs = [
    "-hide_banner", "-loglevel", "warning", "-stats",
    "-ss", String(args.start), "-t", String(duration), "-i", input,
    "-vf", vf, "-frames:v", "1", "-update", "1", "-y", output,
  ];

  fs.mkdirSync(path.dirname(output), { recursive: true });
  console.log(
    `contact sheet: ${args.cols}x${args.rows} tiles, 1 frame / ${args.every} s, window ${args.start} s .. ${args.start + duration} s -> ${output}`,
  );
  console.log(`> ${args.ffmpeg} ${ffArgs.map(quote).join(" ")}\n`);

  const started = Date.now();
  const child = spawn(args.ffmpeg, ffArgs, { stdio: "inherit" });
  child.on("error", (err) => {
    console.error(err.message);
    process.exit(1);
  });
  child.on("exit", (code) => {
    if (code !== 0 || !fs.existsSync(output)) {
      console.error(`\nffmpeg failed (exit ${code})`);
      process.exit(1);
    }
    const size = fs.statSync(output).size;
    console.log(`\ndone in ${((Date.now() - started) / 1000).toFixed(1)} s: ${output} (${(size / 1024).toFixed(0)} kB)`);
  });
}

main();
