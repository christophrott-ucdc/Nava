/** Read-only presentation facts. Never authorizes an action or advances the show. */
export type EducationForm = 'Cerc' | 'Semilună' | 'Aripă' | 'Flacără' | 'Undă' | 'Clopoțel' | 'Frunză' | 'Picătură' | 'Stea' | 'Spirală' | 'pulse' | 'card' | 'gate' | 'beacon';
export interface EducationObject {
  id: string;
  label: string;
  form: EducationForm;
  state: 'available' | 'confirmed' | 'missing' | 'observed';
  /** Coordinates in a fixed diagram plane, x -4..4, y -1..1. */
  x: number;
  y: number;
  scale?: number;
  keyMarker?: boolean;
  quarterTurns?: number;
  /** Exact model intervals in seconds; order and proportional lengths are meaningful. */
  intervals?: number[];
  /** Model offset of the whole sequence in seconds, never added to each interval. */
  offsetSeconds?: number;
}
export interface EducationVisual {
  kind: 'pieces' | 'signals' | 'mandate' | 'resources' | 'archive' | 'beacon' | 'constellation';
  title: string;
  /** Short explicit boundary of the model, visible beside the diagram. */
  caption: string;
  objects: EducationObject[];
  links: Array<[string, string]>;
  /** Exact server facts shown as text in both render modes. */
  facts: string[];
}
