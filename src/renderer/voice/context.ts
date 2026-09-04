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
