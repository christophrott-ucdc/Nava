#!/usr/bin/env node
/** Offline, resumable narrator production. Never called by the show runtime. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets/experience/voice/ro');
const run = promisify(execFile);
const hash = x => createHash('sha256').update(x).digest('hex');
const args = new Set(process.argv.slice(2));
if ([...args].some(x => !['--check', '--auditions', '--transcribe'].includes(x))) throw new Error('Use --check, --auditions, --transcribe or no arguments.');
try { process.loadEnvFile(path.join(root, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const safe = x => String(x).replaceAll(process.env.ELEVENLABS_API_KEY || 'NO_SECRET', '[redacted]').replace(/sk_[\w]+/g, '[redacted]').slice(0, 600);
const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const atomic = async (p, x) => { await fs.writeFile(`${p}.tmp`, x); await fs.rename(`${p}.tmp`, p); };
const json = (p, x) => atomic(p, `${JSON.stringify(x, null, 2)}\n`);
const selected = { voiceId: 'bgVGH727uJ1Qj9P9egUj', voiceName: 'Mihai - Voice That Inspires Confidence' };
const candidates = [selected, { voiceId: 'jZnpFkNYb90WJdOz4bBb', voiceName: 'Nick - Professional Radio and TV Spots' }, { voiceId: '0okaJWIq26j9LWMEOE8N', voiceName: 'Daniel Mihai | Native Romanian Voice – 30+ Years Broadcast Experience' }];
const audition = 'Bine ați venit la bord. Atingeți lumina din fața voastră. Împreună alegem o direcție. Pământul rămâne acasă. Căpitane, echipajul este pregătit.';
const texts = {
  intro: 'Bine ați venit la bord. Înainte să pornim, nava trebuie să vă cunoască. Nu vă faceți griji. Nu cere parole.',
  touch: 'Fiecare are propria jumătate de ecran. Atingeți lumina din fața voastră. Dacă preferați, puteți și să priviți.',
  'age-5-10-practice': 'Nava a rătăcit o piesă. Are obiceiul ăsta înainte de musafiri. Găsiți forma potrivită pe ecran, apoi confirmați alegerea.',
  'age-10-15-practice': 'Un semnal se repetă. Ce ne spune, de fapt? Priviți intervalele de pe ecran, alegeți observația susținută de date și confirmați.',
  'age-15-18-practice': 'O decizie începe cu o propunere. Citiți situația de pe ecran și confirmați alegerea voastră. Apoi vom vedea cum lucrăm împreună.',
  'adults-practice': 'O alegere bună începe cu o întrebare. Priviți informația și costul afișat. Alegeți, apoi confirmați. Această probă nu consumă resursele misiunii.',
  'legacy-v3-practice': 'Priviți indiciul de pe ecran. Găsiți steaua, apoi confirmați. Aceasta este doar o probă.',
  cooperate: 'Acum, împreună. Atingeți semnalul de pe jumătatea voastră de ecran. Priviți în față: fiecare contribuție aprinde o parte din navă.',
  ready: 'Comenzile răspund. Luați-vă o clipă. Priviți în față. Călătoria noastră este gata să înceapă.',
  handoff: 'Echipajul este pregătit. Căpitane... sunt ai dumneavoastră.',
  hint: 'Priviți locul luminos de pe jumătatea voastră de ecran. Încercați în ritmul vostru. Dacă aveți nevoie, operatorul vă poate ajuta.',
  finale: 'Călătoria rămâne în alegerile voastre. Priviți ce ați construit împreună. Alegeți pe ecran ce luați cu voi și trimiteți ultima lumină.',
};

async function synth(id, text, voice, folder) {
  await fs.mkdir(folder, { recursive: true });
  const file = `${id}.mp3`, receiptPath = path.join(folder, `${id}.receipt.json`);
  const request = { text, model_id: 'eleven_v3', language_code: 'ro', voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1 }, seed: parseInt(hash(id).slice(0, 8), 16) };
  const generationKey = hash(JSON.stringify({ voiceId: voice.voiceId, request, format: 'mp3_44100_192' }));
  let receipt, audio;
  try { receipt = await read(receiptPath); audio = await fs.readFile(path.join(folder, file)); } catch {}
  const reused = receipt?.generationKey === generationKey && audio?.length && hash(audio) === receipt.sha256;
  if (!reused) {
    if (args.has('--check') || args.has('--transcribe')) throw new Error(`Missing or stale ${id}; explicit production needed.`);
    if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY missing');
    // An uncertain request is not retried, including after a new process starts.
    const pending = path.join(folder, `${id}.pending.json`);
    try { await fs.access(pending); throw new Error(`${id} has an unresolved provider request. Reconcile ElevenLabs history before removing the pending ledger.`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    await json(pending, { generationKey, requestedAt: new Date().toISOString(), voiceId: voice.voiceId });
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}/with-timestamps?output_format=mp3_44100_192`, { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(120000) });
    if (!response.ok) {
      const reason = safe(`HTTP ${response.status}: ${await response.text()}`);
      await json(pending, { generationKey, voiceId: voice.voiceId, failure: reason });
      throw new Error(reason);
    }
    const payload = await response.json();
    audio = Buffer.from(payload.audio_base64 || '', 'base64');
    if (!audio.length) throw new Error('Empty provider audio');
    receipt = { file, text, voiceId: voice.voiceId, voiceName: voice.voiceName, provider: 'elevenlabs', modelId: request.model_id, generationKey, sha256: hash(audio), generatedAt: new Date().toISOString(), requestId: response.headers.get('request-id'), historyItemId: response.headers.get('history-item-id'), characterCost: response.headers.get('character-cost'), alignment: payload.normalized_alignment || payload.alignment, voiceSettings: request.voice_settings, postprocessTempo: 1 };
    await atomic(path.join(folder, file), audio);
    await json(receiptPath, receipt);
    await fs.unlink(pending);
  }
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate', '-of', 'json', path.join(folder, file)], { windowsHide: true });
  const probe = JSON.parse(stdout);
  const durationSec = Number(probe.format.duration);
  if (!(durationSec > 0 && durationSec <= 20) || probe.streams[0]?.codec_name !== 'mp3' || Number(probe.streams[0]?.sample_rate) !== 44100) throw new Error(`Invalid clip ${id}: ${durationSec}s`);
  await run('ffmpeg', ['-v', 'error', '-xerror', '-i', path.join(folder, file), '-f', 'null', '-'], { windowsHide: true });
  receipt.durationSec = durationSec;
  if (!args.has('--check')) await json(receiptPath, receipt);
  console.log(`${id}: ${reused ? 'reused' : 'generated'}, ${durationSec.toFixed(2)}s, decode PASS`);
  return { ...receipt, reused: Boolean(reused) };
}

async function main() {
  if (args.has('--auditions')) {
    const folder = path.join(out, 'auditions');
    const clips = [];
    for (const [i, voice] of candidates.entries()) clips.push(await synth(`narrator-${i + 1}`, audition, voice, folder));
    await json(path.join(folder, 'manifest.json'), { candidates, text: audition, clips, selectionBasis: 'Native Romanian professional catalog metadata: selected Mihai is explicitly deep, warm baritone with educational narration use. Auditions retained for human listening; no imitation of named public figures.' });
    return;
  }
  const manifest = { schemaVersion: 1, lang: 'ro', ...selected, clips: {} };
  let generated = 0;
  for (const [id, text] of Object.entries(texts)) {
    const clip = await synth(id, text, selected, out);
    if (!clip.reused) generated++;
    manifest.clips[id] = { file: clip.file, durationSec: clip.durationSec, text: clip.text, sha256: clip.sha256 };
    if (!args.has('--check')) await json(path.join(out, 'manifest.json'), manifest);
  }
  if (args.has('--check')) {
    const saved = await read(path.join(out, 'manifest.json'));
    if (JSON.stringify(saved) !== JSON.stringify(manifest)) throw new Error('Runtime manifest differs from verified receipts');
  }
  if (args.has('--transcribe')) {
    const list = path.join(out, 'preview.ffconcat');
    await fs.writeFile(list, Object.values(manifest.clips).map(c => `file '${c.file}'`).join('\n'));
    const reel = path.join(out, 'preview-all-clips.mp3');
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', list, '-c', 'copy', reel], { windowsHide: true });
    const audio = await fs.readFile(reel), sha256 = hash(audio), transcriptPath = path.join(out, 'transcription.json');
    let transcript;
    try { transcript = await read(transcriptPath); } catch {}
    if (transcript?.sha256 !== sha256) {
      const form = new FormData();
      form.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'tutorial.mp3');
      form.append('model_id', 'scribe_v2'); form.append('language_code', 'ro'); form.append('tag_audio_events', 'false');
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: form, signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(safe(`Scribe HTTP ${response.status}: ${await response.text()}`));
      transcript = { sha256, ...(await response.json()) }; await json(transcriptPath, transcript);
    }
    const words = t => t.toLocaleLowerCase('ro').normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
    const expected = words(Object.values(texts).join(' ')), actual = words(transcript.text);
    let prior = actual.map((_, i) => i); prior.push(actual.length);
    for (let i = 1; i <= expected.length; i++) { const next = [i]; for (let j = 1; j <= actual.length; j++) next[j] = Math.min(next[j-1] + 1, prior[j] + 1, prior[j-1] + Number(expected[i-1] !== actual[j-1])); prior = next; }
    const qa = { expectedWords: expected.length, actualWords: actual.length, editDistance: prior[actual.length], wordErrorRate: prior[actual.length] / expected.length, humanListeningRequired: true };
    await json(path.join(out, 'transcription-qa.json'), qa); console.log(JSON.stringify(qa));
    if (qa.wordErrorRate > 0.1) throw new Error('Transcription difference exceeds 10%');
  }
  console.log(JSON.stringify({ clips: Object.keys(manifest.clips).length, generated, reused: Object.keys(manifest.clips).length - generated, totalDurationSec: Object.values(manifest.clips).reduce((s, c) => s + c.durationSec, 0) }));
}
main().catch(e => { console.error(safe(e.message)); process.exitCode = 1; });
