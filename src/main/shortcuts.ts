/**
 * Keyboard policy
 * ---------------
 * Show keys (Space play/pause, S start, P preshow, R restart, E epilogue, arrows seek, I identify, F fullscreen,
 * Esc x2 quit in dev.windowed) are handled by the RENDERER (src/renderer), which calls
 * window.nava.sendCommand(...) / window.nava.quit(). They only make sense on the master screen anyway, and the
 * renderer knows which screen it is (boot.screen) and whether it is the master (boot.config.role).
 *
 * The main process handles only two escape hatches, per window, via `before-input-event` — deliberately NOT
 * `globalShortcut`, which would steal the keys system-wide (e.g. from the operator console on the same PC):
 *   Ctrl+Q / Cmd+Q  -> quit the whole app
 *   F11             -> toggle fullscreen of the focused window (useful in --windowed / dev)
 */
import { app, type BrowserWindow } from "electron";
import type { LogFn } from "./logger";

export function installWindowShortcuts(win: BrowserWindow, opts: { log: LogFn }): void {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const mod = input.control || input.meta;

    if (mod && !input.alt && !input.shift && input.key.toLowerCase() === "q") {
      event.preventDefault();
      opts.log("info", "shortcut: Ctrl+Q -> quit");
      app.quit();
      return;
    }

    if (input.key === "F11" && !mod && !input.alt) {
      event.preventDefault();
      if (win.isDestroyed()) return;
      const next = !win.isFullScreen();
      win.setFullScreen(next);
      opts.log("info", `shortcut: F11 -> fullscreen ${next ? "on" : "off"}`);
    }
  });
}
