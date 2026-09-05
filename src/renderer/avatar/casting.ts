/**
 * Casting: which GLB + body type animates which voice (R4 / C-01).
 *
 * The Captain (CAPITANUL) is the only speaker with `lipsyncAvatar: true` and has a deep male
 * voice (ElevenLabs "Paul Bogorin"). The GLB shipped in assets/avatar/avatar-ai.glb is an Avaturn
 * export of a FEMALE look ("BiologV2"), so the default casting is a known mismatch until a male
 * Captain GLB is produced (see docs/AVATAR.md). Everything here is pure so it can be unit-tested
 * and reused by the debug page.
 */
import type { AvatarCastingReport } from "../../shared/contracts";
import { SPEAKERS, type AppConfig, type Speaker } from "../../shared/types";

export type AvatarBody = "M" | "F";

/** Only the fields this module reads; a full AppConfig["avatar"] satisfies it. */
export type AvatarConfigLike = Partial<Pick<AppConfig["avatar"], "glb" | "body" | "glbBySpeaker">>;

/** Basenames of GLBs known to be female looks (the shipped Avaturn model). */
const KNOWN_FEMALE_GLBS: ReadonlySet<string> = new Set(["avatar-ai.glb"]);

/** Voice gender per speaker, derived from the production casting (voice-script-v3.json). */
const VOICE_GENDER: Readonly<Record<Speaker, AvatarBody | null>> = {
  AVATAR_AI: "F", // AGEIS-7 — synthetic, read as female
  CAPITANUL: "M", // Paul Bogorin — deep male
  LUMINA: "F", // Anca
  NATURA: "M", // Vasile Poenaru
  TEHNOLOGIC: "F", // Antonia
};

export function glbBasename(url: string): string {
  const clean = url.split(/[?#]/)[0];
  const parts = clean.split(/[\\/]/);
  return decodeURIComponent(parts[parts.length - 1] ?? "").toLowerCase();
}

export function isKnownFemaleGlb(url: string): boolean {
  return KNOWN_FEMALE_GLBS.has(glbBasename(url));
}

/** The speaker whose audio drives the GLB mouth (first one flagged lipsyncAvatar; CAPITANUL). */
export function speakerWithLipsync(): Speaker {
  const found = (Object.keys(SPEAKERS) as Speaker[]).find((id) => SPEAKERS[id].lipsyncAvatar);
  return found ?? "CAPITANUL";
}

export function voiceGender(speaker: Speaker): AvatarBody | null {
  return VOICE_GENDER[speaker] ?? null;
}

/** `opts.body` wins, then config.avatar.body, then "M" (the Captain's voice is male). */
export function resolveBody(explicit: AvatarBody | undefined, config: AvatarConfigLike | null | undefined): AvatarBody {
  if (explicit === "M" || explicit === "F") return explicit;
  if (config?.body === "M" || config?.body === "F") return config.body;
  return "M";
}

/**
 * GLB for a speaker: config.avatar.glbBySpeaker[speaker] -> fallback (the boot's avatarUrl /
 * config.avatar.glb). The caller (player) decides which speaker it casts; the controller itself
 * never re-resolves URLs because main already turned config paths into file:// URLs.
 */
export function resolveGlbForSpeaker(config: AvatarConfigLike | null | undefined, speaker: Speaker, fallbackUrl: string): string {
  const specific = config?.glbBySpeaker?.[speaker];
  return typeof specific === "string" && specific.trim() ? specific : fallbackUrl;
}

/** Pure casting report; `femaleLook` may come from GLB inspection when the filename is unknown. */
export function buildCastingReport(glb: string, body: AvatarBody, femaleLook: boolean | null = null): AvatarCastingReport {
  const speaker = speakerWithLipsync();
  const wanted = voiceGender(speaker);
  const looksFemale = femaleLook ?? isKnownFemaleGlb(glb);
  const problems: string[] = [];
  if (wanted && body !== wanted) {
    problems.push(
      `config.avatar.body="${body}" dar vocea lui ${SPEAKERS[speaker].label} este ${wanted === "M" ? "masculină" : "feminină"} (animațiile idle vor fi nepotrivite)`,
    );
  }
  if (wanted === "M" && looksFemale) {
    problems.push(
      `GLB-ul "${glbBasename(glb)}" este modelul feminin Avaturn livrat implicit (BiologV2), iar ${SPEAKERS[speaker].label} are voce gravă masculină — creați un GLB masculin (docs/AVATAR.md) și setați config.avatar.glbBySpeaker.${speaker}`,
    );
  }
  return {
    glb,
    body,
    speakerWithLipsync: speaker,
    mismatchWarning: problems.length ? `[avatar/casting] ${problems.join("; ")}` : null,
  };
}

/**
 * Cheap heuristic on the loaded scene graph: Avaturn exports name their garments `avaturn_*`
 * and the shipped female look carries a hair mesh; a bald male export has none. Returns null when
 * nothing conclusive is visible so the filename rule stays authoritative.
 */
export function inferFemaleLookFromNodeNames(names: readonly string[]): boolean | null {
  const lower = names.map((n) => n.toLowerCase());
  const avaturn = lower.some((n) => n.startsWith("avaturn_"));
  if (!avaturn) return null;
  if (lower.some((n) => /(^|_)(female|woman|girl)(_|$)/.test(n))) return true;
  if (lower.some((n) => /(^|_)(male|man|boy)(_|$)/.test(n))) return false;
  return null;
}

/** Best-effort read of boot.config.avatar via the preload bridge (null outside Electron). */
export async function readBootAvatarConfig(): Promise<AvatarConfigLike | null> {
  try {
    const bridge = (window as unknown as { nava?: { getBoot?: () => Promise<{ config?: { avatar?: AvatarConfigLike } }> } }).nava;
    if (!bridge?.getBoot) return null;
    const boot = await bridge.getBoot();
    return boot?.config?.avatar ?? null;
  } catch {
    return null;
  }
}
