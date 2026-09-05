/**
 * Unit tests for the Romanian lip-sync rules (R4 / C-07). Run with `npm test -- lipsync`.
 * Pure logic only: no DOM, no TalkingHead.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LipsyncRo,
  VISEME_DURATION,
  VISEME_DISTRIBUTION_DEFAULTS,
  distributeWordVisemes,
  isVowelViseme,
  romanianNumberToWords,
  romanianToVisemes,
  wordsToVisemeTrack,
  type OculusViseme,
} from "./lipsync-ro";

const visemesOf = (text: string): OculusViseme[] => romanianToVisemes(text, { includeSilence: false }).visemes;

describe("romanianToVisemes — grapheme rules", () => {
  it("maps Pământ to PP aa PP I nn DD (ă -> aa, â -> I)", () => {
    assert.deepEqual(visemesOf("Pământ"), ["PP", "aa", "PP", "I", "nn", "DD"]);
  });

  it("ce/ci/ge/gi -> CH, che/chi/ghe/ghi -> kk (silent h)", () => {
    assert.deepEqual(visemesOf("ce"), ["CH", "E"]);
    assert.deepEqual(visemesOf("cinci"), ["CH", "I", "nn", "CH", "I"]);
    assert.deepEqual(visemesOf("ghid"), ["kk", "I", "DD"]);
    assert.deepEqual(visemesOf("chem"), ["kk", "E", "PP"]);
  });

  it("cea/cio/ciu: the e/i is only a marker, not a vowel", () => {
    assert.deepEqual(visemesOf("ceas"), ["CH", "aa", "SS"]);
    assert.deepEqual(visemesOf("ciudat"), ["CH", "U", "DD", "aa", "DD"]);
  });

  it("ț -> DD+SS, x -> kk+SS, ș/j -> CH", () => {
    assert.deepEqual(visemesOf("țară"), ["DD", "SS", "aa", "RR", "aa"]);
    assert.deepEqual(visemesOf("Exodus"), ["E", "kk", "SS", "O", "DD", "U", "SS"]);
    assert.deepEqual(visemesOf("șapte"), ["CH", "aa", "PP", "DD", "E"]);
    assert.deepEqual(visemesOf("jurnal"), ["CH", "U", "RR", "nn", "aa", "nn"]);
  });

  it("word-final non-syllabic i is a short palatal hint; initial i before a vowel is a glide", () => {
    const copaci = romanianToVisemes("copaci", { includeSilence: false });
    assert.deepEqual(copaci.visemes, ["kk", "O", "PP", "aa", "CH", "I"]);
    const lastI = copaci.durations[copaci.visemes.length - 1];
    assert.ok(lastI < VISEME_DURATION.I, `final i (${lastI}) should be shorter than a full I (${VISEME_DURATION.I})`);
    const iar = romanianToVisemes("iar", { includeSilence: false });
    assert.equal(iar.visemes[0], "I");
    assert.ok(iar.durations[0] < VISEME_DURATION.I);
  });

  it("merges consecutive identical visemes instead of emitting twice (mm, ll)", () => {
    assert.deepEqual(visemesOf("alla"), ["aa", "nn", "aa"]);
    const seq = romanianToVisemes("alla", { includeSilence: false });
    assert.ok(seq.durations[1] > VISEME_DURATION.nn, "merged nn must be longer than a single nn");
  });

  it("normalises cedilla spellings and case", () => {
    assert.deepEqual(visemesOf("ŞAPTE"), visemesOf("șapte"));
    assert.deepEqual(visemesOf("ţară"), visemesOf("țară"));
  });
});

describe("romanianToVisemes — durations and pauses", () => {
  it("vowels get longer relative durations than consonants", () => {
    const seq = romanianToVisemes("Pământ", { includeSilence: false });
    const byViseme = new Map(seq.visemes.map((v, i) => [v, seq.durations[i]]));
    assert.ok(byViseme.get("aa")! > byViseme.get("DD")!, "aa longer than DD");
    assert.ok(byViseme.get("aa")! > byViseme.get("nn")!, "aa longer than nn");
    assert.ok(byViseme.get("aa")! > byViseme.get("PP")!, "aa longer than PP");
    for (const v of ["aa", "E", "I", "O", "U"] as const) {
      for (const c of ["PP", "DD", "kk", "nn", "RR"] as const) {
        assert.ok(VISEME_DURATION[v] > VISEME_DURATION[c], `${v} (${VISEME_DURATION[v]}) > ${c} (${VISEME_DURATION[c]})`);
      }
    }
  });

  it("punctuation yields an explicit sil with the punctuation's pause length", () => {
    const seq = romanianToVisemes("Da. Nu");
    const silIndex = seq.visemes.indexOf("sil");
    assert.ok(silIndex > 0, "a sil viseme is emitted after the full stop");
    assert.equal(seq.durations[silIndex], 4);
    // The space after the stop adds 1 more unit of time but no extra sil (< 2 units).
    assert.equal(seq.visemes.filter((v) => v === "sil").length, 1);
    assert.equal(seq.wordList.join(" "), "da nu");
  });

  it("times are monotonic and totalDuration covers the last viseme", () => {
    const seq = romanianToVisemes("Priviți-l bine. Când îl vom revedea, îl vom privi altfel.");
    for (let i = 1; i < seq.times.length; i++) assert.ok(seq.times[i] >= seq.times[i - 1], `times[${i}] non-decreasing`);
    const last = seq.visemes.length - 1;
    assert.ok(seq.totalDuration >= seq.times[last] + seq.durations[last] - 1e-9);
  });

  it("omits sil entries when includeSilence is false", () => {
    assert.ok(!visemesOf("Da. Nu, mulțumesc!").includes("sil"));
  });
});

describe("preProcessText / numbers", () => {
  it("converts numbers to Romanian words", () => {
    assert.equal(romanianNumberToWords("186"), "o sută optzeci și șase");
    assert.equal(romanianNumberToWords("10"), "zece");
    assert.equal(romanianNumberToWords("21"), "douăzeci și unu");
    assert.equal(romanianNumberToWords("2000"), "două mii");
    assert.equal(romanianNumberToWords("3,5"), "trei virgulă cinci");
  });

  it("strips quotes/brackets and expands symbols", () => {
    const p = new LipsyncRo();
    assert.equal(p.preProcessText("„Găsiți a patra lume.”"), "Găsiți a patra lume.");
    assert.equal(p.preProcessText("Kepler 186 d"), "Kepler o sută optzeci și șase d");
    assert.equal(p.preProcessText("50%"), "cincizeci la sută");
  });

  it("wordsToVisemes returns the shape TalkingHead expects", () => {
    const r = new LipsyncRo().wordsToVisemes("lume");
    assert.equal(r.words, "lume");
    assert.deepEqual(r.visemes, ["nn", "U", "PP", "E"]);
    assert.equal(r.times.length, 4);
    assert.equal(r.durations.length, 4);
    assert.equal(r.times[0], 0);
  });
});

describe("distributeWordVisemes — offline track used by scripts/precompute-visemes.mjs", () => {
  it("shares each word's duration by class weight (vowel 1.6, consonant 1.0) and inserts sil in gaps > 80 ms", () => {
    const track = distributeWordVisemes(["Pământ", "mare"], [0, 920], [720, 300]);
    // Pământ: PP aa PP I nn DD -> weights 1 1.6 1 1.6 1 1 = 7.2 -> 100 ms per unit at 720 ms.
    assert.deepEqual(track.visemes.slice(0, 6), ["PP", "aa", "PP", "I", "nn", "DD"]);
    assert.deepEqual(track.vtimes.slice(0, 6), [0, 100, 260, 360, 520, 620]);
    assert.deepEqual(track.vdurations.slice(0, 6), [100, 160, 100, 160, 100, 100]);
    // Gap 920 - 720 = 200 ms > 80 -> explicit silence.
    assert.equal(track.visemes[6], "sil");
    assert.equal(track.vtimes[6], 720);
    assert.equal(track.vdurations[6], 200);
    // mare: PP aa RR E -> 1 + 1.6 + 1 + 1.6 = 5.2 over 300 ms, starting at 920.
    assert.deepEqual(track.visemes.slice(7), ["PP", "aa", "RR", "E"]);
    assert.equal(track.vtimes[7], 920);
    const sum = track.vdurations.slice(7).reduce((a, b) => a + b, 0);
    assert.equal(sum, 300, "word durations are preserved exactly after rounding");
    assert.equal(track.vtimes.at(-1)! + track.vdurations.at(-1)!, 1220);
    // A gap of exactly 80 ms is NOT a pause (strictly greater than silGapMs).
    const tight = distributeWordVisemes(["da", "nu"], [0, 280], [200, 100]);
    assert.ok(!tight.visemes.includes("sil"));
  });

  it("vowel visemes end up longer than consonant visemes in the same word", () => {
    const track = distributeWordVisemes(["semnal"], [1000], [500]);
    for (let i = 0; i < track.visemes.length; i++) {
      for (let j = 0; j < track.visemes.length; j++) {
        if (isVowelViseme(track.visemes[i]) && !isVowelViseme(track.visemes[j])) {
          assert.ok(track.vdurations[i] > track.vdurations[j], `${track.visemes[i]} > ${track.visemes[j]}`);
        }
      }
    }
  });

  it("no sil for short gaps, overlaps or the last word; skips words without letters or duration", () => {
    const track = distributeWordVisemes(["da", "—", "nu", "x"], [0, 200, 250, 900], [180, 40, 100, 0]);
    assert.ok(!track.visemes.includes("sil"), "gaps of 20 ms / -10 ms and a trailing word never add sil");
    // "—" has no letters and "x" has zero duration: neither contributes visemes.
    assert.deepEqual(track.visemes, ["DD", "aa", "nn", "U"]);
    assert.deepEqual(track.vtimes, [0, 69, 250, 288]);
  });

  it("honours custom weights and gap threshold", () => {
    const equal = distributeWordVisemes(["ma"], [0], [200], { vowelWeight: 1, consonantWeight: 1 });
    assert.deepEqual(equal.vdurations, [100, 100]);
    const strict = distributeWordVisemes(["da", "nu"], [0, 250], [200, 100], { silGapMs: 40 });
    assert.equal(strict.visemes.filter((v) => v === "sil").length, 1);
    assert.equal(VISEME_DISTRIBUTION_DEFAULTS.vowelWeight, 1.6);
    assert.equal(VISEME_DISTRIBUTION_DEFAULTS.consonantWeight, 1.0);
    assert.equal(VISEME_DISTRIBUTION_DEFAULTS.silGapMs, 80);
  });

  it("is deterministic and tolerant of ragged timing arrays", () => {
    const a = distributeWordVisemes(["Priviți", "bine"], [0, 500], [400, 300]);
    const b = distributeWordVisemes(["Priviți", "bine"], [0, 500], [400, 300]);
    assert.deepEqual(a, b);
    const ragged = distributeWordVisemes(["unu", "doi", "trei"], [0, 300], [200, 200]);
    assert.ok(ragged.visemes.length > 0);
    assert.equal(ragged.vtimes.at(-1)! + ragged.vdurations.at(-1)!, 500);
  });
});

describe("wordsToVisemeTrack — runtime-equivalent scaling", () => {
  it("stretches each word's relative sequence over its duration, capped at 200 ms per viseme", () => {
    const t = wordsToVisemeTrack(["lume"], [100], [4000]);
    assert.deepEqual(t.visemes, ["nn", "U", "PP", "E"]);
    assert.equal(t.vtimes[0], 100);
    const total = t.vdurations.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 800) < 1e-6, `capped at 4 x 200 ms, got ${total}`);
  });
});
