import type { PlayView } from '@shared/play-engine';
import { createYoungToy } from './play-toys';
import { createOlderToy } from './play-older';
import {createGestureGuide} from './gesture-guide';
import {discovery} from './discovery';

type Context = { blocked: boolean; reduced: boolean; pending: boolean; offline: boolean };
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
};

/** A stable input surface: snapshots update the toy, never replace a captured pointer's DOM. */
export function createPlayPanel(zone: 'A' | 'B', send: (value: string) => void) {
  const panel = el('section', `mission-zone mission-zone-${zone.toLowerCase()} play-panel`);
  panel.dataset.zone = zone; panel.setAttribute('aria-label', `Zona ${zone}, ${zone === 'A' ? 'stânga' : 'dreapta'}`);
  const head = el('header', 'play-head');
  const name = el('span', 'play-name'), achievement = el('span', 'play-achievement');
  const help = el('details', 'play-help'), helpButton = el('summary', '', 'Ce descoperim');
  const lesson = el('p', ''); help.append(helpButton, lesson);
  head.append(el('b', 'mission-seat', zone), name, achievement, help);
  const instruction = el('h2', 'mission-instruction play-instruction'); instruction.tabIndex = -1;
  const host = el('div', 'play-host');
  const tools=el('div','play-guidance-tools');
  const insight=el('section','play-discovery');insight.hidden=true;insight.setAttribute('aria-label','Ce ai descoperit');
  const flow=el('div','play-discovery-flow'),takeaway=el('p','play-discovery-copy');takeaway.setAttribute('role','status');insight.append(flow,takeaway);
  const foot = el('footer', 'play-foot');
  const feedback = el('p', 'play-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const observe = el('button', 'play-observe', 'Doar privesc'); observe.type = 'button'; observe.dataset.play = 'observe';
  foot.append(feedback, observe); panel.append(head, instruction, tools, host, insight, foot);
  const guide=createGestureGuide(host,tools);
  let toy: ReturnType<typeof createYoungToy> | ReturnType<typeof createOlderToy> | undefined;
  let identity = '', context: Context | undefined;
  observe.addEventListener('click', () => { if (!context?.blocked && !context?.pending) send('play:observe'); });
  help.addEventListener('keydown', event => { if (event.key === 'Escape') { help.open = false; helpButton.focus(); } });
  return {
    element: panel,
    update(view: PlayView, next: Context) {
      context = next;
      const key = `${view.kind}:${view.stage}`;
      if (key !== identity) {
        toy?.dispose(); host.replaceChildren(); identity = key;
        toy = view.kind === 'light' || view.kind === 'signal' ? createYoungToy(host, send) : createOlderToy(host, send);
      }
      panel.dataset.kind = `play-${view.kind}`; panel.dataset.stage = String(view.stage);
      panel.dataset.solved = String(view.solved); panel.dataset.blocked = String(next.blocked);
      name.textContent = view.title;
      const milestones = { light: ['Piesă găsită', 'Piesă montată', 'Felinar aprins'], signal: ['Idee păstrată', 'Două ritmuri testate', 'Concluzie păstrată'], pilot: ['Regulă aleasă', 'Ambele probe', 'Regulă păstrată'], survey: ['Scanare păstrată', 'Raport creat', 'Copie trimisă'] };
      achievement.textContent = view.solved ? milestones[view.kind][view.stage - 1] : '';
      achievement.hidden = !view.solved;
      instruction.textContent = view.instruction;
      lesson.textContent = view.lesson;
      feedback.textContent = next.offline ? 'Refacem legătura cu nava…' : next.blocked ? 'Facem o pauză. Continuăm în curând.' : next.pending ? 'Trimitem…' : view.feedback;
      observe.disabled = next.blocked || next.pending || view.observed;
      observe.textContent = view.observed ? 'Privesc' : 'Doar privesc';
      toy!.update(view, { blocked: next.blocked || next.pending, reduced: next.reduced || next.blocked });
      guide.update(view,{blocked:next.blocked||next.pending,reduced:next.reduced});
      insight.hidden=!view.solved||view.observed;
      if(!insight.hidden){const result=discovery(view);if(insight.dataset.content!==JSON.stringify(result)){insight.dataset.content=JSON.stringify(result);takeaway.textContent=result.text;flow.replaceChildren(...result.flow.map((label,i)=>{const step=el('span','',label);if(i)step.dataset.after='true';return step;}));}}
    },
    dispose() { guide.dispose();toy?.dispose(); toy = undefined; },
  };
}
