import type { MissionSnapshot } from '../../shared/mission';
import { FINALE_CHOICES } from '../../shared/experience';
import {crewCharacter} from '../../shared/crew';

export type CrewMark = 'star' | 'heart' | 'compass' | 'signal' | 'question' | 'link' | 'shield' | 'archive';
export type CrewSeat = { id: string; state: 'absent' | 'waiting' | 'observing' | 'confirmed'; mark: CrewMark; label: string; color: string };
export type CrewRelay = { epoch: string; phase: 'boarding' | 'touch' | 'practice' | 'cooperate' | 'ready' | 'final'; seats: CrewSeat[] };
const marks: Record<string, CrewMark> = {
  light: 'star', care: 'heart', courage: 'compass', source: 'signal', test: 'compass', meaning: 'question',
  voice: 'signal', review: 'compass', responsibility: 'shield', question: 'question', possibility: 'compass',
  connection: 'link', wonder: 'star', together: 'link', home: 'heart',
};
export const crewMark = (value?: string): CrewMark => marks[value ?? ''] ?? 'star';
export const CREW_COLORS = ['#ef826a', '#e4b54c', '#51aec9', '#68b69b', '#a58bcf'];
export const CREW_POSTS = ['Navigație', 'Propulsie', 'Comunicații', 'Biosemnale', 'Memorie'];
/** Presentation only: never treats a draft, a retry or an observing seat as a contribution. */
export function crewRelay(snapshot: MissionSnapshot): CrewRelay {
  const exp = snapshot.experience;
  const phase = exp?.finaleActive ? 'final' : exp?.crew?.open ? 'boarding' : exp?.step ?? 'touch';
  const done = phase === 'boarding' ? exp?.participants : phase === 'touch' ? exp?.touched : phase === 'practice' ? exp?.practiced : exp?.linked;
  const seats = Array.from({ length: 10 }, (_, i): CrewSeat => {
    const id = `${Math.floor(i / 2) + 1}${i % 2 ? 'B' : 'A'}`;
    const character=crewCharacter(exp?.crew?.characters[id]);
    const choice = FINALE_CHOICES[snapshot.scenarioId].options.find(option => option.value === exp?.finale[id]);
    const state = !exp?.participants.includes(id) ? 'absent'
      : (phase === 'final' ? exp.finale[id] === 'observe' : exp.observed.includes(id)) ? 'observing'
      : (phase === 'final' ? !!choice : done?.includes(id)) ? 'confirmed' : 'waiting';
    return { id, state, mark: phase === 'final' ? crewMark(choice?.value) : 'star',
      label: state === 'absent' ? 'Loc liber' : state === 'observing' ? 'Privește'
        : state === 'confirmed' ? (phase==='boarding'?character?.name:choice?.label) ?? 'La bord' : 'În așteptare', color: character?.color ?? CREW_COLORS[Math.floor(i / 2)] };
  });
  return { epoch: `${snapshot.runId}:${snapshot.serverEpoch}:${exp?.epoch ?? 0}:${phase}`, phase, seats };
}

/** Fixed local symbols shared by the SVG fallback and the solid 3D objects. */
export const CREW_PATHS: Record<CrewMark, string> = {
  star: 'M0 42L12 15L42 13L20 -8L26 -38L0 -23L-26 -38L-20 -8L-42 13L-12 15Z',
  heart: 'M0 -36C-10 -26 -42 -7 -42 17C-42 43 -12 49 0 26C12 49 42 43 42 17C42 -7 10 -26 0 -36Z',
  compass: 'M0 43L23 -23L0 -12L-23 -23Z',
  signal: 'M-39 -13H-26V13H-39ZM-13 -29H0V29H-13ZM13 -40H26V40H13Z',
  question: 'M-28 20C-28 51 31 51 31 21C31 8 9 2 9 -12H-7C-7 10 14 12 14 23C14 36 -12 36 -12 20ZM-8 -24H9V-41H-8Z',
  link: 'M-42 8L-14 36L-4 25L-20 9L9 -20L25 -4L36 -14L8 -42L-3 -31L13 -15L-16 14L-31 -2Z',
  shield: 'M0 43L36 29V-3C36 -23 15 -37 0 -43C-15 -37 -36 -23 -36 -3V29Z',
  archive: 'M-30 -40V40H17L32 24V-40Z',
};
