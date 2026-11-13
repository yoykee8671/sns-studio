// Light stand-ins for uploaded videos, used only on screen: a poster frame (thumbnails,
// template cards) and a small preview MP4 (short side ≤ 720px, H.264, no audio, fast
// start) for the editor preview. Exports keep using the original file. Both live next
// to the original in media/.preview/, so purging a post's media removes them too.
import { spawn } from 'node:child_process';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const SCALE = "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'";

export function previewPaths(file) {
  const dir = path.join(path.dirname(file), '.preview');
  const base = path.basename(file);
  return { dir, video: path.join(dir, `${base}.mp4`), poster: path.join(dir, `${base}.jpg`) };
}

const exists = (p) => stat(p).then((s) => s.size > 0, () => false);

function ffmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d).length > 4000 && (err = err.slice(-4000)));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.trim().split('\n').pop() ?? ''}`));
    });
  });
}

/** Writes `out` through a temp file so a half-made file is never served. */
async function make(out, args, timeoutMs) {
  const tmp = `${out}.part${path.extname(out)}`;
  await mkdir(path.dirname(out), { recursive: true });
  try {
    await ffmpeg([...args, '-y', tmp], timeoutMs);
    await rename(tmp, out);
  } finally {
    await rm(tmp, { force: true });
  }
}

/** The first frame as a small JPEG (quick: ~1s even for 4K). Returns its path. */
export async function ensurePoster(file) {
  const { poster } = previewPaths(file);
  if (!(await exists(poster))) {
    await make(poster, ['-ss', '0', '-i', file, '-frames:v', '1', '-vf', SCALE, '-q:v', '4'], 60_000);
  }
  return poster;
}

// One preview encode at a time: they are CPU-heavy and the server also renders exports.
const jobs = new Map();
let queue = Promise.resolve();

/**
 * Starts (or joins) making the preview MP4. Resolves to its path, or rejects if ffmpeg
 * fails; callers that only kick it off should catch.
 */
export function ensurePreview(file) {
  const { video } = previewPaths(file);
  if (jobs.has(video)) return jobs.get(video);
  const job = (queue = queue.catch(() => {}).then(async () => {
    if (!(await exists(video))) {
      await make(video, [
        '-i', file, '-vf', SCALE, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
        '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', '-t', '600',
      ], 20 * 60_000);
    }
    return video;
  })).finally(() => jobs.delete(video));
  jobs.set(video, job);
  return job;
}

/** The preview MP4 if it is ready (null while it is still being made). */
export async function readyPreview(file) {
  const { video } = previewPaths(file);
  return (await exists(video)) && !jobs.has(video) ? video : null;
}
