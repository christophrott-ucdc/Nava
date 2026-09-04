#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "assets", "show", "voice-script-v3.json");
const showPath = path.join(root, "assets", "show", "show.json");

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const show = JSON.parse(await fs.readFile(showPath, "utf8"));

if (!Array.isArray(source.cues) || !Array.isArray(show.cues) || !Array.isArray(show.scenes)) {
  throw new Error("voice-script-v3.json sau show.json nu are structura așteptată");
}

const voices = source.cues.map((cue) => ({
  id: cue.id,
  phase: cue.phase,
  at: cue.at,
  kind: "voice",
  speaker: cue.speaker,
  direction: cue.direction,
  text: cue.text,
  ...(cue.manual ? { manual: true } : {}),
  fallback: "silent",
  note: "Pistă V3 pre-generată; nu folosi vocea Windows/browser dacă asset-ul lipsește.",
}));

const roles = ["NAVIGAȚIE", "PROPULSIE", "COMUNICAȚII", "BIOSEMNALE", "MEMORIE"];
const retiredTabletCues = new Set(["tech-tablet-question", "rev-tablet-message"]);
const managedV3CueIds = new Set([
  "light-tablet-color",
  "light-tablet-close",
  "nature-tablet-pulse",
  "nature-tablet-close",
  "tech-tablet-perspectives",
  "tech-tablet-close",
  "tech-adaptive-select",
  "home-transmit-chime",
  "home-transmit-marker",
]);
const nonVoice = show.cues
  .filter((cue) => cue.kind !== "voice" && !retiredTabletCues.has(cue.id) && !managedV3CueIds.has(cue.id))
  .map((cue) => {
    if (cue.id === "pre-tablet-roles") {
      return {
        ...cue,
        interaction: { type: "post-assign", posts: roles },
        note: "Fiecare dintre cele cinci tablete este legată de un post fix și deservește două perspective egale.",
      };
    }
    if (cue.id === "light-entity-hide") return { ...cue, at: 125.2 };
    if (cue.id === "nature-entity-hide") return { ...cue, at: 239.2 };
    if (cue.id === "tech-entity-hide") return { ...cue, at: 350.5 };
    if (cue.id === "nature-rain") return { ...cue, durationSec: 45 };
    if (cue.id === "wormhole-whoosh") return { ...cue, at: 360 };
    if (cue.id === "wormhole-exit-swell") return { ...cue, at: 400, durationSec: 2 };
    if (cue.id === "rev-hold-marker") {
      return {
        ...cue,
        label: "La 465 s filmul se oprește determinist pe Pământ și continuă fără tăietură în epilog.",
      };
    }
    if (cue.id === "epi-tablet-thanks") return { ...cue, at: 68 };
    return cue;
  });

const v3TabletCues = [
  {
    id: "light-tablet-color",
    phase: "play",
    at: 103,
    kind: "tablet",
    interaction: {
      type: "paired-choice",
      mode: "color",
      prompt: "Alegeți fiecare o culoare pe care ați purta-o în întuneric.",
      options: ["AURIU · CERC", "ALBASTRU · UNDĂ", "VERDE · FRUNZĂ", "VIOLET · STEA"],
      allowObserve: true,
    },
    note: "Fereastră publică 2:43–2:55; două alegeri independente pe fiecare tabletă.",
  },
  {
    id: "light-tablet-close",
    phase: "play",
    at: 115,
    kind: "tablet",
    interaction: { type: "waiting" },
    note: "Închide interacțiunea și cere ridicarea privirii.",
  },
  {
    id: "nature-tablet-pulse",
    phase: "play",
    at: 219,
    kind: "tablet",
    interaction: {
      type: "paired-choice",
      mode: "pulse",
      prompt: "Atingeți fiecare sigiliul când îi simțiți pulsul.",
      options: ["ATINGE ACUM"],
      allowObserve: true,
    },
    note: "Fereastră publică 4:39–4:51; fără scor de viteză sau sincronizare.",
  },
  {
    id: "nature-tablet-close",
    phase: "play",
    at: 231,
    kind: "tablet",
    interaction: { type: "waiting" },
    note: "Închide interacțiunea și cere ridicarea privirii.",
  },
  {
    id: "tech-tablet-perspectives",
    phase: "play",
    at: 317,
    kind: "tablet",
    interaction: {
      type: "paired-choice",
      mode: "perspective",
      prompt: "Ce păstrează o lume vie? Alegeți fiecare pentru lentila voastră.",
      options: ["CURIOZITATEA", "GRIJA", "POVEȘTILE", "ALEGERILE", "ALTCEVA"],
      allowObserve: true,
    },
    note: "Fereastră publică 6:17–6:34; răspunsurile pot fi identice sau diferite.",
  },
  {
    id: "tech-tablet-close",
    phase: "play",
    at: 334,
    kind: "tablet",
    interaction: { type: "waiting" },
    note: "Închide votul înainte de replica adaptivă.",
  },
  {
    id: "tech-adaptive-select",
    phase: "play",
    at: 335,
    kind: "marker",
    label: "Serverul selectează exact o replică: diverse, same sau observe.",
  },
  {
    id: "home-transmit-chime",
    phase: "play",
    at: 463.5,
    kind: "sfx",
    sfx: "arrival-chime",
    durationSec: 1.4,
    gain: 0.65,
    note: "Nota a patra confirmă trimiterea semnalului înainte de tăietura de la 465 s.",
  },
  {
    id: "home-transmit-marker",
    phase: "play",
    at: 463.5,
    kind: "marker",
    label: "Semnalul celor cinci posturi este transmis; unda înconjoară Pământul.",
  },
];

const phaseRank = { preshow: 0, play: 1, epilogue: 2 };
const kindRank = { theme: 0, entity: 1, tablet: 2, countdown: 3, sfx: 4, voice: 5, marker: 6 };

show.title = "A Patra Lume — Protocolul Acasă";
show.version = "0.4.0-v3-complete";
show.videoDurationSec = 465;
show.timingStatus = "aligned";
show.preshowAutoStart = true;
show.launchLeadInSec = 10;
show.epilogueOnVideoEnd = true;
show.$comment =
  "Pista vocală integrală V3 este sincronizată din assets/show/voice-script-v3.json. " +
  "Flux public: preshow 0–50 s, countdown 50–60 s, video 0–465 s, epilog 0–75 s; total 600 s. " +
  "Video-ul sursă are 741,78 s, dar playerul îl oprește determinist la timpul configurat de 465 s.";

show.scenes = show.scenes.map((scene) => {
  if (scene.id === "intro") return { ...scene, label: "Prolog · Semnalul", end: 50 };
  if (scene.id === "revelation") {
    return {
      ...scene,
      label: "Revelația · Pământul",
      end: 465,
      spaceEngineBeat: "Pământul apare la 403 s; filmul este oprit la 465 s și ultimul cadru persistă în epilog.",
    };
  }
  if (scene.id === "reentry") {
    return {
      ...scene,
      label: "Epilog continuu · Protocolul Acasă",
      end: 75,
      spaceEngineBeat: "Ultimul cadru persistă; HUD-ul și ambianța continuă fără mutarea publicului sau reset vizibil.",
    };
  }
  return scene;
});

show.cues = [...nonVoice, ...v3TabletCues, ...voices].sort(
  (a, b) =>
    phaseRank[a.phase] - phaseRank[b.phase] ||
    a.at - b.at ||
    kindRank[a.kind] - kindRank[b.kind] ||
    a.id.localeCompare(b.id),
);

await fs.writeFile(showPath, JSON.stringify(show, null, 2) + "\n", "utf8");
console.log(`[voice-sync] ${voices.length} cue-uri V3 sincronizate în ${path.relative(root, showPath)}`);
