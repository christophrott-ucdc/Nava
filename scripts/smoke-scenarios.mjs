#!/usr/bin/env node
/** Real Hono/WS/SQLite scenario integration. Uses actual repository media and generated voices.
 * No mock voice manifests or readiness overrides. A missing production asset fails this test.
 * Screens are absent intentionally: this verifies server behavior, not film/audio playback.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import * as esbuild from 'esbuild';
import WebSocket from 'ws';
export const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
export const PROFILES = ['age-5-10', 'age-10-15', 'age-15-18', 'adults'];
export const WINDOWS = { 'age-5-10': [100, 208, 310], 'age-10-15': [100, 200, 311], 'age-15-18': [100, 196, 310], adults: [104, 201, 315] };
export async function waitFor(read, predicate, label, timeout = 8000) {
  const until = Date.now() + timeout; let value;
  while (Date.now() < until) { value = await read(); if (predicate(value)) return value; await new Promise(r => setTimeout(r, 30)); }
  throw new Error(`${label}: timeout; last=${JSON.stringify(value).slice(0, 700)}`);
}
export function client(url, id, post) {
  const ws = new WebSocket(url); const messages = []; let latest = null;
  ws.on('message', raw => { const m = JSON.parse(String(raw)); messages.push(m); if (messages.length > 1000) messages.shift(); if (m.type === 'mission') latest = m.snapshot; });
  const opened = new Promise((resolve, reject) => { ws.once('error', reject); ws.once('open', () => { ws.send(JSON.stringify({ type: 'hello', client: 'tablet', id })); ws.send(JSON.stringify({ type: 'tablet', tabletId: id, event: { kind: 'set-post', post } })); resolve(); }); });
  return { ws, opened, get snapshot() { return latest; }, send(m) { ws.send(JSON.stringify(m)); }, async next(predicate, label) { return waitFor(() => { const i = messages.findIndex(predicate); return i < 0 ? null : messages.splice(i, 1)[0]; }, Boolean, label); } };
}
export async function createHarness({ webDir = path.join(ROOT, 'dist/web'), connectTablets = true, screens = [], tutorial = false } = {}) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'nava-scenarios-smoke-'));
  const bundle = path.join(temp, 'server.cjs');
  await esbuild.build({ entryPoints: [path.join(ROOT, 'src/server/index.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'warning' });
  const config = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));
  Object.assign(config, { screens, server: { port: 0, bindHost: '127.0.0.1' }, autoRun: { enabled: false, requireScreens: screens.map(s => s.id), requireTablets: 0, startTrigger: 'operator', resetAfterSec: 0 }, security: { operatorPin: '9384', screenToken: '', sessionTtlMin: 30, usersFile: path.join(temp, 'data/users.json'), publicState: true }, lights: { driver: 'none' } });
  const logs = [];
  const serverOptions = { config, appRoot: ROOT, webDir, showPath: path.resolve(ROOT, config.show), cacheDir: path.join(temp, 'cache'), runsDir: path.join(temp, 'runs'), log: (level, message) => { if (level === 'error') logs.push(message); } };
  let handle = await require(bundle).startServer(serverOptions);
  let base = `http://127.0.0.1:${handle.port}`, token;
  async function authenticate() { const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '9384' }) }); assert.equal(login.status, 200); token = (await login.json()).token; }
  await authenticate();
  async function api(url, body) { const r = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json() }; }
  const tablets = connectTablets ? Array.from({ length: 5 }, (_, n) => client(`ws://127.0.0.1:${handle.port}/ws`, `scenario-qa-${n + 1}`, n + 1)) : [];
  await Promise.all(tablets.map(t => t.opened));
  await Promise.all(tablets.map((t, n) => waitFor(() => t.snapshot, s => s?.post === n + 1, 'personalized tablet')));
  async function command(action) { const r = await api('/api/cmd', action); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.ok, true, JSON.stringify(r.body)); }
  async function select(profile) { const r = await api('/api/scenarios/select', { id: profile }); assert.equal(r.status, 200, `${profile}: ${JSON.stringify(r.body)}`); if(!tutorial){const skipped=await api('/api/experience/control',{action:'skip'});assert.equal(skipped.status,200);} return r.body; }
  return { temp, get base() { return base; }, get token() { return token; }, tablets, logs, api, command, select,
    async restartServer() {
      for (const t of tablets) t.ws.close(); await handle.stop();
      handle = await require(bundle).startServer(serverOptions); base = `http://127.0.0.1:${handle.port}`; await authenticate();
      tablets.splice(0, tablets.length, ...(connectTablets ? Array.from({ length: 5 }, (_, n) => client(`ws://127.0.0.1:${handle.port}/ws`, `scenario-qa-${n + 1}`, n + 1)) : []));
      await Promise.all(tablets.map(t => t.opened)); await Promise.all(tablets.map((t, n) => waitFor(() => t.snapshot, s => s?.post === n + 1, 'restored tablet')));
    },
    async close() { for (const t of tablets) t.ws.close(); await handle.stop(); await rm(temp, { recursive: true, force: true }); } };
}
export async function act(tablet, zone, value, duplicate = false) {
  const s = tablet.snapshot; assert(s?.stage && s.view, 'active personalized mission required');
  const event = { type: 'missionAction', runId: s.runId, cueInstanceId: s.cueInstanceId, eventId: randomUUID(), zone, value };
  tablet.send(event); const ack = await tablet.next(m => m.type === 'missionAck' && m.eventId === event.eventId, 'action ACK');
  assert.equal(ack.ok, true, `${value}: ${ack.status}`);
  await waitFor(() => tablet.snapshot, n => n.revision > s.revision, 'confirmed snapshot');
  if (duplicate) { const revision = tablet.snapshot.revision; tablet.send(event); const again = await tablet.next(m => m.type === 'missionAck' && m.eventId === event.eventId, 'duplicate ACK'); assert.equal(again.status, 'duplicate'); assert.equal(tablet.snapshot.revision, revision); }
  return event;
}
export async function rejectAction(tablet, zone, value, expectedStatus) {
  const before = tablet.snapshot;
  const event = { type: 'missionAction', runId: before.runId, cueInstanceId: before.cueInstanceId, eventId: randomUUID(), zone, value };
  tablet.send(event);
  const ack = await tablet.next(m => m.type === 'missionAck' && m.eventId === event.eventId, 'recoverable mistake ACK');
  assert.equal(ack.ok, false, value + ' must not count as success');
  if (expectedStatus) assert.equal(ack.status, expectedStatus);
  const reasons={fit:'piece-not-aligned','dead-end':'route-stops-early',loop:'route-returns-to-start'};
  assert.equal(ack.reason,reasons[value] || (value.startsWith('shape:')?'try-matching-shape':'unavailable-action'),'specific recoverable reason reaches tablet');
  assert.equal(tablet.snapshot.revision, before.revision, 'mistake must not commit progress');
  assert.deepEqual(tablet.snapshot.view, before.view, 'mistake leaves the activity available to retry');
}
export async function completeStage(h, profile, stage) {
  for (const tablet of h.tablets) for (const zone of ['A', 'B']) {
    const view = () => tablet.snapshot.view.zones[zone];
    if (profile === 'age-5-10') {
      if (stage === 1) { const target = `shape:${view().items[0].label}`; await rejectAction(tablet, zone, view().options.find(o => o.value.startsWith('shape:') && o.value !== target).value); await act(tablet, zone, target, true); }
      if (stage === 2) {
        await act(tablet, zone, 'select');
        await rejectAction(tablet, zone, 'fit', 'invalid');
        for (let turn = 0; turn < 3 - (tablet.snapshot.post % 3); turn++) await act(tablet, zone, 'rotate');
        await act(tablet, zone, 'fit');
      }
      if (stage === 3) {
        await rejectAction(tablet, zone, 'dead-end');
        await rejectAction(tablet, zone, 'loop');
        await act(tablet, zone, 'link');
      }
    } else if (profile === 'age-10-15') {
      if (stage === 1) await act(tablet, zone, 'far');
      if (stage === 2) { await act(tablet, zone, 'measure:0'); for (const piece of zone === 'A' ? [1, 3, 2] : [3, 1, 2]) await act(tablet, zone, `piece:${piece}`); await act(tablet, zone, 'send'); }
      if (stage === 3) { await act(tablet, zone, 'far'); await act(tablet, zone, 'reconsider'); await act(tablet, zone, 'relay'); await act(tablet, zone, 'attach:repeated'); }
    } else if (profile === 'age-15-18') {
      if (stage === 2) {
        await act(tablet, zone, 'agree');
        assert(view().options.some(o => o.value === 'conflict' && !o.disabled), 'contradictory sensors remain testable after agreement');
        await act(tablet, zone, 'conflict');
        await rejectAction(tablet, zone, 'agree');
      } else await act(tablet, zone, stage === 1 ? zone === 'A' ? 'execute' : 'conflict' : zone === 'A' ? 'propose' : 'keep');
    }
    else await act(tablet, zone, stage === 1 ? zone === 'A' ? 'wide' : 'fine' : stage === 2 ? zone === 'A' ? 'protect' : 'passive' : zone === 'A' ? 'observation' : 'probe');
  }
}
export async function runSmoke() {
  const h = await createHarness(); const results = [];
  try {
    const catalog = await h.api('/api/scenarios');
    assert.equal(catalog.status, 200);
    let oldEvent;
    for (const profile of PROFILES) {
      await h.select(profile); await h.command({ action: 'start' });
      for (let stage = 1; stage <= 3; stage++) {
        await h.command({ action: 'seek', time: WINDOWS[profile][stage - 1] });
        await Promise.all(h.tablets.map(t => waitFor(() => t.snapshot, s => s?.scenarioId === profile && s.stage === stage && s.state.state === 'playing', `${profile} stage ${stage}`)));
        if (oldEvent) { h.tablets[0].send({ ...oldEvent, eventId: randomUUID() }); const ack = await h.tablets[0].next(m => m.type === 'missionAck', 'stale-run ACK'); assert.equal(ack.status, 'stale-run'); oldEvent = undefined; }
        await completeStage(h, profile, stage);
      }
      const done = h.tablets[0].snapshot;
      const committedProgress = (await h.api('/api/runs/' + done.runId + '/summary')).body.progress;
      for (const [seat, progress] of Object.entries(committedProgress.zones)) {
        if (profile === 'age-5-10') {
          assert.equal(progress.game.rotation, 0, seat + ' piece aligned before mounting');
          assert.equal(progress.choices['2'], 'fitted'); assert.equal(progress.choices['3'], 'linked');
        } else if (profile === 'age-10-15') {
          assert(progress.probes.length >= 1, seat + ' actual probe stored');
          assert.equal(progress.pendingVerdict, undefined, 'reconsidered verdict committed cleanly');
          assert.equal(progress.choices['3'], 'relay'); assert.equal(progress.attachment, 'attach:repeated');
        } else if (profile === 'age-15-18') assert.deepEqual(progress.game.tests, ['agree','conflict'], seat + ' both sensor cases persisted');
      }
      if(profile === 'adults') for(const tablet of h.tablets) {
        const a=tablet.snapshot.view.zones.A.documents, b=tablet.snapshot.view.zones.B.documents;
        assert.equal(a.length,2); assert.equal(b.length,2);
        assert.notDeepEqual(a[0].samples.map(s=>s.value),b[0].samples.map(s=>s.value),'wide and fine produce different authored evidence');
        assert.notDeepEqual(a[1].samples.map(s=>s.value),b[1].samples.map(s=>s.value),'protected and passive reports reveal different certainty');
        assert(a.every(d=>d.limitation.length>10) && b.every(d=>d.limitation.length>10),'each report states its information gap');
      }
      oldEvent = { type: 'missionAction', runId: done.runId, cueInstanceId: done.cueInstanceId, eventId: randomUUID(), zone: 'A', value: 'observe' };
      await h.command({ action: 'epilogue' });
      const final = await waitFor(() => h.tablets[0].snapshot, s => s?.state.state === 'epilogue' && s.certificateToken, 'final snapshot and certificate token');
      assert.equal(final.summary.posts.length, 5);
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
      const cert = { post: 1, dataUrl, runId: final.runId, summaryRevision: final.revision, certificateToken: final.certificateToken };
      assert.equal((await h.api('/api/certificates', cert)).status, 201, 'run-bound certificate accepted');
      assert.equal((await h.api('/api/certificates', cert)).status, 201, 'identical certificate retry accepted');
      assert.equal((await h.api('/api/certificates', { ...cert, runId: 'another-run' })).status, 409, 'mismatched run rejected');
      const stored = await h.api(`/api/runs/${final.runId}/summary`);
      assert.equal(stored.body.progress.profile, profile);
      assert.equal(Object.keys(stored.body.progress.zones).length, 10);
      results.push({ profile, runId: final.runId, revision: final.revision, zones: 10, summary: final.summary });
      await h.command({ action: 'restart' });
    }
    // A cold server restart must restore the exact run suspended, never silently autoplay it.
    await h.select('age-5-10'); await h.command({ action: 'start' }); await h.command({ action: 'seek', time: 100 });
    await waitFor(() => h.tablets[0].snapshot, s => s?.stage === 1, 'recovery stage');
    const committed = await act(h.tablets[0], 'A', 'shape:Cerc');
    const beforeRestart = h.tablets[0].snapshot;
    await h.restartServer();
    const recovery = await h.api('/api/recovery');
    assert.equal(recovery.body.pending, true); assert.equal(recovery.body.mission.runId, beforeRestart.runId);
    assert.equal(recovery.body.mission.suspended, true);
    assert.notEqual(recovery.body.mission.serverEpoch, beforeRestart.serverEpoch);
    assert.equal((await h.api('/api/cmd', { action: 'seek', time: 105 })).status, 409, 'suspended recovery blocks seek');
    assert.equal((await h.api('/api/recovery/resume', {})).status, 200);
    await waitFor(() => h.tablets[0].snapshot, s => !s.suspended && s.runId === beforeRestart.runId, 'explicit recovery resume');
    h.tablets[0].send(committed);
    const persistedDuplicate = await h.tablets[0].next(m => m.type === 'missionAck' && m.eventId === committed.eventId, 'persistent event dedup');
    assert.equal(persistedDuplicate.status, 'duplicate');
    const restored = await h.api(`/api/runs/${beforeRestart.runId}/summary`);
    assert.equal(restored.body.progress.zones['1A'].choices['1'], 'found');
    assert.equal(restored.body.progress.zones['1B'].choices['1'], undefined);
    await h.command({ action: 'restart' });
    assert.deepEqual(h.logs, [], 'no server errors');
    const out = path.join(ROOT, 'runs/debug/romanian-games/server'); await mkdir(out, { recursive: true });
    await writeFile(path.join(out, 'server-smoke.json'), JSON.stringify({ checkedAt: new Date().toISOString(), kind: 'real-server-assets-no-renderer', recovery: { sameRun: true, suspendedUntilExplicitResume: true, preservedProgress: true, persistedEventDedup: true }, results }, null, 2));
    console.log(`Scenario integration passed: ${results.length} profiles, 10 zones × 3 stages, retries, stale runs, SQLite cold recovery and certificates.`);
  } finally { await h.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--serve')) {
    const harness = await createHarness({ connectTablets: false });
    await writeFile(path.join(harness.temp, 'browser-auth.json'), JSON.stringify({ base: harness.base, token: harness.token }));
    console.log(`QA server: ${harness.base}; authentication fixture: ${path.join(harness.temp, 'browser-auth.json')}`);
    await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
    await harness.close();
  } else await runSmoke();
}
