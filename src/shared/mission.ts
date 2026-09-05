import type { ScenarioId, ScenarioProgress, scenarioView, summarizeScenario } from "./scenario-engine";
import type { ShowState, TabletPost } from "./types";
import type {ExperienceState,ExperienceSnapshot} from './experience';

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  'legacy-v3': 'Protocolul Acasă · original',
  'age-5-10': '5–10 ani · Bucățile de acasă',
  'age-10-15': '10–15 ani · Semnalul fără semnătură',
  'age-15-18': '15–18 ani · Dreptul de a schimba cursul',
  adults: 'Adulți · Ce lăsăm deschis',
};
export const STAGE_WINDOWS: Record<ScenarioId, readonly (readonly [number, number])[]> = {
  'legacy-v3': [], 'age-5-10': [[96,120],[204,224],[306,331]],
  'age-10-15': [[96,124],[193,223],[307,333]],
  'age-15-18': [[96,124],[192,222],[306,334]], adults: [[100,124],[197,224],[311,336]],
};
export interface PostAccessibility {
  textScale: number; contrastMode: boolean; reducedMotion: boolean; reducedStimuli: boolean;
  simplifiedChrome: boolean; showVisualGuidance: boolean; sfxEnabled: boolean;
}
export const DEFAULT_ACCESSIBILITY: PostAccessibility = {
  textScale: 1, contrastMode: false, reducedMotion: false, reducedStimuli: false,
  simplifiedChrome: false, showVisualGuidance: true, sfxEnabled: true,
};
export interface MissionRecord {
  experience?:ExperienceState;
  runId: string; scenarioId: ScenarioId; contentHash: string; revision: number;
  timelineEpoch: number; createdAt: string; status: 'prepared'|'active'|'completed'|'interrupted';
  progress: ScenarioProgress; checkpoint: ShowState | null;
  accessibility: Record<string, PostAccessibility>;
  mode: 'public'|'rehearsal'|'diagnostic';
}
export interface MissionSnapshot {
  experience?:ExperienceSnapshot;
  lantern?:Array<{found:boolean;mounted:boolean;linked:boolean}>;
  certificateToken?:string;
  runId: string; serverEpoch: string; scenarioId: ScenarioId; label: string; revision: number;
  cueInstanceId: string; stage: number; endsAt: number | null; suspended: boolean;
  state: ShowState; post?: TabletPost;
  view: ReturnType<typeof scenarioView> | null;
  summary: ReturnType<typeof summarizeScenario>;
  accessibility: PostAccessibility;
}
export interface MissionEvent {
  type: 'missionAction'; runId: string; cueInstanceId: string; eventId: string;
  zone: 'A'|'B'; value: string;
}
