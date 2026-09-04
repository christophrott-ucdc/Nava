/**
 * ipcMain side of window.nava (see NavaBridge in src/shared/protocol.ts and src/preload/preload.ts).
 *   nava:getBoot      invoke  -> BootInfo for the calling window (by webContents id)
 *   nava:log          send    -> logger (src = "renderer:<screenId>")
 *   nava:sendCommand  send    -> server.dispatchCommand (master) | master link (follower)
 *   nava:quit         send    -> app.quit()
 */
import { app, ipcMain } from "electron";
import type { Command, NavaBridge } from "../shared/protocol";
import { IPC } from "./ipc-channels";
import type { LogLevel } from "./logger";

/** Exactly what the renderer receives from window.nava.getBoot(). */
export type BootInfo = Awaited<ReturnType<NavaBridge["getBoot"]>>;

export interface IpcDeps {
  /** Throws if the webContents is not one of our screen windows. */
  getBoot(webContentsId: number): BootInfo;
  screenIdFor(webContentsId: number): string | undefined;
  log(level: LogLevel, msg: string, data: unknown, src: string): void;
  dispatchCommand(cmd: Command): void;
}

const LEVELS: ReadonlySet<string> = new Set<LogLevel>(["info", "warn", "error"]);

function isLevel(v: unknown): v is LogLevel {
  return typeof v === "string" && LEVELS.has(v);
}

function isCommand(v: unknown): v is Command {
  return typeof v === "object" && v !== null && typeof (v as { action?: unknown }).action === "string";
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.getBoot, (event) => deps.getBoot(event.sender.id));

  ipcMain.on(IPC.log, (event, level: unknown, msg: unknown, data?: unknown) => {
    const src = `renderer:${deps.screenIdFor(event.sender.id) ?? `wc${event.sender.id}`}`;
    deps.log(isLevel(level) ? level : "info", typeof msg === "string" ? msg : String(msg), data, src);
  });

  ipcMain.on(IPC.sendCommand, (event, cmd: unknown) => {
    const src = `renderer:${deps.screenIdFor(event.sender.id) ?? `wc${event.sender.id}`}`;
    if (!isCommand(cmd)) {
      deps.log("warn", "ignored malformed command from renderer", cmd, src);
      return;
    }
    deps.log("info", `command: ${cmd.action}`, cmd, src);
    deps.dispatchCommand(cmd);
  });

  ipcMain.on(IPC.quit, (event) => {
    deps.log("info", "quit requested by renderer", undefined, `renderer:${deps.screenIdFor(event.sender.id) ?? "?"}`);
    app.quit();
  });
}
