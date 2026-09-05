import type { SceneTheme, TabletPost } from '../../shared/types';
export const THEMES: SceneTheme[]=['prologue','launch','light','nature','tech','void','home','white'];
export function applyTheme(theme: unknown): SceneTheme {const value=THEMES.includes(theme as SceneTheme)?theme as SceneTheme:'prologue';document.documentElement.dataset.theme=value;document.body.dataset.theme=value;return value}
const paths:Record<string,string>={
 rocket:'M14 4c3-2 6-2 6-2s0 3-2 6l-6 7-5-5 7-6ZM7 10l-4 1-1 5 5-1m5 0-1 6 5-1 1-5M4 19l-2 3m3-2-2 1M14 7h.01',
 planet:'M20 12a8 8 0 1 1-3-6M3 17c-5-1 3-8 11-11s13-1 5 5S5 18 3 17Z',
 star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z',
 heart:'M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-5 5 3 12 8 16 5-4 13-11 8-16Z',
 pulse:'M2 12h5l3-8 4 16 3-8h5',wave:'M2 12q3-12 5 0t5 0 5 0 5 0',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
 hand:'M8 12V5a2 2 0 0 1 4 0v6-2a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v5c0 4-3 6-7 6-3 0-5-3-8-7-2-3 1-5 3-2',
 timer:'M9 2h6m-3 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16m0 3v5l3 2',speaker:'M3 9h4l5-4v14l-5-4H3V9Zm13-2q5 5 0 10m3-13q8 8 0 16',
 light:'M9 18h6m-5 3h4M8 15c-7-8 1-15 7-11 5 3 3 8 1 11H8Z',tablet:'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 17h2',screen:'M3 3h18v14H3V3Zm9 14v4m-5 0h10',flag:'M4 22V3c6-4 10 4 16 0v10c-6 4-10-4-16 0',check:'m4 12 5 5L20 6',warning:'m12 3 10 18H2L12 3Zm0 5v6m0 3h.01',
 compass:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4 6-2 6-6 2 2-6 6-2',battery:'M2 6h17v12H2V6Zm20 4v4M5 9h8v6H5V9',memory:'M6 3h12M6 21h12M7 3c0 5 1 6 5 9-4 3-5 4-5 9m10-18c0 5-1 6-5 9 4 3 5 4 5 9',robot:'M12 2v3M5 5h14v13H5V5Zm3 5h1m6 0h1m-7 4h6M2 9v5m20-5v5M9 18v4m6-4v4',
 play:'m7 3 14 9-14 9V3Z',pause:'M7 4v16M17 4v16',close:'m5 5 14 14M5 19 19 5',download:'M12 2v14m-5-5 5 5 5-5M3 16v6h18v-6',signal:'M3 20v-4m6 4v-8m6 8V8m6 12V3',user:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 22v-3c0-7 16-7 16 0v3',back:'m14 5-7 7 7 7',camera:'M3 7h4l2-4h6l2 4h4v14H3V7Zm9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8'};
export const ICON_NAMES=Object.keys(paths);
export function icon(name:string, className=''):string{return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]??paths.star}"/></svg>`}
export const MASCOTS=['mascot-01-navigatie','mascot-02-propulsie','mascot-03-comunicatii','mascot-04-biosemnale','mascot-05-memorie','mascot-ai-avatar'] as const;
export function mascotPath(post:TabletPost|'ai',small=false):string{return `/shared/mascots/${MASCOTS[post==='ai'?5:post-1]}${small?'-256':''}.png`}
/** Per-event gate, never tied to render frequency. Reset only at a new mission. */
export class EffectGate {private seen=new Set<string>();once(key:string):boolean{if(this.seen.has(key))return false;this.seen.add(key);return true}reset():void{this.seen.clear()}}
export function confetti(host:HTMLElement,color='var(--accent)'):void{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const r=host.getBoundingClientRect();for(let i=0;i<12;i++){const p=document.createElement('i');Object.assign(p.style,{position:'fixed',left:`${r.x+r.width/2}px`,top:`${r.y+r.height/2}px`,width:'8px',height:'12px',borderRadius:'3px',background:color,pointerEvents:'none',zIndex:'999'});document.body.append(p);const a=p.animate([{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${Math.cos(i*Math.PI/6)*100}px,${Math.sin(i*Math.PI/6)*80-40}px) rotate(${i*60}deg)`,opacity:0}],{duration:600,easing:'ease-out'});a.onfinish=()=>p.remove()}}
export type TabletSound='tap'|'pick'|'confirm'|'start'|'thanks';
export function createTabletAudio(){let unlocked=false,enabled=true;const pool=new Map<TabletSound,HTMLAudioElement>();for(const name of ['tap','pick','confirm','start','thanks'] as TabletSound[]){const audio=new Audio(`/tablet/sfx/${name}.mp3`);audio.preload='auto';audio.volume=.35;pool.set(name,audio)}
 const unlock=()=>{unlocked=true;const a=pool.get('tap')!;a.muted=true;void a.play().then(()=>{a.pause();a.currentTime=0;a.muted=false}).catch(()=>{a.muted=false})};document.addEventListener('pointerdown',unlock,{once:true});document.addEventListener('keydown',()=>{if(!unlocked)unlock()},{once:true});
 return {setEnabled(value:boolean){enabled=value;if(!value)for(const a of pool.values()){a.pause();a.currentTime=0}},play(name:TabletSound){if(!enabled||!unlocked)return;const a=pool.get(name)!;a.currentTime=0;void a.play().catch(()=>{})}};
}
