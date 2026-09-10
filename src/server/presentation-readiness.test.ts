import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freshExperience } from './experience';
import { MissionSession } from './mission-session';
import { MissionStore } from './mission-store';
import { runPreflight } from './preflight';
import type { AppConfig, ShowFile, ShowState, VoiceManifest } from '../shared/types';

const idle = { state: 'idle', phaseTime: 0, rate: 1 } as ShowState;

function soloTutorial(t: TestContext) {
  const store = new MissionStore(':memory:');
  t.after(() => store.close());
  const session = new MissionSession(store);
  session.reset('age-5-10');
  session.record.experience = {
    ...freshExperience(), status: 'tutorial', participants: ['1B'], touched: ['1B'],
    narration: { id: 'touch', instance: 'narration-instance', startedAt: 0 },
  };
  return session;
}

test('a solo tutorial waits for the narration provider even after the participant has answered', t => {
  const session = soloTutorial(t);
  let narrationReady = false;
  session.narrationReady = experience => {
    assert.equal(experience.narration?.instance, 'narration-instance');
    return narrationReady;
  };

  const waiting = session.snapshot(idle, 1).experience!;
  assert.deepEqual(waiting.touched, ['1B']);
  assert.equal(waiting.narrationComplete, false);
  assert.equal(waiting.canContinue, false, 'a completed touch must not cut off the narrator');

  narrationReady = true;
  assert.equal(session.snapshot(idle, 1).experience!.narrationComplete, true);
  assert.equal(session.snapshot(idle, 1).experience!.canContinue, true);

  session.record.experience!.touched = [];
  assert.equal(session.snapshot(idle, 1).experience!.canContinue, false, 'narration alone does not replace the participant');
  session.record.experience!.touched = ['1B'];
  session.record.experience!.launchRequested = true;
  assert.equal(session.snapshot(idle, 1).experience!.canContinue, false, 'handoff cannot be submitted twice');
});

test('tutorial pause and room suspension block continuation despite completed narration', t => {
  const session = soloTutorial(t);
  session.narrationReady = () => true;
  assert.equal(session.snapshot(idle, 1).experience!.canContinue, true);

  session.record.experience!.pausedAt = 0;
  const paused = session.snapshot(idle, 1).experience!;
  assert.equal(paused.paused, true);
  assert.equal(paused.narrationComplete, false);
  assert.equal(paused.canContinue, false);

  delete session.record.experience!.pausedAt;
  const suspended = session.snapshot({ ...idle, suspended: true }, 1).experience!;
  assert.equal(suspended.paused, true);
  assert.equal(suspended.narrationComplete, false);
  assert.equal(suspended.canContinue, false);
  assert.equal(session.snapshot(idle, 1).experience!.canContinue, true, 'explicit resumption restores availability');
});

const panelIds = ['port-outer', 'port-inner', 'center', 'starboard-inner', 'starboard-outer'];

async function filmFixture(t: TestContext) {
  const appRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nava-presentation-preflight-'));
  t.after(async () => {
    assert.equal(path.dirname(appRoot), path.resolve(os.tmpdir()));
    assert(path.basename(appRoot).startsWith('nava-presentation-preflight-'));
    await fs.rm(appRoot, { recursive: true, force: true });
  });
  const config: AppConfig = {
    role: 'master', server: { port: 0, bindHost: '127.0.0.1' }, lang: 'ro', show: 'assets/show.json',
    video: { path: 'media/legacy.mp4', panelsDir: 'media/panels', fit: 'contain', preloadPoster: true },
    avatar: { glb: 'assets/captain.glb', corner: 'bottom-left', widthPercent: 20, marginPx: 10 },
    audio: { voiceVolume: 1, sfxVolume: 1, outputDeviceId: 'default' },
    screens: panelIds.map((id, displayIndex) => ({
      id, displayIndex, showAvatar: id === 'center', showSubtitles: id === 'center',
      showEntities: true, playAudio: id === 'center', kiosk: false,
    })),
    videoWall: { mode: 'panorama', fit: 'contain', focusX: 0.5, focusY: 0.5,
      panels: panelIds.map((screenId, index) => ({ screenId, x: index * 2200, y: 0, width: 2100, height: 1200 })) },
    sync: { clockHz: 4, seekThresholdSec: 0.12, rateNudge: 0.05 },
    dev: { openDevTools: false, windowed: true },
  };
  const show: ShowFile = {
    title: 'Presentation fixture', version: 'fixture', videoDurationSec: 678.05,
    timingStatus: 'aligned', preshowAutoStart: false, launchLeadInSec: 10, epilogueOnVideoEnd: true,
    scenes: [], cues: [{ id: 'welcome', kind: 'voice', phase: 'play', at: 0, speaker: 'CAPITANUL', text: { ro: 'Salut.' } }],
  };
  const manifest: VoiceManifest = { lang: 'ro', generatedAt: 'fixture', clips: {
    welcome: { cueId: 'welcome', lang: 'ro', speaker: 'CAPITANUL', text: 'Salut.', file: 'welcome.mp3',
      mime: 'audio/mpeg', durationMs: 1000, words: ['Salut.'], wtimes: [0], wdurations: [1000],
      visemes: ['SS'], vtimes: [0], vdurations: [1000], provider: 'elevenlabs', generatedAt: 'fixture' },
  } };
  await fs.mkdir(path.join(appRoot, 'assets/voice/ro'), { recursive: true });
  await fs.mkdir(path.join(appRoot, config.video.panelsDir!), { recursive: true });
  await fs.writeFile(path.join(appRoot, 'assets/voice/ro/manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(appRoot, 'assets/voice/ro/welcome.mp3'), Buffer.alloc(2048, 1));
  await fs.writeFile(path.join(appRoot, config.avatar.glb), Buffer.alloc(2048, 1));
  const panelPath = (id: string) => path.join(appRoot, config.video.panelsDir!, `${id}.mp4`);
  for (const id of panelIds) await fs.writeFile(panelPath(id), Buffer.alloc(2048, 1));
  return {
    appRoot, config, panelPath,
    legacyPath: path.join(appRoot, config.video.path),
    run: () => runPreflight(show, 'ro', null, { appRoot, config, log: () => {} }),
  };
}

test('panorama preflight accepts all five configured panel files without the legacy film', async t => {
  const fixture = await filmFixture(t), result = await fixture.run();
  assert.equal(result.video.exists, false);
  assert.equal(result.ok, true, result.reasons.join('; '));
  assert.equal(result.voice.ok, 1);
  assert.equal(result.avatar.exists, true);
  assert.deepEqual(result.panels?.map(panel => panel.id), panelIds);
  for (const panel of result.panels!) {
    assert.equal(panel.path, fixture.panelPath(panel.id));
    assert.equal(panel.exists, true);
    assert.equal(panel.bytes, 2048);
  }
});

test('each missing or empty panel blocks panorama even when the legacy film exists', async t => {
  const fixture = await filmFixture(t);
  await fs.writeFile(fixture.legacyPath, Buffer.alloc(2048, 1));
  for (const id of panelIds) {
    await fs.unlink(fixture.panelPath(id));
    const missing = await fixture.run();
    assert.equal(missing.video.exists, true);
    assert.equal(missing.ok, false, `${id} must be required`);
    assert.equal(missing.panels?.find(panel => panel.id === id)?.exists, false);
    assert(missing.reasons.some(reason => reason.includes(id)));
    assert.equal(missing.panels?.filter(panel => panel.exists).length, 4);

    await fs.writeFile(fixture.panelPath(id), Buffer.alloc(0));
    const empty = await fixture.run();
    assert.equal(empty.ok, false, `${id} must contain video bytes`);
    assert(empty.reasons.some(reason => reason.includes(id)));
    await fs.writeFile(fixture.panelPath(id), Buffer.alloc(2048, 1));
  }
  assert.equal((await fixture.run()).ok, true, 'restoring the actual missing source clears the issue');
});

test('cinema preflight requires its legacy film instead of accepting the panorama files', async t => {
  const fixture = await filmFixture(t);
  fixture.config.videoWall!.mode = 'cinema';
  const missing = await fixture.run();
  assert.equal(missing.ok, false);
  assert.equal(missing.panels, undefined);
  assert(missing.reasons.some(reason => reason.includes(fixture.config.video.path)));

  await fs.writeFile(fixture.legacyPath, Buffer.alloc(2048, 1));
  await fs.unlink(fixture.panelPath('center'));
  const valid = await fixture.run();
  assert.equal(valid.ok, true, valid.reasons.join('; '));
  assert.equal(valid.video.exists, true);
  assert.equal(valid.panels, undefined);
});
