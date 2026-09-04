/**
 * Where things live, in development vs. packaged:
 *
 *                     development (electron .)          packaged (NavaPlayer.exe)
 *   appRoot           project root (cwd if it holds     dirname(exe); portable build: PORTABLE_EXECUTABLE_DIR
 *                     package.json+src|dist, else       (electron-builder extracts the portable exe to %TEMP%,
 *                     app.getAppPath())                  so execPath would point to the wrong folder)
 *   resourcesRoot     = appRoot                         process.resourcesPath (…/resources) — bundled assets/**
 *   distRoot          appRoot/dist                      app.getAppPath()/dist  (inside resources/app.asar)
 *
 *   config.json, .env, media/, runs/, cache/  -> appRoot (next to the exe)
 *   assets/**                                 -> tried in appRoot first (user override), then resourcesRoot
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface AppPaths {
  isPackaged: boolean;
  appRoot: string;
  resourcesRoot: string;
  distRoot: string;
  rendererHtml: string;
  preloadJs: string;
  /** dist/web (control/ + tablet/) — served by the Hono server. */
  webDir: string;
  runsDir: string;
  cacheDir: string;
}

function looksLikeProjectRoot(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "package.json")) &&
    (fs.existsSync(path.join(dir, "src")) || fs.existsSync(path.join(dir, "dist")))
  );
}

export function computePaths(): AppPaths {
  const isPackaged = app.isPackaged;
  const appPath = app.getAppPath(); // dev: project root; packaged: .../resources/app.asar

  let appRoot: string;
  if (isPackaged) {
    appRoot = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  } else {
    const cwd = process.cwd();
    appRoot = looksLikeProjectRoot(cwd) ? cwd : appPath;
  }
  const resourcesRoot = isPackaged ? process.resourcesPath : appRoot;
  const distRoot = path.join(isPackaged ? appPath : appRoot, "dist");

  // If dist/web was unpacked from the asar (electron-builder asarUnpack), prefer the real files.
  const unpacked = appPath.endsWith(".asar") ? `${appPath}.unpacked` : null;
  const webDir =
    unpacked && fs.existsSync(path.join(unpacked, "dist", "web"))
      ? path.join(unpacked, "dist", "web")
      : path.join(distRoot, "web");

  return {
    isPackaged,
    appRoot,
    resourcesRoot,
    distRoot,
    rendererHtml: path.join(distRoot, "renderer", "index.html"),
    preloadJs: path.join(distRoot, "preload", "preload.js"),
    webDir,
    runsDir: path.join(appRoot, "runs"),
    cacheDir: path.join(appRoot, "cache"),
  };
}

export interface ResolvedPath {
  abs: string;
  exists: boolean;
  source: "absolute" | "appRoot" | "resources" | "missing";
}

/**
 * Resolves a config-relative path ("assets/...", "media/...", or absolute):
 * appRoot first (lets a portable install override bundled assets), then resourcesRoot.
 * When nothing exists, returns appRoot/<p> with exists=false so callers can log a useful message.
 */
export function resolveConfigPath(p: string, paths: Pick<AppPaths, "appRoot" | "resourcesRoot">): ResolvedPath {
  if (path.isAbsolute(p)) return { abs: path.normalize(p), exists: fs.existsSync(p), source: "absolute" };
  const inApp = path.join(paths.appRoot, p);
  if (fs.existsSync(inApp)) return { abs: inApp, exists: true, source: "appRoot" };
  const inRes = path.join(paths.resourcesRoot, p);
  if (fs.existsSync(inRes)) return { abs: inRes, exists: true, source: "resources" };
  return { abs: inApp, exists: false, source: "missing" };
}

/** Windows-safe: C:\x\y.mp4 -> file:///C:/x/y.mp4 (spaces, '#', '?' percent-encoded). */
export function toFileUrl(absPath: string): string {
  return pathToFileURL(absPath).href;
}

/** Directory variant, always with a trailing slash: file:///C:/x/assets/voice/ */
export function toDirFileUrl(absDir: string): string {
  const href = pathToFileURL(absDir).href;
  return href.endsWith("/") ? href : `${href}/`;
}
