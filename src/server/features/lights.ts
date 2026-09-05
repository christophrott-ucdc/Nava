/**
 * D-08 — schelet adaptor lumini de sala. Aplica o "scena" de culoare per tema (SceneTheme) prin:
 *   - none   : doar log (implicit);
 *   - artnet : pachete Art-Net ArtDmx (UDP, port 6454) catre `host`, universul `universe`, 512 canale;
 *              fiecare fixture RGB ocupa 3 canale consecutive (1-3, 4-6, ...) si primeste aceeasi culoare;
 *              fade prin pasi la 25 fps de la culoarea curenta la tinta;
 *   - hue    : Philips Hue REST `PUT http://<host>/api/<hueUser>/groups/<groupId>/action` cu xy/bri,
 *              `transitiontime` in zecimi de secunda, fetch cu timeout 2 s.
 *
 * Apelat de director prin hook-ul `onLights(theme, fadeSec, source)`: cue `lights`, cue `theme` (urmarirea
 * scenelor) si comanda `lights`. Nu arunca niciodata; erorile merg in log.
 */

import { createSocket, type Socket } from "node:dgram";
import type { LightsConfig, SceneTheme } from "../../shared/types";
import type { LogFn } from "../runlog";

export type Rgb = readonly [number, number, number];

export interface LightsAdapter {
  readonly driver: LightsConfig["driver"];
  /** Aplica tema (cu fade optional, secunde). Sincron; lucrul in retea este asincron si nu arunca. */
  apply(theme: SceneTheme, fadeSec?: number, source?: string): void;
  /** Starea curenta (pentru /debug). */
  status(): { driver: LightsConfig["driver"]; theme: SceneTheme | null; rgb: Rgb; target: Rgb; fading: boolean; lastError: string | null; sent: number };
  close(): void;
}

/** Culoarea RGB (0..255) a fiecarei teme — aceeasi paleta ca temele ecranelor/tabletelor. */
export const THEME_RGB: Record<SceneTheme, Rgb> = {
  prologue: [20, 60, 140],
  launch: [90, 150, 255],
  light: [255, 190, 70],
  nature: [60, 200, 110],
  tech: [70, 170, 220],
  void: [70, 20, 120],
  home: [40, 120, 230],
  white: [255, 235, 200],
};

/** Hue CIE xy + brightness (0..254) per tema. */
export const THEME_HUE: Record<SceneTheme, { xy: [number, number]; bri: number }> = {
  prologue: { xy: [0.16, 0.1], bri: 90 },
  launch: { xy: [0.17, 0.2], bri: 200 },
  light: { xy: [0.5, 0.42], bri: 254 },
  nature: { xy: [0.3, 0.6], bri: 180 },
  tech: { xy: [0.19, 0.28], bri: 200 },
  void: { xy: [0.22, 0.09], bri: 70 },
  home: { xy: [0.18, 0.18], bri: 190 },
  white: { xy: [0.4, 0.38], bri: 254 },
};

export const ARTNET_PORT = 6454;
const ARTNET_CHANNELS = 512;
const FADE_FPS = 25;
const HUE_TIMEOUT_MS = 2000;
const DEFAULT_FADE_SEC = 1.5;

/** Un pachet ArtDmx (OpCode 0x5000, ProtVer 14) cu `data` (max 512 canale). */
export function artnetDmxPacket(universe: number, data: Uint8Array, sequence = 0): Buffer {
  const length = Math.min(ARTNET_CHANNELS, Math.max(2, data.length + (data.length % 2)));
  const buf = Buffer.alloc(18 + length);
  buf.write("Art-Net\0", 0, "ascii");
  buf.writeUInt16LE(0x5000, 8); // OpDmx (little-endian)
  buf.writeUInt16BE(14, 10); // protocol version
  buf[12] = sequence & 0xff;
  buf[13] = 0; // physical port
  buf[14] = universe & 0xff; // SubUni
  buf[15] = (universe >> 8) & 0x7f; // Net
  buf.writeUInt16BE(length, 16);
  buf.set(data.subarray(0, length), 18);
  return buf;
}

/** Umple 510 canale cu aceeasi culoare RGB (170 fixture-uri × 3 canale). */
export function rgbFrame(rgb: Rgb): Uint8Array {
  const out = new Uint8Array(ARTNET_CHANNELS);
  for (let ch = 0; ch + 2 < ARTNET_CHANNELS; ch += 3) {
    out[ch] = rgb[0];
    out[ch + 1] = rgb[1];
    out[ch + 2] = rgb[2];
  }
  return out;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}

export function createLightsAdapter(config: LightsConfig | undefined, log: LogFn): LightsAdapter {
  const cfg: LightsConfig = { driver: "none", ...(config ?? {}) };
  const driver = cfg.driver === "artnet" || cfg.driver === "hue" ? cfg.driver : "none";
  let theme: SceneTheme | null = null;
  let current: Rgb = [0, 0, 0];
  let target: Rgb = [0, 0, 0];
  let fadeTimer: ReturnType<typeof setInterval> | null = null;
  let lastError: string | null = null;
  let sent = 0;
  let sequence = 0;
  let socket: Socket | null = null;
  let closed = false;

  if (driver !== "none" && !cfg.host) {
    log("warn", `lights: driver ${driver} fără \`host\` — adaptorul rămâne pasiv`, { config: cfg });
  }

  const stopFade = (): void => {
    if (fadeTimer) clearInterval(fadeTimer);
    fadeTimer = null;
  };

  const udp = (): Socket | null => {
    if (socket || closed) return socket;
    try {
      socket = createSocket("udp4");
      socket.on("error", (err) => {
        lastError = String(err);
        log("warn", "lights: artnet socket error", { err: lastError });
      });
      socket.unref();
    } catch (err) {
      lastError = String(err);
      log("warn", "lights: cannot open udp socket", { err: lastError });
      socket = null;
    }
    return socket;
  };

  const sendArtnet = (rgb: Rgb): void => {
    const s = udp();
    if (!s || !cfg.host) return;
    sequence = (sequence + 1) & 0xff || 1;
    const packet = artnetDmxPacket(cfg.universe ?? 0, rgbFrame(rgb), sequence);
    try {
      s.send(packet, 0, packet.length, ARTNET_PORT, cfg.host, (err) => {
        if (err) {
          lastError = String(err);
          log("warn", "lights: artnet send failed", { err: lastError });
        } else sent += 1;
      });
    } catch (err) {
      lastError = String(err);
    }
  };

  const fadeArtnet = (to: Rgb, fadeSec: number): void => {
    stopFade();
    const from = current;
    const steps = Math.max(1, Math.round(fadeSec * FADE_FPS));
    let step = 0;
    const tick = (): void => {
      step += 1;
      current = mixRgb(from, to, step / steps);
      sendArtnet(current);
      if (step >= steps) {
        stopFade();
        // Repeat the final frame once so a lost UDP packet does not leave the rig mid-fade.
        sendArtnet(current);
      }
    };
    if (steps <= 1) {
      tick();
      return;
    }
    fadeTimer = setInterval(tick, Math.round(1000 / FADE_FPS));
    fadeTimer.unref?.();
  };

  const sendHue = (t: SceneTheme, fadeSec: number): void => {
    if (!cfg.host || !cfg.hueUser || !cfg.groupId) {
      lastError = "hue: host/hueUser/groupId lipsă";
      log("warn", "lights: hue not configured", { host: cfg.host, hueUser: !!cfg.hueUser, groupId: cfg.groupId });
      return;
    }
    const url = `http://${cfg.host}/api/${encodeURIComponent(cfg.hueUser)}/groups/${encodeURIComponent(cfg.groupId)}/action`;
    const body = { on: true, xy: THEME_HUE[t].xy, bri: THEME_HUE[t].bri, transitiontime: Math.round(fadeSec * 10) };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), HUE_TIMEOUT_MS);
    void fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sent += 1;
        lastError = null;
        current = THEME_RGB[t];
      })
      .catch((err: unknown) => {
        lastError = String(err);
        log("warn", "lights: hue request failed", { err: lastError, url });
      })
      .finally(() => clearTimeout(timer));
  };

  return {
    driver,
    apply(t, fadeSec = DEFAULT_FADE_SEC, source = "cue") {
      if (closed) return;
      const fade = Number.isFinite(fadeSec) && fadeSec! >= 0 ? fadeSec! : DEFAULT_FADE_SEC;
      theme = t;
      target = THEME_RGB[t] ?? THEME_RGB.prologue;
      log("info", `lights: ${t} (${driver}, fade ${fade}s, ${source})`, { rgb: target });
      switch (driver) {
        case "artnet":
          fadeArtnet(target, fade);
          break;
        case "hue":
          sendHue(t, fade);
          break;
        default:
          current = target;
      }
    },
    status() {
      return { driver, theme, rgb: current, target, fading: fadeTimer !== null, lastError, sent };
    },
    close() {
      closed = true;
      stopFade();
      try {
        socket?.close();
      } catch {
        /* already closed */
      }
      socket = null;
    },
  };
}
