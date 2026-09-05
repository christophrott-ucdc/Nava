#!/usr/bin/env node
/**
 * esbuild bundler for NavaPlayer.       node scripts/build.mjs [--watch] [--minify]
 *
 *   src/main/main.ts           -> dist/main/main.js          node/cjs, external: electron (+ ws optional natives)
 *   src/preload/preload.ts     -> dist/preload/preload.js    node/cjs, external: electron
 *   src/renderer/index.ts      -> dist/renderer/renderer.js  browser/iife (three + talkinghead bundled)
 *   src/web/control/index.ts   -> dist/web/control/app.js    browser/iife
 *   src/web/tablet/index.ts    -> dist/web/tablet/app.js     browser/iife
 *   + every non-TS file (index.html, *.css, images...) from src/renderer, src/web/control, src/web/tablet is
 *     copied to the matching dist folder; talkinghead's playback-worklet.js is copied next to renderer.js.
 *
 * Tolerant of missing entry points (other agents mid-work): those targets are skipped with a warning. If
 * src/server/index.ts is missing, dist/main/main.js gets a stub startServer() that throws a clear error.
 *
 * Path alias: `@shared/*` (tsconfig.json "paths") is resolved by esbuild natively — the root tsconfig is passed
 * via the `tsconfig` option, so both relative imports (`../shared/types`) and `@shared/types` work.
 *
 * Renderer specifics:
 *   - `alias: { three: "three" }` dedupes three.js: @met4citizen/talkinghead ships a nested three@0.180 while
 *     the project uses three@0.184; without the alias the bundle would contain two copies (instanceof bugs).
 *   - `import.meta.url` is not available in IIFE output; talkinghead evaluates
 *     `new URL('./playback-worklet.js', import.meta.url)` at module load, which would throw. We define it as
 *     the page URL (document.baseURI) so the worklet resolves to dist/renderer/playback-worklet.js.
 */
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = new Set(process.argv.slice(2));
const WATCH = argv.has("--watch");
const MINIFY = argv.has("--minify");
const TSCONFIG = path.join(ROOT, "tsconfig.json");

const abs = (...p) => path.join(ROOT, ...p);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

const NODE_ENV_DEFINE = { "process.env.NODE_ENV": '"production"' };
const WEB_TARGETS = ["es2020", "chrome90", "safari14", "firefox90"];

const state = { serverStubbed: false, failed: false };

// --------------------------------------------------------------------------------------------------
// Plugin: stub ../server/index when Agent D's module does not exist yet.
// --------------------------------------------------------------------------------------------------
function serverStubPlugin() {
  return {
    name: "nava-server-stub",
    setup(build) {
      build.onResolve({ filter: /^\.\.\/server\/index(\.ts|\.js)?$/ }, (args) => {
        const base = path.resolve(args.resolveDir, args.path.replace(/\.(ts|js)$/, ""));
        if ([".ts", ".js", ".mts", ".mjs"].some((ext) => fs.existsSync(base + ext))) return null; // normal resolution
        state.serverStubbed = true;
        return { path: `${base}.ts`, namespace: "nava-stub" };
      });
      build.onLoad({ filter: /.*/, namespace: "nava-stub" }, () => ({
        loader: "js",
        contents: `export async function startServer() {
  throw new Error("src/server/index.ts did not exist when dist/main/main.js was built - run: node scripts/build.mjs");
}`,
      }));
    },
  };
}

// --------------------------------------------------------------------------------------------------
// Targets
// --------------------------------------------------------------------------------------------------
const COMMON = {
  bundle: true,
  tsconfig: TSCONFIG,
  logLevel: "warning",
  color: true,
  minify: MINIFY,
  logOverride: {
    // talkinghead has a variable dynamic import() for lipsync modules; we import them statically instead.
    "unsupported-dynamic-import": "silent",
  },
};

const TARGETS = [
  { name: "web/wall", entry: abs("src/web/wall/index.ts"), outfile: abs("dist/web/wall/app.js"), options: { platform: "browser", format: "iife", target: WEB_TARGETS } },
  { name: "web/preview", entry: abs("src/web/shared/preview.ts"), outfile: abs("dist/web/shared/preview.js"), options: { platform: "browser", format: "iife", target: WEB_TARGETS } },
  {
    name: "main",
    entry: abs("src/main/main.ts"),
    outfile: abs("dist/main/main.js"),
    options: {
      platform: "node",
      format: "cjs",
      target: "node22",
      external: ["electron", "bufferutil", "utf-8-validate"],
      sourcemap: true,
      plugins: [serverStubPlugin()],
    },
  },
  {
    name: "preload",
    entry: abs("src/preload/preload.ts"),
    outfile: abs("dist/preload/preload.js"),
    options: { platform: "node", format: "cjs", target: "node22", external: ["electron"], sourcemap: true },
  },
  {
    name: "renderer",
    entry: abs("src/renderer/index.ts"),
    outfile: abs("dist/renderer/renderer.js"),
    options: {
      platform: "browser",
      format: "iife",
      target: "chrome130",
      define: { ...NODE_ENV_DEFINE, "import.meta.url": "__navaModuleUrl" },
      banner: { js: "var __navaModuleUrl = (typeof document !== 'undefined' && document.baseURI) || 'file:///';" },
      alias: { three: "three" },
      sourcemap: WATCH ? "linked" : false,
    },
  },
  {
    name: "web/control",
    entry: abs("src/web/control/index.ts"),
    outfile: abs("dist/web/control/app.js"),
    options: { platform: "browser", format: "iife", target: WEB_TARGETS, define: NODE_ENV_DEFINE, sourcemap: WATCH ? "linked" : false },
  },
  {
    name: "web/tablet",
    entry: abs("src/web/tablet/index.ts"),
    outfile: abs("dist/web/tablet/app.js"),
    options: { platform: "browser", format: "iife", target: WEB_TARGETS, define: NODE_ENV_DEFINE, sourcemap: WATCH ? "linked" : false },
  },
  // R4 web apps (orchestrator: login + debug; Agent D: analytics). Missing entries are skipped.
  ...["login", "debug", "analytics"].map((name) => ({
    name: `web/${name}`,
    entry: abs(`src/web/${name}/index.ts`),
    outfile: abs(`dist/web/${name}/app.js`),
    // optional: a missing entry is skipped (not a build failure) — analytics lands with package D-05.
    optional: true,
    options: { platform: "browser", format: "iife", target: WEB_TARGETS, define: NODE_ENV_DEFINE, sourcemap: WATCH ? "linked" : false },
  })),
];

/** Static (non-TS) files copied verbatim. */
const STATIC_DIRS = [
  { from: abs("src/web/wall"), to: abs("dist/web/wall") },
  { from: abs("src/web/shared"), to: abs("dist/web/shared") },
  { from: abs("src/web/shared"), to: abs("dist/renderer/shared") },
  { from: abs("src/renderer"), to: abs("dist/renderer") },
  { from: abs("src/web/control"), to: abs("dist/web/control") },
  { from: abs("src/web/tablet"), to: abs("dist/web/tablet") },
  { from: abs("src/web/login"), to: abs("dist/web/login") },
  { from: abs("src/web/debug"), to: abs("dist/web/debug") },
  { from: abs("src/web/analytics"), to: abs("dist/web/analytics") },
];
const STATIC_FILES = [
  {
    from: abs("node_modules/@met4citizen/talkinghead/modules/playback-worklet.js"),
    to: abs("dist/renderer/playback-worklet.js"),
  },
];
const SKIP_EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".md", ".map"]);

function isStaticFile(file) {
  const base = path.basename(file);
  return !base.startsWith(".") && !SKIP_EXT.has(path.extname(file).toLowerCase());
}

function copyDir(from, to, out) {
  if (!fs.existsSync(from)) return;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      copyDir(src, dst, out);
    } else if (entry.isFile() && isStaticFile(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      out.push(dst);
    }
  }
}

function copyStatic() {
  const copied = [];
  for (const { from, to } of STATIC_DIRS) copyDir(from, to, copied);
  for (const { from, to } of STATIC_FILES) {
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.push(to);
  }
  return copied;
}

// --------------------------------------------------------------------------------------------------
// One-shot build
// --------------------------------------------------------------------------------------------------
function buildOptions(t) {
  return { ...COMMON, ...t.options, entryPoints: [t.entry], outfile: t.outfile };
}

async function buildOnce(t) {
  if (!fs.existsSync(t.entry)) {
    if (t.optional) return { t, status: "skip" };
    state.failed = true;
    return { t, status: "fail", error: new Error(`required entry missing: ${rel(t.entry)}`) };
  }
  const started = performance.now();
  try {
    const result = await esbuild.build(buildOptions(t));
    return {
      t,
      status: "ok",
      ms: Math.round(performance.now() - started),
      bytes: fs.statSync(t.outfile).size,
      warnings: result.warnings.length,
    };
  } catch (err) {
    state.failed = true;
    return { t, status: "fail", error: err };
  }
}

function printRow(r) {
  const name = r.t.name.padEnd(12);
  const entry = rel(r.t.entry);
  if (r.status === "skip") {
    console.log(`  skip  ${name} ${entry} missing (not written yet) - skipped`);
  } else if (r.status === "fail") {
    console.log(`  FAIL  ${name} ${entry} -> see errors above`);
  } else {
    const warn = r.warnings ? `, ${r.warnings} warning(s)` : "";
    console.log(`  ok    ${name} ${entry} -> ${rel(r.t.outfile)}  (${kb(r.bytes)}, ${r.ms} ms${warn})`);
  }
}

function printFooter(copied) {
  const dirs = [...new Set(copied.map((f) => rel(path.dirname(f))))];
  console.log(`  copy  ${copied.length} static file(s)${dirs.length ? ` -> ${dirs.join(", ")}` : ""}`);
  if (state.serverStubbed) {
    console.log(
      "  note  src/server/index.ts missing -> dist/main/main.js contains a STUB startServer() that throws; rebuild once it exists",
    );
  }
}

async function runOnce() {
  console.log(`[nava build] esbuild ${esbuild.version} - minify=${MINIFY ? "on" : "off"}`);
  const requiredStatic = [
    abs("src/renderer/index.html"),
    abs("src/renderer/styles.css"),
    abs("src/web/control/index.html"),
    abs("src/web/control/styles.css"),
    abs("src/web/tablet/index.html"),
    abs("src/web/tablet/styles.css"),
    ...STATIC_FILES.map((f) => f.from),
  ];
  for (const file of requiredStatic) {
    if (!fs.existsSync(file)) {
      state.failed = true;
      console.error(`  FAIL  required runtime file missing: ${rel(file)}`);
    }
  }
  const results = [];
  for (const t of TARGETS) {
    const r = await buildOnce(t);
    printRow(r);
    results.push(r);
  }
  printFooter(copyStatic());
  if (state.serverStubbed) state.failed = true;
  if (state.failed) {
    console.error("[nava build] FAILED");
    process.exit(1);
  }
}

// --------------------------------------------------------------------------------------------------
// Watch mode
// --------------------------------------------------------------------------------------------------
async function runWatch() {
  console.log(`[nava build] esbuild ${esbuild.version} - watch mode (Ctrl+C to stop)`);
  const contexts = new Map();

  const startContext = async (t) => {
    const reportPlugin = {
      name: "nava-report",
      setup(build) {
        let started = 0;
        build.onStart(() => {
          started = performance.now();
        });
        build.onEnd((result) => {
          const ms = Math.round(performance.now() - started);
          if (result.errors.length) console.log(`  FAIL  ${t.name.padEnd(12)} ${result.errors.length} error(s)`);
          else {
            const bytes = fs.existsSync(t.outfile) ? fs.statSync(t.outfile).size : 0;
            console.log(`  ok    ${t.name.padEnd(12)} -> ${rel(t.outfile)}  (${kb(bytes)}, ${ms} ms)`);
          }
        });
      },
    };
    const opts = buildOptions(t);
    opts.plugins = [...(opts.plugins ?? []), reportPlugin];
    const ctx = await esbuild.context(opts);
    contexts.set(t.name, ctx);
    await ctx.watch();
  };

  for (const t of TARGETS) {
    if (fs.existsSync(t.entry)) await startContext(t);
    else console.log(`  skip  ${t.name.padEnd(12)} ${rel(t.entry)} missing - will start watching when it appears`);
  }
  printFooter(copyStatic());

  // Entries that appear later (other agents writing their folders).
  setInterval(() => {
    for (const t of TARGETS) {
      if (!contexts.has(t.name) && fs.existsSync(t.entry)) {
        console.log(`  new   ${t.name.padEnd(12)} ${rel(t.entry)} appeared -> building`);
        startContext(t).catch((err) => console.error(`  FAIL  ${t.name}: ${err.message}`));
      }
    }
  }, 2000).unref();

  // Static files: re-copy on any change under src/ (debounced).
  let timer = null;
  const srcDir = abs("src");
  if (fs.existsSync(srcDir)) {
    fs.watch(srcDir, { recursive: true }, (_event, file) => {
      if (file && !isStaticFile(String(file))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const copied = copyStatic();
        console.log(`  copy  ${copied.length} static file(s) re-copied`);
      }, 200);
    });
  }

  const stop = async () => {
    console.log("\n[nava build] stopping watchers");
    await Promise.all([...contexts.values()].map((ctx) => ctx.dispose()));
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (WATCH) {
  runWatch().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  runOnce().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
