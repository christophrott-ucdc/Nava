#!/usr/bin/env node
/**
 * Pre-generate deterministic show speech.
 *
 * Usage:
 *   npm run tts -- --lang ro --provider elevenlabs
 *   npm run tts -- --cue pre-02 --force
 *   npm run tts -- --dry-run
 */
import { build } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOW_PATH = path.join(ROOT, "assets", "show", "show.json");
const VOICE_ROOT = path.join(ROOT, "assets", "voice");
const LANGS = new Set(["ro", "en", "fr"]);
const PROVIDERS = new Set(["elevenlabs", "gemini"]);

function usage() {
  console.log(`Nava voice generator

Options:
  --lang <ro|en|fr>                 Language to generate (default: ro)
  --provider <elevenlabs|gemini>    Provider (default: TTS_PROVIDER or elevenlabs)
  --cue <id>                        Generate one cue (repeatable)
  --force                           Replace matching existing clips
  --dry-run                         List work without calling a provider
  --help                            Show this help

Keys are read from process.env or .env in the repository root. They are never printed.`);
}

function parseArgs(argv) {
  const out = { lang: "ro", provider: process.env.TTS_PROVIDER === "gemini" ? "gemini" : "elevenlabs", cues: [], force: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { ...out, help: true };
    if (arg === "--force") out.force = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--lang") out.lang = argv[++i] ?? "";
    else if (arg.startsWith("--lang=")) out.lang = arg.slice(7);
    else if (arg === "--provider") out.provider = argv[++i] ?? "";
    else if (arg.startsWith("--provider=")) out.provider = arg.slice(11);
    else if (arg === "--cue") out.cues.push(argv[++i] ?? "");
    else if (arg.startsWith("--cue=")) out.cues.push(arg.slice(6));
    else throw new Error(`Argument necunoscut: ${arg}`);
  }
  if (!LANGS.has(out.lang)) throw new Error(`Limbă invalidă: ${out.lang}`);
  if (!PROVIDERS.has(out.provider)) throw new Error(`Provider invalid: ${out.provider}`);
  if (out.cues.some((id) => !id)) throw new Error("--cue necesită un id");
  return out;
}

function unquoteEnv(value) {
  const v = value.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v.replace(/\s+#.*$/, "").trim();
}

async function loadDotEnv() {
  let source;
  try {
    source = await fs.readFile(path.join(ROOT, ".env"), "utf8");
  } catch (err) {
    if (err?.code === "ENOENT") return;
    throw err;
  }
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = unquoteEnv(match[2]);
  }
}

async function loadProviderModule() {
  // The application is bundled by esbuild and the TS source uses bundler
  // resolution. Bundle this one server-only module in memory for the CLI too.
  const result = await build({
    entryPoints: [path.join(ROOT, "src", "server", "tts-providers.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "silent",
  });
  const code = result.outputFiles[0]?.contents;
  if (!code) throw new Error("Nu am putut încărca adaptorul TTS.");
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readManifest(file, lang) {
  try {
    const value = await readJson(file);
    if (value && value.lang === lang && value.clips && typeof value.clips === "object") return value;
    console.warn(`[tts] Ignor manifestul invalid: ${path.relative(ROOT, file)}`);
  } catch (err) {
    if (err?.code !== "ENOENT") console.warn(`[tts] Nu pot citi manifestul existent: ${err.message}`);
  }
  return { lang, generatedAt: new Date(0).toISOString(), clips: {} };
}

function safeCueFile(id, extension) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id) || id.includes("..")) {
    throw new Error(`Id de cue nesigur pentru nume de fișier: ${JSON.stringify(id)}`);
  }
  return `${id}.${extension}`;
}

async function nonEmptyFile(file) {
  try {
    return (await fs.stat(file)).isFile() && (await fs.stat(file)).size > 0;
  } catch {
    return false;
  }
}

function matchesExisting(meta, cue, text, lang, provider) {
  return (
    meta &&
    meta.cueId === cue.id &&
    meta.speaker === cue.speaker &&
    meta.lang === lang &&
    meta.text === text &&
    meta.provider === provider &&
    typeof meta.file === "string" &&
    Number.isFinite(meta.durationMs) &&
    meta.durationMs > 0
  );
}

async function main() {
  await loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  // TTS_PROVIDER in .env is loaded after the initial argv parse. Honour it
  // only when the user did not explicitly select a provider.
  const providerWasExplicit = process.argv.slice(2).some((a) => a === "--provider" || a.startsWith("--provider="));
  if (!providerWasExplicit) args.provider = process.env.TTS_PROVIDER === "gemini" ? "gemini" : "elevenlabs";

  const show = await readJson(SHOW_PATH);
  if (!Array.isArray(show.cues)) throw new Error("assets/show/show.json nu conține un vector cues.");
  const wanted = new Set(args.cues);
  const voiceCues = show.cues.filter((cue) => cue?.kind === "voice" && (!wanted.size || wanted.has(cue.id)));
  const found = new Set(voiceCues.map((cue) => cue.id));
  const missing = [...wanted].filter((id) => !found.has(id));
  if (missing.length) throw new Error(`Cue-uri vocale necunoscute: ${missing.join(", ")}`);
  if (!voiceCues.length) throw new Error("Nu există cue-uri vocale de generat.");

  const outputDir = path.join(VOICE_ROOT, args.lang);
  const manifestPath = path.join(outputDir, "manifest.json");
  const manifest = await readManifest(manifestPath, args.lang);
  const plan = [];
  for (const cue of voiceCues) {
    const text = cue.text?.[args.lang] ?? cue.text?.ro;
    if (typeof text !== "string" || !text.trim()) {
      console.warn(`[tts] ${cue.id}: nu are text pentru ${args.lang}; omit.`);
      continue;
    }
    const existing = manifest.clips[cue.id];
    const canReuse =
      !args.force &&
      matchesExisting(existing, cue, text, args.lang, args.provider) &&
      (await nonEmptyFile(path.join(outputDir, existing.file)));
    plan.push({ cue, text, existing, action: canReuse ? "skip" : "generate" });
  }

  const toGenerate = plan.filter((item) => item.action === "generate");
  console.log(
    `[tts] show=${show.version ?? "?"} lang=${args.lang} provider=${args.provider} cues=${plan.length} generate=${toGenerate.length} reuse=${plan.length - toGenerate.length}`,
  );
  if (args.lang !== "ro" && voiceCues.some((cue) => !cue.text?.[args.lang])) {
    console.warn(`[tts] Unele cue-uri nu au traducere ${args.lang}; se folosește textul românesc din show.json.`);
  }
  if (args.dryRun) {
    for (const item of plan) console.log(`  ${item.action.padEnd(8)} ${item.cue.id} (${item.cue.speaker})`);
    return;
  }
  if (!toGenerate.length) return;

  const keyName = args.provider === "elevenlabs" ? "ELEVENLABS_API_KEY" : "GEMINI_API_KEY";
  if (!process.env[keyName]?.trim()) {
    throw new Error(`${keyName} lipsește. Completează .env sau folosește --dry-run; manifestul nu a fost modificat.`);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const { synthesize } = await loadProviderModule();
  const nextClips = {};
  // Keep only current show voice cues in the selected language, which prevents
  // deleted cue IDs from silently surviving forever in a production manifest.
  for (const cue of show.cues.filter((item) => item?.kind === "voice")) {
    if (manifest.clips[cue.id]) nextClips[cue.id] = manifest.clips[cue.id];
  }

  let generated = 0;
  let reused = 0;
  const failures = [];
  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    if (item.action === "skip") {
      nextClips[item.cue.id] = item.existing;
      reused++;
      console.log(`[tts] ${i + 1}/${plan.length} reuse ${item.cue.id}`);
      continue;
    }
    process.stdout.write(`[tts] ${i + 1}/${plan.length} generate ${item.cue.id} (${item.cue.speaker}) ... `);
    let result;
    try {
      result = await synthesize({ text: item.text, speaker: item.cue.speaker, lang: args.lang, provider: args.provider });
    } catch (err) {
      result = { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
    if (!result.ok) {
      failures.push({ id: item.cue.id, reason: result.reason });
      console.log(`FAILED\n      ${result.reason}`);
      continue;
    }
    const extension = result.mime === "audio/wav" ? "wav" : "mp3";
    const file = safeCueFile(item.cue.id, extension);
    await fs.writeFile(path.join(outputDir, file), result.audio);
    const now = new Date().toISOString();
    nextClips[item.cue.id] = {
      cueId: item.cue.id,
      lang: args.lang,
      speaker: item.cue.speaker,
      text: item.text,
      file,
      mime: result.mime,
      durationMs: result.durationMs,
      words: result.words,
      wtimes: result.wtimes,
      wdurations: result.wdurations,
      provider: result.provider,
      generatedAt: now,
    };
    generated++;
    console.log(`ok (${(result.durationMs / 1000).toFixed(2)}s, ${Math.round(result.audio.length / 1024)} KiB)`);
  }

  if (generated > 0 || reused > 0) {
    const next = { lang: args.lang, generatedAt: new Date().toISOString(), clips: nextClips };
    await fs.writeFile(manifestPath, JSON.stringify(next, null, 2) + "\n", "utf8");
    console.log(`[tts] manifest: ${path.relative(ROOT, manifestPath)} (${Object.keys(nextClips).length} clips)`);
  }
  if (failures.length) {
    console.error(`[tts] ${failures.length} cue(s) failed; successful clips were kept. Re-run to resume.`);
    process.exitCode = 1;
  } else {
    console.log(`[tts] done: ${generated} generated, ${reused} reused.`);
  }
}

main().catch((err) => {
  console.error(`[tts] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
