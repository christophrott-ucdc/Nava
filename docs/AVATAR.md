# Avatarul Căpitanului — GLB, viseme, casting, lip-sync, limbi, variante

> Scris 2026-09-05 (agentul E, preluând partea de documentație a pachetului C-01 după oprirea agentului C). Surse: `src/renderer/avatar/{casting,index,lipsync-ro,talkinghead-setup,perf-probe}.ts`, `scripts/precompute-visemes.mjs`, `scripts/tts-generate.mjs`, `src/renderer/voice/manifest.ts`, `assets/voice/ro/manifest.json`, `assets/show/show.json`, `docs/BRIEF.md` §1. Pașii din serviciile externe (Avaturn, Ready Player Me) sunt indicații generale — verificați-i în documentația serviciului la data folosirii.

## 1. Situația actuală și problema de casting

- GLB-ul livrat, `assets/avatar/avatar-ai.glb` (≈ 14,3 MB), este exportul **Avaturn** al unui personaj **feminin** („BiologV2", moștenit din proiectul Exodus; `docs/BRIEF.md` §1). Are cele 15 viseme Oculus, blendshape-urile ARKit și rig Mixamo — deci este **tehnic corect** pentru TalkingHead.
- Singurul personaj cu corp este **CĂPITANUL** (`SPEAKERS.CAPITANUL.lipsyncAvatar: true`, `src/shared/types.ts`), a cărui voce ElevenLabs este **masculină, gravă** („Paul Bogorin", `assets/show/voice-script-v3.json`).
- `src/renderer/avatar/casting.ts` codifică sexul vocii per vorbitor (`VOICE_GENDER`: `CAPITANUL: "M"`, `AVATAR_AI: "F"`, `LUMINA: "F"`, `NATURA: "M"`, `TEHNOLOGIC: "F"`) și cunoaște GLB-ul livrat ca feminin (`KNOWN_FEMALE_GLBS = {"avatar-ai.glb"}`). Rezultatul: cu configurația implicită, `buildCastingReport()` produce avertismentul

  > `[avatar/casting] GLB-ul "avatar-ai.glb" este modelul feminin Avaturn livrat implicit (BiologV2), iar CĂPITANUL are voce gravă masculină — creați un GLB masculin (docs/AVATAR.md) și setați config.avatar.glbBySpeaker.CAPITANUL`

  Show-ul rulează oricum (avertismentul nu blochează nimic), dar publicul vede o femeie vorbind cu voce de bărbat. **Acțiunea cerută:** un GLB masculin de Căpitan + `config.avatar.glbBySpeaker.CAPITANUL` + `config.avatar.body: "M"`.

## 2. Cele 15 viseme Oculus obligatorii

TalkingHead animează gura prin morph target-uri cu numele visemelor Oculus (OVR). `lipsync-ro.ts` produce exact acest set (`OCULUS_VISEMES`):

`sil` (tăcere) · `PP` (p, b, m) · `FF` (f, v) · `TH` · `DD` (t, d, ț-parțial) · `kk` (c, g, ch, gh) · `CH` (ce, ci, ge, gi, ș, j) · `SS` (s, z, ț-parțial, x-parțial) · `nn` (n, l) · `RR` (r) · `aa` (a, ă) · `E` (e) · `I` (i, â, î, y) · `O` (o) · `U` (u, w)

În GLB, morph target-urile trebuie să se numească `viseme_sil`, `viseme_PP`, `viseme_FF`, `viseme_TH`, `viseme_DD`, `viseme_kk`, `viseme_CH`, `viseme_SS`, `viseme_nn`, `viseme_RR`, `viseme_aa`, `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U` (convenția Oculus/Ready Player Me pe care o așteaptă TalkingHead). La încărcare, `AvatarController` numără câte dintre cele 14 viseme ne-`sil` există și loghează `visemes=<n>/14`; cele lipsă apar în `console.warn("[avatar] missing Oculus morph targets: …")` (`src/renderer/avatar/index.ts`). Un model fără viseme se încarcă, dar gura nu se mișcă.

În plus: blendshape-urile **ARKit** (52; TalkingHead le folosește pentru clipit, sprâncene, expresii) și un rig compatibil **Mixamo** (pentru pozele/animațiile idle; TalkingHead alege setul după `body: "M" | "F"`).

## 3. Cum obțineți un GLB de Căpitan

### 3.1 Avaturn (același serviciu ca GLB-ul livrat)

1. Creați avatarul (din selfie sau din galerie) cu un **corp masculin** și o înfățișare de Căpitan (uniformă închisă, fără păr lung care să acopere gura).
2. Exportați **GLB** cu blendshape-urile faciale active (Avaturn exportă în mod normal ARKit + viseme Oculus și un rig Mixamo — exact ce are `avatar-ai.glb`). Nu alegeți variante „static"/fără blendshapes.
3. Verificați mărimea: 10–20 MB este normal; peste 50 MB încetinește încărcarea la boot.

### 3.2 Ready Player Me

1. Creați avatarul masculin (full-body) și luați URL-ul `.glb` din exportul RPM.
2. Cereți morph target-urile la export prin parametrii URL, de exemplu `?morphTargets=ARKit,Oculus%20Visemes` (opțional `&textureAtlas=1024` pentru o singură textură). Fără acești parametri RPM livrează un model **fără** viseme.
3. Descărcați fișierul și puneți-l în `assets/avatar/`.

### 3.3 Alte surse (Blender, CC4, Mixamo)

Orice GLB funcționează dacă are: morph target-urile `viseme_*` de la §2 (nume exacte), rig cu oasele Mixamo (`Hips`, `Spine`, `Neck`, `Head`, `LeftArm`…) și, ideal, blendshape-urile ARKit. Convertiți din FBX cu Blender → glTF 2.0, cu „Shape Keys" exportate.

### 3.4 Instalare

```
assets/avatar/avatar-ai.glb      (livrat, feminin — poate rămâne pentru alte personaje/teste)
assets/avatar/capitan.glb        (nou, masculin)
```

În pachetul portabil, `assets/**` se caută în `appRoot` și apoi în `resources/` (`src/main/paths.ts`), deci puteți pune GLB-ul nou lângă executabil fără rebuild.

## 4. Configurare (`config.json`, `src/shared/types.ts` `AppConfig.avatar`)

```jsonc
"avatar": {
  "glb": "assets/avatar/avatar-ai.glb",        // GLB implicit (orice vorbitor fără cheie în glbBySpeaker)
  "corner": "bottom-left", "widthPercent": 22, "marginPx": 40,
  "body": "M",                                  // R4: corpul pentru animațiile idle; trebuie să se potrivească vocii
  "glbBySpeaker": { "CAPITANUL": "assets/avatar/capitan.glb" }   // R4: GLB per vorbitor
}
```

- `body`: validat la `"M"` / `"F"` (`normalizeAvatarR4`, `src/main/config.ts`); lipsă → rendererul folosește `"M"` (`resolveBody`: opțiunea explicită → `config.avatar.body` → `"M"`). Cu GLB-ul feminin actual, `body: "M"` dă animații idle nepotrivite corpului, dar potrivite vocii; e compromisul implicit până la GLB-ul nou.
- `glbBySpeaker`: cheile trebuie să fie vorbitori cunoscuți (`AVATAR_AI`, `CAPITANUL`, `LUMINA`, `NATURA`, `TEHNOLOGIC`), altfel sunt ignorate cu avertisment; valorile sunt căi relative la appRoot. În V3 doar `CAPITANUL` are corp, deci practic doar această cheie contează. Rezoluția: `resolveGlbForSpeaker(config, speaker, fallbackUrl)` (`casting.ts`).
- `showAvatar: true` doar pe ecranul `center` (`config.screens[]`), altfel Căpitanul apare pe fiecare TV.

## 5. Cum verificați castingul

1. **Log-ul rendererului** (DevTools cu `--dev`, sau `runs/app-*.jsonl` prin `window.nava.log`): la încărcarea GLB-ului apare linia `[avatar] casting: glb=<url> body=<M|F> lipsync=CAPITANUL visemes=<n>/14`, urmată — dacă e cazul — de avertismentul din §1 (`mismatchWarning`). Verificați `visemes=14/14`.
2. **Programatic:** `AvatarController.getCastingReport()` întoarce `AvatarCastingReport { glb, body, speakerWithLipsync, mismatchWarning }` (`src/shared/contracts.ts`); după încărcare raportul include și euristica pe numele nodurilor Avaturn (`inferFemaleLookFromNodeNames`: noduri `avaturn_*` cu `female/woman/girl` → feminin, `male/man/boy` → masculin, altfel decide numele fișierului).
3. **Test rapid:** comanda `testAvatar` (tasta `T` pe ecranul-sursă de ceas sau butonul din consolă) — Căpitanul spune „Căpitanul EXODUS-7 online. Vă aud, echipaj." și trebuie să-și miște gura.
4. **`/debug/`:** raportul de casting **nu** este afișat acolo (nu face parte din `PerfSample`, care aduce doar `avatarFps` și `lipsyncLatencyMs`); folosiți log-ul. `/debug/` → PREFLIGHT ACTIVE confirmă însă că GLB-ul configurat există (`avatar.exists`).

## 6. lipsync-ro și visemele precalculate

- **La runtime** (`src/renderer/avatar/lipsync-ro.ts`): ortografia română este aproape fonemică, așa că graphemele se mapează direct la viseme, cu reguli contextuale pentru digrafe (`ce/ci/ge/gi → CH`, `che/chi/ghe/ghi → kk`, `x → kk+SS`, `ț → DD+SS`) și pentru `i` final nesilabic (*copaci*, *ochi*). `preProcessText` transformă cifrele și simbolurile în cuvinte. Testele: `src/renderer/avatar/lipsync-ro.test.ts` (`npm test`).
- **Precalculate** (`scripts/precompute-visemes.mjs`, R4/C-02): pentru fiecare clip din `assets/voice/<lang>/manifest.json`, `words/wtimes/wdurations` (alinierea ElevenLabs) devin `visemes/vtimes/vdurations` cu **aceleași reguli** (scriptul bundlează `lipsync-ro.ts` cu esbuild — o singură sursă de adevăr). Durata fiecărui cuvânt se împarte între visemele lui (vocale 1,6 : consoane 1,0); un `sil` umple pauzele > 80 ms. Rendererul **preferă** aceste piste (`clipHasVisemes`) și cade pe cuvinte doar dacă lipsesc.

```powershell
node scripts/precompute-visemes.mjs                 # ro, scrie manifestul dacă s-a schimbat ceva
node scripts/precompute-visemes.mjs --check         # iese 1 dacă un clip nu are / are viseme vechi
node scripts/precompute-visemes.mjs --cue v3-cap-0004 --verbose
node scripts/precompute-visemes.mjs --lang en
```

Nu există (încă) alias `npm run` pentru acest script (`package.json`). Rulați-l **după fiecare `npm run tts`** care regenerează clipuri. Stare la 2026-09-05: manifestul RO are **51/51** clipuri cu viseme (`generatedAt 2026-09-04T19:45Z`); preflight-ul raportează `withVisemes`.

- **Latența lip-sync** (C-04): `LipsyncLatencyProbe` măsoară cât de târziu apare primul visem ne-`sil` față de momentul programat; `getLastLipsyncLatencyMs()` alimentează `PerfSample.lipsyncLatencyMs` (roșu în `/debug/` peste 120 ms). 30–70 ms = una–două cadre la `modelFPS: 30`.

## 7. Limbi: EN și FR

- Tipul `Lang = "ro" | "en" | "fr"`; `config.lang` și comanda `setLang` acceptă toate trei, dar **manifestele `assets/voice/en|fr/manifest.json` au 0 clipuri** (schelete). `createLangGuard` (`src/renderer/voice/manifest.ts`) refuză o limbă fără clipuri și rămâne pe cea curentă, logând `limbi fără voci pre-generate: en, fr`.
- Generare: cue-urile din `show.json` au nevoie de `text.en` / `text.fr` (altfel scriptul folosește textul românesc și avertizează), apoi:

```powershell
npm run tts -- --lang en --provider elevenlabs      # scrie assets/voice/en/*.mp3 + manifest.json
node scripts/precompute-visemes.mjs --lang en
npm run check
```

- Lip-sync pentru EN/FR: `lipsyncLanguage()` folosește procesorul RO doar pentru `ro`; EN și FR trec prin modulul EN al TalkingHead (aproximare acceptabilă pentru FR). Visemele precalculate cu `--lang en` folosesc totuși regulile românești (scriptul are o singură sursă de reguli) — pentru EN/FR rezultatul este o aproximare; dacă se investește în EN/FR, scriptul ar trebui să primească un modul per limbă.

## 8. Variante pe vârstă (R4/C-06)

- `show.json > variants`: `7-9` („cuvinte mai scurte"), `10-12` (textul de bază, implicit), `13+` (rezervat). `VoiceCue.variants["7-9"].ro` există pe **3 replici**: `v3-cap-0004`, `v3-ai-0206`, `v3-tech-0610`.
- Activare: `config.variant: "7-9"` sau comanda `{ "action": "setVariant", "variant": "7-9" }` (`null` = baza). `ShowState.variant` o arată; `getBoot().variant` o dă rendererului.
- Audio: fișierul variantei este `assets/voice/<lang>/<cueId>.<variant>.mp3`, cheia de manifest `clips["<cueId>.<variant>"]` (`13+` → fișier `<cueId>.13plus.mp3`, conform `show.json`). Preflight-ul caută mai întâi cheia variantei, apoi baza, și raportează `variant-missing` (avertisment) când o replică are text de variantă fără audio.
- **Stare reală:** niciun clip de variantă nu este generat și `scripts/tts-generate.mjs` **nu are încă opțiunea `--variant`** (grep gol la 2026-09-05). Până la livrarea C-06, `setVariant` schimbă doar textul afișat/raportat; sunetul rămâne al replicii de bază.

## 9. Checklist la schimbarea GLB-ului

1. Copiați GLB-ul în `assets/avatar/`, setați `glbBySpeaker.CAPITANUL` și `body: "M"`.
2. `npm run dev -- --windowed`; în log: `visemes=14/14`, fără `mismatchWarning`.
3. `T` (testAvatar) → gura se mișcă sincron; verificați și prima replică reală a Căpitanului (transporter la `v3-cap-0004`, preshow 0:04).
4. `npm run smoke:renderer` (cu `--remote-debugging-port=19191`) confirmă că canvasul GLB este vizibil la prima replică.
5. Dacă gura nu se mișcă: morph target-urile nu se numesc `viseme_*` (§2) — re-exportați cu viseme Oculus.
6. Actualizați `KNOWN_FEMALE_GLBS` din `casting.ts` doar dacă noul fișier este tot feminin (altfel nu este nevoie de nicio schimbare de cod).
