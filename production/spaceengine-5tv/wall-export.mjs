import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const degrees = x => x * 180 / Math.PI;
const evenCeil = x => Math.ceil(x / 2) * 2;

export function geometry(config, width = 3840) {
  if (!Number.isInteger(width) || width < 160 || width > 3840 || width % 16) throw Error('Width must be a multiple of 16, 160–3840.');
  const d = config.viewer.distanceMm;
  if (!Number.isFinite(d) || d < 500 || d > 50000) throw Error('Invalid viewer distance.');
  const { xMm: eyeX, yMm: eyeY } = config.viewer;
  if (![eyeX, eyeY].every(Number.isFinite)) throw Error('Invalid eye position.');
  if (config.panels.length !== 5 || new Set(config.panels.map(p => p.id)).size !== 5) throw Error('Expected five unique panels.');
  return config.panels.map(p => {
    const { activeWidthMm: w, activeHeightMm: h, centerXmm: cx, centerYmm: cy } = p;
    if (![w, h, cx, cy].every(Number.isFinite) || w <= 0 || h <= 0) throw Error('Invalid panel geometry.');
    const height = width * 9 / 16;
    const left = cx - eyeX - w / 2, right = left + w;
    const bottom = cy - eyeY - h / 2, top = bottom + h;
    // Parallel off-axis frusta. The padded symmetric render is cropped, never yawed.
    const paddedWidth = evenCeil(Math.max(Math.abs(left), Math.abs(right)) * 2 * width / w + 4);
    const paddedHeight = evenCeil(Math.max(Math.abs(bottom), Math.abs(top)) * 2 * height / h + 4);
    if (paddedWidth > 32767 || paddedHeight > 32767) throw Error('Intermediate exceeds FFmpeg v360 dimension limit.');
    const cropX = Math.round(paddedWidth / 2 + left * width / w);
    const cropY = Math.round(paddedHeight / 2 - top * height / h);
    const horizontalFov = degrees(2 * Math.atan(paddedWidth * w / width / (2 * d)));
    const verticalFov = degrees(2 * Math.atan(paddedHeight * h / height / (2 * d)));
    return {
      ...p, width, height, distanceMm: d, leftMm: left, rightMm: right, bottomMm: bottom, topMm: top,
      bearingDeg: degrees(Math.atan2(cx - eyeX, d)),
      leftAngleDeg: degrees(Math.atan2(left, d)), rightAngleDeg: degrees(Math.atan2(right, d)),
      paddedWidth, paddedHeight, cropX, cropY, horizontalFov, verticalFov,
      cropErrorXmm: (cropX - paddedWidth / 2) * w / width - left,
      cropErrorYmm: (paddedHeight / 2 - cropY) * h / height - top,
      maximumCropRoundingMm: Math.max(w / width, h / height) / 2,
      requiredEquirectangularWidthForNativeSampling: Math.ceil(2 * Math.PI * d * width / w),
    };
  });
}

export function filterFor(p) {
  // RGB avoids chroma-grid crop rounding. Both FOVs are explicit; no aspect inference.
  return `format=gbrp,v360=input=equirect:output=flat:w=${p.paddedWidth}:h=${p.paddedHeight}:h_fov=${p.horizontalFov.toFixed(12)}:v_fov=${p.verticalFov.toFixed(12)}:yaw=0:pitch=0:roll=0:interp=lanczos,crop=w=${p.width}:h=${p.height}:x=${p.cropX}:y=${p.cropY}:exact=1,setsar=1,format=yuv420p`;
}

function run(executable, args, capture = false) {
  const result = spawnSync(executable, args, { shell: false, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${executable} failed: ${result.status}\n${result.stderr || ''}`);
  return result.stdout;
}

function main() {
  const args = process.argv.slice(2);
  const command = args.shift() || 'plan';
  const value = (name, fallback) => {
    const at = args.indexOf(name);
    if (at < 0) return fallback;
    if (!args[at + 1] || args[at + 1].startsWith('--')) throw Error(`Missing value for ${name}`);
    return args[at + 1];
  };
  const config = JSON.parse(fs.readFileSync(value('--config', path.join(here, 'wall-geometry.json')), 'utf8'));
  const panels = geometry(config, Number(value('--width', 3840)));
  if (command === 'plan') {
    console.log(JSON.stringify({ geometryVerified: config.geometryVerified, panels }, null, 2));
    return;
  }
  if (command !== 'render') throw Error('Use plan or render.');
  if (!config.geometryVerified && !args.includes('--allow-provisional')) throw Error('Geometry is provisional. Measure it, or explicitly use --allow-provisional for a test export.');
  if (value('--projection') !== 'equirect') throw Error('Confirm an unpadded mono 360x180 equirectangular source with --projection equirect. A 2:1 size alone does not prove its projection.');
  const master = path.resolve(value('--master', 'MASTER-360.mp4'));
  if (!fs.existsSync(master)) throw Error(`Master missing: ${master}`);
  const ffmpeg = value('--ffmpeg', 'ffmpeg'), ffprobe = value('--ffprobe', 'ffprobe');
  const info = JSON.parse(run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,start_time,duration,nb_frames:format=duration', '-of', 'json', master], true));
  const stream = info.streams[0];
  if (!stream || stream.width !== 2 * stream.height) throw Error('Expected full, unpadded 2:1 equirectangular master.');
  const duration = Number(stream.duration ?? info.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw Error('Source duration unavailable.');
  const screen = value('--screen', 'all');
  const selected = screen === 'all' ? panels : panels.filter(p => p.id === screen);
  if (!selected.length) throw Error('Unknown screen ID.');
  const out = path.resolve(value('--out', path.join(here, 'exports')));
  fs.mkdirSync(out, { recursive: true });
  // Check every destination before starting an expensive batch. Never overwrite a render.
  for (const p of selected) for (const suffix of ['.mp4', '.render.json']) {
    if (fs.existsSync(path.join(out, p.id + suffix))) throw Error(`Output already exists: ${p.id + suffix}`);
  }
  const limit = value('--seconds');
  if (limit !== undefined && (!Number.isFinite(Number(limit)) || Number(limit) <= 0)) throw Error('Invalid --seconds.');
  for (const p of selected) {
    const dest = path.join(out, p.id + '.mp4');
    const ffargs = ['-hide_banner', '-nostdin', '-n', '-i', master, '-map', '0:v:0', '-an', '-vf', filterFor(p), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-fps_mode', 'passthrough', '-movflags', '+faststart'];
    if (limit) ffargs.push('-t', limit);
    ffargs.push(dest);
    console.log(`${p.id}: same optical origin, parallel projection; input ${stream.width}x${stream.height}. Native local sampling target ~${p.requiredEquirectangularWidthForNativeSampling}px panorama width.`);
    run(ffmpeg, ffargs);
    const proof = JSON.parse(run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,avg_frame_rate,duration', '-of', 'json', dest], true));
    const outputStream = proof.streams?.[0];
    if (!outputStream || outputStream.width !== p.width || outputStream.height !== p.height || !(Number(outputStream.nb_read_frames) > 0)) throw Error('Output validation failed.');
    const expectedDuration = limit ? Math.min(Number(limit), duration) : duration;
    const [num, den] = String(stream.avg_frame_rate).split('/').map(Number);
    const tolerance = num > 0 && den > 0 ? Math.max(0.1, 2 * den / num) : 0.1;
    if (Math.abs(Number(outputStream.duration) - expectedDuration) > tolerance) throw Error('Output duration differs from master.');
    fs.writeFileSync(path.join(out, p.id + '.render.json'), JSON.stringify({ source: master, sourceStream: stream, geometryVerified: config.geometryVerified, projectionConfirmedByCaller: true, panel: p, output: proof, filter: filterFor(p) }, null, 2), { flag: 'wx' });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
