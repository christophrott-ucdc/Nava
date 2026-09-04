/**
 * IPC channel names shared by src/main (handlers) and src/preload (window.nava bridge).
 * Kept out of src/shared on purpose: the renderer never sees channel names, only `window.nava`.
 */
export const IPC = {
  getBoot: "nava:getBoot",
  log: "nava:log",
  sendCommand: "nava:sendCommand",
  quit: "nava:quit",
} as const;
