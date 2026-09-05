/**
 * R4 / B-07 (skeleton) — span mode: ONE window over all displays, ONE <video> decoded once and
 * drawn into one <canvas> per viewport (boot.viewports, from main/windows.ts), each with the
 * object-fit + yaw view of its screen (perspective.yawSourceRect).
 *
 *   - the <video> keeps decoding but is made invisible (opacity 0 — NOT display:none /
 *     visibility:hidden, which would stop requestVideoFrameCallback);
 *   - frames are copied with requestVideoFrameCallback (falls back to requestAnimationFrame);
 *   - the overlays (vignette, white-fade, entities, countdown, subtitles, avatar) are re-parented
 *     into a `#span-focus` box covering the viewport of the screen whose config has
 *     showAvatar/showSubtitles (else the centre screen);
 *   - one WS connection, with the centre screen id (index.ts passes boot.screen = centre).
 *
 * Known limits (skeleton): overlay sizes use vw/vh units, so on a 3-wide span they come out
 * ~3x too large (a per-viewport font scale is future work); the OSD / identify / error banner
 * stay window-level; every viewport shares the window DPR (mixed-DPI setups are approximated);
 * per-viewport playAudio is not split (audio comes from the centre screen's config). Tested with
 * one viewport; N viewports draw N times per frame (cheap: GPU->GPU drawImage).
 */

import type { ScreenConfig, SpanViewport } from "../shared/types";
import type { Logger } from "./log";
import { yawSourceRect, type Fit } from "./perspective";

export interface SpanOptions {
  stage: HTMLElement;
  video: HTMLVideoElement;
  viewports: SpanViewport[];
  screens: ScreenConfig[];
  fit: Fit;
  /** The screen the WS connection identifies as (boot.screen.id). */
  centerScreenId: string;
  /** Overlay layers to confine to the focus viewport. */
  overlays: HTMLElement[];
  log?: Logger;
}

export interface SpanController {
  start(): void;
  stop(): void;
  /** Re-fit canvases (window resize / DPR change). */
  refresh(): void;
  focusViewport(): SpanViewport | null;
  viewportCount(): number;
}

/** The viewport whose overlays are shown: the screen with showAvatar, else showSubtitles, else the centre, else the first. */
export function pickFocusViewport(viewports: readonly SpanViewport[], screens: readonly ScreenConfig[], centerScreenId: string): SpanViewport | null {
  if (!viewports.length) return null;
  const byId = new Map(screens.map((s) => [s.id, s] as const));
  const withAvatar = viewports.find((v) => byId.get(v.screenId)?.showAvatar);
  if (withAvatar) return withAvatar;
  const withSubs = viewports.find((v) => byId.get(v.screenId)?.showSubtitles);
  if (withSubs) return withSubs;
  return viewports.find((v) => v.screenId === centerScreenId) ?? viewports[0];
}

/** CSS placement of a viewport inside the single window (DIP = CSS px). */
export function viewportCss(v: SpanViewport): { left: string; top: string; width: string; height: string } {
  return { left: `${v.x}px`, top: `${v.y}px`, width: `${v.width}px`, height: `${v.height}px` };
}

/** Backing-store size for a viewport canvas (capped so a 4K x 5 span does not explode memory). */
export function canvasBacking(v: SpanViewport, dpr: number, maxSide = 4096): { width: number; height: number } {
  const k = Math.min(Math.max(1, dpr || 1), maxSide / Math.max(1, v.width, v.height));
  return { width: Math.max(1, Math.round(v.width * k)), height: Math.max(1, Math.round(v.height * k)) };
}

type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: unknown) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export function createSpan(opts: SpanOptions): SpanController {
  const log: Logger = opts.log ?? (() => undefined);
  const video = opts.video as RvfcVideo;
  const byId = new Map(opts.screens.map((s) => [s.id, s] as const));
  const canvases: Array<{ vp: SpanViewport; yaw: number; el: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null }> = [];
  let focusBox: HTMLElement | null = null;
  let running = false;
  let handle = 0;
  const hasRvfc = typeof video.requestVideoFrameCallback === "function";
  const focus = pickFocusViewport(opts.viewports, opts.screens, opts.centerScreenId);
  const originalParents: Array<{ el: HTMLElement; parent: Node | null; next: Node | null }> = [];

  const build = () => {
    for (const vp of opts.viewports) {
      const el = document.createElement("canvas");
      el.className = "span-canvas";
      Object.assign(el.style, viewportCss(vp), { position: "absolute", display: "block", background: "#000" });
      opts.stage.insertBefore(el, video.nextSibling);
      const yaw = byId.get(vp.screenId)?.yawOffsetDeg ?? 0;
      canvases.push({ vp, yaw, el, ctx: el.getContext("2d", { alpha: false }) });
    }
    if (focus) {
      focusBox = document.createElement("div");
      focusBox.id = "span-focus";
      Object.assign(focusBox.style, viewportCss(focus), { position: "absolute", overflow: "hidden", pointerEvents: "none" });
      opts.stage.appendChild(focusBox);
      for (const el of opts.overlays) {
        originalParents.push({ el, parent: el.parentNode, next: el.nextSibling });
        focusBox.appendChild(el);
      }
    }
    fit();
  };

  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    for (const c of canvases) {
      const b = canvasBacking(c.vp, dpr);
      if (c.el.width !== b.width || c.el.height !== b.height) {
        c.el.width = b.width;
        c.el.height = b.height;
      }
    }
  };

  const draw = () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!(vw > 0 && vh > 0) || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    for (const c of canvases) {
      if (!c.ctx) continue;
      const W = c.el.width;
      const H = c.el.height;
      const r = yawSourceRect(c.yaw, W, H, vw, vh, opts.fit);
      if (opts.fit === "contain") {
        c.ctx.fillStyle = "#000";
        c.ctx.fillRect(0, 0, W, H);
      }
      try {
        c.ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
      } catch {
        /* decoder not ready for this frame */
      }
    }
  };

  const loop = () => {
    if (!running) return;
    draw();
    if (hasRvfc) handle = video.requestVideoFrameCallback!(() => loop());
    else handle = requestAnimationFrame(loop);
  };

  return {
    start() {
      if (running) return;
      if (!canvases.length) build();
      running = true;
      video.classList.add("span-hidden");
      video.style.transform = ""; // yaw is done per canvas
      video.addEventListener("seeked", draw);
      video.addEventListener("loadeddata", draw);
      loop();
      log("info", `span: ${canvases.length} viewport(s), focus=${focus?.screenId ?? "—"}, rvfc=${hasRvfc}`);
    },
    stop() {
      running = false;
      if (handle) {
        if (hasRvfc) video.cancelVideoFrameCallback?.(handle);
        else cancelAnimationFrame(handle);
      }
      handle = 0;
      video.removeEventListener("seeked", draw);
      video.removeEventListener("loadeddata", draw);
      video.classList.remove("span-hidden");
      for (const c of canvases) c.el.remove();
      canvases.length = 0;
      for (const o of originalParents) o.parent?.insertBefore(o.el, o.next);
      originalParents.length = 0;
      focusBox?.remove();
      focusBox = null;
    },
    refresh() {
      fit();
      draw();
    },
    focusViewport: () => focus,
    viewportCount: () => opts.viewports.length,
  };
}
