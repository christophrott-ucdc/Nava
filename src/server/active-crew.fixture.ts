import type {MissionSession} from './mission-session';
/** Explicit test setup: a fresh public room has zero participants until registration. */
export function activeCrew(session:MissionSession,seats=['1A','1B']):void{
  const experience=session.record.experience;
  if(!experience)throw new Error('Fixture requires an experience');
  experience.participants=[...seats];
  if(experience.crew)experience.crew.open=false;
  session.record.progress={...session.record.progress,participants:[...seats]};
}
