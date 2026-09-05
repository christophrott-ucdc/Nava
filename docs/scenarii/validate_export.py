"""Validate editorial dialogue tables and export inactive production drafts.

Run from the repository root with Python 3. No runtime assets are overwritten.
Slot validation is textual, not a substitute for recording and rehearsal.
"""
import hashlib
import itertools
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROFILES = [
    ('age-5-10', '05-10-BUCATILE-DE-ACASA.md', 120),
    ('age-10-15', '10-15-SEMNALUL-FARA-SEMNATURA.md', 130),
    ('age-15-18', '15-18-DREPTUL-DE-A-SCHIMBA-CURSUL.md', 130),
    ('adults', 'ADULTI-CE-LASAM-DESCHIS.md', 130),
]

def states(profile):
    # Editorial truth tables, deliberately separate from the production engine.
    if profile == 'age-5-10':
        for counts in itertools.product(range(11), repeat=3):
            active = {'always'}
            for name, count in zip(('find', 'fit', 'link'), counts):
                active.add(name + ('_none' if count == 0 else '_complete' if count == 10 else '_partial'))
            active.add('final_' + ('none' if sum(counts) == 0 else 'complete' if counts == (10, 10, 10) else 'partial'))
            yield active
    elif profile == 'age-10-15':
        for evidence in (False, True):
            for n in range(11):
                for r in range(n + 1):
                    yield {'always', 'N' if n == 0 else 'V' if evidence and r > n/2 else 'D' if evidence else 'O'}
    elif profile == 'age-15-18':
        for complete in range(6):
            for changed in range(11):
                yield {'always', 'DRAFT' if complete == 0 else 'PARTIAL' if complete < 5 else 'REVISED' if changed else 'RETAINED'}
    else:
        for available in range(11):
            for observation in range(available + 1):
                for probe in range(available - observation + 1):
                    count = observation + probe
                    yield {'always', 'all_channels_have_document' if available == 10 else 'some_channels_have_no_document',
                           'archive_both_types' if observation and probe else 'archive_one_type' if count else 'archive_empty',
                           'archive_full' if count == 10 else 'archive_partial'}

report = []
catalog = []
for profile, filename, limit in PROFILES:
    source = ROOT / 'docs/scenarii' / filename
    cues = []
    for line in source.read_text(encoding='utf-8').splitlines():
        columns = [x.strip() for x in line.strip().strip('|').split('|')]
        if len(columns) != 7 or columns[1] not in ('preshow', 'play', 'epilogue'):
            continue
        cue_id, phase, at, slot, speaker, condition, spoken = columns
        cues.append(dict(id=cue_id, phase=phase, at=float(at), maxDurationSec=float(slot),
                         speaker=speaker, condition=condition, text={'ro': spoken.strip('„”')}))
    assert cues and len({c['id'] for c in cues}) == len(cues), filename
    groups = {}
    for c in cues:
        assert c['text']['ro'].strip(), ('empty text', c)
        assert c['speaker'] in ('CAPITANUL', 'AVATAR_AI', 'LUMINA', 'NATURA', 'TEHNOLOGIC'), c
        lower, upper = {'preshow': (0, 50), 'play': (-10, 465), 'epilogue': (0, 75)}[c['phase']]
        assert c['maxDurationSec'] > 0 and lower <= c['at'] and c['at'] + c['maxDurationSec'] <= upper, c
        assert len(c['text']['ro'].split()) * 60 <= c['maxDurationSec'] * limit, ('too fast', c)
        groups.setdefault((c['phase'], c['at']), []).append(c)
    words, lengths, covered = [], [], set()
    fixtures = list(states(profile))
    for active in fixtures:
        selected = []
        for group in groups.values():
            matches = [c for c in group if c['condition'] in active]
            assert len(matches) == 1, ('nonexclusive or missing branch', profile, active, group)
            selected.extend(matches)
        for phase in ('preshow', 'play', 'epilogue'):
            ordered = sorted((c for c in selected if c['phase'] == phase), key=lambda c: c['at'])
            for previous, current in zip(ordered, ordered[1:]):
                assert previous['at'] + previous['maxDurationSec'] <= current['at'], ('overlap', previous, current)
        covered.update(c['id'] for c in selected)
        words.append(sum(len(c['text']['ro'].split()) for c in selected))
        lengths.append(len(selected))
    assert len(covered) == len(cues), ('unreachable cue', profile)
    output = ROOT / 'assets/scenarios' / profile / 'dialogue.ro.draft.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(schemaVersion=1, scenarioId=profile, language='ro', status='editorial-draft',
                   productionReady=False, runtimeActivation='not-loaded', audioStatus='not-produced',
                   timingStatus='proposed-slots', sourceDocument=source.relative_to(ROOT).as_posix(),
                   sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                   conditionSemantics='See source document; no runtime evaluator supplied.', cues=cues)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    assert json.loads(output.read_text(encoding='utf-8')) == payload
    catalog.append(dict(profile=profile, path=output.relative_to(ROOT).as_posix(), productionReady=False))
    report.append(f'| {profile} | {len(cues)} | {min(lengths)} | {sum(len(c["text"]["ro"].split()) for c in cues)} | {min(words)}–{max(words)} | {limit} | {len(fixtures)} |')

(ROOT / 'assets/scenarios/editorial-catalog.draft.json').write_text(
    json.dumps(dict(status='editorial-draft', runtimeActivation='not-loaded', profiles=catalog), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
header = '''# Validare editorială — 5 septembrie 2026

Verificare reproductibilă: `python docs/scenarii/validate_export.py`, din rădăcina repository-ului.
Scriptul exportă numai drafturile din `assets/scenarios/`; nu modifică show-ul activ.

| Profil | Replici în bancă | Replici/rulare | Cuvinte în bancă | Cuvinte/rulare | Plafon cuvinte/min | Stări editoriale enumerate |
|---|---:|---:|---:|---:|---:|---:|
'''
footer = '''
Au trecut: ID-uri unice, vorbitori declarați, text prezent, limite de fază, sloturi fără suprapuneri pe fiecare ramură, plafon textual de rostire, exact o replică per slot în fiecare stare enumerată, accesibilitatea tuturor variantelor și recitirea JSON exportat. Numărătoarea tratează cuvintele separate prin spații; formele cu cratimă sunt un cuvânt. Stările numerice sunt o verificare editorială conservatoare, nu o simulare a reducerelor de producție.

Nu sunt verificate prin acest script: implementarea interacțiunilor, gesturile și înțelegerea publicului, actualizarea WebSocket, durata vocilor reale, sincronizarea optică pe film, GLB, subtitrări sau hardware. Nu s-au produs voci și nu s-a activat vreun profil. Sunt necesare probe cu copii, adolescenți și adulți, apoi producție și verificare pe instalația reală. Testele aplicației nu înlocuiesc aceste probe; această livrare nu modifică aplicația.
'''
(ROOT / 'docs/scenarii/VALIDARE-EDITORIALA.md').write_text(header + '\n'.join(report) + '\n' + footer, encoding='utf-8')
print('\n'.join(report))
print('PASS: editorial tables, branch fixtures, textual slots and JSON exports')
