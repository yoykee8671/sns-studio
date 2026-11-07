// 링크로 가져오기: downloads the video(s) of a public Instagram post/reel with yt-dlp (the
// standard open-source downloader, run only on demand) so a repost can be made from them.
// Instagram changes often: keep yt-dlp current (`yt-dlp -U`, or rebuild the image), and
// for posts that need a login set INSTAGRAM_COOKIES_FILE to an exported cookies.txt.
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const TIMEOUT_MS = 150_000;
const MEDIA = { '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image' };

/** Accepts instagram.com post / reel / tv links only (unless IMPORT_ALLOW_ANY=1 for tests). */
export function checkUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw new Error('링크 형식이 아니에요.');
  }
  if (process.env.IMPORT_ALLOW_ANY === '1') return u.toString();
  const host = u.hostname.replace(/^(www|m)\./, '');
  if (host !== 'instagram.com' || !/^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/.test(u.pathname)) {
    throw new Error('인스타그램 게시물·릴스 링크를 넣어주세요 (instagram.com/p/… 또는 /reel/…).');
  }
  return `https://www.instagram.com${u.pathname.replace(/\/reels\//, '/reel/')}`;
}

function ytdlp(args) {
  const cookies = process.env.INSTAGRAM_COOKIES_FILE;
  const all = [
    '--no-warnings', '--socket-timeout', '30', '--ffmpeg-location', ffmpegPath,
    ...(cookies && existsSync(cookies) ? ['--cookies', cookies] : []),
    ...args,
  ];
  return new Promise((resolve, reject) => {
    execFile(YTDLP, all, { timeout: TIMEOUT_MS, maxBuffer: 1 << 26 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message);
        if (err.code === 'ENOENT') return reject(new Error('서버에 yt-dlp가 없어요 (YTDLP_PATH 확인).'));
        if (/log(ged)?[ -]?in|cookies|rate-limit|not available|private|empty media/i.test(msg)) {
          return reject(new Error('인스타그램이 로그인을 요구하거나 비공개 게시물이에요. 잠시 뒤 다시 시도하거나 서버에 로그인 쿠키(INSTAGRAM_COOKIES_FILE)를 설정해야 해요.'));
        }
        if (err.killed) return reject(new Error('가져오는 데 너무 오래 걸려서 멈췄어요. 다시 시도해 주세요.'));
        return reject(new Error(`가져오지 못했어요: ${msg.split('\n').filter(Boolean).pop()?.slice(0, 200)}`));
      }
      resolve(stdout);
    });
  });
}

/**
 * @returns {Promise<{ url: string, handle: string, caption: string,
 *   files: { name: string, data: Buffer, kind: 'video'|'image' }[] }>}
 */
export async function importFromUrl(rawUrl) {
  const url = checkUrl(rawUrl);
  const dir = await mkdtemp(path.join(tmpdir(), 'sns-import-'));
  try {
    const info = JSON.parse(await ytdlp(['-J', url]));
    await ytdlp([
      '-f', 'bv*+ba/b', '--merge-output-format', 'mp4',
      '-o', path.join(dir, '%(playlist_index|0)03d.%(ext)s'),
      url,
    ]);
    const names = (await readdir(dir)).filter((f) => MEDIA[path.extname(f).toLowerCase()]).sort();
    if (!names.length) throw new Error('이 게시물에서 가져올 영상이나 사진을 찾지 못했어요.');
    const files = [];
    for (const name of names) {
      files.push({ name, data: await readFile(path.join(dir, name)), kind: MEDIA[path.extname(name).toLowerCase()] });
    }
    const first = info.entries?.[0] ?? info;
    const handle = String(info.uploader_id || info.channel || first.uploader_id || first.channel || info.uploader || '')
      .replace(/^@/, '').trim();
    const caption = String(info.description ?? first.description ?? '').slice(0, 2000);
    return { url, handle, caption, files };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
