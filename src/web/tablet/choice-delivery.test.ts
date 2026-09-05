import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { TabletViewMsg } from "@shared/protocol";
import { rememberChoice, reconcileChoices, type PendingChoices } from "./choice-delivery";

const active = (): TabletViewMsg => ({ type: "tabletView", theme: "light", sceneLabel: "Lumină", subtitle: null, cueId: "color", post: 1, lens: "NAVIGAȚIE", zoneChoices: {}, interaction: { type: "paired-choice", prompt: "Alege", options: ["auriu", "verde"], allowObserve: true, mode: "color" } });

test("rapid taps cannot change or duplicate one child's intention; the other child stays independent", () => {
  const pending: PendingChoices = {};
  assert.equal(rememberChoice(pending, active(), "color", "A", "auriu"), true);
  assert.equal(rememberChoice(pending, active(), "color", "A", "verde"), false);
  assert.equal(rememberChoice(pending, active(), "color", "B", "verde"), true);
  assert.deepEqual(pending.color, { A: "auriu", B: "verde" });
});
test("confirmation wins and reconnect resends only the still missing child", () => {
  const pending: PendingChoices = { color: { A: "auriu", B: "verde" } };
  const view = active(); view.zoneChoices.A = { value: "auriu", observed: false };
  assert.deepEqual(reconcileChoices(pending, view, true), [{ kind: "choice", cueId: "color", zone: "B", value: "verde" }]);
  assert.deepEqual(pending, { color: { B: "verde" } });
  assert.equal(rememberChoice(pending, view, "color", "A", "verde"), false);
});
test("a later cue or waiting screen discards old queued choices without sending them", () => {
  const pending: PendingChoices = { old: { A: "auriu" }, color: { B: "verde" } };
  assert.deepEqual(reconcileChoices(pending, { ...active(), cueId: "later" }, true), []);
  assert.deepEqual(pending, {});
  pending.color = { A: "auriu" };
  assert.deepEqual(reconcileChoices(pending, { ...active(), interaction: { type: "waiting" } }, true), []);
  assert.deepEqual(pending, {});
});
test("ordinary broadcasts do not retransmit an in-flight choice", () => {
  const pending: PendingChoices = { color: { A: "auriu" } };
  for (let i = 0; i < 20; i++) assert.deepEqual(reconcileChoices(pending, active(), false), []);
  assert.equal(pending.color.A, "auriu");
});
test("acknowledged choices cannot reappear optimistically after a server clear or new run", () => {
  const pending: PendingChoices = { color: { A: "auriu" } };
  const view = active(); view.zoneChoices.A = { value: "auriu", observed: false };
  reconcileChoices(pending, view, false);
  assert.deepEqual(pending, {});
  assert.deepEqual(reconcileChoices(pending, active(), true), []);
  assert.equal(rememberChoice(pending, active(), "color", "A", "verde"), true);
});
