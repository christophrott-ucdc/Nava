import type { TabletZone } from "@shared/types";
import type { TabletViewMsg } from "@shared/protocol";

export type PendingChoices = Record<string, Partial<Record<TabletZone, string>>>;
export interface ChoiceToSend { kind: "choice"; cueId: string; zone: TabletZone; value: string }

/** One local intention per child. Server confirmation always wins. */
export function rememberChoice(pending: PendingChoices, view: TabletViewMsg | null, cueId: string, zone: TabletZone, value: string): boolean {
  if (view?.cueId !== cueId || view.interaction?.type !== "paired-choice" || view.zoneChoices[zone] || pending[cueId]?.[zone] !== undefined) return false;
  pending[cueId] ??= {};
  pending[cueId][zone] = value;
  return true;
}

/** Reconnect only resends after a fresh personalized view, never an expired interaction. */
export function reconcileChoices(pending: PendingChoices, view: TabletViewMsg, resend: boolean): ChoiceToSend[] {
  const outgoing: ChoiceToSend[] = [];
  for (const cueId of Object.keys(pending)) {
    if (view.interaction?.type !== "paired-choice" || view.cueId !== cueId) {
      delete pending[cueId];
      continue;
    }
    for (const zone of ["A", "B"] as const) {
      const value = pending[cueId][zone];
      if (view.zoneChoices[zone]) delete pending[cueId][zone];
      else if (resend && value !== undefined) outgoing.push({ kind: "choice", cueId, zone, value });
    }
    if (!Object.keys(pending[cueId]).length) delete pending[cueId];
  }
  return outgoing;
}
