/** One-time migration from the 465s show; refuses to retime an already migrated show. */
import fs from 'node:fs';
import {build} from 'esbuild';
const built=await build({entryPoints:['src/shared/film-timing.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {remapFilmTime:map,FILM_DURATION,publicDurationSec}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const show=read('assets/show/show.json');
if(show.videoDurationSec!==465)throw Error('Already migrated or unknown source; no files changed.');
fs.mkdirSync('runs/film-reintegration',{recursive:true});
write('runs/film-reintegration/show-before.json',show);
const changes=show.cues.filter(c=>c.phase==='play').map(c=>({id:c.id,old:c.at,new:map(c.at)}));
for(const c of show.cues)if(c.phase==='play'){
 const old=c.at;c.at=map(old);
 if(c.durationSec&&old>=0)c.durationSec=Math.max(.1,map(Math.min(465,old+c.durationSec))-c.at);
 if(c.note)c.note='Sincronizat după filmul panoramic; timpii sunt secunde de film.';
}
show.videoDurationSec=FILM_DURATION;show.version='0.6.0-film-panels';
for(const s of show.scenes)if(s.phase==='play'){
 s.start=map(s.start);s.end=s.id==='wormhole'?504:s.id==='revelation'?FILM_DURATION:map(s.end);
}
const descriptions={launch:'Cadru de deschidere ilustrat; Pământul vizibil la 10 s, ieșit la 20 s; stele și apropiere de sursa luminoasă.',light:'Sursă albă strălucitoare în apropiere la 80–100 s; plecare înainte de 110 s. Dialogul continuă prin radio.',nature:'Kepler recognoscibil la 180 s, apropiere la 200 s, ieșire din cadrul central între 210 și 220 s. Dialogul continuă prin radio.',tech:'Mann vizibil la 280–310 s; plecare înainte de 320 s. Gargantua intră între 344 și 345 s și rămâne vizibilă la 380 s.',wormhole:'Viraj după Gargantua; tunel cu imaginea unei planete cu inele la 420–440 s; traversare și câmp de stele până la apropierea Saturn.',revelation:'Pământul recognoscibil la 610 s, mare la 630–640 s; trecere apropiată la 650 s, apoi stele. Nu există hold final pe Pământ.'};
for(const s of show.scenes)if(descriptions[s.id])s.spaceEngineBeat=descriptions[s.id];
show.scenes.splice(show.scenes.findIndex(s=>s.id==='revelation'),0,{id:'saturn',label:'Saturn · Primul semn de acasă',phase:'play',start:504,end:610,theme:'home',spaceEngineBeat:'Saturn cu inele recognoscibil la 504 s; apropiere 510–540 s, plecare înainte de 560 s; drumul spre Pământ.'});
show.scenes.find(s=>s.id==='reentry').spaceEngineBeat='Ultimul cadru de stele persistă; finalul interactiv continuă fără reset.';
show.cues.find(c=>c.id==='rev-hold-marker').label='Filmul se termină; epilogul continuă pe ultimul cadru de stele.';
show.cues.find(c=>c.id==='home-transmit-marker').label='Semnalul echipajului este transmis după apropierea de Pământ.';
show.cues.find(c=>c.id==='wormhole-marker').label='Tunelul și traversarea; Saturn se vede prin lentila tunelului.';
show.cues.find(c=>c.id==='nature-marker-silence').label='Dialog radio după trecerea pe lângă Kepler; pregătirea următoarei lumi.';
const source=read('assets/show/voice-script-v3.json');source.version='3.4.0-film-panels';
for(const c of source.cues)if(c.phase==='play')c.at=map(c.at);
const newLines=[
 ['v4-saturn-01','CAPITANUL',510,'Priviți inelele! E Saturn. Suntem din nou în Sistemul Solar. De aici, drumul spre casă ne este cunoscut.'],
 ['v4-saturn-02','AVATAR_AI',527,'De departe, inelele par întregi. De aproape, sunt nenumărate bucăți de gheață și rocă. Fiecare se rotește în jurul lui Saturn.'],
 ['v4-saturn-03','CAPITANUL',557,'Lăsăm Saturn în urmă. Următoarea oprire este o lume cu oceane, nori și oameni care ne așteaptă.']
].map(([id,speaker,at,text])=>({id,kind:'voice',phase:'play',at,speaker,text:{ro:text},fallback:'silent',condition:'always',maxDurationSec:15,direction:'cald, clar, uimit fără strigăte; pauze naturale',tts:{audioTags:['warmly','calm']}}));
source.cues.push(...newLines);
show.cues.push(...newLines.map(({maxDurationSec,tts,condition,...c})=>c),{id:'saturn-theme',kind:'theme',phase:'play',at:504,theme:'home'},{id:'saturn-tablets-rest',kind:'tablet',phase:'play',at:504,interaction:{type:'waiting'}});
// Correct a fixed headcount: the installation also runs with one participant.
for(const data of [source,show])data.cues.find(c=>c.id==='v3-cap-0501').text.ro='Ritmuri diferite. Un singur echipaj.';
const rank={preshow:0,play:1,epilogue:2};const sort=c=>c.sort((a,b)=>rank[a.phase]-rank[b.phase]||a.at-b.at);
sort(source.cues);sort(show.cues);
for(const c of source.cues){c.publicAtSec=c.phase==='preshow'?c.at:c.phase==='play'?60+c.at:60+FILM_DURATION+c.at;const next=Math.min(...source.cues.filter(n=>n.phase===c.phase&&n.at>c.at).map(n=>n.at),c.phase==='preshow'?50:c.phase==='play'?FILM_DURATION:75);c.maxDurationSec=+(next-c.at).toFixed(3);c.fallback='silent';}
show.$comment=`Sincronizare vizuală autorizată: repere măsurate direct în center.mp4; fără decalaj global script→film. Gargantua 344–345 s, Saturn 504 s, Pământul 610 s. Film ${FILM_DURATION} s; durată publică derivată ${publicDurationSec(show)} s, fără tutorialul interactiv. Vezi docs/REINTEGRARE-FILM.md.`;
write('assets/show/show.json',show);write('assets/show/voice-script-v3.json',source);
// Age packages retain their distinct dialogue and branching; all use the same film clock.
const offsets={'s1015-03':23.2,'s1015-26':418.3,'s1015-30':455.5,'s1015-36':55.5,'s1518-04':36.5,'s1518-29':452.4,'s1518-37':71};
for(const id of ['age-5-10','age-10-15','age-15-18','adults']){
 const file=`assets/scenarios/${id}/dialogue.ro.draft.json`,draft=read(file);write(`runs/film-reintegration/${id}-before.json`,draft);
 for(const c of draft.cues){if(offsets[c.id]!==undefined)c.at=offsets[c.id];if(c.phase==='play')c.at=map(c.at);}
 draft.cues.push(...structuredClone(newLines));sort(draft.cues);draft.timingStatus='film-panels-visual';draft.filmDurationSec=FILM_DURATION;
 for(const c of draft.cues){const next=Math.min(...draft.cues.filter(n=>n.phase===c.phase&&n.at>c.at).map(n=>n.at),c.phase==='preshow'?50:c.phase==='play'?FILM_DURATION:75);c.maxDurationSec=+(next-c.at).toFixed(3);}
 write(file,draft);
}
const music=read('assets/music/manifest.json');
for(const t of music.tracks)if(t.phase==='play'){const end=t.id==='M07'?504:t.id==='M08'?FILM_DURATION:map(t.startSec+t.windowSec);t.startSec=map(t.startSec);t.windowSec=end-t.startSec;if(t.windowSec>t.durationSec)t.loop=true;}
const home=music.tracks.find(t=>t.id==='M08');music.tracks.push({...home,id:'M11',sceneId:'saturn',startSec:504,windowSec:106,loop:true,fadeInSec:3,fadeOutSec:3,gainDb:-4});
write('assets/music/manifest.json',music);
fs.writeFileSync('runs/film-reintegration/cue-remap.md','| Cue | Vechi | Nou |\n|---|---:|---:|\n'+changes.map(c=>`| ${c.id} | ${c.old} | ${c.new} |`).join('\n')+'\n');
console.log(`Migrated ${changes.length} play cues and all four age profiles; added three shared Saturn recordings.`);
