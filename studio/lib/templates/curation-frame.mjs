// 디깅형: introduces someone else's post. The original stays uncropped (contain) in the media area,
// and our comment sits in a solid band — below the media for feed posts, above it for reels
// (the bottom of a reel is covered by Instagram's UI). Credit line is always visible.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, escapeHtml, mediaTag } from './runtime.mjs';

const SIZES = {
  carousel: { width: 1080, height: 1350 },
  single: { width: 1080, height: 1350 },
  reel: { width: 1080, height: 1920 },
};

export const meta = {
  label: '디깅형 (원본 + 코멘트)',
  contentType: 'curation',
  formats: ['carousel', 'single', 'reel'],
  mediaTypes: ['image', 'video'],
  sizeFor: (post) => SIZES[post?.format] ?? SIZES.carousel,
  fields: [
    { key: 'headline', label: '헤드라인' },
    { key: 'body', label: '코멘트' },
    { key: 'credit', label: '출처 표기' },
  ],
  options: [
    { key: 'theme', label: '코멘트 영역', choices: [[undefined, '화이트'], ['dark', '블랙']] },
    { key: 'fit', label: '원본 맞춤', choices: [[undefined, '자르지 않기'], ['cover', '꽉 채우기']] },
  ],
  newSlide: (post) => ({
    headline: '',
    body: '',
    credit: post?.source?.handle ? `📷 @${post.source.handle}` : '',
    stickers: [],
  }),
};

/**
 * @param {object} o
 * @param {'preview'|'export'|'overlay'} o.mode
 *   overlay = everything except the media, on a transparent page (composited over video by ffmpeg)
 */
export function renderSlide({ brand, post, slide, index, mediaSrc, mediaType, logoSvg, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const isReel = post?.format === 'reel';
  const isCover = index === 0;
  const dark = slide.theme === 'dark';
  const fit = slide.fit === 'cover' ? 'cover' : 'contain';
  const { fonts, colors } = brand;
  const bg = dark ? colors.ink : '#ffffff';
  const fg = dark ? '#ffffff' : colors.ink;
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const field = (key, cls, max, label, text) =>
    text ? `<div class="${cls}" data-field="${key}" data-max-lines="${max}" data-label="${label}">${escapeHtml(text)}</div>` : '';

  const band = `<div class="band">
      ${field('headline', 'headline', 2, '헤드라인', slide.headline)}
      ${field('body', 'body', 2, '코멘트', slide.body)}
      <div class="foot">
        ${field('credit', 'credit', 1, '출처 표기', slide.credit) || '<span></span>'}
        ${isCover ? `<div class="logo">${logoSvg}</div>` : ''}
      </div>
    </div>`;
  const media = `<div class="media-box" data-media-box>
      ${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'media' })}
    </div>`;

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${mode === 'overlay' ? 'transparent' : bg}; }
  body {
    position: relative; color: ${fg};
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .frame { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .media-box { position: relative; flex: 1; min-height: 0; background: ${bg}; }
  .media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: ${fit}; }
  .media-missing {
    display: grid; place-items: center; background: ${dark ? '#2a2a2a' : '#ecebe6'};
    color: ${dark ? '#888' : '#8a877f'}; font-size: 32px;
  }
  .band { flex: none; padding: ${isReel ? '190px 72px 56px' : '40px 64px 46px'}; }
  .headline {
    font-family: '${fonts.headline}'; font-weight: 700;
    font-size: ${isReel ? 58 : 46}px; line-height: 1.3; letter-spacing: -0.03em; white-space: pre;
  }
  .body {
    margin-top: 14px; font-size: ${isReel ? 34 : 28}px; line-height: 1.5; letter-spacing: -0.02em;
    white-space: pre; opacity: .82;
  }
  .foot { margin-top: 26px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .credit { font-size: ${isReel ? 26 : 22}px; letter-spacing: -0.01em; white-space: pre; opacity: .6; min-width: 0; }
  .logo svg { display: block; width: ${isReel ? 240 : 200}px; height: auto; }
  body[data-mode='overlay'] .media-box { background: transparent; }
  body[data-mode='overlay'] .media { visibility: hidden; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${['preview', 'overlay'].includes(mode) ? mode : 'export'}" data-base-color="${bg}"
  data-fit="${fit}">
  <div class="frame">
    ${isReel ? band + media : media + band}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
