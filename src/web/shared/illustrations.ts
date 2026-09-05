/** Local artwork is shared by the tablet server and the Electron renderer. */
export type ExodusIllustration =
  | 'ship-boarding-v1'
  | 'ship-cruise-v1'
  | 'tutorial-pair-v1'
  | 'lantern-shell-v1'
  | 'signal-receiver-shell-v1'
  | 'keepsake-light-v1'
  | 'keepsake-care-v1'
  | 'keepsake-compass-v1'
  | 'expedition-emblem-v1'
  | 'homecoming-v1';

export function illustrationPath(name: ExodusIllustration, scope: 'web' | 'renderer' = 'web'): string {
  return `${scope === 'web' ? '/' : ''}shared/illustrations/exodus7/${name}.png`;
}

export function hasChildIllustrations(scenarioId: string): boolean {
  return scenarioId === 'age-5-10' || scenarioId === 'age-10-15';
}
