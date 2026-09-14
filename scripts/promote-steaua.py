"""Promote complete generated media, archiving replaced voice packs before retirement."""
import json, hashlib, shutil
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from datetime import datetime
ROOT=Path(__file__).resolve().parents[1]
STAGE=ROOT/'runs/steaua-production/staged'
packs=[('scenario','assets/scenarios/age-5-10/voice/ro',55),('narrator','assets/experience/voice/ro',12),('vr','assets/experience/vr/ro',3)]
manifests={}
for group,target,count in packs:
    manifest=json.loads((STAGE/group/'manifest.json').read_text(encoding='utf-8'))
    assert len(manifest['clips'])==count, group
    for clip in manifest['clips'].values():
        assert hashlib.sha256((STAGE/group/clip['file']).read_bytes()).hexdigest()==clip['sha256'], clip['file']
    manifests[group]=manifest
music=json.loads((STAGE/'music/manifest.json').read_text(encoding='utf-8'))
for track in music['scenarios']['age-5-10']['tracks']:
    assert hashlib.sha256((STAGE/'music'/track['file']).read_bytes()).hexdigest()==track['sha256']
    track['promptRef']='docs/STEAUA-OMENIRII-INTEGRARE.md'
archive=ROOT/'runs/steaua-production'/('retired-voices-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.zip')
with ZipFile(archive,'w',ZIP_DEFLATED) as z:
    for _,target,_ in packs[:2]:
        for file in (ROOT/target).rglob('*'):
            if file.is_file(): z.write(file,str(file.relative_to(ROOT)))
    for file in [ROOT/'assets/scenarios/age-5-10/dialogue.ro.draft.json',ROOT/'assets/music/manifest.json']:
        z.write(file,str(file.relative_to(ROOT)))
for group,target,_ in packs:
    destination=ROOT/target
    destination.mkdir(parents=True,exist_ok=True)
    for file in (STAGE/group).iterdir():
        if file.suffix=='.mp3' or file.name.endswith('.receipt.json'): shutil.copy2(file,destination/file.name)
    # Old listening reels and transcription reports describe retired speech, not this edition.
    for file in destination.iterdir():
        if file.name.startswith(('preview','transcription')) or file.name=='production-report.json':
            if file.is_file(): file.unlink()
    manifest=manifests[group]
    if group=='narrator': manifest={k:manifest[k] for k in ['schemaVersion','lang','voiceId','voiceName','clips']}
    (destination/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for track in music['scenarios']['age-5-10']['tracks']:
    shutil.copy2(STAGE/'music'/track['file'],ROOT/'assets/music'/track['file'])
(ROOT/'assets/music/manifest.json').write_text(json.dumps(music,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
shutil.copy2(STAGE/'dialogue.ro.draft.json',ROOT/'assets/scenarios/age-5-10/dialogue.ro.draft.json')
print('Promoted 70 voices and 11 music masters. Retired voice archive:',archive)
