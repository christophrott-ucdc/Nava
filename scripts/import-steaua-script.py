"""Import the supplied theatre document into a staged source, leaving live audio untouched."""
import sys, json, re, hashlib, shutil
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as E

ROOT=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1])
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(source) as archive:
    document=E.fromstring(archive.read('word/document.xml'))
    paragraphs=[''.join(t.text or '' for t in p.findall('.//w:t',ns)).strip() for p in document.findall('.//w:body//w:p',ns)]
paragraphs=[p for p in paragraphs if p]
pattern=re.compile(r'^(?:Varianta [ABC]\s*[—–-]\s*)?(NARATORUL|COMANDANTUL|AVATARUL AI|LUMINA|NATURA|TEHNOLOGICUL)\s*(?:[—–-]\s*)?(R\d+[a-z]?|RV\d)\b\s*(?:NOU\s*)?(.*)$')
replicas={}
for i,p in enumerate(paragraphs):
    match=pattern.match(p)
    if not match: continue
    speaker,ref,remainder=match.groups();direction=''
    if remainder.startswith('['):
        direction,remainder=remainder[1:].split(']',1)
    if not remainder.strip():
        j=i+1
        while j<len(paragraphs) and paragraphs[j].startswith('['):
            direction+=' '+paragraphs[j].strip('[]');j+=1
        remainder=paragraphs[j]
    replicas[ref]={'ref':ref,'speaker':speaker,'originalText':remainder.strip(),'text':remainder.strip(),'direction':direction.strip()}
expected={f'R{i:02d}' for i in range(1,54)}|{'R13a','R14a','R14b','R21a','R21b','R28a','R28b','R34a','R40a','R42a','RV1','RV2','RV3'}
if set(replicas)!=expected: raise SystemExit(f'Unexpected reference coverage: missing {expected-set(replicas)}, extra {set(replicas)-expected}')
# The author's inline revision replaces the suitcase with an escort of light.
overrides={
 'R13a':('Priviți Pământul. Acolo jos e toată lumea pe care o știți.','Spațiu tipografic eliminat înainte de punct.'),
 'R27':('Trimit o frunză din grădina mea, să zboare cu voi. Frunza ține minte soarele.','Aplicată revizia explicită a autorului din nota de după R21.'),
 'R28b':(replicas['R28b']['text'].replace('se intampla','se întâmplă'),'Diacritice normalizate.'),
 'R41':('Pământul! Uite ce albastru e. De aici am plecat pe întuneric — și uite cu ce alai ne întoarcem.','Aplicată revizia explicită a autorului din nota de după R21.'),
 'R50':(replicas['R50']['text'].replace('Închid valiza. ',''),'Eliminată valiza rămasă în text după revizia către escorta de lumini.'),
}
for ref,(text,reason) in overrides.items(): replicas[ref].update(text=text,editorialChange=reason)
old=json.loads((ROOT/'assets/scenarios/age-5-10/dialogue.ro.draft.json').read_text(encoding='utf-8-sig'))
order={'preshow':0,'play':1,'epilogue':2}
oldcues=sorted(old['cues'],key=lambda c:(order[c['phase']],c['at']))
if len(oldcues)!=45:
    raise SystemExit('Import already applied or baseline changed. Preserve steaua-authoring.json; do not remap revised cue IDs by position.')
mapping={f'R{i+7:02d}':c for i,c in enumerate(oldcues)}
newtimes={'R13a':16,'R14a':40,'R14b':54,'R21a':148,'R21b':164,'R28a':254,'R28b':270,'R34a':364,'R40a':580,'R42a':637}
speakerkeys={'COMANDANTUL':'CAPITANUL','AVATARUL AI':'AVATAR_AI','LUMINA':'LUMINA','NATURA':'NATURA','TEHNOLOGICUL':'TEHNOLOGIC'}
tags={'CAPITANUL':['confident'],'AVATAR_AI':['warmly'],'LUMINA':['gentle'],'NATURA':['warmly'],'TEHNOLOGIC':['thoughtful']}
cues=[]
for ref,r in replicas.items():
    if r['speaker']=='NARATORUL' or ref.startswith('RV'): continue
    prior=mapping.get(ref)
    cue={**(prior or {}),'id':prior['id'] if prior else 'star-'+ref.lower(),'phase':prior['phase'] if prior else 'play',
         'at':prior['at'] if prior else newtimes[ref],'maxDurationSec':prior['maxDurationSec'] if prior else 20,
         'speaker':speakerkeys[r['speaker']],'condition':prior['condition'] if prior else 'always','text':{'ro':r['text']},
         'direction':r['direction'],'authorRef':ref,'tts':{'audioTags':tags[speakerkeys[r['speaker']]]}}
    cues.append(cue)
cues.sort(key=lambda c:(order[c['phase']],c['at']))
narratorids={'R01':'intro','R02':'touch','R03':'age-5-10-practice','R04':'cooperate','R05':'ready','R06':'handoff','R52':'finale','R53':'hint'}
narration={key:replicas[ref] for ref,key in narratorids.items()}
payload={'version':1,'title':'Steaua Omenirii','scenarioId':'age-5-10','sourceDocument':'docs/scenarii/surse/Steaua-Omenirii.docx',
 'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'dialogue':{**old,'title':'Steaua Omenirii','cues':cues},
 'narrator':narration,'vr':{ref:r for ref,r in replicas.items() if ref.startswith('RV')},'replicas':replicas,
 'notes':['Reperele din anexă sunt propuneri; se reașază după durata reală a noilor clipuri.',
          'Ghidul rămâne rostit liber. Robotul și capsula VR rămân extensii hardware neactivate.']}
dest=ROOT/'assets/scenarios/age-5-10/steaua-authoring.json'
dest.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
docs=ROOT/'docs/scenarii/surse';docs.mkdir(parents=True,exist_ok=True)
shutil.copyfile(source,docs/'Steaua-Omenirii.docx')
(docs/'Steaua-Omenirii-extras.txt').write_text('\n\n'.join(paragraphs)+'\n',encoding='utf-8')
print(f'Imported {len(cues)} scenario cues, {len(narration)} narrator cues, {len(payload["vr"])} optional VR cues. Live dialogue and audio unchanged.')
