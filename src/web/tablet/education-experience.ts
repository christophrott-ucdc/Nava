import type { EducationForm, EducationObject, EducationVisual } from '@shared/education-visual';
import { EXPERIENCE_PRACTICE, FINALE_CHOICES } from '@shared/experience';
import type { MissionSnapshot } from '@shared/mission';
import type { ScenarioId } from '@shared/scenario-engine';

type Zone = 'A' | 'B';
const seats = Array.from({ length: 5 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat();
const profileForm: Record<ScenarioId, EducationForm> = {
  'legacy-v3': 'beacon', 'age-5-10': 'Stea', 'age-10-15': 'pulse',
  'age-15-18': 'gate', adults: 'card',
};
const profileKind: Record<ScenarioId, EducationVisual['kind']> = {
  'legacy-v3': 'beacon', 'age-5-10': 'pieces', 'age-10-15': 'signals',
  'age-15-18': 'mandate', adults: 'resources',
};
const practiceForms: Record<string, EducationForm> = {
  star: 'Stea', circle: 'Cerc', drop: 'Picătură', regular: 'pulse', life: 'card',
  both: 'gate', review: 'gate', observe: 'card', reserve: 'beacon',
};

/** A read-only diagram: no timers, scoring, narrative triggers or optimistic success. */
export function experienceVisual(snapshot: MissionSnapshot, zone: Zone, finale: boolean): EducationVisual {
  const exp = snapshot.experience;
  const own = `${snapshot.post}${zone}`, partner = `${snapshot.post}${zone === 'A' ? 'B' : 'A'}`;
  const form = profileForm[snapshot.scenarioId];
  const empty: EducationVisual = {
    kind: profileKind[snapshot.scenarioId], title: 'În așteptarea echipajului',
    caption: 'Pregătim locul tău la bord.', objects: [], links: [], facts: [],
  };
  if (!exp) return empty;
  const included = (key: string) => exp.participants.includes(key);
  const finalChoice = (key: string) => FINALE_CHOICES[snapshot.scenarioId].options.find(option => option.value === exp.finale[key]);
  const confirmedAtStep = (key: string) => (
    exp.step === 'touch' ? exp.touched : exp.step === 'practice' ? exp.practiced : exp.linked
  ).includes(key);
  const state = (key: string): EducationObject['state'] => {
    if (!included(key)) return 'missing';
    if (finale) return exp.finale[key] === 'observe' ? 'observed' : finalChoice(key) ? 'confirmed' : 'available';
    if (exp.observed.includes(key)) return 'observed';
    return confirmedAtStep(key) ? 'confirmed' : 'available';
  };
  const status = (key: string) => {
    if (!included(key)) return 'loc liber';
    if (state(key) === 'observed') return key === own ? 'privești' : 'privește';
    if (state(key) === 'confirmed') return finale ? finalChoice(key)!.label : 'gata';
    return finale ? (key === own ? 'alege când ești gata' : 'încă alege') : 'încă un pas';
  };

  if (finale) {
    const seatStatus = (key: string) => !included(key) ? 'liber'
      : state(key) === 'observed' ? 'privește'
      : state(key) === 'confirmed' ? 'primit' : 'alege';
    // Ten fixed positions preserve absent seats; a sparse crew is never filled with invented contributions.
    const objects = seats.map((key, index): EducationObject => ({
      id: key, label: `${key} · ${seatStatus(key)}`, form, state: state(key),
      x: (Math.floor(index / 2) - 2) * 1.65, y: index % 2 === 0 ? 0.55 : -0.55,
      scale: key === own ? 0.6 : 0.42,
    }));
    const links: EducationVisual['links'] = [];
    for (let post = 1; post <= 5; post++) {
      if (state(`${post}A`) === 'confirmed' && state(`${post}B`) === 'confirmed') links.push([`${post}A`, `${post}B`]);
    }
    const active = seats.filter(included);
    const confirmed = active.filter(key => state(key) === 'confirmed').length;
    const observed = active.filter(key => state(key) === 'observed').length;
    return {
      kind: 'constellation', title: 'Jurnalul echipajului',
      caption: 'Fiecare răspuns aprinde un loc în amintirea noastră comună.', objects, links,
      facts: [`Tu · ${status(own)}`, `Colegul · ${status(partner)}`,
        `${confirmed} ${confirmed === 1 ? 'răspuns primit' : 'răspunsuri primite'} · ${observed} ${observed === 1 ? 'persoană privește' : 'persoane privesc'}.`],
    };
  }

  if (!included(own) || exp.observed.includes(own)) {
    return {
      ...empty, title: included(own) ? 'Privește și descoperă' : 'Loc liber',
      caption: included(own) ? 'Poți urmări proba fără să apeși.' : 'Pentru a participa de aici, vorbește cu ghidul.',
      objects: [{ id: own, label: `${zone} · ${status(own)}`, form, state: state(own), x: 0, y: 0 }],
      facts: [included(own) ? 'Poți urmări proba în ritmul tău.' : 'Ghidul te poate adăuga în echipaj.'],
    };
  }

  if (exp.step === 'practice') {
    const config = EXPERIENCE_PRACTICE[snapshot.scenarioId], chosen = exp.practice[own];
    const selected = config.options.find(option => option.value === chosen);
    const done = exp.practiced.includes(own);
    return {
      kind: profileKind[snapshot.scenarioId], title: config.title,
      caption: snapshot.scenarioId === 'age-10-15' ? 'Un ritm regulat este un indiciu. Sursa rămâne necunoscută.'
        : snapshot.scenarioId === 'age-15-18' ? 'Mai întâi alegi o regulă. În misiune vei testa regulile pilotului automat.'
        : snapshot.scenarioId === 'adults' ? 'O probă înainte de misiune: cercetezi acum sau păstrezi energia?'
        : 'Caută steaua. Alege-o, apoi confirmă.',
      objects: config.options.map((option, index) => ({
        id: `practice-${option.value}`, label: option.label, form: practiceForms[option.value] ?? form,
        state: done && chosen === option.value ? 'confirmed' : 'available',
        x: (index - (config.options.length - 1) / 2) * 2.6, y: 0, scale: chosen === option.value ? 0.8 : 0.6,
      })), links: [],
      facts: [config.instruction, selected ? `${done ? 'Ai trimis' : 'Ai ales'}: ${selected.label}` : 'Atinge una dintre opțiuni, apoi confirmă.', config.detail],
    };
  }

  const together = exp.step === 'cooperate' || exp.step === 'ready';
  const keys = together ? [`${snapshot.post}A`, `${snapshot.post}B`] : [own];
  return {
    kind: profileKind[snapshot.scenarioId], title: together ? 'Două lumini, un echipaj' : 'Locul tău în echipaj',
    caption: together ? 'Când sunteți gata amândoi, luminile voastre se unesc.' : 'Salută nava și aprinde lumina ta.',
    objects: keys.map((key, index) => ({ id: key, label: `${key === own ? 'Tu' : 'Colegul'} · ${status(key)}`,
      form, state: state(key), x: together ? (index === 0 ? -1.5 : 1.5) : 0, y: 0, scale: 0.85 })),
    links: together && state(own) === 'confirmed' && state(partner) === 'confirmed' ? [[own, partner]] : [],
    facts: together ? ['Fiecare apasă în jumătatea sa.', 'Puteți apăsa pe rând.',
      exp.step === 'ready' ? 'Suntem gata. Privește ecranul central.' : `Tu · ${status(own)}`]
      : ['Zona A este în stânga; zona B este în dreapta.', `Tu · ${status(own)}`],
  };
}
