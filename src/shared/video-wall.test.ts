import {test} from 'node:test';import assert from 'node:assert/strict';
import {samsungWallPreset,validateVideoWall,wallBounds,wallSourceRect,connectedWallScreens,validateWallScreens} from './video-wall';
test('mixed Samsung sizes preserve one physical scale and continuous source seams',()=>{
 const wall=samsungWallPreset();wall.mode='panorama';assert.ok(validateVideoWall(wall).ok);
 const r=wall.panels.map(p=>wallSourceRect(wall,p.screenId,3840,2160,3840,2160)!);
 for(let i=1;i<r.length;i++)assert.ok(Math.abs(r[i-1].sx+r[i-1].sw-r[i].sx)<1e-8);
 assert.ok(r[2].sw>r[1].sw);assert.ok(r[2].sh>r[1].sh);
 assert.ok(Math.abs(r[2].sw/wall.panels[2].width-r[1].sw/wall.panels[1].width)<1e-8);
 assert.equal(r[0].sx,0);assert.ok(Math.abs(r[4].sx+r[4].sw-3840)<1e-8);
});
test('bezel gaps consume source space rather than duplicating the neighboring edge',()=>{
 const w=samsungWallPreset();for(let i=0;i<w.panels.length;i++)w.panels[i].x+=i*30;
 const a=wallSourceRect(w,w.panels[0].screenId,8000,1000,3840,2160)!,b=wallSourceRect(w,w.panels[1].screenId,8000,1000,3840,2160)!;
 assert.ok(b.sx>a.sx+a.sw);
});
test('contain keeps full source while a native wall-aspect movie fills all panels',()=>{
 const w=samsungWallPreset();w.fit='contain';assert.equal(wallSourceRect(w,'port-outer',1920,1080,3840,2160),null);
 const c=wallSourceRect(w,'center',1920,1080,3840,2160)!;assert.ok(Math.abs(c.sw-1920)<2);
 const b=wallBounds(w);for(const p of w.panels){const r=wallSourceRect(w,p.screenId,b.width,b.height,3840,2160)!;assert.ok(Math.abs(r.dw-3840)<1e-8);assert.ok(Math.abs(r.dh-2160)<1e-8)}
});
test('invalid layouts cannot silently become duplicated TV views',()=>{
 const w=samsungWallPreset();assert.equal(validateVideoWall({...w,focusX:NaN}).ok,false);
 assert.equal(validateVideoWall({...w,panels:[w.panels[0],w.panels[0]]}).ok,false);
 assert.equal(validateVideoWall({...w,panels:[{...w.panels[0],width:0}]}).ok,false);
 assert.equal(validateVideoWall(w,['center']).ok,false);
 assert.equal(validateVideoWall({...w,mode:['cinema'],fit:['cover']}).ok,false);
 assert.equal(wallSourceRect(w,'missing',1920,1080,3840,2160),null);
});
test('wall outputs reject duplicated Windows indices and multiple audio/avatar owners',()=>{
 const w=samsungWallPreset();const screens=w.panels.map((p,i)=>({id:p.screenId,displayIndex:i,showAvatar:i===2,playAudio:i===2,showSubtitles:i===2,showEntities:true,kiosk:true}));
 assert.ok(validateWallScreens(screens,w).ok);
 assert.equal(validateWallScreens(screens.map(s=>({...s,displayIndex:0})),w).ok,false);
 assert.equal(validateWallScreens(screens.map(s=>({...s,playAudio:true})),w).ok,false);
 assert.equal(validateWallScreens(screens.map(s=>({...s,showAvatar:false})),w).ok,false);
});
test('one span connection counts physical screens only with native evidence and loses them on disconnect',()=>{
 const ids=samsungWallPreset().panels.map(p=>p.screenId);
 assert.deepEqual(connectedWallScreens(['center'],'center',ids),['center',...ids.filter(id=>id!=='center')]);
 assert.deepEqual(connectedWallScreens(['center'],'center',[]),['center']);
 assert.deepEqual(connectedWallScreens([],'center',ids),[]);
 assert.deepEqual(connectedWallScreens(['unknown'],'center',ids),['unknown']);
});
