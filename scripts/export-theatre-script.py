"""Export the current children's dialogue as an editable play, without changing runtime assets."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'scenarii'
stem = OUT / 'SCENARIU-TEATRU-COPII-DE-EDITAT'
if any(stem.with_suffix(extension).exists() for extension in ('.md', '.rtf')):
    raise SystemExit('Export already exists. Preserve the author edits; choose a new output name for another export.')
dialogue = json.loads((ROOT / 'assets/scenarios/age-5-10/dialogue.ro.draft.json').read_text(encoding='utf-8-sig'))
narrator = json.loads((ROOT / 'assets/experience/voice/ro/manifest.json').read_text(encoding='utf-8-sig'))['clips']
speakers = {'CAPITANUL':'CĂPITANUL', 'AVATAR_AI':'AVATARUL AI', 'LUMINA':'LUMINA', 'NATURA':'NATURA', 'TEHNOLOGIC':'TEHNOLOGICUL'}
blocks = []
references = []

def add(kind, text):
    blocks.append((kind, text))

def utterance(speaker, text, source, direction=None, timing=None):
    number = len(references) + 1
    add('speaker', f'{speaker}    R{number:02d}')
    if direction:
        add('stage', f'[{direction}]')
    add('speech', text)
    references.append((f'R{number:02d}', source, timing or 'La comanda sau la progresul tutorialului'))

def voice(key, direction):
    utterance('NARATORUL', narrator[key]['text'], f'narator / {key}', direction)

def scene(title, note, cues):
    add('h1', title)
    add('stage', f'[{note}]')
    previous_slot = None
    for cue in sorted(cues, key=lambda c:c['at']):
        condition = cue['condition']
        if condition != 'always':
            slot = (cue['phase'], cue['at'])
            if slot != previous_slot:
                add('stage', '[Următoarele trei replici sunt alternative. Într-o reprezentație se rostește una singură, potrivit contribuțiilor participanților.]')
            previous_slot = slot
            branch = condition.rsplit('_', 1)[1]
            add('branch', {'complete':'Varianta A — Toți participanții activi au încheiat activitatea',
                           'partial':'Varianta B — Există contribuții, dar activitatea nu este completă pentru toți',
                           'none':'Varianta C — Nu există contribuții la această activitate'}[branch])
            if condition.startswith('final_'):
                add('stage', '[La această alegere se iau în calcul împreună toate cele trei activități ale călătoriei.]')
        utterance(speakers[cue['speaker']], cue['text']['ro'], cue['id'], cue.get('direction'),
                  f"{ {'preshow':'Primire', 'play':'Film', 'epilogue':'Epilog'}[cue['phase']]} · {cue['at']:g} s")

add('title', 'EXODUS7 Bucățile de acasă')
add('subtitle', 'Scenariu complet pentru rescriere teatrală')
add('p', 'Publicul acestui scenariu: copii de 5–10 ani. Versiune de lucru pentru autor, cu dialogul actual, tutorialul naratorului, toate răspunsurile alternative și încheierea interactivă.')
add('p', 'Autorul rescrierii: ........................................    Data: ........................')
add('h1', 'Cum lucrezi în acest document')
add('p', 'Înlocuiește direct replicile de sub numele personajelor. Modifică liber scenele, intențiile, umorul și finalul. Textele dintre paranteze drepte sunt indicații pentru lucru și nu se rostesc. Numele personajelor și numerele R identifică replicile; nici ele nu se citesc cu voce tare.')
add('p', 'Păstrează, dacă poți, numerele R ale replicilor existente. Pentru o replică nouă poți scrie R12a sau NOU. Numerotarea și reperele de la sfârșit ne vor ajuta să punem ulterior noul text în aplicație. Editarea acestui document nu schimbă automat filmul, vocile sau programul.')
add('p', 'Aceasta este versiunea completă a experienței pentru copii. DEMO TV omite tutorialul și primirea, începe la numărătoarea inversă și folosește răspunsurile fără contribuții; acestea sunt păstrate aici alături de toate celelalte variante.')
add('h1', 'Personajele și spațiul de joc')
for text in [
    'CĂPITANUL — conduce călătoria și vorbește cu echipajul. Apare ca personaj 3D pe televizorul central; nu este un actor prezent fizic în sală.',
    'AVATARUL AI — vocea de bord care explică, observă și îi însoțește pe participanți. Robotul fizic nu face parte din această versiune.',
    'NARATORUL — voce separată, care întâmpină publicul, explică folosirea comenzilor și invită la alegerea de final.',
    'LUMINA — vocea primei lumi, Siwarha; oferă bucățile de lumină.',
    'NATURA — vocea atelierului în care piesele își găsesc locul.',
    'TEHNOLOGICUL — vocea atelierului Mann, unde este completat felinarul.',
    'ECHIPAJUL — participanții. Acțiunile și reacțiile lor sunt libere; scenariul actual nu le impune replici rostite.',
    'GHIDUL — persoana din sală care conduce îmbarcarea și ieșirea. Nu are replici înregistrate în acest pachet; autorul le poate adăuga.',
]: add('p', text)
add('stage', '[Cinci televizoare alcătuiesc panorama. Căpitanul apare pe cel central. Cele cinci tablete au două locuri fiecare: A în stânga, B în dreapta, cu textul citit normal. Participă între una și zece persoane; locurile neocupate nu reprezintă personaje absente din poveste. Valiza și felinarul sunt elemente ale poveștii, nu recuzită fizică obligatorie.]')

add('h1', 'Prologul Îmbarcarea și primele comenzi')
add('stage', '[Ecran de așteptare EXODUS7. Participanții își aleg personajele pe tablete și le confirmă. Ghidul pornește tutorialul. Filmul călătoriei nu a început. Pauzele de aici urmează acțiunile participanților.]')
voice('intro', 'Întâmpinarea echipajului.')
voice('touch', 'După introducere. Fiecare participant poate atinge lumina din jumătatea lui sau poate alege să privească.')
voice('age-5-10-practice', 'Exercițiul pentru copii. Pe tabletă se alege steaua, apoi se confirmă. Se așteaptă participanții activi.')
voice('cooperate', 'Fiecare participant trimite semnalul său. Într-o sesiune cu un singur participant este suficient semnalul acestuia; nu se așteaptă locurile libere.')
voice('ready', 'Pregătirea pentru plecare. Ghidul confirmă lansarea după încheierea explicației.')
voice('handoff', 'Predarea către Căpitan. Urmează primirea din scenariul principal.')

cues = dialogue['cues']
scene('Scena 1 Primirea la bord', 'Primirea durează în prezent 50 de secunde, înaintea filmului. Publicul este așezat, iar Căpitanul și vocea de bord prezintă căutarea felinarului.', [c for c in cues if c['phase']=='preshow'])
scene('Scena 2 Plecarea de pe Pământ', 'Numărătoare inversă de zece secunde, apoi începe filmul. Pământul rămâne în urmă. Intervalul actual al filmului: 0–60 s.', [c for c in cues if c['phase']=='play' and c['at']<60])
scene('Scena 3 Lumea Luminii', 'Prima oprire este Siwarha. Activitate: participantul recunoaște o formă și atinge piesa potrivită. Fereastra actuală a jocului: 96–120 s. Film: 60–144 s.', [c for c in cues if c['phase']=='play' and 60<=c['at']<144])
scene('Scena 4 Atelierul Naturii', 'Activitate: participantul rotește și așază piesa în contur. Piesele și lumina construiesc povestea felinarului. Fereastra actuală a jocului: 204–224 s. Film: 144–246 s.', [c for c in cues if c['phase']=='play' and 144<=c['at']<246])
scene('Scena 5 Atelierul Mann', 'Activitate: participantul rotește două legături, închide un circuit și aprinde becul. Fereastra actuală a jocului: 323,5–355,5 s. Film: 246–388 s. Gaura neagră apare în acest segment al filmului; atelierul și călătoria fac parte din ficțiunea experienței.', [c for c in cues if c['phase']=='play' and 246<=c['at']<388])
scene('Scena 6 Tunelul de stele', 'Se privește panorama. Nu există o activitate de rezolvat pe tablete. Film: 388–504 s. Tunelul este un element de ficțiune; nu este prezentat ca un mijloc de călătorie demonstrat științific.', [c for c in cues if c['phase']=='play' and 388<=c['at']<504])
scene('Scena 7 Saturn și drumul spre casă', 'Saturn este vizibil în film. Moment de observație, apoi revenire spre Pământ. Film: 504–610 s.', [c for c in cues if c['phase']=='play' and 504<=c['at']<610])
scene('Scena 8 Întoarcerea pe Pământ', 'Pământul reapare. Călătoria filmată se încheie la 678,05 s. Felinarul rămâne obiectul poveștii adus acasă.', [c for c in cues if c['phase']=='play' and c['at']>=610])
scene('Scena 9 Felinarul adus acasă', 'Epilogul începe după film și durează în prezent 75 de secunde. Se arată contribuțiile echipajului. La variante se alege o singură replică, potrivit întregii călătorii.', [c for c in cues if c['phase']=='epilogue'])
add('h1', 'Scena 10 Ultima lumină a echipajului')
add('stage', '[În experiența interactivă, alegerea finală devine disponibilă spre sfârșitul epilogului. Replica naratorului de mai jos se declanșează după încheierea epilogului. DEMO TV omite această scenă.]')
voice('finale', 'Invitație la ultima contribuție. Nu se grăbește publicul.')
add('stage', '[Pe tablete apare întrebarea „Ce dar duci acasă?”. Alegerile sunt „O lumină”, „Grijă pentru ceilalți” și „Curaj de explorator”. Participantul alege, apoi apasă „Trimite simbolul meu”. Poate și să privească. Acestea sunt texte afișate, nu replici înregistrate.]')
add('stage', '[Contribuțiile ajung pe ecranul central. Ghidul încheie întâlnirea și conduce ieșirea. Replicile ghidului, reacțiile publicului și eventualele saluturi de final pot fi scrise aici de autor.]')
add('p', 'GHIDUL — text de scris:')
add('p', '................................................................................................................')

add('h1', 'Replică suplimentară de ajutor')
add('stage', '[Replica următoare există în pachetul audio al naratorului, dar nu este declanșată de fluxul automat actual. Autorul poate decide unde ar fi potrivită; includerea în spectacol va necesita stabilirea momentului de redare.]')
voice('hint', 'Sprijin opțional pentru folosirea tabletei.')

add('h1', 'Observații pentru rescriere')
add('p', 'Variantele A, B și C se raportează la participanții activi. O singură persoană poate încheia toate activitățile. În textul înregistrat există încă formulările „toate cele zece bucăți” și „cele cinci ferestre”; ele sunt păstrate mai sus, pentru a decide cum le rescrii pentru grupuri de orice mărime.')
add('p', 'În epilog se spune „Nu mai e nimic de apăsat”, iar ulterior naratorul invită la alegerea ultimei lumini. Poți rescrie această trecere astfel încât invitațiile să se lege firesc. Pentru demonstrația fără tablete poți decide separat dacă păstrezi sau înlocuiești instrucțiunile despre jocuri și rezultatele de pe ecran.')
add('p', 'Găsirea, potrivirea și circuitul sunt activități reale ale aplicației. Valiza, atelierele și felinarul alcătuiesc povestea. La rescriere poți schimba această poveste; gesturile noi, obiectele noi sau schimbarea traseului filmului vor trebui implementate separat.')
add('p', 'Reperele de mai jos descriu montajul actual. Poți scrie liber; după rescriere, duratele vocilor și raportul lor cu filmul vor trebui reașezate. Programul actual are 50 s de primire, 10 s de numărătoare, 678,05 s de film și 75 s de epilog, la care se adaugă tutorialul și încheierea interactivă.')
add('h1', 'Repere pentru reintegrarea textului')
add('p', 'Această anexă nu se citește la spectacol. Numerele R leagă textul editabil de replica înregistrată. Secundele filmului sunt măsurate de la primul cadru; secundele primirii și epilogului au fiecare propriul început.')
for number, source, timing in references:
    add('reference', f'{number} · {source} · {timing}')
add('p', 'Surse: assets/scenarios/age-5-10/dialogue.ro.draft.json; assets/experience/voice/ro/manifest.json. Contextul scenelor și al participării: docs/scenarii/05-10-BUCATILE-DE-ACASA.md și logica experienței din aplicație.')

md = []
for kind, text in blocks:
    if kind=='title': line = '# ' + text
    elif kind=='h1': line = '## ' + text
    elif kind in ('speaker','branch'): line = '**' + text + '**'
    elif kind in ('stage','subtitle'): line = '*' + text + '*'
    else: line = text
    md.append(line)
stem.with_suffix('.md').write_text('\n\n'.join(md)+'\n', encoding='utf-8')

# RTF is directly editable in Word and LibreOffice, with plain editable paragraphs.
def rtf_escape(text):
    result=[]
    for char in text:
        if char in '\\{}': result.append('\\'+char)
        elif ord(char)<128: result.append(char)
        else:
            encoded=char.encode('utf-16-le')
            for i in range(0,len(encoded),2):
                value=int.from_bytes(encoded[i:i+2],'little')
                result.append(f'\\u{value if value<32768 else value-65536}?')
    return ''.join(result)

rtf = [r'{\rtf1\ansi\ansicpg1252\deff0\uc1{\fonttbl{\f0 Georgia;}{\f1 Arial;}}',
       r'\paperw12240\paperh15840\margl1260\margr1260\margt1080\margb1080',
       r'{\footer\pard\qc\f1\fs18{\field{\*\fldinst PAGE}{\fldrslt 1}}\par}']
styles = {
    'title':r'\f1\fs40\b\sb0\sa200\keepn',
    'subtitle':r'\f0\fs26\i\sa220\keepn',
    'h1':r'\f1\fs28\b\sb280\sa150\keepn\outlinelevel0',
    'speaker':r'\f1\fs22\b\sb150\sa60\keepn',
    'stage':r'\f0\fs22\i\sa110\sl270\slmult1\keepn',
    'speech':r'\f0\fs24\li240\sa180\sl300\slmult1\keep',
    'branch':r'\f1\fs22\b\sb160\sa80\keepn',
    'p':r'\f0\fs23\sa150\sl285\slmult1',
    'reference':r'\f1\fs20\sa60\sl240\slmult1',
}
for kind,text in blocks:
    rtf.append('{\\pard\\plain\\widctlpar'+styles[kind]+' '+rtf_escape(text)+'\\par}')
rtf.append('}')
stem.with_suffix('.rtf').write_text('\n'.join(rtf), encoding='ascii')
print(f'Exported {len(references)} spoken texts: {len(cues)} scenario cues and {len(references)-len(cues)} narrator clips.')
print(stem.with_suffix('.rtf'))
print(stem.with_suffix('.md'))
