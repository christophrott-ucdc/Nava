import type { ShowFile } from './types';

/** Editorial anchors measured from center.mp4, not a guessed SpaceEngine offset.
 * The first three scenes retain their departure/dialogue windows. Mann includes
 * the Gargantua reveal; Saturn gets its own return-home passage. */
export const FILM_DURATION = 678.05;
export const FILM_ANCHORS = [[-10,-10],[0,0],[60,60],[144,144],[246,246],[356,388],[402,610],[465,FILM_DURATION]] as const;
/** The wormhole ends at Saturn, not Earth: the new passage is an insertion. */
export function remapFilmTime(at: number): number {
  if (!Number.isFinite(at) || at < -10 || at > 465) throw new Error('Time outside legacy film');
  if (at >= 402) return Math.min(FILM_DURATION, Math.round((610+(at-402)*(FILM_DURATION-610)/63)*2)/2);
  if (at >= 356) return Math.round((388+(at-356)*116/46)*2)/2;
  if (at >= 246) return Math.round((246+(at-246)*142/110)*2)/2;
  return Math.round(at*2)/2;
}
export function publicDurationSec(show: Pick<ShowFile,'scenes'|'launchLeadInSec'|'videoDurationSec'>): number {
  const end = (phase: string) => Math.max(0,...show.scenes.filter(s=>s.phase===phase).map(s=>s.end));
  return end('preshow')+(show.launchLeadInSec??0)+show.videoDurationSec+end('epilogue');
}
export interface DriftSettings { deadbandSec?: number; seekThresholdSec?: number; rateNudge?: number }
export function videoCorrection(actual: number, target: number, rate: number, settings: DriftSettings = {}) {
  const deadband = Math.max(0,settings.deadbandSec??.025);
  const threshold = Math.max(deadband,settings.seekThresholdSec??.12);
  const nudge = Math.max(0,Math.min(.25,settings.rateNudge??.05));
  const drift = target-actual;
  if (!Number.isFinite(drift)) return {seek:false,rate};
  if (Math.abs(drift)>=threshold) return {seek:true,rate};
  return {seek:false,rate:Math.abs(drift)<deadband ? rate : rate*(1+Math.sign(drift)*nudge)};
}
