/**
 * One frameless BrowserWindow per config.screens[] entry, placed on the display selected by `displayIndex`
 * (displays sorted by bounds.x, then bounds.y). Kiosk + fullscreen unless windowed mode. A crashed renderer
 * (`render-process-gone`) is re-created on the same display.
 */
import { BrowserWindow, screen as electronScreen, type BrowserWindowConstructorOptions, type Display } from "electron";
import fs from "node:fs";
import type { ScreenConfig } from "../shared/types";
import type { LogFn } from "./logger";
import { installWindowShortcuts } from "./shortcuts";

export interface WindowManagerOptions {
  rendererHtml: string;
  preloadJs: string;
  /** true => never kiosk/fullscreen (config.dev.windowed or --windowed). */
  windowed: boolean;
  openDevTools: boolean;
  log: LogFn;
}

const RESPAWN_DELAY_MS = 500;

export class WindowManager {
  private readonly byWebContents = new Map<number, ScreenConfig>();
  private readonly byScreenId = new Map<string, BrowserWindow>();
  private quitting = false;
  private created = 0;

  constructor(private readonly opts: WindowManagerOptions) {}

  /** Displays sorted left-to-right then top-to-bottom; config.screens[].displayIndex indexes this list. */
  static sortedDisplays(): Display[] {
    return electronScreen
      .getAllDisplays()
      .slice()
      .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  }

  open(screens: ScreenConfig[]): void {
    const { log } = this.opts;
    const primaryId = electronScreen.getPrimaryDisplay().id;
    const displays = WindowManager.sortedDisplays();
    log(
      "info",
      `displays detected: ${displays.length}`,
      displays.map((d, index) => ({ index, id: d.id, bounds: d.bounds, scale: d.scaleFactor, primary: d.id === primaryId })),
    );
    if (!fs.existsSync(this.opts.rendererHtml)) {
      log("error", `renderer not built: ${this.opts.rendererHtml} is missing (run: node scripts/build.mjs)`);
    }
    if (!fs.existsSync(this.opts.preloadJs)) {
      log("error", `preload not built: ${this.opts.preloadJs} is missing -> window.nava will be undefined`);
    }
    for (const sc of screens) this.create(sc);
  }

  screenFor(webContentsId: number): ScreenConfig | undefined {
    return this.byWebContents.get(webContentsId);
  }

  windowFor(screenId: string): BrowserWindow | undefined {
    const win = this.byScreenId.get(screenId);
    return win && !win.isDestroyed() ? win : undefined;
  }

  all(): BrowserWindow[] {
    return [...this.byScreenId.values()].filter((w) => !w.isDestroyed());
  }

  focusFirst(): void {
    const win = this.all()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  }

  setQuitting(): void {
    this.quitting = true;
  }

  closeAll(): void {
    this.quitting = true;
    for (const win of this.all()) win.destroy();
    this.byScreenId.clear();
    this.byWebContents.clear();
  }

  private create(sc: ScreenConfig): BrowserWindow {
    const { log } = this.opts;
    const displays = WindowManager.sortedDisplays();
    let display: Display | undefined = displays[sc.displayIndex];
    if (!display) {
      display = electronScreen.getPrimaryDisplay();
      log(
        "warn",
        `screen "${sc.id}": displayIndex ${sc.displayIndex} out of range (have ${displays.length}) -> primary display`,
      );
    }

    const kiosk = sc.kiosk && !this.opts.windowed;
    const b = display.bounds;
    const wa = display.workArea;
    const index = this.created++;

    let bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    if (!kiosk) {
      // Windowed / dev: a 16:9 window on the target display, staggered so several screens do not overlap fully.
      const width = Math.min(1600, Math.max(640, wa.width - 80));
      const height = Math.min(Math.round((width * 9) / 16), wa.height - 80);
      const offset = (index % 5) * 40;
      bounds = { x: wa.x + 40 + offset, y: wa.y + 40 + offset, width, height };
    }

    const options: BrowserWindowConstructorOptions = {
      ...bounds,
      title: `Nava - ${sc.id}`,
      // Frameless in kiosk; in windowed/dev mode keep the frame so the window can be moved/closed by hand.
      frame: !kiosk,
      fullscreen: kiosk,
      kiosk,
      backgroundColor: "#000000",
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.opts.preloadJs,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
        spellcheck: false,
      },
    };

    const win = new BrowserWindow(options);
    const wcId = win.webContents.id;
    this.byScreenId.set(sc.id, win);
    this.byWebContents.set(wcId, sc);
    win.setMenuBarVisibility(false);
    // The player is a local, privileged renderer. Keep it on its bundled document and deny popups so
    // a compromised/accidental link cannot turn the preload bridge into a general browsing surface.
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, url) => {
      event.preventDefault();
      log("warn", `screen "${sc.id}": blocked renderer navigation`, { url });
    });
    installWindowShortcuts(win, { log });

    win.once("ready-to-show", () => {
      if (win.isDestroyed()) return;
      win.show();
      if (kiosk) win.focus();
    });

    win.webContents.on("did-finish-load", () => {
      log("info", `screen "${sc.id}": renderer loaded`);
    });
    win.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (isMainFrame) log("error", `screen "${sc.id}": renderer failed to load (${code} ${description})`, { url });
    });
    win.webContents.on("unresponsive", () => log("warn", `screen "${sc.id}": renderer unresponsive`));
    win.webContents.on("responsive", () => log("info", `screen "${sc.id}": renderer responsive again`));
    win.webContents.on("render-process-gone", (_event, details) => {
      log("error", `screen "${sc.id}": renderer process gone (${details.reason}, exit code ${details.exitCode})`);
      this.byWebContents.delete(wcId);
      if (this.quitting || details.reason === "clean-exit") return;
      setTimeout(() => {
        if (this.quitting) return;
        if (!win.isDestroyed()) win.destroy();
        if (this.byScreenId.get(sc.id) === win) this.byScreenId.delete(sc.id);
        log("warn", `screen "${sc.id}": re-creating window`);
        this.create(sc);
      }, RESPAWN_DELAY_MS);
    });
    win.on("closed", () => {
      this.byWebContents.delete(wcId);
      if (this.byScreenId.get(sc.id) === win) this.byScreenId.delete(sc.id);
    });

    // dist/renderer/index.html?screen=<id>  (the renderer also gets the ScreenConfig from nava.getBoot()).
    void win
      .loadFile(this.opts.rendererHtml, { query: { screen: sc.id } })
      .catch((err: unknown) => log("error", `screen "${sc.id}": loadFile failed`, err));

    if (this.opts.openDevTools) win.webContents.openDevTools({ mode: kiosk ? "detach" : "right" });

    log("info", `screen "${sc.id}": window created`, { displayIndex: sc.displayIndex, displayId: display.id, kiosk, bounds });
    return win;
  }
}
