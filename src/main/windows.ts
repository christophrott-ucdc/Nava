/**
 * Screen windows.
 *
 * displayMode "windows" (default): one frameless BrowserWindow per config.screens[] entry, placed on the display
 * selected by `displayIndex` (displays sorted by bounds.x, then bounds.y). Kiosk + fullscreen unless windowed.
 *
 * displayMode "span": ONE frameless window whose bounds are the union (DIP coordinates, as reported by
 * screen.getAllDisplays) of the displays used by config.screens. The renderer receives one SpanViewport per
 * screen — x/y/width/height relative to the window's top-left plus that display's scaleFactor — and draws a
 * single decoded <video> onto one canvas per viewport (B-07). In windowed/dev mode the union is scaled down to
 * fit one 16:9-ish window on the primary display and the viewports are scaled with it, so the layout can be
 * checked on a laptop.
 *   Caveat (mixed DPI): Chromium rasterizes a window at ONE device scale factor (that of the display holding the
 *   window). Electron's display bounds are DIP, so the union is exact only when every TV uses the same scale;
 *   with 125% on one TV and 100% on the others, that TV's viewport is off by the scale ratio. Set identical
 *   scale (100%) on all TVs in Windows > Display. Also prefer contiguous, same-height arrangements: gaps in the
 *   union are simply black (no display shows them).
 *
 * Watchdog: a crashed renderer (`render-process-gone`) is re-created after RESPAWN_DELAY_MS with the same
 * layout. CRASH_LOOP_MAX crashes within CRASH_LOOP_WINDOW_MS (all windows together) -> `onCrashLoop()` is called
 * once and no window is re-created any more (main.ts relaunches the whole app).
 */
import {
  BrowserWindow,
  screen as electronScreen,
  type BrowserWindowConstructorOptions,
  type Display,
  type Rectangle,
} from "electron";
import fs from "node:fs";
import type { ScreenConfig, SpanViewport, VideoWallConfig } from "../shared/types";
import { wallBounds, type WallRuntimeInfo } from "../shared/video-wall";
import type { LogFn } from "./logger";
import { installWindowShortcuts } from "./shortcuts";

export interface WindowManagerOptions {
  rendererHtml: string;
  preloadJs: string;
  /** true => never kiosk/fullscreen (config.dev.windowed or --windowed; --kiosk forces false). */
  windowed: boolean;
  openDevTools: boolean;
  /** config.displayMode (normalized by the config loader). */
  displayMode: "windows" | "span";
  videoWall?: VideoWallConfig;
  wallPreview?: boolean;
  log: LogFn;
  /** Renderer crash loop detected (CRASH_LOOP_MAX crashes within CRASH_LOOP_WINDOW_MS). Windows are not re-created after this. */
  onCrashLoop?: (crashes: number, windowMs: number) => void;
}

const RESPAWN_DELAY_MS = 500;
const CRASH_LOOP_MAX = 3;
const CRASH_LOOP_WINDOW_MS = 60_000;

interface SpanLayout {
  /** Window bounds (DIP). In kiosk = the union of the used displays; windowed = a scaled-down preview. */
  bounds: Rectangle;
  /** Union of the used displays (DIP, screen coordinates). */
  union: Rectangle;
  /** bounds / union (1 in kiosk). */
  scale: number;
  kiosk: boolean;
  viewports: SpanViewport[];
}

/** The screen a span window "is" for getBoot().screen: the one with audio (normally "center"), else the first. */
function spanPrimaryScreen(screens: ScreenConfig[]): ScreenConfig {
  return screens.find((s) => s.playAudio) ?? screens[0];
}

export class WindowManager {
  private readonly byWebContents = new Map<number, ScreenConfig>();
  private readonly byScreenId = new Map<string, BrowserWindow>();
  private spanLayout: SpanLayout | null = null;
  private crashTimes: number[] = [];
  private crashLoop = false;
  private quitting = false;
  private created = 0;
  private layoutGeneration = 0;
  private readonly openedDisplayIds = new Map<string, number>();

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
    for (const sc of screens) {
      const display = displays[sc.displayIndex];
      if (display) this.openedDisplayIds.set(sc.id, display.id);
    }
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
    if (this.opts.displayMode === "span") this.createSpan(screens);
    else for (const sc of screens) this.create(sc);
  }

  /** Idle-only transaction: keep existing windows until every replacement has loaded. */
  async reconfigure(screens:ScreenConfig[],displayMode:'span'|'windows',videoWall?:VideoWallConfig):Promise<void> {
    const oldWindows=this.all(),oldScreens=new Map(this.byScreenId),oldContents=new Map(this.byWebContents),oldIds=new Map(this.openedDisplayIds);
    const oldOptions={displayMode:this.opts.displayMode,videoWall:this.opts.videoWall},oldLayout=this.spanLayout,oldGeneration=this.layoutGeneration;
    this.layoutGeneration++;
    this.byScreenId.clear();this.byWebContents.clear();this.openedDisplayIds.clear();this.spanLayout=null;
    this.opts.displayMode=displayMode;this.opts.videoWall=videoWall;
    try{
      this.open(screens);
      await Promise.all(this.all().map(win=>new Promise<void>((resolve,reject)=>{
        let timer:ReturnType<typeof setTimeout>;
        const done=()=>{clearTimeout(timer);win.webContents.removeListener('did-finish-load',loaded);win.webContents.removeListener('did-fail-load',failed);};
        const loaded=()=>{done();resolve();};
        const failed=(_event:unknown,_code:number,description:string,_url:string,isMainFrame:boolean)=>{if(isMainFrame){done();reject(new Error(description));}};
        timer=setTimeout(()=>{done();reject(new Error('Rendererul nou nu a confirmat încărcarea în 15 secunde.'));},15000);
        win.webContents.once('did-finish-load',loaded);win.webContents.on('did-fail-load',failed);
        if(win.webContents.getURL()&&!win.webContents.isLoadingMainFrame())loaded();
      })));
      for(const old of oldWindows)if(!old.isDestroyed())old.destroy();
    }catch(err){
      for(const win of this.all())if(!win.isDestroyed())win.destroy();
      this.byScreenId.clear();this.byWebContents.clear();this.openedDisplayIds.clear();
      for(const [id,win] of oldScreens)this.byScreenId.set(id,win);
      for(const [id,sc] of oldContents)this.byWebContents.set(id,sc);
      for(const [id,display] of oldIds)this.openedDisplayIds.set(id,display);
      Object.assign(this.opts,oldOptions);this.spanLayout=oldLayout;
      this.layoutGeneration=oldGeneration;
      throw err;
    }
  }

  /** The ScreenConfig a renderer belongs to (span: the primary screen — see spanPrimaryScreen). */
  screenFor(webContentsId: number): ScreenConfig | undefined {
    return this.byWebContents.get(webContentsId);
  }

  /** Span mode only: per-screen viewports relative to the spanning window; undefined in windows mode. */
  viewports(): SpanViewport[] | undefined {
    return this.spanLayout ? this.spanLayout.viewports.map((v) => ({ ...v })) : undefined;
  }

  wallRuntime(screens: ScreenConfig[]): WallRuntimeInfo {
    const displays = WindowManager.sortedDisplays().map((d,index) => ({index, id:d.id, bounds:d.bounds, scaleFactor:d.scaleFactor}));
    const issues: string[] = [];
    const preview = this.opts.wallPreview === true || this.opts.windowed;
    if (preview) issues.push("Previzualizare locală; prezența fizică a TV-urilor nu este validată.");
    const used = screens.map(s => displays[s.displayIndex]);
    if (used.some(d => !d)) issues.push("Lipsesc ieșiri video configurate în Windows.");
    if (new Set(used.filter(Boolean).map(d => d.id)).size !== screens.length) issues.push("Fiecare TV trebuie să aibă o ieșire video separată (desktop extins).");
    if (this.opts.displayMode === "span" && new Set(used.filter(Boolean).map(d => d.scaleFactor)).size > 1) issues.push("Folosește aceeași scalare Windows pe toate TV-urile în modul span.");
    if (!preview && screens.some(s => this.openedDisplayIds.get(s.id) !== displays[s.displayIndex]?.id)) issues.push("Identitatea display-urilor s-a schimbat; reaplică configurația în pregătire.");
    if (this.opts.displayMode === "span" && this.spanLayout && !preview) {
      const actual = this.all()[0]?.getContentBounds(), expected = this.spanLayout.bounds;
      if (!actual || ["x","y","width","height"].some(k => actual[k as keyof Rectangle] !== expected[k as keyof Rectangle])) issues.push("Fereastra panoramică nu acoperă suprafața Windows configurată.");
      for (const s of screens) {
        const current = displays[s.displayIndex]?.bounds, viewport = this.spanLayout.viewports.find(v => v.screenId === s.id);
        if (current && viewport && (current.x !== viewport.x+expected.x || current.y !== viewport.y+expected.y || current.width !== viewport.width || current.height !== viewport.height)) issues.push(`Poziția Windows pentru ${s.id} s-a schimbat; repornește playerul.`);
      }
    }
    return {preview,displays,issues,verifiedScreenIds:issues.length ? [] : screens.filter(s => !!this.windowFor(s.id)).map(s => s.id)};
  }

  windowFor(screenId: string): BrowserWindow | undefined {
    const win = this.byScreenId.get(screenId);
    return win && !win.isDestroyed() ? win : undefined;
  }

  all(): BrowserWindow[] {
    return [...new Set(this.byScreenId.values())].filter((w) => !w.isDestroyed());
  }

  focusFirst(): boolean {
    const win = this.all()[0];
    if (!win) return false;
    win.show();
    if (win.isMinimized()) win.restore();
    win.moveTop();
    win.focus();
    return true;
  }

  setQuitting(): void {
    this.quitting = true;
  }

  closeAll(): void {
    this.quitting = true;
    for (const win of this.all()) win.destroy();
    this.byScreenId.clear();
    this.byWebContents.clear();
    this.openedDisplayIds.clear();
  }

  // -----------------------------------------------------------------------------------------------------
  // windows mode
  // -----------------------------------------------------------------------------------------------------

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
      webPreferences: this.webPreferences(),
    };

    const win = new BrowserWindow(options);
    this.byScreenId.set(sc.id, win);
    this.byWebContents.set(win.webContents.id, sc);
    this.attach(win, {
      label: `screen "${sc.id}"`,
      screenIds: [sc.id],
      kiosk,
      query: { screen: sc.id },
      fullscreenToggle: true,
      recreate: () => this.create(sc),
    });

    log("info", `screen "${sc.id}": window created`, { displayIndex: sc.displayIndex, displayId: display.id, kiosk, bounds });
    return win;
  }

  // -----------------------------------------------------------------------------------------------------
  // span mode
  // -----------------------------------------------------------------------------------------------------

  private computeSpanLayout(screens: ScreenConfig[]): SpanLayout {
    const { log } = this.opts;
    const displays = WindowManager.sortedDisplays();
    const primaryDisplay = electronScreen.getPrimaryDisplay();
    if (this.opts.wallPreview && this.opts.videoWall) {
      const wall = this.opts.videoWall, b = wallBounds(wall), wa = primaryDisplay.workArea;
      const scale = Math.min(Math.min(1600,wa.width-80)/b.width,(wa.height-160)/b.height);
      const bounds = {x:wa.x+40,y:wa.y+80,width:Math.round(b.width*scale),height:Math.round(b.height*scale)};
      const viewports = screens.map(sc => {
        const p = wall.panels.find(p => p.screenId===sc.id)!;
        return {screenId:sc.id,x:(p.x-b.x)*scale,y:(p.y-b.y)*scale,width:p.width*scale,height:p.height*scale,scaleFactor:1};
      });
      log("warn","Physical wall preview: simulated viewports; hardware readiness is NOT certified");
      return {bounds,union:{x:0,y:0,width:bounds.width,height:bounds.height},scale:1,kiosk:false,viewports};
    }

    const placed = screens.map((sc) => {
      let display: Display | undefined = displays[sc.displayIndex];
      if (!display) {
        display = primaryDisplay;
        log("warn", `span: screen "${sc.id}" displayIndex ${sc.displayIndex} out of range (have ${displays.length}) -> primary display`);
      }
      return { sc, display };
    });

    const byDisplay = new Map<number, string[]>();
    for (const { sc, display } of placed) byDisplay.set(display.id, [...(byDisplay.get(display.id) ?? []), sc.id]);
    for (const [id, ids] of byDisplay) {
      if (ids.length > 1) log("warn", `span: screens ${ids.join(", ")} share display ${id} -> their viewports overlap`);
    }
    const scales = [...new Set(placed.map((p) => p.display.scaleFactor))];
    if (scales.length > 1) {
      log(
        "warn",
        `span: the used displays have different scale factors (${scales.join(", ")}) -> viewports will be imprecise; set 100% scale on every TV`,
      );
    }

    const rects = placed.map((p) => p.display.bounds);
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.width));
    const maxY = Math.max(...rects.map((r) => r.y + r.height));
    const union: Rectangle = { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };

    const kiosk = !this.opts.windowed && screens.some((s) => s.kiosk);
    let bounds: Rectangle = { ...union };
    let scale = 1;
    if (!kiosk) {
      // Windowed / dev: shrink the whole union onto the primary display's work area, keeping the aspect ratio.
      const wa = primaryDisplay.workArea;
      const maxW = Math.max(640, Math.min(1600, wa.width - 80));
      const maxH = Math.max(360, wa.height - 80);
      scale = Math.min(1, maxW / union.width, maxH / union.height);
      bounds = {
        x: wa.x + 40,
        y: wa.y + 40,
        width: Math.max(1, Math.round(union.width * scale)),
        height: Math.max(1, Math.round(union.height * scale)),
      };
    }

    const viewports: SpanViewport[] = placed.map(({ sc, display }) => ({
      screenId: sc.id,
      x: Math.round((display.bounds.x - union.x) * scale),
      y: Math.round((display.bounds.y - union.y) * scale),
      width: Math.max(1, Math.round(display.bounds.width * scale)),
      height: Math.max(1, Math.round(display.bounds.height * scale)),
      scaleFactor: display.scaleFactor,
    }));

    return { bounds, union, scale, kiosk, viewports };
  }

  private createSpan(screens: ScreenConfig[]): BrowserWindow {
    const { log } = this.opts;
    const layout = this.computeSpanLayout(screens);
    this.spanLayout = layout;
    const primary = spanPrimaryScreen(screens);
    const { kiosk, bounds } = layout;

    const options: BrowserWindowConstructorOptions = {
      ...bounds,
      // width/height are the web contents' size, so viewports (relative to the page) match even with a frame.
      useContentSize: true,
      title: `Nava - span (${screens.map((s) => s.id).join(", ")})`,
      frame: !kiosk,
      thickFrame: !kiosk,
      // Electron's kiosk/fullscreen are per-display and would collapse the window onto one TV: place it ourselves.
      fullscreen: false,
      fullscreenable: false,
      kiosk: false,
      alwaysOnTop: kiosk,
      skipTaskbar: kiosk,
      resizable: !kiosk,
      movable: !kiosk,
      minimizable: !kiosk,
      maximizable: false,
      enableLargerThanScreen: true,
      backgroundColor: "#000000",
      show: false,
      autoHideMenuBar: true,
      webPreferences: this.webPreferences(),
    };

    const win = new BrowserWindow(options);
    for (const sc of screens) this.byScreenId.set(sc.id, win);
    this.byWebContents.set(win.webContents.id, primary);
    if (kiosk) {
      // The shell may nudge an oversized window onto one monitor at creation: re-assert the union bounds.
      win.setBounds(bounds);
      win.setAlwaysOnTop(true, "screen-saver");
    }
    this.attach(win, {
      label: "span window",
      screenIds: screens.map((s) => s.id),
      kiosk,
      query: { screen: primary.id, mode: "span" },
      fullscreenToggle: !kiosk,
      recreate: () => this.createSpan(screens),
      onShown: () => {
        if (!kiosk || win.isDestroyed()) return;
        win.setBounds(bounds);
        const actual = win.getContentBounds();
        if (actual.width !== bounds.width || actual.height !== bounds.height || actual.x !== bounds.x || actual.y !== bounds.y) {
          log("warn", "span window bounds differ from the requested union (the OS clamped them)", { requested: bounds, actual });
        }
      },
    });

    log("info", `span window created (${screens.length} screen(s), primary "${primary.id}")`, {
      kiosk,
      bounds,
      union: layout.union,
      scale: layout.scale,
      viewports: layout.viewports,
    });
    return win;
  }

  // -----------------------------------------------------------------------------------------------------
  // shared
  // -----------------------------------------------------------------------------------------------------

  private webPreferences(): BrowserWindowConstructorOptions["webPreferences"] {
    return {
      preload: this.opts.preloadJs,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
    };
  }

  private forget(win: BrowserWindow, screenIds: string[]): void {
    for (const id of screenIds) if (this.byScreenId.get(id) === win) this.byScreenId.delete(id);
  }

  /** Returns true when the crash-loop threshold was reached (the caller must NOT re-create the window). */
  private registerCrash(): boolean {
    if (this.crashLoop) return true;
    const now = Date.now();
    this.crashTimes = this.crashTimes.filter((t) => now - t < CRASH_LOOP_WINDOW_MS);
    this.crashTimes.push(now);
    if (this.crashTimes.length < CRASH_LOOP_MAX) return false;
    this.crashLoop = true;
    this.opts.log(
      "error",
      `FATAL: ${this.crashTimes.length} renderer crashes within ${CRASH_LOOP_WINDOW_MS / 1000} s -> not re-creating windows any more`,
    );
    this.opts.onCrashLoop?.(this.crashTimes.length, CRASH_LOOP_WINDOW_MS);
    return true;
  }

  private attach(
    win: BrowserWindow,
    p: {
      label: string;
      screenIds: string[];
      kiosk: boolean;
      query: Record<string, string>;
      fullscreenToggle: boolean;
      recreate: () => void;
      onShown?: () => void;
    },
  ): void {
    const { log } = this.opts;
    const wcId = win.webContents.id;
    const generation = this.layoutGeneration;
    win.setMenuBarVisibility(false);
    // The player is a local, privileged renderer. Keep it on its bundled document and deny popups so
    // a compromised/accidental link cannot turn the preload bridge into a general browsing surface.
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, url) => {
      event.preventDefault();
      log("warn", `${p.label}: blocked renderer navigation`, { url });
    });
    installWindowShortcuts(win, { log, fullscreenToggle: p.fullscreenToggle });

    win.once("ready-to-show", () => {
      if (win.isDestroyed()) return;
      win.show();
      if (p.kiosk) win.focus();
      p.onShown?.();
    });

    win.webContents.on("did-finish-load", () => {
      log("info", `${p.label}: renderer loaded`);
    });
    win.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (isMainFrame) log("error", `${p.label}: renderer failed to load (${code} ${description})`, { url });
    });
    win.webContents.on("unresponsive", () => log("warn", `${p.label}: renderer unresponsive`));
    win.webContents.on("responsive", () => log("info", `${p.label}: renderer responsive again`));
    win.webContents.on("render-process-gone", (_event, details) => {
      log("error", `${p.label}: renderer process gone (${details.reason}, exit code ${details.exitCode})`);
      this.byWebContents.delete(wcId);
      if (this.quitting || generation !== this.layoutGeneration || details.reason === "clean-exit") return;
      if (this.registerCrash()) return;
      setTimeout(() => {
        if (this.quitting || this.crashLoop || generation !== this.layoutGeneration) return;
        if (!win.isDestroyed()) win.destroy();
        this.forget(win, p.screenIds);
        log("warn", `${p.label}: re-creating window`);
        p.recreate();
      }, RESPAWN_DELAY_MS);
    });
    win.on("closed", () => {
      this.byWebContents.delete(wcId);
      this.forget(win, p.screenIds);
    });

    // dist/renderer/index.html?screen=<id>[&mode=span]  (the renderer also gets everything from nava.getBoot()).
    void win
      .loadFile(this.opts.rendererHtml, { query: p.query })
      .catch((err: unknown) => log("error", `${p.label}: loadFile failed`, err));

    if (this.opts.openDevTools) win.webContents.openDevTools({ mode: p.kiosk ? "detach" : "right" });
  }
}
