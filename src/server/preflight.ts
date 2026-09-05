/**
 * Preflight: verifies, before a show, that every production asset the timeline needs is present:
 *   - every `voice` cue has a clip in assets/voice/<lang>/manifest.json, the file exists, has size, duration, words
 *   - the film exists and has size
 *   - the avatar GLB exists
 * Result is exposed on /api/debug/summary, drives Readiness.assetsOk (server/state.ts via provider) and is logged.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppConfig, Lang, ShowFile, VoiceManifest } from "../shared/types";
import type { LogFn } from "./runlog";

export interface PreflightIssue {
  cueId: string;
  problem: "missing-clip" | "missing-file" | "empty-file" | "no-duration" | "no-words" | "variant-missing";
  detail?: string;
}

export interface PreflightResult {
  ok: boolean;
  checkedAt: string;
  lang: Lang;
  variant: string | null;
  durationMs: number;
  assetsDir: string | null;
  voice: { total: number; ok: number; withVisemes: number; issues: PreflightIssue[]; manifestPath: string | null };
  video: { path: string; exists: boolean; bytes: number };
  avatar: { path: string; exists: boolean; bytes: number };
  reasons: string[];
}

export interface PreflightDeps {
  appRoot: string;
  config: AppConfig;
  log: LogFn;
}

function candidatesFor(appRoot: string, rel: string): string[] {
  const out = [path.resolve(appRoot, rel)];
  if (typeof process.resourcesPath === "string") out.push(path.resolve(process.resourcesPath, rel));
  return out;
}

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function statSize(p: string | null): Promise<{ exists: boolean; bytes: number }> {
  if (!p) return { exists: false, bytes: 0 };
  try {
    const st = await fs.stat(p);
    return { exists: st.isFile(), bytes: st.size };
  } catch {
    return { exists: false, bytes: 0 };
  }
}

export async function runPreflight(show: ShowFile, lang: Lang, variant: string | null, deps: PreflightDeps): Promise<PreflightResult> {
  const t0 = Date.now();
  const reasons: string[] = [];
  const issues: PreflightIssue[] = [];

  const voiceRoot=show.scenario?.voiceRoot??'assets/voice';
  const manifestPath = await firstExisting(candidatesFor(deps.appRoot, path.join(voiceRoot, lang, "manifest.json")));
  const assetsDir = manifestPath ? path.dirname(path.dirname(path.dirname(manifestPath))) : null;
  let manifest: VoiceManifest | null = null;
  if (manifestPath) {
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as VoiceManifest;
    } catch (err) {
      reasons.push(`manifest ${lang} ilizibil: ${String(err)}`);
    }
  } else {
    reasons.push(`lipsește assets/voice/${lang}/manifest.json`);
  }

  const voiceCues = show.cues.filter((c) => c.kind === "voice");
  let okCount = 0;
  let withVisemes = 0;
  if (manifest) {
    const dir = path.dirname(manifestPath as string);
    for (const cue of voiceCues) {
      const keys = variant ? [`${cue.id}.${variant}`, cue.id] : [cue.id];
      let clip = null as VoiceManifest["clips"][string] | null;
      for (const k of keys) {
        if (manifest.clips[k]) {
          clip = manifest.clips[k];
          if (variant && k === cue.id && cue.kind === "voice" && cue.variants?.[variant]) {
            issues.push({ cueId: cue.id, problem: "variant-missing", detail: `varianta ${variant} nu are audio; se folosește baza` });
          }
          break;
        }
      }
      if (!clip) {
        issues.push({ cueId: cue.id, problem: "missing-clip" });
        continue;
      }
      const filePath = path.join(dir, clip.file);
      const st = await statSize(filePath);
      if (!st.exists) {
        issues.push({ cueId: cue.id, problem: "missing-file", detail: clip.file });
        continue;
      }
      if (st.bytes < 1024) {
        issues.push({ cueId: cue.id, problem: "empty-file", detail: `${st.bytes} B` });
        continue;
      }
      if (!(clip.durationMs > 0)) {
        issues.push({ cueId: cue.id, problem: "no-duration" });
        continue;
      }
      if (!Array.isArray(clip.words) || clip.words.length === 0) {
        issues.push({ cueId: cue.id, problem: "no-words" });
        continue;
      }
      if (Array.isArray(clip.visemes) && clip.visemes.length > 0) withVisemes += 1;
      okCount += 1;
    }
  }
  const hardIssues = issues.filter((i) => i.problem !== "variant-missing");
  if (hardIssues.length > 0) reasons.push(`${hardIssues.length} replici fără audio valid (${hardIssues.slice(0, 5).map((i) => i.cueId).join(", ")}${hardIssues.length > 5 ? "…" : ""})`);

  const videoPath = (await firstExisting(candidatesFor(deps.appRoot, deps.config.video.path))) ?? path.resolve(deps.appRoot, deps.config.video.path);
  const video = await statSize(videoPath);
  if (!video.exists || video.bytes === 0) reasons.push(`filmul lipsește: ${deps.config.video.path}`);

  const avatarPath = (await firstExisting(candidatesFor(deps.appRoot, deps.config.avatar.glb))) ?? path.resolve(deps.appRoot, deps.config.avatar.glb);
  const avatar = await statSize(avatarPath);
  if (!avatar.exists || avatar.bytes === 0) reasons.push(`avatarul GLB lipsește: ${deps.config.avatar.glb}`);

  const result: PreflightResult = {
    ok: reasons.length === 0,
    checkedAt: new Date().toISOString(),
    lang,
    variant,
    durationMs: Date.now() - t0,
    assetsDir,
    voice: { total: voiceCues.length, ok: okCount, withVisemes, issues, manifestPath },
    video: { path: videoPath, ...video },
    avatar: { path: avatarPath, ...avatar },
    reasons,
  };
  deps.log(result.ok ? "info" : "warn", `preflight ${result.ok ? "OK" : "PROBLEME"}: voci ${okCount}/${voiceCues.length}, viseme ${withVisemes}`, {
    reasons,
    issues: hardIssues.slice(0, 20),
  });
  return result;
}
