// Server-side export: renders slides with the same template as the editor preview.
// Image slides → PNG/JPG/SVG screenshots. Video slides → MP4: the template is rendered as a
// transparent overlay and composited over the original video with ffmpeg.
import { execFile } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright-core';
import { loadBrand, loadLogoSvg, imageStatus, mediaFile, mediaTypeOf, closingImage, resolveAsset } from './store.mjs';
import { exportSlideSvg } from './svg-export.mjs';
import { getTemplate } from './templates/index.mjs';

const run = promisify(execFile);
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export class ImageChangedError extends Error {}

const dataUrl = async (file, mime) =>
  `data:${mime ?? MIME[path.extname(file).toLowerCase()]};base64,${(await readFile(file)).toString('base64')}`;

async function posterFrame(video, dir) {
  const out = path.join(dir, `poster-${path.basename(video)}.jpg`);
  await run(ffmpegPath, ['-y', '-ss', '0', '-i', video, '-frames:v', '1', '-q:v', '2', out]);
  return out;
}

async function composeVideo({ video, overlayPng, box, fit, baseColor, size, out }) {
  const { width: W, height: H } = size;
  const bw = Math.round(box.width);
  const bh = Math.round(box.height);
  const scale =
    fit === 'cover'
      ? `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh}`
      : `scale=${bw}:${bh}:force_original_aspect_ratio=decrease`;
  const filter = [
    `color=c=${baseColor}:s=${W}x${H}:r=30[base]`,
    `[0:v]${scale},setsar=1[v]`,
    `[base][v]overlay=x=${Math.round(box.left)}+(${bw}-overlay_w)/2:y=${Math.round(box.top)}+(${bh}-overlay_h)/2:shortest=1[b]`,
    `[b][1:v]overlay=0:0,format=yuv420p[out]`,
  ].join(';');
  await run(
    ffmpegPath,
    [
      '-y', '-i', video, '-i', overlayPng, '-filter_complex', filter,
      '-map', '[out]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out,
    ],
    { maxBuffer: 1 << 26 },
  );
}

// The closing slide is just the image, full-bleed — no gradient, no text, no logo.
const closingHtml = (src, { width, height }) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style></head><body><img src="${src}"></body></html>`;

/**
 * @param {object} post
 * @param {{ format: 'png'|'jpg'|'svg', quality?: number, allowChanged?: boolean, only?: number[] }} opts
 *   only = 0-based slide indices to render (skips the closing slide)
 * @returns {Promise<{ files: {name: string, data: Buffer, type: string}[], reports: object[] }>}
 */
export async function renderPost(post, { format, quality = 92, allowChanged = false, only = null }) {
  const brand = await loadBrand(post.brand);
  const { renderSlide, meta } = getTemplate(post.template);
  const size = meta.sizeFor(post);
  const logoSvg = await loadLogoSvg(brand);

  const status = await imageStatus(brand, post);
  const bad = status.flatMap((s, i) => (s.state === 'changed' || s.state === 'missing' ? [`${i + 1}장 (${s.state})`] : []));
  if (bad.length && !allowChanged) {
    throw new ImageChangedError(`사진·영상 파일이 바뀌었거나 없어요: ${bad.join(', ')}`);
  }

  const tmp = await mkdtemp(path.join(tmpdir(), 'sns-studio-'));
  // Locally the installed Chrome is used; in Docker CHROME_PATH points at system chromium.
  const browser = await chromium.launch(
    process.env.CHROME_PATH
      ? {
          executablePath: process.env.CHROME_PATH,
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
        }
      : { channel: 'chrome' },
  );
  try {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    const files = [];
    const reports = [];
    for (const [i, slide] of post.slides.entries()) {
      if (only && !only.includes(i)) continue;
      const name = String(i + 1).padStart(2, '0');
      const file = mediaFile(brand, post, slide);
      const isVideo = mediaTypeOf(slide) === 'video';
      const base = { brand, post, slide, index: i, logoSvg };

      // Image slides (and the still/SVG version of video slides) render the photo or first frame.
      const still = isVideo ? await posterFrame(file, tmp) : file;
      const stillSrc = still ? await dataUrl(still) : null;
      await page.setContent(renderSlide({ ...base, mediaSrc: stillSrc, mediaType: 'image', mode: 'export' }), {
        waitUntil: 'load',
      });
      reports.push(await page.evaluate(() => window.__ready));

      if (format === 'svg') {
        const svg = await page.evaluate(exportSlideSvg);
        files.push({ name: `${name}.svg`, data: Buffer.from(svg), type: 'image/svg+xml' });
        continue;
      }
      if (!isVideo) {
        const data = await page.screenshot(format === 'jpg' ? { type: 'jpeg', quality } : { type: 'png' });
        files.push({ name: `${name}.${format}`, data, type: format === 'jpg' ? 'image/jpeg' : 'image/png' });
        continue;
      }

      // Video: transparent overlay + measured media box → ffmpeg composite.
      await page.setContent(renderSlide({ ...base, mediaSrc: stillSrc, mediaType: 'image', mode: 'overlay' }), {
        waitUntil: 'load',
      });
      await page.evaluate(() => window.__ready);
      const geo = await page.evaluate(() => {
        const r = document.querySelector('[data-media-box]').getBoundingClientRect();
        return {
          box: { left: r.left, top: r.top, width: r.width, height: r.height },
          baseColor: document.body.dataset.baseColor,
          fit: document.body.dataset.fit,
        };
      });
      const overlayPng = path.join(tmp, `${name}-overlay.png`);
      await page.screenshot({ path: overlayPng, omitBackground: true });
      const out = path.join(tmp, `${name}.mp4`);
      await composeVideo({ video: file, overlayPng, ...geo, size, out });
      files.push({ name: `${name}.mp4`, data: await readFile(out), type: 'video/mp4' });
    }

    // Append the fixed closing slide to full carousel renders (not SVG sets or single-slide pulls).
    if (!only && format !== 'svg' && post.format === 'carousel') {
      const rel = await closingImage(brand);
      if (rel) {
        const src = await dataUrl(resolveAsset(brand, rel));
        await page.setContent(closingHtml(src, size), { waitUntil: 'load' });
        const name = String(post.slides.length + 1).padStart(2, '0');
        const data = await page.screenshot(format === 'jpg' ? { type: 'jpeg', quality } : { type: 'png' });
        files.push({ name: `${name}.${format}`, data, type: format === 'jpg' ? 'image/jpeg' : 'image/png' });
      }
    }
    return { files, reports };
  } finally {
    await browser.close();
    await rm(tmp, { recursive: true, force: true });
  }
}

export const captionText = (post) =>
  `${post.caption}\n\n${post.hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}`.trim() + '\n';

/** 디깅형 posts can only leave the app once the original creator has agreed. */
export function permissionError(post) {
  if (post.contentType === 'curation' && post.source?.permission !== 'granted') {
    return '원작자 허락이 확인되지 않았어요. 소재·출처 탭에서 허락 상태를 "허락 받음"으로 바꿔주세요.';
  }
  return null;
}
