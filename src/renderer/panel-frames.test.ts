import assert from 'node:assert/strict';
import {it} from 'node:test';
import {PanelFrames} from './panel-frames';
const frame=()=>({closed:0,close(){this.closed++;}});
it('commits identical decoded timestamps, holding all panels when one decoder falls behind',()=>{
 const q=new PanelFrames<ReturnType<typeof frame>>(['a','b']);
 q.push('a',1,frame());assert.equal(q.select(1),null);
 q.push('b',1,frame());assert.equal(q.select(1)?.key,60);
 q.push('a',1.05,frame());q.push('b',1.033333,frame());assert.equal(q.select(2)?.key,60);
 q.push('b',1.05,frame());assert.equal(q.select(2)?.key,63);q.dispose();
});
it('never presents future frames, handles backward seek epochs and releases every frame once',()=>{
 const q=new PanelFrames<ReturnType<typeof frame>>(['a','b'],60,2),all=[];
 for(const id of ['a','b'])for(const t of [1,2,3]){const f=frame();all.push(f);q.push(id,t,f);}
 assert.equal(q.select(2)?.key,120);q.reset();
 for(const id of ['a','b']){const f=frame();all.push(f);q.push(id,.5,f);}
 assert.equal(q.select(.5)?.key,30);q.dispose();assert(all.every(f=>f.closed===1));
});
it('bounds memory during a long stall and resumes only at a complete common frame',()=>{
 const q=new PanelFrames<ReturnType<typeof frame>>(['a','b'],60,3),all=[];
 for(const id of ['a','b']){const f=frame();all.push(f);q.push(id,0,f);}q.select(0);
 for(let i=1;i<120;i++){const f=frame();all.push(f);q.push('a',i/60,f);}
 assert.equal(all.filter(f=>f.closed===0).length,5);
 assert.equal(q.select(2)?.key,0);
 const recovered=frame();all.push(recovered);q.push('b',119/60,recovered);
 assert.equal(q.select(2)?.key,119);q.dispose();assert(all.every(f=>f.closed===1));
});
