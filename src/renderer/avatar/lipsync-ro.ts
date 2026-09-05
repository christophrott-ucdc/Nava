/**
 * Romanian lip-sync module for TalkingHead (Oculus OVR visemes).
 *
 * Romanian orthography is close to phonemic, so — like the library's Finnish
 * module — we map graphemes straight to visemes, with a handful of contextual
 * rules for the digraphs (ce/ci/ge/gi -> CH, che/chi/ghe/ghi -> kk, x -> kk+SS,
 * ț -> DD+SS) and for the word-final non-syllabic "i" (copaci, ochi).
 *
 * Interface expected by TalkingHead (see modules/lipsync-fi.mjs):
 *   preProcessText(s): string                       — symbols/numbers -> words, strip unspoken chars
 *   wordsToVisemes(w): { words, visemes, times, durations }  — relative units (1 = average)
 *
 * This file is import-free and uses only erasable TS syntax so that
 * `node --test` can load it directly (type stripping) for unit tests.
 */

export type OculusViseme =
  | "sil"
  | "PP"
  | "FF"
  | "TH"
  | "DD"
  | "kk"
  | "CH"
  | "SS"
  | "nn"
  | "RR"
  | "aa"
  | "E"
  | "I"
  | "O"
  | "U";

export const OCULUS_VISEMES: readonly OculusViseme[] = [
  "sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U",
];

/** Result shape TalkingHead consumes (relative time units). */
export interface VisemeSequence {
  words: string;
  visemes: OculusViseme[];
  times: number[];
  durations: number[];
}

export interface RomanianVisemeTrack extends VisemeSequence {
  /** Whitespace-separated words found in the text (after pre-processing). */
  wordList: string[];
  /** End time of the sequence in relative units (including trailing pauses). */
  totalDuration: number;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const VOWELS: ReadonlySet<string> = new Set(["a", "ă", "â", "î", "e", "i", "o", "u", "y"]);

/** Plain vowels (no context). */
const VOWEL_VISEME: Readonly<Record<string, OculusViseme>> = {
  a: "aa",
  ă: "aa", // [ə] — mid-central; the open "aa" shape reads best on this avatar
  â: "I", // [ɨ] — close central: closer to I/E than to aa
  î: "I",
  e: "E",
  i: "I",
  o: "O",
  u: "U",
  y: "I",
};

/** Context-free consonants. c/g/x/ț/h are handled in code. */
const CONSONANT_VISEME: Readonly<Record<string, OculusViseme>> = {
  p: "PP",
  b: "PP",
  m: "PP",
  f: "FF",
  v: "FF",
  w: "U",
  t: "DD",
  d: "DD",
  n: "nn",
  l: "nn",
  r: "RR",
  s: "SS",
  z: "SS",
  ș: "CH", // [ʃ]
  j: "CH", // [ʒ]
  k: "kk",
  q: "kk",
};

/** Viseme durations in relative units (1 = average). Vowels > consonants. */
export const VISEME_DURATION: Readonly<Record<OculusViseme, number>> = {
  aa: 1.0,
  E: 0.92,
  I: 0.85,
  O: 1.0,
  U: 0.95,
  PP: 0.8,
  FF: 0.82,
  TH: 0.8,
  DD: 0.7,
  kk: 0.75,
  CH: 0.9,
  SS: 0.9,
  nn: 0.7,
  RR: 0.6,
  sil: 1,
};

/** Pauses for punctuation / separators, relative units. */
const SPECIAL_DURATION: Readonly<Record<string, number>> = {
  " ": 1,
  "\n": 3,
  ",": 3,
  ";": 3,
  ":": 3,
  ".": 4,
  "!": 4,
  "?": 4,
  "…": 5,
  "-": 0.5,
  "–": 1.5,
  "—": 2,
};

/** Merged consecutive identical visemes extend by this factor (as lipsync-fi). */
const MERGE_FACTOR = 0.7;

// ---------------------------------------------------------------------------
// Numbers -> Romanian words (enough for scripts: 0 .. 999 999, decimals)
// ---------------------------------------------------------------------------

const UNITS = ["zero", "unu", "doi", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă"];
const TEENS = [
  "zece", "unsprezece", "doisprezece", "treisprezece", "paisprezece", "cincisprezece",
  "șaisprezece", "șaptesprezece", "optsprezece", "nouăsprezece",
];
const TENS = ["", "", "douăzeci", "treizeci", "patruzeci", "cincizeci", "șaizeci", "șaptezeci", "optzeci", "nouăzeci"];

function under1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 1) parts.push("o sută");
  else if (h === 2) parts.push("două sute");
  else if (h > 2) parts.push(UNITS[h] + " sute");
  if (rest > 0 || n === 0) {
    if (rest < 10) parts.push(UNITS[rest]);
    else if (rest < 20) parts.push(TEENS[rest - 10]);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u === 0 ? TENS[t] : `${TENS[t]} și ${UNITS[u]}`);
    }
  }
  return parts.join(" ");
}

/** Convert a number string ("10", "3,5", "1200") to Romanian words. */
export function romanianNumberToWords(x: string): string {
  const cleaned = x.replace(",", ".");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return x;
  const words: string[] = [];
  let v = Math.abs(n);
  if (n < 0) words.push("minus");
  const intPart = Math.floor(v);
  if (intPart >= 1_000_000) {
    const m = Math.floor(intPart / 1_000_000);
    words.push(m === 1 ? "un milion" : `${under1000(m)} milioane`);
    v = intPart % 1_000_000;
  } else {
    v = intPart;
  }
  const thousands = Math.floor(v / 1000);
  const remainder = v % 1000;
  if (thousands === 1) words.push("o mie");
  else if (thousands > 1) {
    // "mii" is feminine: două mii, douăzeci și două de mii; from 20 upwards Romanian inserts "de".
    const fem = under1000(thousands).replace(/\bdoi$/, "două").replace(/\bunu$/, "una");
    words.push(thousands >= 20 ? `${fem} de mii` : `${fem} mii`);
  }
  if (remainder > 0 || words.length === 0 || (n < 0 && words.length === 1)) words.push(under1000(remainder));
  const dec = cleaned.split(".")[1];
  if (dec && /^\d+$/.test(dec) && Number(dec) > 0) {
    words.push("virgulă");
    for (const d of dec) words.push(UNITS[Number(d)]);
  }
  return words.join(" ");
}

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

interface Emitter {
  visemes: OculusViseme[];
  times: number[];
  durations: number[];
  t: number;
}

function emit(o: Emitter, v: OculusViseme, scale = 1): void {
  const base = (VISEME_DURATION[v] ?? 1) * scale;
  const last = o.visemes.length - 1;
  if (last >= 0 && o.visemes[last] === v) {
    const d = MERGE_FACTOR * base;
    o.durations[last] += d;
    o.t += d;
  } else {
    o.visemes.push(v);
    o.times.push(o.t);
    o.durations.push(base);
    o.t += base;
  }
}

function pause(o: Emitter, units: number, includeSilence: boolean): void {
  if (units <= 0) return;
  if (includeSilence && units >= 2) {
    o.visemes.push("sil");
    o.times.push(o.t);
    o.durations.push(units);
  }
  o.t += units;
}

/** Normalise Romanian spelling variants (cedilla -> comma-below) and case. */
function normaliseWord(w: string): string {
  return w
    .normalize("NFC")
    .toLowerCase()
    .replace(/ş/g, "ș") // U+015F -> U+0219
    .replace(/ţ/g, "ț"); // U+0163 -> U+021B
}

/** Vowels that turn a preceding "ce/ci/ge/gi" e/i into a silent glide marker. */
const GLIDE_TRIGGER: ReadonlySet<string> = new Set(["a", "o", "u"]);

/** Emit the visemes of one word (letters only, already normalised). */
function processWord(word: string, o: Emitter): void {
  const cs = [...word];
  const nVowels = cs.reduce((acc, c) => acc + (VOWELS.has(c) ? 1 : 0), 0);

  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const n1 = cs[i + 1];
    const n2 = cs[i + 2];

    if (c === "c" || c === "g") {
      if (n1 === "h") {
        // che/chi -> [k], ghe/ghi -> [g]; the h is silent
        emit(o, "kk");
        i += 1;
        continue;
      }
      if (n1 === "e" || n1 === "i") {
        // ce/ci -> [tʃ], ge/gi -> [dʒ]
        emit(o, "CH");
        if (n2 !== undefined && GLIDE_TRIGGER.has(n2)) {
          // cea/cio/ciu/gea/giu: the e/i is a diacritic marker, not a vowel
          i += 1;
        }
        continue;
      }
      emit(o, "kk");
      continue;
    }

    if (c === "x") {
      emit(o, "kk", 0.55);
      emit(o, "SS");
      continue;
    }

    if (c === "ț") {
      // [ts]: short closure then the sibilant shape
      emit(o, "DD", 0.5);
      emit(o, "SS", 0.85);
      continue;
    }

    if (c === "h") {
      emit(o, "kk", 0.5); // weak
      continue;
    }

    if (c === "i") {
      const isLast = i === cs.length - 1;
      const prev = cs[i - 1];
      if (isLast && i > 0 && prev !== undefined && !VOWELS.has(prev) && nVowels > 1) {
        // Word-final non-syllabic i (copaci, ochi, lumi): a brief palatal hint
        emit(o, "I", 0.45);
        continue;
      }
      if (i === 0 && n1 !== undefined && VOWELS.has(n1)) {
        // Initial semivowel [j] (iubește, iar)
        emit(o, "I", 0.6);
        continue;
      }
      emit(o, "I");
      continue;
    }

    const vv = VOWEL_VISEME[c];
    if (vv) {
      emit(o, vv);
      continue;
    }
    const cv = CONSONANT_VISEME[c];
    if (cv) {
      emit(o, cv);
      continue;
    }
    // Unknown letter (foreign): ignore.
  }
}

// ---------------------------------------------------------------------------
// TalkingHead-compatible class
// ---------------------------------------------------------------------------

const SYMBOLS: Readonly<Record<string, string>> = {
  "%": " la sută ",
  "€": " euro ",
  $: " dolari ",
  "&": " și ",
  "+": " plus ",
};

export class LipsyncRo {
  readonly visemeDurations: Readonly<Record<OculusViseme, number>>;
  readonly specialDurations: Readonly<Record<string, number>>;

  constructor() {
    this.visemeDurations = VISEME_DURATION;
    this.specialDurations = SPECIAL_DURATION;
  }

  /**
   * Preprocess text: symbols and numbers to words, drop characters that are
   * not spoken (quotes, brackets, markup), collapse whitespace.
   */
  preProcessText(s: string): string {
    return s
      .replace(/[#_*"'„”“«»()[\]{}]/g, "")
      .replace(/[%€$&+]/g, (sym) => SYMBOLS[sym] ?? " ")
      .replace(/(\d)[.,](\d)/g, "$1 virgulă $2")
      .replace(/\d+/g, (num) => romanianNumberToWords(num))
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Convert a word (or short text) to visemes with relative timings. */
  wordsToVisemes(w: string): VisemeSequence {
    const track = romanianToVisemes(w, { includeSilence: false, preprocess: false });
    return { words: w, visemes: track.visemes, times: track.times, durations: track.durations };
  }
}

// ---------------------------------------------------------------------------
// Pure function (unit-testable)
// ---------------------------------------------------------------------------

export interface RomanianToVisemesOptions {
  /** Emit explicit "sil" entries for pauses >= 2 units (default true). */
  includeSilence?: boolean;
  /** Run preProcessText first (default true). */
  preprocess?: boolean;
}

const preprocessor = new LipsyncRo();

/**
 * Romanian text -> Oculus viseme sequence in relative units.
 * Letters are grouped into words; everything else contributes pauses.
 */
export function romanianToVisemes(text: string, opts: RomanianToVisemesOptions = {}): RomanianVisemeTrack {
  const includeSilence = opts.includeSilence !== false;
  const src = opts.preprocess === false ? text : preprocessor.preProcessText(text);
  const o: Emitter = { visemes: [], times: [], durations: [], t: 0 };
  const wordList: string[] = [];

  const re = /\p{L}+|[^\p{L}]/gsu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const tok = m[0];
    if (/^\p{L}/u.test(tok)) {
      const w = normaliseWord(tok);
      wordList.push(w);
      processWord(w, o);
    } else {
      pause(o, SPECIAL_DURATION[tok] ?? 0, includeSilence);
    }
  }

  return {
    words: src,
    wordList,
    visemes: o.visemes,
    times: o.times,
    durations: o.durations,
    totalDuration: o.t,
  };
}

/**
 * Build an absolute viseme track (ms) from word timings, using the same
 * scaling TalkingHead applies internally (each word's relative sequence is
 * stretched over the word's duration, capped at 200 ms per viseme).
 */
export function wordsToVisemeTrack(
  words: string[],
  wtimes: number[],
  wdurations: number[],
): { visemes: OculusViseme[]; vtimes: number[]; vdurations: number[] } {
  const visemes: OculusViseme[] = [];
  const vtimes: number[] = [];
  const vdurations: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const seq = romanianToVisemes(words[i], { includeSilence: false });
    if (!seq.visemes.length) continue;
    const last = seq.visemes.length - 1;
    const dTotal = seq.times[last] + seq.durations[last];
    if (dTotal <= 0) continue;
    const duration = Math.min(wdurations[i] ?? 0, seq.visemes.length * 200);
    for (let j = 0; j < seq.visemes.length; j++) {
      visemes.push(seq.visemes[j]);
      vtimes.push((wtimes[i] ?? 0) + (seq.times[j] / dTotal) * duration);
      vdurations.push((seq.durations[j] / dTotal) * duration);
    }
  }
  return { visemes, vtimes, vdurations };
}

// ---------------------------------------------------------------------------
// Precomputed viseme tracks (scripts/precompute-visemes.mjs) — R4 / C-02
// ---------------------------------------------------------------------------

/** Mouth-open (vowel) visemes; everything else counts as a consonant shape. */
export const VOWEL_VISEMES: ReadonlySet<OculusViseme> = new Set<OculusViseme>(["aa", "E", "I", "O", "U"]);

export function isVowelViseme(v: string): boolean {
  return VOWEL_VISEMES.has(v as OculusViseme);
}

export interface VisemeDistributionOptions {
  /** Weight of a vowel viseme when a word's duration is shared out (default 1.6). */
  vowelWeight?: number;
  /** Weight of a consonant viseme (default 1.0). */
  consonantWeight?: number;
  /** A `sil` viseme is inserted between two words when the gap exceeds this (default 80 ms). */
  silGapMs?: number;
}

export const VISEME_DISTRIBUTION_DEFAULTS: Required<VisemeDistributionOptions> = {
  vowelWeight: 1.6,
  consonantWeight: 1.0,
  silGapMs: 80,
};

export interface VisemeTrack {
  visemes: OculusViseme[];
  /** Absolute start times in ms (same clock as `wtimes`). */
  vtimes: number[];
  /** Durations in ms. */
  vdurations: number[];
}

/**
 * Word timings (ms, e.g. ElevenLabs alignment) -> absolute viseme track.
 *
 * Unlike {@link wordsToVisemeTrack} (which mirrors TalkingHead's runtime scaling), this is the
 * OFFLINE rule used by `scripts/precompute-visemes.mjs`: each word's duration is distributed over
 * its visemes proportionally to a class weight (vowels 1.6, consonants 1.0) and an explicit `sil`
 * fills any inter-word gap longer than `silGapMs`. Times/durations are rounded to whole ms.
 * Words without letters (or with a non-positive duration) contribute nothing.
 */
export function distributeWordVisemes(
  words: readonly string[],
  wtimes: readonly number[],
  wdurations: readonly number[],
  opts: VisemeDistributionOptions = {},
): VisemeTrack {
  const o = { ...VISEME_DISTRIBUTION_DEFAULTS, ...opts };
  const visemes: OculusViseme[] = [];
  const vtimes: number[] = [];
  const vdurations: number[] = [];
  const n = Math.min(words.length, wtimes.length, wdurations.length);
  // A word "counts" only when it has a positive duration and yields at least one viseme; gaps and
  // trailing silences are measured against the next COUNTING word, so skipped tokens ("—", zero-length
  // words) never create a `sil` on their own.
  const valid: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const ok = Number.isFinite(wtimes[i]) && Number.isFinite(wdurations[i]) && wdurations[i] > 0;
    valid.push(ok && romanianToVisemes(words[i], { includeSilence: false }).visemes.length > 0);
  }

  for (let i = 0; i < n; i++) {
    const start = wtimes[i];
    const duration = wdurations[i];
    if (!valid[i]) continue;
    const seq = romanianToVisemes(words[i], { includeSilence: false });
    if (seq.visemes.length) {
      const weights = seq.visemes.map((v) => (VOWEL_VISEMES.has(v) ? o.vowelWeight : o.consonantWeight));
      const total = weights.reduce((a, b) => a + b, 0);
      let cursor = start;
      for (let j = 0; j < seq.visemes.length; j++) {
        const share = (duration * weights[j]) / total;
        const t0 = Math.round(cursor);
        // Last viseme absorbs the rounding so the word's visemes end exactly at start+duration.
        const t1 = j === seq.visemes.length - 1 ? Math.round(start + duration) : Math.round(cursor + share);
        visemes.push(seq.visemes[j]);
        vtimes.push(t0);
        vdurations.push(Math.max(1, t1 - t0));
        cursor += share;
      }
    }
    // Explicit silence in a long gap before the next counting word.
    let nextIdx = i + 1;
    while (nextIdx < n && !valid[nextIdx]) nextIdx += 1;
    const next = nextIdx < n ? wtimes[nextIdx] : NaN;
    const end = start + duration;
    if (Number.isFinite(next) && next - end > o.silGapMs) {
      visemes.push("sil");
      vtimes.push(Math.round(end));
      vdurations.push(Math.round(next - end));
    }
  }
  return { visemes, vtimes, vdurations };
}
