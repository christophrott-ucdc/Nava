#!/usr/bin/env node
/**
 * Precompute Oculus viseme tracks for every clip in assets/voice/<lang>/manifest.json (R4 / C-02).
 *
 * For each clip, `words/wtimes/wdurations` (ElevenLabs alignment) are turned into
 * `visemes/vtimes/vdurations` with the SAME Romanian rules the renderer uses
 * (src/renderer/avatar/lipsync-ro.ts — bundled in memory with esbuild, so there is one source of
 * truth): each word's duration is shared among its visemes (vowels weight 1.6, consonants 1.0)
 * and a `sil` viseme fills inter-word gaps longer than 80 ms. The renderer prefers these tracks
 * over runtime word mapping (AvatarController.lipsync).
 *
 * Usage:
 *   node scripts/precompute-visemes.mjs                 # ro, writes the manifest if anything changed
 *   node scripts/precompute-visemes.mjs --lang en
 *   node scripts/precompute-visemes.mjs --dry-run       # report only
 *   node scripts/precompute-visemes.mjs --check         # exit 1 if any clip lacks/has stale visemes
 *   node scripts/precompute-visemes.mjs --cue v3-cap-0004 --verbose
 *
 * Re-run after `npm run tts` regenerates clips (the generator prints a reminder).
 */
import { build } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = new Set(["ro", "en", "fr"]);
const RULES_SOURCE = path.join(ROOT, "src", "renderer", "avatar", "lipsync-ro.ts");

function usage() {
  console.log(`Nava viseme precompute

Options:
  --lang <ro|en|fr>   Manifest language (default: ro)
  --cue <id>          Only this clip (repeatable)
  --dry-run           Compute and report, do not write
  --check             Exit 1 when any clip is missing/stale (for preflight/CI); implies --dry-run
  --verbose           Print per-clip lines
  --help`);
}

function parseArgs(argv) {
  const out = { lang: "ro", cues: [], dryRun: false, check: false, verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--check") out.check = out.dryRun = true;
    else if (arg === "--verbose" || arg === "-v") out.verbose = true;
    else if (arg === "--lang") out.lang = argv[++i] ?? "";
    else if (arg.startsWith("--lang=")) out.lang = arg.slice(7);
    else if (arg === "--cue") out.cues.push(argv[++i] ?? "");
    else if (arg.startsWith("--cue=")) out.cues.push(arg.slice(6));
    else throw new Error(`Argument necunoscut: ${arg}`);
  }
  if (!LANGS.has(out.lang)) throw new Error(`Limbă invalidă: ${out.lang}`);
  return out;
}

/** Bundle the TS lip-sync module in memory (same trick as tts-generate.mjs for the providers). */
async function loadLipsyncRo() {
  const result = await build({
    entryPoints: [RULES_SOURCE],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "silent",
  });
  const code = result.outputFiles[0]?.contents;
  if (!code) throw new Error("Nu am putut încărca src/renderer/avatar/lipsync-ro.ts");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

function sameTrack(clip, track) {
  const eq = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
  return eq(clip.visemes, track.visemes) && eq(clip.vtimes, track.vtimes) && eq(clip.vdurations, track.vdurations);
}

/** Rebuild the clip with the viseme fields placed right after `wdurations` (stable diffs). */
function withTrack(clip, track) {
  const out = {};
  for (const [key, value] of Object.entries(clip)) {
    if (key === "visemes" || key === "vtimes" || key === "vdurations") continue;
    out[key] = value;
    if (key === "wdurations") {
      out.visemes = track.visemes;
      out.vtimes = track.vtimes;
      out.vdurations = track.vdurations;
    }
  }
  if (!("visemes" in out)) Object.assign(out, track);
  return out;
}

function usableWords(clip) {
  return (
    Array.isArray(clip.words) &&
    clip.words.length > 0 &&
    Array.isArray(clip.wtimes) &&
    Array.isArray(clip.wdurations) &&
    clip.wtimes.length >= clip.words.length &&
    clip.wdurations.length >= clip.words.length
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const manifestPath = path.join(ROOT, "assets", "voice", args.lang, "manifest.json");
  const rel = path.relative(ROOT, manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (err) {
    throw new Error(`Nu pot citi ${rel}: ${err.message}`);
  }
  if (!manifest || manifest.lang !== args.lang || !manifest.clips || typeof manifest.clips !== "object") {
    throw new Error(`${rel} nu este un manifest valid pentru ${args.lang}`);
  }

  const { distributeWordVisemes, VISEME_DISTRIBUTION_DEFAULTS } = await loadLipsyncRo();
  const wanted = new Set(args.cues.filter(Boolean));
  const ids = Object.keys(manifest.clips).filter((id) => !wanted.size || wanted.has(id));
  const unknown = [...wanted].filter((id) => !manifest.clips[id]);
  if (unknown.length) throw new Error(`Clipuri necunoscute în ${rel}: ${unknown.join(", ")}`);

  const stats = { clips: 0, updated: 0, unchanged: 0, skipped: 0, visemes: 0, sil: 0, words: 0, stale: [] };
  for (const id of ids) {
    const clip = manifest.clips[id];
    stats.clips += 1;
    if (!usableWords(clip)) {
      stats.skipped += 1;
      if (args.verbose) console.log(`  skip     ${id} (fără words/wtimes/wdurations)`);
      continue;
    }
    const track = distributeWordVisemes(clip.words, clip.wtimes, clip.wdurations);
    const silCount = track.visemes.filter((v) => v === "sil").length;
    stats.visemes += track.visemes.length;
    stats.sil += silCount;
    stats.words += clip.words.length;
    if (sameTrack(clip, track)) {
      stats.unchanged += 1;
      if (args.verbose) console.log(`  ok       ${id} (${track.visemes.length} viseme, ${silCount} sil)`);
      continue;
    }
    stats.updated += 1;
    stats.stale.push(id);
    if (args.verbose) {
      const state = Array.isArray(clip.visemes) ? "stale" : "missing";
      console.log(`  ${state.padEnd(8)} ${id} -> ${track.visemes.length} viseme, ${silCount} sil, ${clip.words.length} cuvinte`);
    }
    if (!args.dryRun) manifest.clips[id] = withTrack(clip, track);
  }

  const rules = `vowel=${VISEME_DISTRIBUTION_DEFAULTS.vowelWeight} consonant=${VISEME_DISTRIBUTION_DEFAULTS.consonantWeight} silGap=${VISEME_DISTRIBUTION_DEFAULTS.silGapMs}ms`;
  console.log(
    `[visemes] ${rel}: clips=${stats.clips} updated=${stats.updated} unchanged=${stats.unchanged} skipped=${stats.skipped} ` +
      `words=${stats.words} visemes=${stats.visemes} (sil=${stats.sil}, ${stats.words ? (stats.visemes / stats.words).toFixed(2) : "0"} viseme/cuvânt) rules: ${rules}`,
  );

  if (args.check) {
    if (stats.stale.length) {
      console.error(`[visemes] ${stats.stale.length} clip(uri) fără viseme actuale: ${stats.stale.slice(0, 8).join(", ")}${stats.stale.length > 8 ? ", …" : ""}`);
      process.exitCode = 1;
    } else {
      console.log("[visemes] check OK");
    }
    return;
  }
  if (args.dryRun) {
    console.log("[visemes] dry-run: manifestul nu a fost modificat.");
    return;
  }
  if (!stats.updated) {
    console.log("[visemes] nimic de scris.");
    return;
  }
  manifest.generatedAt = new Date().toISOString();
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`[visemes] scris ${rel} (generatedAt=${manifest.generatedAt})`);
}

main().catch((err) => {
  console.error(`[visemes] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
