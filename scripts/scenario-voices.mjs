#!/usr/bin/env node
/** Separate, resumable scenario audio production. Never mutates legacy show audio. */
import { build } from 'esbuild';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profiles = ['age-5-10', 'age-10-15', 'age-15-18', 'adults'];
const run = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const atomic = async (file, value) => { await fs.writeFile(`${file}.tmp`, value); await fs.rename(`${file}.tmp`, file); };
const json = (file, value) => atomic(file, JSON.stringify(value, null, 2) + '\n');
const args = new Set(process.argv.slice(2));
const check = args.has('--check') || args.has('--reels') || args.has('--transcribe');
const dry = args.has('--dry-run');
if ([...args].some(a => !['--check', '--dry-run', '--reels', '--transcribe'].includes(a))) throw new Error('Use --check, --dry-run, --reels, --transcribe, or no arguments to generate/resume.');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const sanitize = value => String(value).replaceAll(process.env.ELEVENLABS_API_KEY || 'NEVER_MATCH_SECRET', '[redacted]').replace(/sk_[a-zA-Z0-9]+/g, '[redacted]').slice(0, 800);

async function moduleFrom(file) {
  const result = await build({ entryPoints: [path.join(ROOT, file)], bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

async function main() {
  const [{ alignmentToWords }, { distributeWordVisemes }] = await Promise.all([
    moduleFrom('src/server/tts-providers.ts'), moduleFrom('src/renderer/avatar/lipsync-ro.ts'),
  ]);
  const casting = (await read(path.join(ROOT, 'assets/show/voice-script-v3.json'))).tts;
  const summary = { generatedAt: new Date().toISOString(), generated: 0, reused: 0, missing: [], overBudget: [], failures: [], profiles: {} };
  let blocked = false;
  for (const profile of profiles) {
    const base = path.join(ROOT, 'assets/scenarios', profile);
    const source = await read(path.join(base, 'dialogue.ro.draft.json'));
    const out = path.join(base, 'voice/ro');
    if (!dry && !check) await fs.mkdir(out, { recursive: true });
    let manifest;
    try { manifest = await read(path.join(out, 'manifest.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    manifest ??= { lang: 'ro', scenarioId: profile, clips: {} };
    for (const cue of source.cues) {
      if (!/^[A-Za-z0-9_-]+$/.test(cue.id)) throw new Error('Unsafe cue ID');
      const voice = casting.voices[cue.speaker];
      if (!voice) throw new Error(`No casting for ${cue.speaker}`);
      const voiceId = process.env[`ELEVENLABS_VOICE_${cue.speaker}`] || voice.voiceId;
      const settings = { ...voice.voiceSettings, stability: 0.5, speed: 1 };
      const request = { text: cue.text.ro, model_id: 'eleven_v3', language_code: 'ro', voice_settings: settings, seed: parseInt(hash(`${profile}:${cue.id}`).slice(0, 8), 16) };
      const generationKey = hash(JSON.stringify({ voiceId, request, format: 'mp3_44100_192' }));
      const file = `${cue.id}.mp3`;
      const receiptPath = path.join(out, `${cue.id}.receipt.json`);
      let clip = manifest.clips[cue.id];
      try {
        const receipt = await read(receiptPath);
        if (receipt.generationKey === generationKey) clip = receipt;
      } catch {}
      let audio;
      try { audio = await fs.readFile(path.join(out, file)); } catch {}
      const reusable = clip?.generationKey === generationKey && audio?.length > 0 && hash(audio) === clip.sha256;
      if (dry) { console.log(`${profile}/${cue.id} ${reusable ? 'reuse' : 'generate'} ${cue.text.ro.length} chars`); continue; }
      if (!reusable && (check || blocked)) { summary.missing.push(`${profile}/${cue.id}`); continue; }
      if (!reusable) {
        if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY missing');
        console.log(`[voices] ${profile}/${cue.id} generating`);
        let response;
        try {
          response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_192`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
            body: JSON.stringify(request), signal: AbortSignal.timeout(120000),
          });
          if (!response.ok) {
            const reason = sanitize(`HTTP ${response.status}: ${await response.text()}`);
            summary.failures.push({ profile, cueId: cue.id, reason });
            console.error(`[voices] ${reason}`);
            if ([401, 403, 429].includes(response.status)) blocked = true;
            summary.missing.push(`${profile}/${cue.id}`);
            continue;
          }
          const payload = await response.json();
          audio = Buffer.from(payload.audio_base64 || '', 'base64');
          if (!audio.length) throw new Error('Provider returned empty audio');
          const timing = alignmentToWords(payload.normalized_alignment || payload.alignment, true);
          if (!timing.words.length) throw new Error('Provider returned no word alignment');
          clip = {
            cueId: cue.id, lang: 'ro', speaker: cue.speaker, text: cue.text.ro, file, mime: 'audio/mpeg',
            durationMs: timing.durationMs, words: timing.words, wtimes: timing.wtimes, wdurations: timing.wdurations,
            ...distributeWordVisemes(timing.words, timing.wtimes, timing.wdurations),
            provider: 'elevenlabs', modelId: request.model_id, voiceId, voiceSettings: settings, generationKey,
            requestId: response.headers.get('request-id') || response.headers.get('x-request-id'),
            historyItemId: response.headers.get('history-item-id'), characterCost: response.headers.get('character-cost'),
            sha256: hash(audio), generatedAt: new Date().toISOString(), postprocessTempo: 1,
          };
          // Persist provider output before probing, so a local tool failure never repeats billed synthesis.
          await atomic(path.join(out, file), audio);
          await json(receiptPath, clip);
          summary.generated++;
        } catch (e) {
          summary.failures.push({ profile, cueId: cue.id, reason: sanitize(e.message) });
          console.error(`[voices] ${sanitize(e.message)}`);
          summary.missing.push(`${profile}/${cue.id}`);
          blocked = true; // Network outcome may be uncertain: no automatic rebilling.
          continue;
        }
      } else summary.reused++;
      const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', path.join(out, file)], { windowsHide: true });
      const probe = JSON.parse(stdout);
      clip.durationMs = Math.ceil(Number(probe.format.duration) * 1000);
      clip.codec = probe.streams[0]?.codec_name;
      clip.sampleRate = Number(probe.streams[0]?.sample_rate);
      clip.channels = Number(probe.streams[0]?.channels);
      if (!(clip.durationMs > 0) || clip.codec !== 'mp3' || clip.sampleRate !== 44100 || ![1, 2].includes(clip.channels) || clip.words.length !== clip.wtimes.length || clip.words.length !== clip.wdurations.length || clip.visemes.length !== clip.vtimes.length || clip.visemes.length !== clip.vdurations.length) throw new Error(`Invalid media ${profile}/${cue.id}`);
      const currentTrack = distributeWordVisemes(clip.words, clip.wtimes, clip.wdurations);
      if (['visemes', 'vtimes', 'vdurations'].some(key => JSON.stringify(clip[key]) !== JSON.stringify(currentTrack[key]))) throw new Error(`Stale visemes ${profile}/${cue.id}`);
      if (check) await run('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-i', path.join(out, file), '-f', 'null', '-'], { windowsHide: true });
      for (const [times, durations] of [[clip.wtimes, clip.wdurations], [clip.vtimes, clip.vdurations]]) {
        if (times.some((t, i) => !Number.isFinite(t) || t < 0 || !(durations[i] > 0) || t + durations[i] > clip.durationMs + 150 || (i && t < times[i-1]))) throw new Error(`Invalid timing ${profile}/${cue.id}`);
      }
      clip.slotBudgetMs = cue.maxDurationSec * 1000;
      clip.overBudgetMs = Math.max(0, clip.durationMs - clip.slotBudgetMs);
      if (clip.overBudgetMs) summary.overBudget.push({ profile, cueId: cue.id, phase: cue.phase, at: cue.at, durationSec: clip.durationMs / 1000, budgetSec: cue.maxDurationSec });
      manifest.clips[cue.id] = clip;
      if (!check) { manifest.generatedAt = new Date().toISOString(); await json(receiptPath, clip); await json(path.join(out, 'manifest.json'), manifest); }
      console.log(`[voices] ${profile}/${cue.id} ${clip.durationMs}ms${clip.overBudgetMs ? ' OVER SLOT' : ''}`);
    }
    summary.profiles[profile] = { expected: source.cues.length, available: Object.keys(manifest.clips).length };
    if (!check && !dry) await json(path.join(out, 'production-report.json'), {
      generatedAt: new Date().toISOString(), profile, expected: source.cues.length,
      available: Object.keys(manifest.clips).length,
      sourceSha256: hash(await fs.readFile(path.join(base, 'dialogue.ro.draft.json'))),
      missing: summary.missing.filter(id => id.startsWith(`${profile}/`)),
      overBudget: summary.overBudget.filter(c => c.profile === profile),
      failures: summary.failures.filter(c => c.profile === profile),
      totalAudioMs: Object.values(manifest.clips).reduce((sum, c) => sum + c.durationMs, 0),
      providerCharacterCost: Object.values(manifest.clips).reduce((sum, c) => sum + Number(c.characterCost || 0), 0),
      postprocessTempo: 1,
    });
    if ((args.has('--reels') || args.has('--transcribe')) && source.cues.every(c => manifest.clips[c.id])) {
      const reel = path.join(out, 'preview-all-branches.mp3');
      const list = path.join(out, 'preview-all-branches.ffconcat');
      await fs.writeFile(list, source.cues.map(c => `file '${c.id}.mp3'`).join('\n') + '\n');
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', list, '-c', 'copy', reel], { windowsHide: true });
      if (args.has('--transcribe')) {
        const audio = await fs.readFile(reel);
        const sha256 = hash(audio);
        const transcriptPath = path.join(out, 'preview-transcription.json');
        let transcript;
        try { transcript = await read(transcriptPath); } catch {}
        if (transcript?.sha256 !== sha256) {
          const form = new FormData();
          form.append('file', new Blob([audio], { type: 'audio/mpeg' }), path.basename(reel));
          form.append('model_id', 'scribe_v2');
          form.append('language_code', 'ro');
          form.append('tag_audio_events', 'false');
          form.append('diarize', 'false');
          const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: form, signal: AbortSignal.timeout(240000) });
          if (!response.ok) throw new Error(sanitize(`Scribe HTTP ${response.status}: ${await response.text()}`));
          transcript = { sha256, generatedAt: new Date().toISOString(), requestId: response.headers.get('request-id'), ...(await response.json()) };
          await json(transcriptPath, transcript);
        }
        const words = value => value.toLocaleLowerCase('ro').normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
        const expected = words(source.cues.map(c => c.text.ro).join(' '));
        const actual = words(transcript.text || '');
        let prior = Array.from({ length: actual.length + 1 }, (_, i) => i);
        for (let i = 1; i <= expected.length; i++) {
          const next = [i];
          for (let j = 1; j <= actual.length; j++) next[j] = Math.min(next[j-1] + 1, prior[j] + 1, prior[j-1] + Number(expected[i-1] !== actual[j-1]));
          prior = next;
        }
        const qa = { generatedAt: new Date().toISOString(), method: 'Independent ElevenLabs Scribe v2 transcription of all branch clips; punctuation/case ignored', expectedWords: expected.length, actualWords: actual.length, editDistance: prior[actual.length], wordErrorRate: prior[actual.length] / expected.length, language: transcript.language_code, humanListeningStillRequired: true };
        await json(path.join(out, 'transcription-qa.json'), qa);
        console.log(`[voices-qa] ${profile} WER=${(qa.wordErrorRate * 100).toFixed(2)}%`);
        if (qa.wordErrorRate > 0.18) process.exitCode = 1;
      }
    }
  }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.missing.length || summary.failures.length) process.exitCode = 1;
}
main().catch(e => { console.error(`[voices] ${sanitize(e.message)}`); process.exitCode = 1; });
