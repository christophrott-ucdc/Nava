import {test} from 'node:test';import assert from 'node:assert/strict';
import {EffectGate,THEMES,applyTheme,createTabletAudio} from './glass';
test('effect gate suppresses repeated server renders, distinguishes zones, rearms next mission',()=>{const g=new EffectGate();assert.equal(g.once('cue:A'),true);for(let i=0;i<10;i++)assert.equal(g.once('cue:A'),false);assert.equal(g.once('cue:B'),true);assert.equal(g.once('thanks'),true);assert.equal(g.once('thanks'),false);g.reset();assert.equal(g.once('cue:A'),true)});
test('all themes synchronize html and body; unknown state safely uses prologue',()=>{const old=globalThis.document;const html={dataset:{} as Record<string,string>},body={dataset:{} as Record<string,string>};Object.assign(globalThis,{document:{documentElement:html,body}});try{for(const t of THEMES){assert.equal(applyTheme(t),t);assert.equal(html.dataset.theme,t);assert.equal(body.dataset.theme,t)}assert.equal(applyTheme('unknown'),'prologue')}finally{Object.assign(globalThis,{document:old})}});

test('tablet audio requires a gesture and obeys operator mute including active sounds',async()=>{
 const oldDocument=globalThis.document,oldAudio=globalThis.Audio;
 const events=new EventTarget(),instances:FakeAudio[]=[],audible:string[]=[];
 class FakeAudio {
  muted=false;volume=1;currentTime=0;preload='';paused=true;
  constructor(readonly src:string){instances.push(this)}
  play(){this.paused=false;if(!this.muted)audible.push(this.src);return Promise.resolve()}
  pause(){this.paused=true}
 }
 Object.assign(globalThis,{document:events,Audio:FakeAudio});
 try {
  const audio=createTabletAudio();audio.play('pick');assert.deepEqual(audible,[]);
  assert.equal(instances.length,5);assert.ok(instances.every(a=>a.volume===.35));
  events.dispatchEvent(new Event('pointerdown'));await Promise.resolve();
  audio.play('pick');assert.deepEqual(audible,['/tablet/sfx/pick.mp3']);
  audio.setEnabled(false);assert.ok(instances.every(a=>a.paused&&a.currentTime===0));
  audio.play('thanks');assert.equal(audible.length,1);
  audio.setEnabled(true);audio.play('confirm');assert.equal(audible.at(-1),'/tablet/sfx/confirm.mp3');
 } finally {Object.assign(globalThis,{document:oldDocument,Audio:oldAudio})}
});
