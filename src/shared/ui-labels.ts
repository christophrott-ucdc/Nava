import { ROLE_LABELS as ADMIN_ROLE_LABELS } from "./admin";
export const ROLE_LABELS: Readonly<Record<string, string>> = ADMIN_ROLE_LABELS;
export const PLAYBACK_LABELS = { idle: 'În așteptare', preshow: 'Primirea echipajului', playing: 'În redare', paused: 'Pauză', epilogue: 'Încheiere', ended: 'Încheiat' } as const;
export const THEME_LABELS: Readonly<Record<string, string>> = { prologue: 'Îmbarcare', launch: 'Decolare', light: 'Lumină', nature: 'Natură', tech: 'Tehnologie', void: 'Spațiu profund', home: 'Acasă', white: 'Final luminos' };
export const OBSERVE_LABEL = 'Doar privesc';
export const OPTIONAL_TABLETS_LABEL = 'Nicio tabletă obligatorie în configurația curentă; verifică participanții confirmați înainte de pornire.';
