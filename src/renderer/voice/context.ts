/**
 * Shared Web Audio context for the renderer (voice + SFX + transporter).
 * TalkingHead keeps its own (muted) context; everything audible goes here.
 */

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let sfxVolume = 0.8;
let sfxAudible = true;

export function getAudioContext(): AudioContext {
  if (ctx && ctx.state !== "closed") return ctx;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new Ctor({ latencyHint: "interactive" });
  sfxBus = null;
  return ctx;
}

/** Bus for synthesized effects (transporter, rumble, rain...). */
export function getSfxBus(): GainNode {
  const c = getAudioContext();
  if (!sfxBus) {
    sfxBus = c.createGain();
    sfxBus.gain.value = sfxAudible ? sfxVolume : 0;
    sfxBus.connect(c.destination);
  }
  return sfxBus;
}

function applySfxGain(): void {
  if (!sfxBus) return;
  const c = getAudioContext();
  const target = sfxAudible ? sfxVolume : 0;
  sfxBus.gain.cancelScheduledValues(c.currentTime);
  sfxBus.gain.setTargetAtTime(target, c.currentTime, 0.03);
}

export function setSfxVolume(v: number): void {
  sfxVolume = Math.max(0, Math.min(1.5, v));
  applySfxGain();
}

export function getSfxVolume(): number {
  return sfxVolume;
}

/** Follower screens (`audible: false`) keep the graph running but silent. */
export function setSfxAudible(on: boolean): void {
  sfxAudible = on;
  applySfxGain();
}

/** Resume the context (autoplay policy is disabled in the Electron kiosk, but be safe). */
export async function unlockAudio(): Promise<void> {
  const c = getAudioContext();
  if (c.state === "suspended" || (c.state as string) === "interrupted") {
    try {
      await c.resume();
    } catch {
      /* ignore */
    }
  }
}

/** Output + processing latency of the shared context in ms (for sync diagnostics). */
export function outputLatencyMs(): number {
  const c = getAudioContext();
  const out = (c as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
  return Math.round((c.baseLatency + out) * 1000);
}

// ---------------------------------------------------------------------------
// R4 / B-01 — output device routing (AudioContext.setSinkId, Chromium 110+)
// ---------------------------------------------------------------------------

let outputLabel: string | null = null;

type SinkCapableContext = AudioContext & { setSinkId?: (sinkId: string | { type: "none" }) => Promise<void>; sinkId?: string };

/** Label (or id) of the output device the shared context plays through; "default" until routed. */
export function getAudioOutputLabel(): string | null {
  return outputLabel;
}

/** Output devices visible to this renderer (labels may be empty before any media permission). */
export async function listAudioOutputs(): Promise<Array<{ deviceId: string; label: string }>> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audiooutput").map((d) => ({ deviceId: d.deviceId, label: d.label }));
  } catch {
    return [];
  }
}

/**
 * Route the shared context to `config.audio.outputDeviceId`: matched by exact deviceId OR by a
 * case-insensitive label substring (e.g. "Realtek", "HDMI 2"). "default"/empty keeps the system
 * default. Falls back silently (returns null) when unsupported or not found — never throws.
 * Everything audible (voices, SFX, ambient, the rehearse HTMLAudioElement path via
 * createMediaElementSource) goes through this context, so one call routes it all.
 */
export async function routeAudioOutput(
  outputDeviceId: string | undefined,
  log?: (level: "info" | "warn" | "error", msg: string, data?: unknown) => void,
): Promise<string | null> {
  const want = (outputDeviceId ?? "").trim();
  if (!want || want.toLowerCase() === "default") {
    outputLabel = "default";
    return outputLabel;
  }
  const c = getAudioContext() as SinkCapableContext;
  if (typeof c.setSinkId !== "function") {
    log?.("warn", `audio: AudioContext.setSinkId indisponibil — rămân pe dispozitivul implicit (cerut: "${want}")`);
    outputLabel = "default";
    return null;
  }
  const outputs = await listAudioOutputs();
  const needle = want.toLowerCase();
  const match = outputs.find((d) => d.deviceId === want) ?? outputs.find((d) => d.label.toLowerCase().includes(needle));
  if (!match) {
    log?.("warn", `audio: dispozitivul de ieșire "${want}" nu a fost găsit — folosesc implicitul`, { available: outputs.map((d) => d.label || d.deviceId) });
    outputLabel = "default";
    return null;
  }
  try {
    await c.setSinkId(match.deviceId);
    outputLabel = match.label || match.deviceId;
    log?.("info", `audio: ieșire → ${outputLabel}`);
    return outputLabel;
  } catch (err) {
    log?.("warn", `audio: setSinkId(${match.label || match.deviceId}) a eșuat — implicit: ${err instanceof Error ? err.message : String(err)}`);
    outputLabel = "default";
    return null;
  }
}
