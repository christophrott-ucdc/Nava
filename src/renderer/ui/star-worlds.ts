import * as THREE from 'three';
import type {MissionSnapshot} from '../../shared/mission';
import {STAR_SCORE} from '../../shared/star-score';

type World = 'light'|'nature'|'crystal'|'earth'|'star';
const LABELS:Record<World,[string,string,string]>={
  light:['LUMEA LUMINII','O scânteie poate porni o poveste.','#ffd58b'],
  nature:['LUMEA NATURII','Viața crește atunci când avem grijă de ea.','#9ff0c3'],
  crystal:['LUMEA DE CRISTAL','Piesele diferite pot construi ceva împreună.','#b6caff'],
  earth:['PĂMÂNTUL · ACASĂ','Lumini de oameni. O lume pe care o împărțim.','#9bdcff'],
  star:['STEAUA OMENIRII','Lumină. Viață. Imaginație.','#ffdda0'],
};
const material=(color:string,metalness=.15)=>new THREE.MeshStandardMaterial({color,roughness:.32,metalness});
const mesh=(geometry:THREE.BufferGeometry,color:string,parent:THREE.Object3D)=>{
  const result=new THREE.Mesh(geometry,material(color));parent.add(result);return result;
};
const smooth=(v:number)=>{const x=Math.max(0,Math.min(1,v));return x*x*(3-2*x);};

/** A single, capped transparent WebGL surface on the central TV. No postprocessing,
 * shadows, network textures or independently advancing animation clocks. */
export function createStarWorlds(parent:HTMLElement,clock:()=>{state:string;time:number},enabled:boolean){
  const element=document.createElement('aside');element.className='star-worlds';element.hidden=true;
  // Side displays must not allocate geometry, textures, a scene or an animation loop.
  if(!enabled)return {element,update(snapshot:MissionSnapshot){document.body.dataset.scenario=snapshot.scenarioId;},dispose(){element.remove();}};
  const stage=document.createElement('div');stage.className='star-worlds-stage';stage.setAttribute('role','img');
  const label=document.createElement('strong'),caption=document.createElement('p'),note=document.createElement('small');
  note.textContent='Ilustrație 3D · povestea noastră';
  const copy=document.createElement('div');copy.className='star-worlds-copy';copy.append(label,caption,note);element.append(stage,copy);parent.append(element);
  let snapshot:MissionSnapshot|null=null,renderer:THREE.WebGLRenderer|null=null,failed=false,disposed=false;
  let normalParent:HTMLElement|null=null;
  let frame=0,lastDraw=-Infinity,lastPose='',width=0,height=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,35);camera.position.set(0,0,8.6);
  scene.add(new THREE.HemisphereLight('#e9f9ff','#675689',2.3));
  const sun=new THREE.DirectionalLight('#fff2d0',4);sun.position.set(-3,5,6);scene.add(sun);
  const rim=new THREE.DirectionalLight('#8acfff',3);rim.position.set(4,-1,-3);scene.add(rim);
  const roots={} as Record<World,THREE.Group>;for(const id of Object.keys(LABELS) as World[]){roots[id]=new THREE.Group();roots[id].visible=false;scene.add(roots[id]);}
  const moving:Array<{object:THREE.Object3D;world:World;index:number;radius:number}>=[];
  const light=roots.light;
  const core=mesh(new THREE.SphereGeometry(.94,32,20),'#ffc76a',light);core.material.emissive.set('#ed891f');core.material.emissiveIntensity=.35;
  for(let i=0;i<3;i++){const band=mesh(new THREE.TorusGeometry(1.08+i*.1,.025,6,64),['#fff0b0','#ffad8e','#fffbea'][i],light);band.rotation.set(.8+i*.6,.3+i*.4,0);}
  for(let i=0;i<9;i++){const shard=mesh(new THREE.OctahedronGeometry(.10+(i%3)*.035),'#fff0be',light);moving.push({object:shard,world:'light',index:i,radius:1.5});}
  const garden=roots.nature;
  const island=mesh(new THREE.DodecahedronGeometry(1,1),'#80c7a7',garden);island.scale.set(1.12,.48,1.05);island.position.y=-.35;
  const water=mesh(new THREE.TorusGeometry(.57,.08,8,40),'#86e7ff',garden);water.rotation.x=Math.PI/2;water.scale.set(.65,1,1);water.position.y=.07;
  for(let i=0;i<7;i++){
    const a=i*2.399,rad=.3+(i%3)*.24,x=Math.cos(a)*rad,z=Math.sin(a)*rad;
    const trunk=mesh(new THREE.CylinderGeometry(.045,.065,.5,6),'#c28e72',garden);trunk.position.set(x,.25,z);
    const crown=mesh(new THREE.IcosahedronGeometry(.27+(i%2)*.1,1),['#9df0b7','#51c99a','#c6f5a2'][i%3],garden);crown.position.set(x,.57,z);crown.scale.y=1.3;
  }
  for(let i=0;i<8;i++){const leaf=mesh(new THREE.SphereGeometry(.1,8,6),i%2?'#cff5a7':'#7ee3bb',garden);leaf.scale.set(.65,1.5,.3);moving.push({object:leaf,world:'nature',index:i,radius:1.45});}
  const crystal=roots.crystal;
  const base=mesh(new THREE.IcosahedronGeometry(.95,0),'#858dcc',crystal);base.scale.y=.62;base.position.y=-.35;
  for(let i=0;i<12;i++){
    const a=i*2.399,r=.15+(i%4)*.22,h=.45+(i%5)*.18;
    const tower=mesh(new THREE.CylinderGeometry(0,.17,h,5),['#b1f0ff','#c8b0ff','#ffe4ff','#8fcaff'][i%4],crystal);
    tower.position.set(Math.cos(a)*r,h/2-.02,Math.sin(a)*r);tower.rotation.z=Math.cos(a)*-.15;tower.material.metalness=.4;
  }
  for(let i=0;i<6;i++){const gem=mesh(new THREE.OctahedronGeometry(.13),'#d8caff',crystal);moving.push({object:gem,world:'crystal',index:i,radius:1.45});}
  // A deliberately illustrated globe, not a claim that the underlying footage contains city lights.
  const {texture:earthTexture,cityPositions}=paintEarth();
  const earth=mesh(new THREE.SphereGeometry(1.13,40,28),'#ffffff',roots.earth);
  earth.material.map=earthTexture;earth.material.emissiveMap=earthTexture;earth.material.emissive.set('#ffffff');earth.material.emissiveIntensity=.5;earth.material.roughness=.65;
  const citiesGeometry=new THREE.BufferGeometry();citiesGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cityPositions,3));citiesGeometry.setDrawRange(0,0);
  const cities=new THREE.Points(citiesGeometry,new THREE.PointsMaterial({color:'#ffe8a8',size:.025,sizeAttenuation:true,depthWrite:false}));earth.add(cities);
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.19,32,20),new THREE.MeshBasicMaterial({color:'#74d8ff',transparent:true,opacity:.12,side:THREE.BackSide,depthWrite:false}));roots.earth.add(atmosphere);
  const starShape=new THREE.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.43:1.05;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(!i)starShape.moveTo(x,y);else starShape.lineTo(x,y);}starShape.closePath();
  const star=mesh(new THREE.ExtrudeGeometry(starShape,{depth:.22,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.08,bevelThickness:.08}),'#ffe397',roots.star);star.position.z=-.11;star.material.emissive.set('#ffb84b');star.material.emissiveIntensity=.3;
  const contributionGroup=new THREE.Group();roots.star.add(contributionGroup);
  const contributionOrbs:THREE.Mesh[]=[];
  for(let i=0;i<10;i++){const orb=mesh(new THREE.IcosahedronGeometry(.095,1),['#ffd28e','#9be5bd','#b6c5ff'][i%3],contributionGroup);orb.visible=false;contributionOrbs.push(orb);}
  // The three escort tokens are explicitly gifts, separate from the seat-owned lights.
  const escort=new THREE.Group();scene.add(escort);
  const escortGifts=[mesh(new THREE.OctahedronGeometry(.20),'#ffdc91',escort),mesh(new THREE.SphereGeometry(.17,10,8),'#a5e7b0',escort),mesh(new THREE.OctahedronGeometry(.20),'#c4bdff',escort)];
  escortGifts[1].scale.set(.6,1.4,.3);
  // Three ribbons are gifts from the worlds, never a fabricated participant count.
  const ribbons:THREE.Mesh[]=[];for(let i=0;i<3;i++){const ribbon=mesh(new THREE.TorusGeometry(1.24+i*.12,.017,5,56),['#ffe397','#9be5bd','#b6c5ff'][i],roots.star);ribbon.rotation.set(.5+i*.65,.25+i*.5,.1);ribbons.push(ribbon);}
  const cometTail=new THREE.Group();roots.star.add(cometTail);
  for(let i=0;i<3;i++){
    const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.6,i*.14-.14,-.2),new THREE.Vector3(-1.3,.4+i*.1,-.15),new THREE.Vector3(-2.1,.85+i*.18,-.3));
    mesh(new THREE.TubeGeometry(curve,18,.028-i*.005,5,false),['#ffe397','#9be5bd','#b6c5ff'][i],cometTail);
  }
  function init(){if(renderer||failed)return;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;stage.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');renderer.domElement.addEventListener('webglcontextlost',lost);}catch{failed=true;element.dataset.fallback='true';}}
  function lost(event:Event){event.preventDefault();failed=true;element.dataset.fallback='true';}
  function tick(now:number){
    if(disposed)return;frame=requestAnimationFrame(tick);if(now-lastDraw<1000/30)return;lastDraw=now;
    const s=snapshot,c=clock();let kind:World|null=null,fade=1;
    const active=enabled&&s?.scenarioId==='age-5-10'&&(!s.experience?.active||s.experience?.finaleActive);
    if(active&&(c.state==='playing'||c.state==='paused')){
      const t=c.time;
      const windows:Array<[World,number,number]>=[['light',60,144],['nature',144,246],['crystal',246,STAR_SCORE.cometSec],['earth',620,665]];
      const window=windows.find(([,a,b])=>t>=a&&t<b);
      if(window){kind=window[0];fade=smooth((t-window[1])/3)*smooth((window[2]-t)/3);}
      else if(t>=STAR_SCORE.cometSec&&t<504){kind='star';fade=.85;}
    }else if(active&&(c.state==='epilogue'||c.state==='ended'))kind='star';
    element.hidden=!kind;document.body.classList.toggle('star-worlds-active',!!kind);
    if(!kind||!s)return;
    init();const still=reduced.matches||s.accessibility.reducedMotion||s.accessibility.reducedStimuli;
    element.dataset.world=kind;element.style.opacity=String(fade);element.style.setProperty('--world-accent',LABELS[kind][2]);
    label.textContent=LABELS[kind][0];caption.textContent=LABELS[kind][1];
    const contributions=(s.lantern??[]).filter(p=>p.seat&&s.experience?.participants.includes(p.seat));
    if(kind==='star')caption.textContent=s.experience?.tvOnly?'Trei daruri. O stea care ne amintește de acasă.':`${contributions.filter(p=>p.linked).length} ${contributions.filter(p=>p.linked).length===1?'legătură aprinsă':'legături aprinse'} de echipaj · O poveste comună.`;
    stage.setAttribute('aria-label',`${label.textContent}. ${caption.textContent}`);
    const giftTimes=[STAR_SCORE.stageWindows[0][1],STAR_SCORE.stageWindows[1][1],STAR_SCORE.ignitionSec];
    const t=still?0:c.time,pose=JSON.stringify([kind,t,still,c.state,s.runId,s.revision,contributions,s.experience?.finale,giftTimes.map(at=>c.time>=at),stage.clientWidth,stage.clientHeight]);if(pose===lastPose)return;lastPose=pose;
    for(const id of Object.keys(roots) as World[])roots[id].visible=id===kind;
    roots[kind].rotation.set(kind==='earth'?.08:.13,kind==='earth'?-.7+t*.012:t*.075,kind==='star'?Math.sin(t*.15)*.08:0);
    roots[kind].position.y=still?0:Math.sin(t*.5)*.045;
    const cityProgress=still?1:smooth((c.time-623)/(644-623));
    citiesGeometry.setDrawRange(0,Math.floor(cityPositions.length/3*cityProgress));
    const escortVisible=kind==='light'||kind==='nature'||kind==='crystal';escort.visible=escortVisible;
    escort.position.set(.1,-1.28,.9);
    for(let i=0;i<escortGifts.length;i++){
      const gift=escortGifts[i];gift.visible=c.time>=giftTimes[i];
      gift.position.set((i-1)*.48,still?0:Math.sin(t*.8+i)*.07,0);gift.rotation.set(.2,t*.2+i,.25);
    }
    const contributionParent=kind==='star'?roots.star:scene;
    if(contributionGroup.parent!==contributionParent)contributionParent.add(contributionGroup);
    contributionGroup.visible=kind==='star'||escortVisible;
    contributionGroup.position.set(0,kind==='star'?0:-.05,kind==='star'?0:.8);
    contributionGroup.scale.setScalar(kind==='star'?1:1.15);
    for(const item of moving){if(item.world!==kind)continue;const a=t*.16+item.index*2.399;item.object.position.set(Math.cos(a)*item.radius,Math.sin(a*1.7)*.7,Math.sin(a)*.7);item.object.rotation.set(a,a*.7,a*.3);}
    for(let i=0;i<contributionOrbs.length;i++){const orb=contributionOrbs[i],p=contributions[i];const finalSymbol=p?.seat?s.experience?.finale[p.seat]:undefined;const received=!!finalSymbol&&finalSymbol!=='observe';orb.visible=(!!p?.found&&c.time>=STAR_SCORE.stageWindows[0][0])||(!!p?.mounted&&c.time>=STAR_SCORE.stageWindows[1][0])||(!!p?.linked&&c.time>=STAR_SCORE.stageWindows[2][0])||received||((c.state==='epilogue'||c.state==='ended')&&!!(p?.found||p?.mounted||p?.linked));if(!p)continue;const a=i*Math.PI*2/Math.max(1,contributions.length)+t*.12;orb.position.set(Math.cos(a)*1.45,Math.sin(a)*1.45,.2);orb.scale.setScalar(received?1.7:p.linked?1.4:p.mounted?1:.7);}
    for(let i=0;i<ribbons.length;i++)ribbons[i].visible=c.state==='epilogue'||c.state==='ended'||c.time>=giftTimes[i];
    cometTail.visible=kind==='star'&&(c.state==='playing'||c.state==='paused');
    if(!renderer||failed)return;
    const logicalWidth=Math.max(1,stage.clientWidth),logicalHeight=Math.max(1,stage.clientHeight);
    const scale=Math.min(1,880/logicalWidth,760/logicalHeight),w=Math.max(1,Math.round(logicalWidth*scale)),h=Math.max(1,Math.round(logicalHeight*scale));
    if(w!==width||h!==height){width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
    renderer.render(scene,camera);
  }
  frame=requestAnimationFrame(tick);
  return {element,update(s:MissionSnapshot){
    snapshot=s;document.body.dataset.scenario=s.scenarioId;
    const finale=s.scenarioId==='age-5-10'&&!!s.experience?.finaleActive;
    const host=finale?parent.querySelector<HTMLElement>('.experience-final .crew-world'):null;
    if(host&&element.parentElement!==host){normalParent=element.parentElement;host.append(element);}
    else if(!host&&normalParent){normalParent.append(element);normalParent=null;}
    element.classList.toggle('star-worlds-embedded',!!host);
  },dispose(){disposed=true;cancelAnimationFrame(frame);renderer?.domElement.removeEventListener('webglcontextlost',lost);scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials)m.dispose();}});earthTexture.dispose();renderer?.dispose();element.remove();}};
}

function paintEarth(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#0c2348';ctx.fillRect(0,0,1024,512);
  const lands=[[[.05,.2],[.15,.13],[.28,.2],[.29,.34],[.22,.45],[.2,.55],[.15,.4],[.09,.37]],[[.23,.49],[.32,.54],[.33,.67],[.27,.88],[.23,.75]],[[.43,.23],[.5,.19],[.55,.29],[.52,.37],[.43,.35]],[[.44,.38],[.54,.37],[.59,.52],[.53,.75],[.46,.65],[.41,.48]],[[.53,.22],[.69,.13],[.88,.22],[.9,.38],[.79,.48],[.7,.4],[.63,.55],[.56,.4]],[[.79,.62],[.9,.63],[.93,.75],[.81,.79],[.76,.71]]];
  ctx.fillStyle='#236d74';for(const points of lands){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x*1024,y*512):ctx.moveTo(x*1024,y*512));ctx.closePath();ctx.fill();}
  // Seeded illustration points confined to the painted land. No city is baked
  // into the texture: one Points drawRange reveals them against the show clock.
  const pixels=ctx.getImageData(0,0,1024,512),cityPositions:number[]=[];
  let seed=4201;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<2400;i++){
    const x=Math.floor(random()*1024),y=Math.floor(random()*512),index=(y*1024+x)*4;
    if(pixels.data[index]!==35)continue;
    const phi=x/1024*Math.PI*2,theta=y/512*Math.PI,r=1.138;
    cityPositions.push(-r*Math.cos(phi)*Math.sin(theta),r*Math.cos(theta),r*Math.sin(phi)*Math.sin(theta));
  }
  ctx.fillStyle='#bce6e7';ctx.fillRect(0,487,1024,25);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return {texture,cityPositions};
}
