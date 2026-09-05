import { SPEAKERS, type Cue, type SceneTheme, type ShowFile, type ShowState } from "@shared/types";
import type { Command, TabletsMsg } from "@shared/protocol";
import { icon, mascotPath } from "../shared/glass";

type Mode = "before" | "live" | "tools";
const sceneNames: Record<SceneTheme, string> = {
  prologue: "Bun venit la bord", launch: "Pregătim decolarea", light: "Întâlnirea cu Lumina",
  nature: "Întâlnirea cu Natura", tech: "Întâlnirea cu Tehnologica", void: "Călătoria prin necunoscut",
  home: "Întoarcerea acasă", white: "Încheierea călătoriei",
};

/** Human-facing guide labels; executable cue IDs, dialogue and timing remain untouched. */
function momentTitle(cue: Cue, voiceTitle: () => string): string {
  switch (cue.kind) {
    case "voice": return voiceTitle();
    case "theme": return sceneNames[cue.theme];
    case "tablet": {
      const interaction = cue.interaction;
      switch (interaction.type) {
        case "post-assign": return "Perechile își aleg posturile";
        case "role-pick": return "Participanții își aleg rolurile";
        case "waiting": return "Echipajul ascultă povestea";
        case "paired-choice": return interaction.mode === "color" ? "Fiecare participant își alege culoarea" : interaction.mode === "pulse" ? "Echipajul își găsește ritmul" : "Două perspective, o alegere pentru fiecare";
        case "question": return "O întrebare pentru echipaj";
        case "vote": return "Echipajul își exprimă alegerea";
        case "message": return "Echipajul lasă un mesaj de amintire";
        case "thanks": return "Mulțumim echipajului · certificatele misiunii";
      }
    }
    case "entity": return `${cue.action === "show" ? "Ne întâmpină" : "Ne luăm rămas-bun de la"} ${SPEAKERS[cue.entity].label}`;
    case "sfx": return {
      "liftoff-rumble": "Se aud motoarele navei", "low-swell": "Sunetul călătoriei crește ușor",
      "wormhole-whoosh": "Traversăm spațiul", "arrival-chime": "Semnalul sosirii",
      rain: "Se aude ploaia", "white-fade": "Sunetul se stinge în lumină",
    }[cue.sfx];
    case "countdown": return "Numărăm împreună până la decolare";
    case "marker": return "Trecem la următorul moment al poveștii";
    case "dynamic-voice": return `${SPEAKERS[cue.speaker].label} răspunde echipajului`;
    case "ambient": return cue.action === "stop" ? "Liniște pentru următorul moment" : "Atmosfera sonoră însoțește povestea";
    case "lights": return `Lumina sălii · ${sceneNames[cue.theme]}`;
    case "photo": return "Fotografia de amintire a echipajului";
  }
}
interface Snapshot {
  state: ShowState | null;
  show: ShowFile | null;
  tablets: TabletsMsg;
  statuses: Record<string, string>;
  time: number;
  role: string | null;
}

/** A read-only presentation of live state; only explicit button presses send commands. */
export function createPresentation(deps: {
  snapshot(): Snapshot;
  dispatch(command: Command): Promise<void>;
  focusPlayer(): Promise<void>;
  describe(cue: Cue): { title: string; detail: string };
  formatTime(time: number): string;
}): void {
  const main = document.querySelector("main")!;
  const toolbar = document.createElement("nav");
  toolbar.className = "presentation-toolbar";
  toolbar.setAttribute("aria-label", "Mod de lucru operator");
  toolbar.innerHTML = `<div class="mode-switch" role="group" aria-label="Alege vederea">
    <button type="button" data-mode="before" aria-pressed="true">${icon("check")} Înainte de show</button>
    <button type="button" data-mode="live" aria-pressed="false">${icon("play")} În show</button>
    <button type="button" data-mode="tools" aria-pressed="false">${icon("light")} Instrumente</button>
  </div><a class="wall-link" href="/wall/" target="_blank" rel="noreferrer">${icon("screen")} Calibrare panoramă</a>`;
  main.before(toolbar);
  const panel = document.createElement("section");
  panel.className = "presentation-deck";
  panel.setAttribute("aria-label", "Prezentare operator");
  panel.innerHTML = `<section class="glass present-flight">
    <p class="eyebrow" id="present-stage">PREGĂTIM CĂLĂTORIA</p>
    <h2 id="present-title">Un echipaj. O singură navă.</h2>
    <p class="present-guidance" id="present-guidance"></p>
    <div class="present-checks" id="present-checks" aria-live="polite"></div>
    <div class="present-actions">
      <button type="button" class="present-primary" data-present-command="preshow">${icon("rocket")} Primește echipajul</button>
      <button type="button" data-present-command="start">${icon("play")} Sari la lansare</button>
      <button type="button" data-present-command="pause">${icon("pause")} Pauză</button>
      <button type="button" data-present-command="play">${icon("play")} Continuă</button>
      <button type="button" data-present-command="epilogue">${icon("flag")} Treci la epilog</button>
      <button type="button" data-present-command="restart">${icon("back")} Pregătește următorul grup</button>
    </div>
    <div class="present-secondary"><button type="button" id="present-focus">${icon("screen")} Arată playerul</button><button type="button" id="present-tools">Toate instrumentele</button></div>
    <p id="present-role-note" class="present-role-note"></p>
  </section>
  <section class="glass present-crew"><div class="section-heading"><div><p class="eyebrow">ECHIPAJUL VOSTRU</p><h2>Cele cinci posturi</h2></div><strong id="present-post-count"></strong></div><div id="present-posts" class="present-posts"></div><p class="present-crew-note">A citește din stânga, B din dreapta. O tabletă pentru fiecare pereche.</p></section>
  <section class="glass present-next"><div class="section-heading"><div><p class="eyebrow">CE URMEAZĂ</p><h2 id="present-cues-title">Următoarele momente</h2></div><span id="present-phase"></span></div><ol id="present-cues" class="present-cues"></ol><div class="present-progress"><span id="present-progress"></span></div><p class="present-next-note" id="present-next-note"></p></section>`;
  main.querySelector(".hero")!.after(panel);
  const el = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  let mode: Mode = "before";
  let lastSignature = "";
  function setMode(next: Mode): void {
    mode = next;
    document.body.dataset.operatorMode = mode;
    panel.hidden = mode === "tools";
    toolbar.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
    lastSignature = "";
    render();
  }
  toolbar.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode as Mode)));
  el("present-tools").addEventListener("click", () => { setMode("tools"); document.getElementById("transport-title")?.scrollIntoView({ block: "start" }); });
  el("present-focus").addEventListener("click", () => { const role = deps.snapshot().role; if (role && role !== "viewer") void deps.focusPlayer(); });
  panel.querySelectorAll<HTMLButtonElement>("[data-present-command]").forEach(button => button.addEventListener("click", () => {
    const role = deps.snapshot().role;
    if (!role || role === "viewer") return;
    // These existing commands carry no extra payload. dispatch retains restart confirmation.
    void deps.dispatch({ action: button.dataset.presentCommand } as Command);
  }));

  function render(): void {
    const { state, show, tablets, statuses, time, role } = deps.snapshot();
    const signature = JSON.stringify([mode, state, tablets.tablets, statuses, Math.floor(time), role, show?.version]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    const readiness = state?.readiness;
    const ended = state?.state === "ended";
    const closing = ended || state?.state === "epilogue";
    el("present-stage").textContent = closing ? "ÎNCHEIEM ÎMPREUNĂ" : mode === "live" ? "MISIUNEA ESTE ÎN MÂINILE TALE" : "PREGĂTIM CĂLĂTORIA";
    el("present-title").textContent = ended ? "O călătorie de ținut minte." : closing ? "Înapoi acasă, împreună." : mode === "live" ? "Privește echipajul. Ascultă povestea." : "Un echipaj. O singură navă.";
    el("present-guidance").textContent = ended ? "Lasă echipajul să salveze certificatele și fotografia. Apoi pregătește următorul grup." : closing ? "Lasă ultimele replici să se încheie. Certificatele și fotografia rămân parte din experiența echipajului." : mode === "live" ? "Urmărește cele cinci perechi. Pune pauză când echipajul are nevoie de tine." : "Verifică ecranele și cele cinci perechi. „Primește echipajul” pornește pre-show-ul.";
    const checks = [
      { ok: !!readiness && readiness.screensConnected.length>0 && readiness.screensMissing.length === 0, text: readiness ? `${readiness.screensConnected.length} ${readiness.screensConnected.length === 1 ? "ecran conectat" : "ecrane conectate"}${readiness.screensMissing.length ? ` · lipsesc ${readiness.screensMissing.join(", ")}` : ""}` : "Așteptăm ecranele" },
      { ok: !!state?.videoReady, text: state?.videoReady ? "Filmul este pregătit" : "Filmul nu este încă pregătit" },
      { ok: readiness?.assetsOk === true, text: readiness?.assetsOk === true ? "Vocile și avatarul sunt verificate" : readiness?.assetsOk === false ? "Activele necesită verificare" : "Așteptăm verificarea activelor" },
    ];
    el("present-checks").replaceChildren(...checks.map(check => {
      const row = document.createElement("div"); row.className = `present-check ${check.ok ? "ready" : "pending"}`;
      row.innerHTML = icon(check.ok ? "check" : "warning"); const text = document.createElement("span"); text.textContent = check.text; row.append(text); return row;
    }));
    const disabled = !role || role === "viewer";
    el<HTMLButtonElement>("present-focus").disabled = disabled;
    el("present-role-note").textContent = disabled ? "Mod de vizualizare · comenzile necesită rol operator." : readiness?.ready&&state?.videoReady&&readiness.screensConnected.length>0 ? "Nava este pregătită. Tu alegi momentul pornirii." : "Pornirea manuală este permisă. Verifică avertismentele înainte de a continua.";
    panel.querySelectorAll<HTMLButtonElement>("[data-present-command]").forEach(button => {
      const action = button.dataset.presentCommand;
      const allowed = action === "preshow" || action === "start" ? state?.state === "idle" || state?.state === "preshow" : action === "pause" ? state?.state === "playing" : action === "play" ? state?.state === "paused" : action === "restart" ? !!state && state.state !== "idle" : !!state;
      button.disabled = disabled || !allowed;
      button.hidden = mode === "before" && !closing ? action === "pause" || action === "play" || action === "epilogue" || action === "restart" : closing ? action !== "restart" : action === "preshow" || action === "start" || action === "restart";
    });
    const names = ["NAVIGAȚIE", "PROPULSIE", "COMUNICAȚII", "BIOSEMNALE", "MEMORIE"];
    let connected = 0;
    el("present-posts").replaceChildren(...([1, 2, 3, 4, 5] as const).map(post => {
      const tablet = tablets.tablets.find(candidate => candidate.post === post && candidate.connected) ?? tablets.tablets.find(candidate => candidate.post === post);
      if (tablet?.connected) connected++;
      const card = document.createElement("div"); card.className = `present-post${tablet?.connected ? " connected" : ""}`;
      const image = document.createElement("img"); image.src = mascotPath(post, true); image.alt = "";
      const copy = document.createElement("div"); const title = document.createElement("strong"); title.textContent = `${post} · ${names[post - 1]}`;
      const status = document.createElement("span"); status.textContent = tablet?.connected ? `Conectat${tablet.name ? ` · ${tablet.name}` : ""}` : "Așteaptă conectarea"; copy.append(title, status);
      const mark = document.createElement("span"); mark.innerHTML = icon(tablet?.connected ? "check" : "tablet"); card.append(image, copy, mark); return card;
    }));
    el("present-post-count").textContent = `${connected} / 5 gata`;
    const phase = state?.state === "preshow" || state?.state === "idle" ? "preshow" : closing ? "epilogue" : "play";
    const upcoming = (show?.cues ?? []).filter(cue => cue.phase === phase && !cue.manual && cue.at >= (state?.state === "idle" ? 0 : time) && statuses[cue.id] !== "fired" && statuses[cue.id] !== "skipped").sort((a, b) => a.at - b.at).slice(0, 3);
    el("present-phase").textContent = phase === "play" ? "FILM" : phase === "preshow" ? "PRE-SHOW" : "EPILOG";
    el("present-cues").replaceChildren(...upcoming.map(cue => {
      const item = document.createElement("li"); const clock = document.createElement("time"); clock.textContent = deps.formatTime(cue.at);
      const copy = document.createElement("div"); const title = document.createElement("strong"); title.textContent = momentTitle(cue, () => deps.describe(cue).title);
      const detail = document.createElement("span"); detail.textContent = cue.kind === "voice" ? "Replică" : cue.kind === "tablet" ? "Participarea echipajului" : "Moment al poveștii"; copy.append(title, detail); item.append(clock, copy); return item;
    }));
    const duration = Math.max(1, ...(show?.scenes.filter(scene => scene.phase === phase).map(scene => scene.end) ?? [1]));
    el("present-progress").style.width = `${Math.max(0, Math.min(100, time / duration * 100))}%`;
    el("present-next-note").textContent = ended ? "Misiunea s-a încheiat. Restart eliberează posturile pentru următorul grup." : upcoming.length ? "Cronologia continuă automat. Aceste momente sunt afișate doar pentru orientare." : "Niciun moment automat rămas în această fază.";
  }
  setMode("before");
  window.setInterval(render, 500);
}
