/**
 * Follower mode: the main process keeps a small WebSocket client to the master (config.masterUrl) so keyboard
 * commands from this PC's screens (window.nava.sendCommand) reach the master's server exactly like console
 * commands. It identifies itself as a `control` client. Reconnects with backoff; commands sent while
 * disconnected are queued for a few seconds (stale play/pause presses are dropped, not replayed late).
 */
import os from "node:os";
import WebSocket from "ws";
import type { ClientMessage, Command } from "../shared/protocol";
import type { LogFn } from "./logger";

export interface MasterLink {
  dispatch(cmd: Command): void;
  isConnected(): boolean;
  close(): Promise<void>;
}

const QUEUE_TTL_MS = 5000;
const QUEUE_MAX = 20;
const HANDSHAKE_TIMEOUT_MS = 5000;

export function createMasterLink(masterUrl: string, log: LogFn): MasterLink {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  const queue: Array<{ cmd: Command; at: number }> = [];
  const clientId = `follower-main-${os.hostname()}`;

  const send = (msg: ClientMessage): boolean => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  };

  const flushQueue = (): void => {
    const now = Date.now();
    const items = queue.splice(0, queue.length);
    for (const item of items) {
      if (now - item.at > QUEUE_TTL_MS) {
        log("warn", `master link: dropped stale queued command "${item.cmd.action}"`);
        continue;
      }
      send({ type: "cmd", cmd: item.cmd });
    }
  };

  const scheduleReconnect = (): void => {
    if (closed || reconnectTimer) return;
    const delay = Math.min(10_000, 1000 * 2 ** Math.min(attempt, 4));
    attempt++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = (): void => {
    if (closed) return;
    let sock: WebSocket;
    try {
      sock = new WebSocket(masterUrl, { handshakeTimeout: HANDSHAKE_TIMEOUT_MS });
    } catch (err) {
      log("error", `master link: cannot open ${masterUrl}`, err);
      scheduleReconnect();
      return;
    }
    ws = sock;
    sock.on("open", () => {
      attempt = 0;
      log("info", `master link: connected to ${masterUrl}`);
      send({ type: "hello", client: "control", id: clientId, name: `Follower ${os.hostname()} (keyboard)` });
      flushQueue();
    });
    sock.on("message", () => {
      /* state/clock/tablets broadcasts for control clients: not needed in the main process */
    });
    sock.on("error", (err) => {
      log("warn", `master link: ${err.message}`);
    });
    sock.on("close", (code) => {
      if (ws === sock) ws = null;
      if (!closed) {
        log("warn", `master link: closed (${code}); reconnecting`);
        scheduleReconnect();
      }
    });
  };

  connect();

  return {
    isConnected: () => ws !== null && ws.readyState === WebSocket.OPEN,
    dispatch(cmd) {
      if (send({ type: "cmd", cmd })) return;
      queue.push({ cmd, at: Date.now() });
      if (queue.length > QUEUE_MAX) queue.shift();
      log("warn", `master link: not connected; queued command "${cmd.action}"`);
    },
    close() {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      return new Promise<void>((resolve) => {
        const sock = ws;
        ws = null;
        if (!sock || sock.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        const done = (): void => resolve();
        sock.once("close", done);
        setTimeout(done, 1000);
        try {
          sock.close(1000, "shutdown");
        } catch {
          resolve();
        }
      });
    },
  };
}
