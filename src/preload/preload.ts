/**
 * Preload: exposes window.nava (NavaBridge, src/shared/protocol.ts) via contextBridge.
 * contextIsolation is ON — the renderer gets exactly these four functions, no Node, no ipcRenderer.
 * Bundled to dist/preload/preload.js (CJS) by scripts/build.mjs.
 *
 * getBoot() is a pure pass-through of the object built in src/main/main.ts (structured clone over IPC): the R4
 * fields — serverHttpUrl, screenToken, security.publicState, displayMode, viewports (span mode only), variant —
 * arrive in the renderer exactly as main produced them; nothing is added, renamed or filtered here.
 */
import { contextBridge, ipcRenderer } from "electron";
import type { Command, NavaBridge } from "../shared/protocol";
import { IPC } from "../main/ipc-channels";

type BootInfo = Awaited<ReturnType<NavaBridge["getBoot"]>>;

/** IPC uses structured clone (functions/DOM nodes throw); Errors become plain objects. */
function cloneSafe(data: unknown): unknown {
  if (data === undefined) return undefined;
  if (data instanceof Error) return { name: data.name, message: data.message, stack: data.stack };
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return String(data);
  }
}

const bridge: NavaBridge = {
  getBoot: (): Promise<BootInfo> => ipcRenderer.invoke(IPC.getBoot) as Promise<BootInfo>,
  log: (level, msg, data) => {
    ipcRenderer.send(IPC.log, level, String(msg), cloneSafe(data));
  },
  sendCommand: (cmd: Command) => {
    ipcRenderer.send(IPC.sendCommand, cmd);
  },
  quit: () => {
    ipcRenderer.send(IPC.quit);
  },
};

contextBridge.exposeInMainWorld("nava", bridge);
