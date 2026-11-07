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
import { ROOT, loadBrand, loadLogoSvg, imageStatus, mediaFile, mediaTypeOf, closingImage, resolveAsset } from './store.mjs';
import { exportSlideSvg } from './svg-export.mjs';
import { getTemplate, resolveTemplate } from './templates/index.mjs';
import { needsPermission } from './post-rules.mjs';
import { WEB_FONTS } from './templates/fonts.mjs';

const run = promisify(execFile);
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export class ImageChangedError extends Error {}

const dataUrl = async (file, mime) =>
  `data:${mime ?? MIME[path.extname(file).toLowerCase()]};base64,${(await readFile(file)).toString('base64')}`;

// setContent() documents have no base URL, so the /fonts/<file> URLs that work in the
// srcDoc previews resolve to nothing at export time. Swap them for data URLs instead
// (only for fonts the slide actually references; base64 is cached per process).
const fontDataUrls = new Map();
async function inlineWebFonts(html) {
  for (const f of WEB_FONTS) {
    const url = `/fonts/${f.file}`;
    if (!html.includes(url)) continue;
    if (!fontDataUrls.has(f.file)) {
      const bytes = await readFile(path.resolve(ROOT, '../deploy/fonts', f.file));
      fontDataUrls.set(f.file, `data:font/ttf;base64,${bytes.toString('base64')}`);
    }
    html = html.replaceAll(url, fontDataUrls.get(f.file));
  }
  return html;
}

async function posterFrame(video, dir) {
  const out = path.join(dir, `poster-${path.basename(video)}.jpg`);
  await run(ffmpegPath, ['-y', '-ss', '0', '-i', video, '-frames:v', '1', '-q:v', '2', out]);
  return out;
}

async function composeVideo({ video, overlayPng, box, fit, baseColor, size, out, focus = '50% 50%' }) {
  const { width: W, height: H } = size;
  const bw = Math.max(2, Math.round(box.width / 2) * 2);
  const bh = Math.max(2, Math.round(box.height / 2) * 2);
  // Cover-fit crops around the panned focus point (slide.focus), like the photo preview.
  const [fx, fy] = (/^\d{1,3}% \d{1,3}%$/.test(focus) ? focus : '50% 50%').split(' ').map((v) => parseInt(v, 10) / 100);
  const scale =
    fit === 'cover'
      ? `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh}:(iw-${bw})*${fx}:(ih-${bh})*${fy}`
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


// Two environments:
// - Docker (Mac mini server): CHROME_PATH points at system chromium. Low-memory flags keep
//   it inside a small container's budget (one process, no GPU, capped JS heap);
//   CHROME_LOW_MEM=0 turns them off without a rebuild in case a chromium build misbehaves.
// - Local dev: the installed Chrome.
async function launchBrowser() {
  const lowMem =
    process.env.CHROME_LOW_MEM !== '0'
      ? [
          '--single-process',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--renderer-process-limit=1',
          '--js-flags=--max-old-space-size=128',
        ]
      : [];
  return chromium.launch(
    process.env.CHROME_PATH
      ? {
          executablePath: process.env.CHROME_PATH,
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', ...lowMem],
        }
      : { channel: 'chrome' },
  );
}

/**
 * @param {object} post
 * @param {{ format: 'png'|'jpg'|'svg', quality?: number, allowChanged?: boolean, only?: number[] }} opts
 *   only = 0-based slide indices to render
 * @returns {Promise<{ files: {name: string, data: Buffer, type: string}[], reports: object[] }>}
 */
export async function renderPost(post, { format, quality = 92, allowChanged = false, only = null }) {
  const brand = await loadBrand(post.brand);
  const { meta } = getTemplate(post.template);
  const size = meta.sizeFor(post);
  const logoSvg = await loadLogoSvg(brand);
  // setContent() pages have no base URL: the profile photo goes in as a data URL.
  if (brand.avatarFile) brand.avatarSrc = await dataUrl(brand.avatarFile);
  const closingRel = await closingImage(brand);
  const closingFile = closingRel ? resolveAsset(brand, closingRel) : null;

  const status = await imageStatus(brand, post);
  const bad = status.flatMap((s, i) => (s.state === 'changed' || s.state === 'missing' ? [`${i + 1}장 (${s.state})`] : []));
  if (bad.length && !allowChanged) {
    throw new ImageChangedError(`사진·영상 파일이 바뀌었거나 없어요: ${bad.join(', ')}`);
  }

  const tmp = await mkdtemp(path.join(tmpdir(), 'sns-studio-'));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    const files = [];
    const reports = [];
    for (const [i, slide] of post.slides.entries()) {
      if (only && !only.includes(i)) continue;
      const { renderSlide, meta: tMeta } = resolveTemplate(post, slide);
      const name = String(i + 1).padStart(2, '0');
      // A slide's media only participates when its template actually shows it —
      // stale media fields left over from a template switch must not drive the
      // video-composite path (templates without [data-media-box] would crash it).
      const usesMedia = tMeta.mediaTypes.length > 0 && tMeta.usesMedia?.(slide) !== false;
      const file = usesMedia
        ? (slide.media ? mediaFile(brand, post, slide) : tMeta.brandClosing ? closingFile : mediaFile(brand, post, slide))
        : null;
      const isVideoFile = Boolean(file) && mediaTypeOf(slide) === 'video';
      const isVideo = isVideoFile && tMeta.mediaTypes.includes('video');
      const base = { brand, post, slide, index: i, logoSvg };

      // Image slides (and the still/SVG version of video slides) render the photo or
      // first frame. Image-only templates render a video's first frame as the photo.
      const still = isVideoFile ? await posterFrame(file, tmp) : file;
      const stillSrc = still ? await dataUrl(still) : null;
      await page.setContent(await inlineWebFonts(renderSlide({ ...base, mediaSrc: stillSrc, mediaType: 'image', mode: 'export' })), {
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
      await page.setContent(await inlineWebFonts(renderSlide({ ...base, mediaSrc: stillSrc, mediaType: 'image', mode: 'overlay' })), {
        waitUntil: 'load',
      });
      await page.evaluate(() => window.__ready);
      // Templates with their own overlay mode (curation-frame) declare the base color and
      // fit on <body>. Any other template: the video goes where its photo element sits
      // (zoom/position included), the page color becomes the video's base, and the photo
      // element plus page backgrounds are made transparent so only the design is overlaid.
      const geo = await page.evaluate(() => {
        const hex = (c) => {
          const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c ?? '');
          if (!m || (m[4] !== undefined && +m[4] === 0)) return null;
          return '#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('');
        };
        const body = document.body;
        const own = body.dataset.baseColor;
        const media = document.querySelector('[data-media]');
        const el = own ? document.querySelector('[data-media-box]') : (media ?? document.querySelector('[data-media-box]'));
        const r = el.getBoundingClientRect();
        const geo = {
          box: { left: r.left, top: r.top, width: r.width, height: r.height },
          baseColor: own || hex(getComputedStyle(body).backgroundColor) || hex(getComputedStyle(document.documentElement).backgroundColor) || '#000000',
          fit: body.dataset.fit || (media && getComputedStyle(media).objectFit === 'contain' ? 'contain' : 'cover'),
        };
        if (!own) {
          const st = document.createElement('style');
          st.textContent = 'html,body{background:transparent!important}[data-media]{visibility:hidden!important}';
          document.head.appendChild(st);
        }
        return geo;
      });
      const overlayPng = path.join(tmp, `${name}-overlay.png`);
      await page.screenshot({ path: overlayPng, omitBackground: true });
      const out = path.join(tmp, `${name}.mp4`);
      await composeVideo({ video: file, overlayPng, ...geo, size, out, focus: slide.focus });
      files.push({ name: `${name}.mp4`, data: await readFile(out), type: 'video/mp4' });
    }

    return { files, reports };
  } finally {
    await browser.close();
    await rm(tmp, { recursive: true, force: true });
  }
}

export const captionText = (post) =>
  `${post.caption}\n\n${post.hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}`.trim() + '\n';

/** Posts that name an original (link or account) leave the app only once it agreed. */
export function permissionError(post) {
  if (needsPermission(post)) {
    return '원작자 허락이 확인되지 않았어요. 출처·허락 탭에서 허락 상태를 "허락 받음"으로 바꿔주세요.';
  }
  return null;
}
