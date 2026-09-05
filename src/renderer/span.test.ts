import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {canvasBacking,panelFilmRect,pickFocusViewport,rendererClockSource,scaleViewports,wallStar} from './span';
import {samsungWallPreset} from '../shared/video-wall';
import type {ScreenConfig,SpanViewport} from '../shared/types';
const ids=['left-outer','left-inner','center','right-inner','right-outer'];
const screens:ScreenConfig[]=ids.map((id,i)=>({id,displayIndex:i,showAvatar:i===2,showSubtitles:i===2,showEntities:i===2,playAudio:i===2,kiosk:true}));
const panels:SpanViewport[]=ids.map((screenId,i)=>({screenId,x:3840*i,y:0,width:3840,height:2160,scaleFactor:1}));
describe('physical wall renderer layout',()=>{
 it('chooses only the captain screen for central overlays even if it is not first',()=>{
  assert.equal(pickFocusViewport(panels,screens,'center')?.screenId,'center');
  assert.equal(pickFocusViewport(panels,screens.map(s=>({...s,showAvatar:false,showSubtitles:true})),'center')?.screenId,'left-outer');
  assert.equal(pickFocusViewport(panels,screens.map(s=>({...s,showAvatar:false,showSubtitles:false})),'center')?.screenId,'center');
 });
 it('resizes every viewport and centre overlay consistently without enlarging units fivefold',()=>{
  const p=scaleViewports(panels,1920,216);
  assert.deepEqual(p.map(v=>[v.x,v.width]),[[0,384],[384,384],[768,384],[1152,384],[1536,384]]);
  assert.equal(p[2].height,216);
  assert.equal(pickFocusViewport(p,screens,'center')?.width,384);
  const full=scaleViewports(p,19200,2160);assert.deepEqual(full,panels);
 });
 it('keeps physical viewport offsets and staggered heights during scaling',()=>{
  const p=scaleViewports([{...panels[0],x:0,y:100,width:1000,height:800},{...panels[2],x:1000,y:0,width:1200,height:1000}],1100,500);
  assert.deepEqual(p.map(v=>[v.x,v.y,v.width,v.height]),[[0,50,500,400],[500,0,600,500]]);
 });
 it('caps a large canvas backing store and preserves aspect ratio',()=>{
  assert.deepEqual(canvasBacking(panels[0],2),{width:4096,height:2304});
  assert.deepEqual(canvasBacking({...panels[0],width:384,height:216},1),{width:384,height:216});
 });
 it('assigns the one master span renderer as clock source while followers never own the clock',()=>{
  assert.equal(rendererClockSource(true,true,'center',screens),true);
  assert.equal(rendererClockSource(false,true,'center',screens),false);
  assert.equal(rendererClockSource(true,false,'center',screens),false);
  assert.equal(rendererClockSource(true,false,ids[0],screens),true);
 });
 it('uses one reproducible global star field across panels',()=>{
  for(let i=0;i<220;i++){const p=wallStar(i);assert.deepEqual(p,wallStar(i));assert.ok(p.x>=0&&p.x<1&&p.y>=0&&p.y<1);}
  assert.notDeepEqual(wallStar(0),wallStar(1));
 });
 it('cinema retains the entire source exclusively on the centre and never duplicates it on sides',()=>{
  const wall=samsungWallPreset();
  for(const p of wall.panels){
   const r=panelFilmRect(wall,p.screenId,'center',3840,2160,1920,1080);
   if(p.screenId!=='center')assert.equal(r,null);
   else {assert.ok(r);assert.deepEqual([r.sx,r.sy,r.sw,r.sh,r.dx,r.dy,r.dw,r.dh],[0,0,3840,2160,0,0,1920,1080]);}
  }
 });
 it('panorama assigns monotonically advancing crops with no repeated scene across adjacent panels',()=>{
  const wall=samsungWallPreset();wall.mode='panorama';
  const rects=wall.panels.map(p=>panelFilmRect(wall,p.screenId,'center',3840,2160,3840,2160)!);
  assert.equal(rects[0].sx,0);
  for(let i=1;i<rects.length;i++)assert.ok(Math.abs(rects[i-1].sx+rects[i-1].sw-rects[i].sx)<1e-6);
  assert.ok(Math.abs(rects[4].sx+rects[4].sw-3840)<1e-6);
 });
});
