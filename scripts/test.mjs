#!/usr/bin/env node
/**
 * Unit test runner: bundles every `src/**\/*.test.ts` with esbuild (platform node, ESM) into
 * `.tmp-tests/` and runs them with `node --test`. Pure-logic tests only (no DOM); browser-only
 * modules must be tested through small pure helpers.
 *
 *   npm test                -> all tests
 *   npm test -- lipsync     -> only files whose path contains "lipsync"
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".tmp-tests");
const filter = process.argv.slice(2).filter((a) => !a.startsWith("-"));

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/\.test\.(ts|mts)$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

const tests = walk(path.join(root, "src")).filter((p) => filter.length === 0 || filter.some((f) => p.includes(f)));
if (tests.length === 0) {
  console.log("[test] no *.test.ts files found" + (filter.length ? ` for filter ${filter.join(",")}` : ""));
  process.exit(0);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: tests,
  outdir: outDir,
  outbase: path.join(root, "src"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: "inline",
  outExtension: { ".js": ".mjs" },
  external: ["electron", "three", "@met4citizen/talkinghead"],
  logLevel: "warning",
  alias: { "@shared": path.join(root, "src/shared") },
});

const files = walk2(outDir);
console.log(`[test] running ${files.length} test file(s)`);
const res = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit", cwd: root });
process.exit(res.status ?? 1);

function walk2(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk2(p, acc);
    else if (p.endsWith(".test.mjs")) acc.push(p);
  }
  return acc;
}
