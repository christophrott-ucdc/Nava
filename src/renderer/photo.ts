/**
 * R4 / B-09 (skeleton) — crew photo. The SERVER drives the flow with `photo` messages:
 *   countdown  -> big digits (countdownSec..1) in an overlay
 *   capture    -> ONLY the capturing screen (clock source / "center") opens the webcam,
 *                 grabs one frame, scales it to <= MAX_PHOTO_PX, JPEG dataURL, sends `photoCaptured`
 *   show       -> every screen displays `dataUrl` for `showSec` seconds
 *   hide       -> overlay off
 * Without a camera (or permission refused) nothing crashes: a warning is logged, the countdown
 * simply ends and the server never receives a photo.
 */

import type { PhotoCapturedMsg, PhotoMsg } from "../shared/protocol";
import type { Logger } from "./log";

export const MAX_PHOTO_PX = 1280;
export const JPEG_QUALITY = 0.82;

export interface PhotoController {
  handle(msg: PhotoMsg): void;
  /** Remember the cue that asked for the photo (timeline `photo` cue) so `photoCaptured` carries it. */
  setCueId(cueId: string | null): void;
  dispose(): void;
}

/** Scale (w,h) so that the larger side is <= max, never upscaling. Integers. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (!(w > 0 && h > 0)) return { width: 0, height: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

export function createPhoto(opts: {
  root: HTMLElement;
  /** Only the centre screen opens the webcam. */
  canCapture: boolean;
  send: (msg: PhotoCapturedMsg) => void;
  log?: Logger;
}): PhotoController {
  const log: Logger = opts.log ?? (() => undefined);
  const layer = document.createElement("div");
  layer.id = "photo";
  layer.className = "layer";
  layer.hidden = true;
  layer.setAttribute("aria-hidden", "true");
  const digit = document.createElement("div");
  digit.className = "photo-digit";
  const flash = document.createElement("div");
  flash.className = "photo-flash";
  const img = document.createElement("img");
  img.className = "photo-img";
  img.alt = "";
  img.hidden = true;
  layer.append(digit, img, flash);
  opts.root.appendChild(layer);

  let cueId: string | null = null;
  let countdownTimers: number[] = [];
  let hideTimer: number | null = null;
  let capturing = false;

  const clearCountdown = () => {
    for (const t of countdownTimers) window.clearTimeout(t);
    countdownTimers = [];
    digit.textContent = "";
    digit.classList.remove("on");
  };

  const hide = () => {
    clearCountdown();
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    hideTimer = null;
    img.hidden = true;
    img.removeAttribute("src");
    layer.hidden = true;
  };

  const countdown = (sec: number) => {
    clearCountdown();
    layer.hidden = false;
    const n = Math.max(1, Math.min(10, Math.round(sec)));
    for (let i = 0; i < n; i++) {
      countdownTimers.push(
        window.setTimeout(() => {
          digit.textContent = String(n - i);
          digit.classList.remove("on");
          void digit.offsetWidth;
          digit.classList.add("on");
        }, i * 1000),
      );
    }
    countdownTimers.push(window.setTimeout(() => clearCountdown(), n * 1000));
  };

  const doFlash = () => {
    layer.hidden = false;
    flash.classList.remove("on");
    void flash.offsetWidth;
    flash.classList.add("on");
    window.setTimeout(() => flash.classList.remove("on"), 700);
  };

  const capture = async () => {
    clearCountdown();
    doFlash();
    if (!opts.canCapture || capturing) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      log("warn", "photo: getUserMedia indisponibil — fără cameră");
      return;
    }
    capturing = true;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
      const cam = document.createElement("video");
      cam.muted = true;
      cam.playsInline = true;
      cam.srcObject = stream;
      await new Promise<void>((resolve, reject) => {
        const t = window.setTimeout(() => reject(new Error("camera timeout")), 4000);
        cam.onloadedmetadata = () => {
          window.clearTimeout(t);
          resolve();
        };
        cam.onerror = () => {
          window.clearTimeout(t);
          reject(new Error("camera error"));
        };
      });
      await cam.play().catch(() => undefined);
      // Let auto-exposure settle for a moment.
      await new Promise((r) => window.setTimeout(r, 350));
      const { width, height } = fitWithin(cam.videoWidth || 1280, cam.videoHeight || 720, MAX_PHOTO_PX);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2d indisponibil");
      ctx.drawImage(cam, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      cam.pause();
      cam.srcObject = null;
      log("info", `photo: captură ${width}x${height} (${Math.round(dataUrl.length / 1024)} kB)`);
      opts.send({ type: "photoCaptured", cueId, dataUrl });
    } catch (err) {
      log("warn", `photo: captura a eșuat — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      for (const t of stream?.getTracks() ?? []) t.stop();
      capturing = false;
    }
  };

  const show = (dataUrl: string | undefined, showSec: number | undefined) => {
    clearCountdown();
    if (!dataUrl || !/^data:image\/(jpeg|png);base64,/.test(dataUrl)) {
      log("warn", "photo: dataUrl invalid la show");
      return;
    }
    img.src = dataUrl;
    img.hidden = false;
    layer.hidden = false;
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    const sec = Number.isFinite(showSec) && (showSec as number) > 0 ? (showSec as number) : 8;
    hideTimer = window.setTimeout(hide, sec * 1000);
  };

  return {
    handle(msg) {
      try {
        switch (msg.action) {
          case "countdown":
            countdown(msg.countdownSec ?? 3);
            break;
          case "capture":
            void capture();
            break;
          case "show":
            show(msg.dataUrl, msg.showSec);
            break;
          case "hide":
            hide();
            break;
          default:
            break;
        }
      } catch (err) {
        log("warn", `photo: ${msg.action} a eșuat — ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    setCueId(id) {
      cueId = id;
    },
    dispose() {
      hide();
      layer.remove();
    },
  };
}
