/**
 * Side-screen perspective (R4 / B-05, B-07) — pure math, unit-tested in perspective.test.ts.
 *
 * APPROXIMATION (a true reprojection of the film onto angled windows is future work):
 * the film is rendered with a horizontal FOV of FILM_HFOV_DEG (50 deg). A screen rotated by
 * `yawOffsetDeg` around the cockpit's vertical axis shows the film shifted horizontally by
 *   shift = (yawOffsetDeg / 50) x displayedVideoWidth, clamped to +/-40 % of that width,
 * and zoomed so that no black edge appears. For the CSS path (`transform` on the <video>) the
 * zoom that closes the gap is scale = 1 + 2|shift| / elementWidth (a shift of s px opens an
 * s px gap on one side; scaling about the centre grows each side by (scale-1) x W/2).
 * For the span/canvas path the same view is expressed as a source rectangle of the video.
 */

export const FILM_HFOV_DEG = 50;
export const MAX_YAW_SHIFT_FRACTION = 0.4;

export type Fit = "cover" | "contain";

export interface DisplayedVideo {
  /** Scale from video pixels to element/viewport pixels after object-fit. */
  scale: number;
  displayedWidth: number;
  displayedHeight: number;
}

export function displayedVideo(elW: number, elH: number, videoW: number, videoH: number, fit: Fit): DisplayedVideo {
  if (!(elW > 0 && elH > 0 && videoW > 0 && videoH > 0)) return { scale: 1, displayedWidth: elW, displayedHeight: elH };
  const scale = fit === "contain" ? Math.min(elW / videoW, elH / videoH) : Math.max(elW / videoW, elH / videoH);
  return { scale, displayedWidth: videoW * scale, displayedHeight: videoH * scale };
}

export interface YawTransform {
  /** translateX in element px (negative = content moves left = screen looks to the right). */
  translateX: number;
  scale: number;
  /** Shift actually applied (element px, signed) after clamping. */
  shiftPx: number;
  clamped: boolean;
  /** CSS value for `transform` ("" when yaw is zero). */
  css: string;
}

/** CSS transform for a single-window side screen. */
export function yawTransform(yawDeg: number, elW: number, elH: number, videoW: number, videoH: number, fit: Fit): YawTransform {
  const yaw = Number.isFinite(yawDeg) ? yawDeg : 0;
  if (Math.abs(yaw) < 1e-6 || !(elW > 0)) return { translateX: 0, scale: 1, shiftPx: 0, clamped: false, css: "" };
  const { displayedWidth } = displayedVideo(elW, elH, videoW, videoH, fit);
  const raw = (yaw / FILM_HFOV_DEG) * displayedWidth;
  const max = MAX_YAW_SHIFT_FRACTION * displayedWidth;
  const shift = Math.max(-max, Math.min(max, raw));
  const scale = 1 + (2 * Math.abs(shift)) / elW;
  const translateX = -shift;
  return {
    translateX,
    scale,
    shiftPx: shift,
    clamped: Math.abs(raw) > max + 1e-9,
    css: `translateX(${translateX.toFixed(2)}px) scale(${scale.toFixed(4)})`,
  };
}

export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** Zoom applied to realise the yaw shift without black edges (1 = none). */
  zoom: number;
  clamped: boolean;
}

/**
 * drawImage() rectangles for one span viewport: object-fit (cover/contain) + the same yaw view as
 * `yawTransform`, expressed as a crop of the video. The crop stays inside the object-fit window, so
 * cover never shows black; contain keeps its usual letter/pillar-box.
 */
export function yawSourceRect(yawDeg: number, vpW: number, vpH: number, videoW: number, videoH: number, fit: Fit): SourceRect {
  const none: SourceRect = { sx: 0, sy: 0, sw: videoW, sh: videoH, dx: 0, dy: 0, dw: vpW, dh: vpH, zoom: 1, clamped: false };
  if (!(vpW > 0 && vpH > 0 && videoW > 0 && videoH > 0)) return none;
  const { scale } = displayedVideo(vpW, vpH, videoW, videoH, fit);
  // Base window (no yaw) in source pixels.
  let sw: number;
  let sh: number;
  let dx = 0;
  let dy = 0;
  let dw = vpW;
  let dh = vpH;
  if (fit === "contain") {
    sw = videoW;
    sh = videoH;
    dw = videoW * scale;
    dh = videoH * scale;
    dx = (vpW - dw) / 2;
    dy = (vpH - dh) / 2;
  } else {
    sw = vpW / scale;
    sh = vpH / scale;
  }
  const cx = videoW / 2;
  const cy = videoH / 2;
  const yaw = Number.isFinite(yawDeg) ? yawDeg : 0;
  const raw = (yaw / FILM_HFOV_DEG) * videoW;
  const max = MAX_YAW_SHIFT_FRACTION * videoW;
  const shift = Math.max(-max, Math.min(max, raw));
  // Same zoom law as the CSS path: window shrinks by k, its centre moves by shift/k, and the far
  // edge lands exactly on the base window's edge (no black).
  const k = Math.abs(shift) < 1e-9 ? 1 : 1 + (2 * Math.abs(shift)) / sw;
  const w = sw / k;
  const h = sh / k;
  let sx = cx + shift / k - w / 2;
  let sy = cy - h / 2;
  // Numerical safety: keep inside the video.
  sx = Math.max(0, Math.min(videoW - w, sx));
  sy = Math.max(0, Math.min(videoH - h, sy));
  return { sx, sy, sw: w, sh: h, dx, dy, dw, dh, zoom: k, clamped: Math.abs(raw) > max + 1e-9 };
}
