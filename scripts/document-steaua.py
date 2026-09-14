"""Publish the implemented score and the editable spoken text without replacing earlier human drafts."""
import json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
read=lambda p:json.loads((R/p).read_text(encoding='utf-8'))
a=read('assets/scenarios/age-5-10/steaua-authoring.json')
d=read('assets/scenarios/age-5-10/dialogue.ro.draft.json')
t=read('runs/steaua-production/staged/timing-report.json')
rows=['| Referință | Fază | Start (s) | Voce (s) | Condiție |','|---|---|---:|---:|---|']
for c in t['cues']: rows.append(f"| {c['ref']} | {c['phase']} | {c['at']} | {c['durationSec']} | {c['condition']} |")
text='''# Steaua Omenirii — integrare, 10 septembrie 2026

Ediția pentru copii `age-5-10` folosește documentul autorului din `docs/scenarii/surse/Steaua-Omenirii.docx`. Originalul și extragerea integrală sunt păstrate; copiile editoriale anterioare nu au fost suprascrise.

## Implementat

- 55 replici de scenariu, inclusiv variantele condiționate, cu subtitrări și aliniere vocală pentru GLB. Eticheta vizibilă este COMANDANTUL; identificatorul intern CAPITANUL rămâne compatibil.
- 12 fișiere de narator: 8 texte din noul document și cele 4 explicații existente pentru celelalte profiluri. Toate regenerate pe ElevenLabs `eleven_v3`, română, fără accelerarea vorbirii.
- 3 replici VR produse separat în `assets/experience/vr/ro`; nu declanșează hardware sau redare în programul principal. Indiciul naratorului este disponibil ca fișier, fără declanșare automată nouă. Ghidul rămâne o voce umană în sală.
- 11 montaje muzicale pentru copii, derivate din muzica existentă: crossfade la extindere, fără schimbarea tempoului. Muzica scade cu 12 dB sub voce; pauză dramatică la 368,9–382,2 s. Saturn primește un pasaj al simfoniei; aprinderea are un accent separat.
- Lumina: glob auriu și fragmente orbitale. Natura: insulă plutitoare cu arbori și râu. Cristal: atelier cu turnuri fațetate. Stea 3D, escortă de daruri, coadă de cometă și glob terestru cu lumini progresive. Geometrie procedurală Three.js, fără active externe noi.
- Tabletele au lumi mici animate, grafica stelei în instrumente și finalul «Trimite raza mea». Contribuțiile confirmate apar pe TV; demonstrația fără tablete folosește darurile poveștii și nu inventează participanți.
- Redare 3D limitată la 30 fps pe TV și 24 fps pe tablete, rezoluții limitate, mod static pentru mișcare redusă și alternativă grafică la indisponibilitatea WebGL. Avatarul GLB rămâne pe ecranul central.
- Corectată încărcarea muzicii: manifestul existent cu 11 piese era respins de o condiție rigidă de 10. Pachetele muzicale pot avea acum partituri specifice profilului.

## Partitură

Preshow 60 s; numărătoare 10 s; film 678,05 s; epilog 75 s: **13:43,05**, plus tutorialul și finalul interactiv. DEMO TV omite primirea și interacțiunile: **12:43,05**.

Filmul rămâne intact. Lumi: Lumina 60–144 s, Natura 144–246 s, Cristal 246–388 s, tunel 388–504 s, Saturn 504–610 s, Pământ 610–678,05 s. Câteva replici de rămas-bun continuă peste tăietură, înaintea următoarei prezentări.

Jocuri: găsește 106–129 s; potrivește 205–229 s; închide circuitul 323,5–355,5 s. Aprindere 356,5 s, întrebare 369,2 s, cometă 382,7 s, revelație 633 s. Instrucțiunile se încheie înaintea deschiderii jocurilor. Distanța minimă calculată între înregistrări este 0,68 s, inclusiv pe variantele alternative.

Globul cu orașe este etichetat ca ilustrație 3D. Nu pretindem că filmul real conține aceste lumini; «Steaua Omenirii» este metafora poveștii, nu o explicație fizică despre o stea reală.

## Adaptări editoriale explicite

'''
for ref,r in a['replicas'].items():
    if r.get('editorialChange'):text+=f"- {ref}: {r['editorialChange']}\n"
text+='''
## Operare și stare reală

Închide aplicația Electron veche și pornește `PREZENTARE.bat`; pentru instalație folosește `PREZENTARE.bat --live`. Butonul DEMO TV selectează pachetul pentru copii. Pentru o sesiune normală, resetează sala și selectează «5–10 ani · Steaua Omenirii». O sesiune salvată cu pachetul anterior necesită resetare, deoarece hashul conținutului s-a schimbat.

Fișierele vocale vechi ale pachetului copiilor și naratorului au fost înlocuite; reel-urile și rapoartele de transcriere vechi au fost eliminate din pachetele active. Arhiva de revenire este în `runs/steaua-production/retired-voices-*.zip`. Muzica sursă, așteptarea și vocile celorlalte scenarii sunt păstrate pentru funcționalitatea lor. Cheia furnizorului este exclusiv în `.env`, ignorat de Git.

Au trecut compilarea TypeScript și buildul. Producția media a confirmat 70/70 fișiere, integritatea SHA-256 și duratele reale; montajul a calculat lipsa suprapunerilor. La cererea utilizatorului nu au fost rulate teste, smoke-uri sau aplicația pentru verificare vizuală; nu există capturi noi. Nu s-a făcut audiție umană integrală sau certificare a pronunției. `productionReady: false` rămâne până la acceptare.

Pe instalație rămân de verificat audiția, nivelul muzicii față de voce, sincronizarea video/GLB/subtitrări pe cele cinci TV-uri, performanța GPU, încadrarea la 4K, atingerea pe tablete, pauza/reluarea și sesiunea cu un singur participant. Nu există commit, push sau deploy pentru această livrare.

## Repere vocale exacte

'''+ '\n'.join(rows)+'\n'
(R/'docs/STEAUA-OMENIRII-INTEGRARE.md').write_text(text,encoding='utf-8')
spoken=['# Steaua Omenirii — toate replicile pentru editare','', 'Textul implementat; indicațiile de scenă sunt separate de vorbire. Variantele A/B/C sunt alternative, nu replici rostite toate consecutiv.','']
for ref,r in a['replicas'].items():
    spoken += [f"## {ref} — {r['speaker']}", '',f"*Indicație: {r['direction']}*" if r['direction'] else '', '',r['text'],'']
(R/'docs/scenarii/STEAUA-OMENIRII-REPLICI-DE-EDITAT.md').write_text('\n'.join(spoken),encoding='utf-8')
p=R/'docs/scenarii/05-10-BUCATILE-DE-ACASA.md'
p.write_text('# 5–10 ani — Steaua Omenirii\n\nAcest profil a fost înlocuit integral de ediția autorului «Steaua Omenirii». Numele fișierului este păstrat pentru legăturile existente.\n\n- [Integrare, timpi și limite](../STEAUA-OMENIRII-INTEGRARE.md)\n- [Toate replicile pentru editare](STEAUA-OMENIRII-REPLICI-DE-EDITAT.md)\n- [Documentul original](surse/Steaua-Omenirii.docx)\n\nObiectiv: găsește fragmentele, potrivește-le, închide circuitul și trimite o rază spre steaua echipajului. Funcționează pe configurația de participanți confirmați, inclusiv unul singur.\n',encoding='utf-8')
for name,link in [('README.md','docs/STEAUA-OMENIRII-INTEGRARE.md'),('docs/OPERARE.md','STEAUA-OMENIRII-INTEGRARE.md'),('docs/PREZENTARE-2026-09-10.md','STEAUA-OMENIRII-INTEGRARE.md')]:
    p=R/name;s=p.read_text(encoding='utf-8');s=s.replace('Bucățile de acasă','Steaua Omenirii')
    p.write_text(f'> Ediția curentă pentru copii: **Steaua Omenirii**, 10 septembrie 2026. Voci Eleven v3 și muzică remontată; reporniți Electron și resetați sesiunea veche. [Partitura și limitele verificării]({link}).\n\n'+s,encoding='utf-8')
note='''

## 2026-09-10 — Steaua Omenirii, noua ediție implementată

Importat DOCX-ul autorului, original păstrat în docs/scenarii/surse. Promovate 55 voci scenariu, 12 narator și 3 VR separate, toate Eleven v3; 11 montaje muzicale specifice copiilor. Timpi măsurați, interval minim 0,68 s; jocuri 106–129 / 205–229 / 323,5–355,5; preshow 60 s. Noi lumi Three.js pe TV și tablete, stea/cometă și glob ilustrat; contribuții reale filtrate după participanți. Corectat loaderul muzical care respingea manifestul de 11 piese. Vechile voci înlocuite și arhivate ZIP în runs/steaua-production; alte profiluri și muzica sursă păstrate.

Typecheck și build trecute. Fără teste, lansare runtime sau capturi, conform interdicției utilizatorului. Fără audiție umană integrală; hardware-ul și sincronizarea percepută rămân de acceptat. Fără commit/push/deploy. Documentație: docs/STEAUA-OMENIRII-INTEGRARE.md; replici editabile: docs/scenarii/STEAUA-OMENIRII-REPLICI-DE-EDITAT.md. Reporniți Electron; sesiunea veche trebuie resetată.
'''
for name in ['AI/HANDOFF-LIVE.md','AI/HANDOFF.md']:
    with (R/name).open('a',encoding='utf-8') as f:f.write(note)
print('Published integration score, editable speech and append-only handoffs.')
