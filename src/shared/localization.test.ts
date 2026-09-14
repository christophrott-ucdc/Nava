import test from 'node:test';
import assert from 'node:assert/strict';
import {translateText,languageOf} from './localization';
import {decodeDiploma,publicDiplomaUrl} from './public-diploma';
import type {MissionRecord} from './mission';
import {buildSystemPrompt,pickCannedReply} from '../server/features/dialog';
import {buildDynamicVoice} from '../server/features/dynamic-voice';

test('localization preserves Romanian exactly and keeps gameplay IDs unchanged',()=>{
 for(const lang of ['ro','en','fr'] as const){
  assert.equal(translateText('play:match:Picătură',lang),'play:match:Picătură');
  assert.equal(translateText('crew:draft:nova',lang),'crew:draft:nova');
 }
 assert.equal(translateText('  Așază piesa\n','ro'),'  Așază piesa\n');
 assert.equal(languageOf('de'),'ro');
});
test('game instructions retain scientific meaning and interpolate localized shapes',()=>{
 assert.equal(translateText('Închide circuitul. Aprinde becul.','en'),'Complete the circuit. Light the bulb.');
 assert.equal(translateText('Închide circuitul. Aprinde becul.','fr'),"Ferme le circuit. Allume l'ampoule.");
 assert.equal(translateText('Ia piesa Picătură','en'),'Take the Drop piece');
 assert.equal(translateText('Ia piesa Picătură','fr'),'Prends la pièce Goutte');
 assert.equal(translateText('Semnal: 83%. Pregătește primul ritm.','fr'),'Signal : 83 %. Prépare ton premier rythme.');
 assert.equal(translateText('Înainte: se oprește și cere acordul. Acum: se oprește și cere acordul.','en'),'Before: it stops and asks for approval. Now: it stops and asks for approval.');
});
test('public diploma carries its language without a LAN or session dependency; old QR codes remain valid',()=>{
 const record={scenarioId:'age-5-10',createdAt:'2026-09-13T10:00:00Z',mode:'public',checkpoint:{lang:'fr'},experience:{participants:['1A'],crew:{characters:{'1A':'nova'}}}} as unknown as MissionRecord;
 const url=publicDiplomaUrl('https://diplomas.exodus7.com/',record)!;
 assert.equal(decodeDiploma(new URL(url).hash).lang,'fr');
 const old=btoa(JSON.stringify([1,1,'2026-09-13',[['1A','nova']],0]));assert.equal(decodeDiploma(old).lang,'ro');
 const romanian={...record,checkpoint:{lang:'ro'}} as unknown as MissionRecord;
 const compatible=new URL(publicDiplomaUrl('https://diplomas.exodus7.com/',romanian)!).hash.slice(1).replace(/-/g,'+').replace(/_/g,'/');
 assert.equal(JSON.parse(atob(compatible)).length,5,'Romanian QR remains readable by the previous public portal');
 const bad=btoa(JSON.stringify([1,1,'2026-09-13',[],0,'de']));assert.throws(()=>decodeDiploma(bad));
});

test('live dialogue and generated summaries respect the requested language',()=>{
 assert.match(buildSystemPrompt(undefined,'en'),/ONLY in English/);
 assert.match(buildSystemPrompt(undefined,'fr'),/UNIQUEMENT en français/);
 assert.match(buildSystemPrompt(undefined,'ro'),/DOAR în limba română/);
 assert.match(pickCannedReply('the light on Siwarha','en'),/Siwarha/);
 assert.match(pickCannedReply('la lumière de Siwarha','fr'),/Siwarha/);
 for(const lang of ['en','fr'] as const){
  assert(!/[ășț]/.test(pickCannedReply('hello',lang)));
  const message=buildDynamicVoice({id:'test',kind:'dynamic-voice',phase:'play',at:0,speaker:'CAPITANUL',source:'tablet-messages'},{lang,answers:[]});
  assert.equal(message.lang,lang);assert.equal(message.text,lang==='en'?"We haven't received a message from the crew yet.":"Nous n'avons pas encore reçu de message de l'équipage.");
 }
});
