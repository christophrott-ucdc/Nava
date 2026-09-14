/** The ring follows the authoritative show lead-in, including custom lengths. */
export function countdownProgress(phaseTime:number,leadInSec:number):number {
  if(!Number.isFinite(phaseTime)||!Number.isFinite(leadInSec)||leadInSec<=0)return 100;
  return Math.max(0,Math.min(100,(1+phaseTime/leadInSec)*100));
}
