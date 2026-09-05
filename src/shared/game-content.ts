import type { Post, Zone } from './scenario-engine';

/** Authored training data, not readings from the film or physical instruments. */
export interface ExpeditionDocument {
  title: string;
  summary: string;
  samples: Array<{ label: string; value: string }>;
  limitation: string;
}
const surveys = [
  ['Traseul următorului echipaj', 'culoar liber', 'margine neclară', 'obstacol', 'Marginea culoarului se află între reperele 4 și 5.'],
  ['Rezerva de propulsie', 'consum mic', 'consum variabil', 'consum mare', 'În sectorul central, consumul crește doar la accelerare.'],
  ['Harta semnalului', 'semnal slab', 'semnal puternic', 'fără semnal', 'Emisia centrală se repetă la fiecare 3 secunde.'],
  ['Rețeaua de senzori', 'conexiune stabilă', 'întreruperi', 'conexiune stabilă', 'Conexiunea centrală cade la fiecare a patra citire.'],
  ['Jurnalul expediției', 'înregistrare completă', 'date lipsă', 'înregistrare completă', 'În secvența centrală lipsește înregistrarea numărul 4.'],
] as const;

export function adultSubject(post: Post): string { return surveys[post - 1][0]; }

export function adultDocument(post: Post, zone: Zone, kind: 'wide' | 'fine' | 'protect' | 'passive'): ExpeditionDocument {
  const row = surveys[post - 1];
  // Both participants inspect the same spatial model independently.
  const labels = ['Zona de intrare', 'Zona centrală', 'Zona de ieșire'];
  if (kind === 'wide') return {
    title: `${row[0]} · imagine de ansamblu`,
    summary: 'Ai cercetat trei zone. Știi unde merită să revii, dar nu și cauza diferențelor.',
    samples: labels.map((label, n) => ({ label, value: row[n + 1] })),
    limitation: 'Harta indică diferențele; detaliul din zona centrală rămâne necunoscut.',
  };
  if (kind === 'fine') return {
    title: `${row[0]} · cercetare în detaliu`, summary: row[4],
    samples: [{ label: labels[0], value: 'necercetat' }, { label: labels[1], value: row[4] }, { label: labels[2], value: 'necercetat' }],
    limitation: 'Ai o observație detaliată. Nu știi dacă se aplică și în celelalte două zone.',
  };
  if (kind === 'protect') return {
    title: `${row[0]} · raport verificat`, summary: 'Filtrul sondei a separat citirile stabile de interferențe.',
    samples: [{ label: 'Citirea 1', value: row[2] }, { label: 'Citirea 2', value: row[2] }, { label: 'Citirea 3', value: row[2] }],
    limitation: 'Trei citiri concordante în simulare. Nu ai cercetat zone suplimentare.',
  };
  return {
    title: `${row[0]} · raport nefiltrat`, summary: 'Nu ai cheltuit credite suplimentare. Sonda a trimis date, dar două citiri sunt afectate de interferențe.',
    samples: [{ label: 'Citirea 1', value: row[2] }, { label: 'Citirea 2', value: 'interferență — rezultat incert' }, { label: 'Citirea 3', value: 'interferență — rezultat incert' }],
    limitation: 'O singură citire clară nu permite verificarea repetării.',
  };
}

export const autopilotTasks = [
  'Alege traseul de studiu când hărțile senzorilor diferă.',
  'Alege regimul motorului virtual din cele două recomandări.',
  'Trimite mesajul de test către destinația indicată de senzori.',
  'Alege pragul de alertă al rețelei de senzori.',
  'Organizează copia arhivei pentru echipajul următor.',
];
