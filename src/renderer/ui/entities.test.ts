import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { entityDensity, hexToRgb, perspectivePose, pulseAt, rgbCss, tintPalette } from "./entities";

describe("entities.entityDensity (R4 / B-04)", () => {
  it("is 1 without intensity/votes", () => {
    assert.equal(entityDensity(null), 1);
    assert.equal(entityDensity({}), 1);
    assert.equal(entityDensity({ color: "#ff0000" }), 1);
  });
  it("grows with intensity, clamped to 0.5..1.4", () => {
    assert.equal(entityDensity({ intensity: 0 }), 0.6);
    assert.equal(entityDensity({ intensity: 1 }), 1.4);
    assert.equal(entityDensity({ intensity: 7 }), 1.4);
    assert.equal(entityDensity({ intensity: -3 }), 0.6);
  });
  it("uses votes (saturating at 5 pairs) when intensity is missing", () => {
    assert.ok(Math.abs(entityDensity({ votes: 0 }) - 0.6) < 1e-9);
    assert.ok(Math.abs(entityDensity({ votes: 5 }) - 1.4) < 1e-9);
    assert.ok(Math.abs(entityDensity({ votes: 50 }) - 1.4) < 1e-9);
    assert.equal(entityDensity({ votes: 5, intensity: 0 }), 0.6);
  });
});

describe("entities.hexToRgb / tintPalette", () => {
  it("parses 3- and 6-digit hex", () => {
    assert.deepEqual(hexToRgb("#fcd34d"), [252, 211, 77]);
    assert.deepEqual(hexToRgb("fcd34d"), [252, 211, 77]);
    assert.deepEqual(hexToRgb("#f00"), [255, 0, 0]);
    assert.equal(hexToRgb("red"), null);
    assert.equal(hexToRgb(undefined), null);
    assert.equal(rgbCss([255, 0, 128]), "#ff0080");
  });
  it("builds [base, lighter, white, darker]; default gold when the colour is invalid", () => {
    const p = tintPalette("#0000ff");
    assert.equal(p.length, 4);
    assert.equal(p[0], "#0000ff");
    assert.equal(p[2], "#ffffff");
    assert.ok(hexToRgb(p[1])![0] > 0, "lighter mixes toward white");
    assert.ok(hexToRgb(p[3])![2] < 255, "darker mixes toward black");
    assert.equal(tintPalette("nope")[0], "#fcd34d");
  });
});

describe("entities.perspectivePose / pulseAt", () => {
  it("is deterministic per key, zero without key, within bounds", () => {
    assert.deepEqual(perspectivePose(undefined), { rotation: 0, skew: 0 });
    const a = perspectivePose("DIRECȚIE");
    const b = perspectivePose("DIRECȚIE");
    const c = perspectivePose("TRASEU");
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
    for (const p of [a, c]) {
      assert.ok(Math.abs(p.rotation) <= 0.6 + 1e-9);
      assert.ok(Math.abs(p.skew) <= 0.22 + 1e-9);
    }
  });
  it("heartbeat at bpm: attack then decay, 0 without bpm", () => {
    assert.equal(pulseAt(1.23, undefined), 0);
    assert.equal(pulseAt(1.23, 0), 0);
    const bpm = 60; // one beat per second
    assert.ok(pulseAt(0.04, bpm) > 0.4 && pulseAt(0.04, bpm) < 0.6, "mid-attack");
    assert.ok(Math.abs(pulseAt(0.08, bpm) - 1) < 1e-6, "peak");
    assert.ok(pulseAt(0.5, bpm) < pulseAt(0.2, bpm), "decays");
    assert.ok(Math.abs(pulseAt(1.08, bpm) - pulseAt(0.08, bpm)) < 1e-6, "periodic");
  });
});
