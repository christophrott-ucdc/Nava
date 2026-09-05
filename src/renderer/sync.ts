/**
 * WebSocket client to the master server (ws://host:port/ws).
 *   - `hello` on connect (client "screen", isClockSource for the master's first screen)
 *   - clock-source screen: sends `report` at config.sync.clockHz
 *   - other screens: on `clock` compute the expected phaseTime and correct drift
 *     (seek if |drift| > seekThresholdSec, else playbackRate 1 ± rateNudge)
 *   - ALL screens apply commands only via `applyCmd` (the server is the authority)
 *   - auto-reconnect with capped exponential backoff.
 */

import type { ClientMessage, PhotoMsg, ServerMessage, WelcomeMsg } from "../shared/protocol";
import type { PerfSample } from "../shared/types";
import { describeError, type Logger } from "./log";
import type { Player } from "./player";

export interface SyncOptions {
  wsUrl: string;
  screenId: string;
  screenName?: string;
  /** R4 — `security.screenToken` from boot; sent in `hello` (server closes 4401 without it when configured). */
  screenToken?: string;
  isClockSource: boolean;
  clockHz: number;
  seekThresholdSec: number;
  rateNudge: number;
  player: Player;
  log: Logger;
  onWelcome?: (msg: WelcomeMsg) => void;
  onStatus?: (status: SyncStatus) => void;
  /** R4 / B-09 — `photo` messages (countdown / capture / show / hide) go to photo.ts. */
  onPhoto?: (msg: PhotoMsg) => void;
}

export interface SyncStatus {
  connected: boolean;
  reconnecting: boolean;
  /** Last measured drift (expected - local) in seconds; null on the clock source / before the first clock. */
  driftSec: number | null;
  /** Estimated server clock - local clock (ms). */
  offsetMs: number;
  attempts: number;
}

const OFFSET_WINDOW = 40;

export class SyncClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reportTimer: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;
  private disposed = false;
  private offsetSamples: number[] = [];
  private offsetMs = 0;
  private driftSec: number | null = null;
  private seekThresholdSec: number;
  private rateNudge: number;
  private clockHz: number;

  constructor(private readonly opts: SyncOptions) {
    this.seekThresholdSec = opts.seekThresholdSec;
    this.rateNudge = opts.rateNudge;
    this.clockHz = opts.clockHz;
  }

  connect(): void {
    if (this.disposed) return;
    this.clearReconnect();
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.wsUrl);
    } catch (err) {
      this.opts.log("error", `WebSocket(${this.opts.wsUrl}) failed: ${describeError(err)}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.addEventListener("open", () => {
      if (ws !== this.ws) return;
      this.attempts = 0;
      this.opts.log("info", `ws connected ${this.opts.wsUrl}`);
      this.send({
        type: "hello",
        client: "screen",
        id: this.opts.screenId,
        name: this.opts.screenName,
        isClockSource: this.opts.isClockSource,
        ...(this.opts.screenToken ? { token: this.opts.screenToken } : {}),
      });
      this.startReporting();
      this.emitStatus();
    });
    ws.addEventListener("message", (ev) => {
      if (ws !== this.ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)) as ServerMessage;
      } catch {
        this.opts.log("warn", "ws: mesaj JSON invalid");
        return;
      }
      try {
        this.handle(msg);
      } catch (err) {
        this.opts.log("error", `ws handler failed for ${msg.type}: ${describeError(err)}`);
      }
    });
    ws.addEventListener("close", (ev) => {
      if (ws !== this.ws) return;
      this.opts.log("warn", `ws closed (${ev.code}) — reconectare`);
      this.ws = null;
      this.stopReporting();
      this.driftSec = null;
      this.emitStatus();
      this.scheduleReconnect();
    });
    ws.addEventListener("error", () => {
      // "close" follows; nothing else to do here.
    });
    this.emitStatus();
  }

  dispose(): void {
    this.disposed = true;
    this.clearReconnect();
    this.stopReporting();
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  status(): SyncStatus {
    return {
      connected: this.isConnected(),
      reconnecting: !this.isConnected() && !this.disposed,
      driftSec: this.opts.isClockSource ? null : this.driftSec,
      offsetMs: this.offsetMs,
      attempts: this.attempts,
    };
  }

  /** Server time estimate (ms epoch) on the local clock. */
  serverNow(): number {
    return Date.now() + this.offsetMs;
  }

  /** R4 / B-02 — 1 Hz performance sample from EVERY screen (dropped silently while disconnected). */
  sendPerf(sample: PerfSample): void {
    this.send({ type: "perf", sample });
  }

  /** R4 — any client->server message (photoCaptured...). Dropped silently while disconnected. */
  sendRaw(msg: ClientMessage): void {
    this.send(msg);
  }

  // ---------------------------------------------------------------- internals

  private send(msg: ClientMessage): void {
    if (!this.isConnected()) return;
    try {
      this.ws!.send(JSON.stringify(msg));
    } catch (err) {
      this.opts.log("warn", `ws send failed: ${describeError(err)}`);
    }
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case "welcome": {
        this.sampleOffset(msg.serverTimeMs);
        if (msg.config?.sync) {
          this.seekThresholdSec = msg.config.sync.seekThresholdSec ?? this.seekThresholdSec;
          this.rateNudge = msg.config.sync.rateNudge ?? this.rateNudge;
          if (msg.config.sync.clockHz && msg.config.sync.clockHz !== this.clockHz) {
            this.clockHz = msg.config.sync.clockHz;
            this.startReporting();
          }
        }
        this.opts.onWelcome?.(msg);
        if (!this.opts.isClockSource && msg.state) {
          const s = msg.state;
          const expected = this.extrapolate(s.phaseTime, s.serverTimeMs, s.rate);
          this.driftSec = this.opts.player.follow(s.state, expected, s.rate, this.params());
        }
        this.emitStatus();
        break;
      }
      case "clock": {
        this.sampleOffset(msg.serverTimeMs);
        if (this.opts.isClockSource) return;
        const expected = this.extrapolate(msg.phaseTime, msg.serverTimeMs, msg.rate);
        this.driftSec = this.opts.player.follow(msg.state, expected, msg.rate, this.params());
        this.emitStatus();
        break;
      }
      case "applyCmd":
        this.sampleOffset(msg.serverTimeMs);
        this.opts.player.apply(msg.cmd);
        break;
      case "state":
        this.opts.player.setRemoteCounts(msg.state.screensConnected, msg.state.tabletsConnected);
        break;
      case "cueFired":
      case "tabletView":
      case "tablets":
      case "perfSummary":
        break; // informational (console / tablets); every screen fires its own cues
      // ---- R4
      case "dynamicVoice":
        this.opts.player.speakDynamic(msg);
        break;
      case "entityParams":
        this.opts.player.setEntityParams(msg.entity, msg.params);
        break;
      case "photo":
        this.opts.onPhoto?.(msg);
        break;
      case "error":
        this.opts.log("warn", `server error: ${msg.reason}${msg.code ? ` (${msg.code})` : ""}`);
        break;
      default:
        break;
    }
  }

  private params() {
    return { seekThresholdSec: this.seekThresholdSec, rateNudge: this.rateNudge };
  }

  /** phaseTime the master should have "now", given a sample taken at serverTimeMs. */
  private extrapolate(phaseTime: number, serverTimeMs: number, rate: number): number {
    if (!(rate > 0)) return phaseTime;
    const ageSec = Math.max(0, (this.serverNow() - serverTimeMs) / 1000);
    return phaseTime + Math.min(ageSec, 2) * rate;
  }

  /**
   * Offset estimation: sample = serverTimeMs - localArrival = trueOffset - latency, so the
   * MAX over a short window is the sample with the least latency (closest to the true offset).
   */
  private sampleOffset(serverTimeMs: number): void {
    if (typeof serverTimeMs !== "number" || !Number.isFinite(serverTimeMs)) return;
    this.offsetSamples.push(serverTimeMs - Date.now());
    if (this.offsetSamples.length > OFFSET_WINDOW) this.offsetSamples.shift();
    let best = -Infinity;
    for (const s of this.offsetSamples) if (s > best) best = s;
    this.offsetMs = best;
  }

  private startReporting(): void {
    this.stopReporting();
    if (!this.opts.isClockSource) return;
    const hz = Math.min(30, Math.max(1, this.clockHz || 4));
    this.reportTimer = setInterval(() => this.report(), Math.round(1000 / hz));
    this.report();
  }

  private stopReporting(): void {
    if (this.reportTimer !== null) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
  }

  private report(): void {
    if (!this.isConnected()) return;
    const s = this.opts.player.getState();
    this.send({ type: "report", state: s.state, phaseTime: s.phaseTime, rate: s.rate, videoReady: s.videoReady, sceneId: s.sceneId });
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== null) return;
    this.attempts++;
    const base = Math.min(8000, 500 * Math.pow(1.7, Math.min(this.attempts, 8)));
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.emitStatus();
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emitStatus(): void {
    this.opts.onStatus?.(this.status());
  }
}
