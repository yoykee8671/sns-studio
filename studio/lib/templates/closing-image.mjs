// 마지막 장: 끝장 이미지 — the brand's fixed closing image (<brand assets>/closing/),
// full-bleed with nothing on top. It is an ordinary slide now: swap it for another
// last-page template, upload a different picture, or delete it.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag } from './runtime.mjs';
import { feedSizeFor } from './sizes.mjs';

export const meta = {
  label: '끝장 이미지 (계정 고정 이미지)',
  contentType: 'knowledge',
  role: 'last',
  formats: ['carousel', 'single'],
  mediaTypes: ['image'],
  sizeFor: feedSizeFor,
  fields: [],
  options: [],
  // Without an uploaded photo the slide shows the account's current closing file
  // (resolved at render time, so replacing or renaming that file updates every post).
  brandClosing: true,
  newSlide: () => ({ template: 'closing-image', stickers: [] }),
  sample: {},
};

export function renderSlide({ brand, post, slide, mediaSrc, mediaType, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const focus = /^\d{1,3}% \d{1,3}%$/.test(slide.focus ?? '') ? slide.focus : '50% 50%';
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  body { position: relative; color: #fff; font-family: 'Pretendard', sans-serif; }
  .media-box { position: absolute; inset: 0; }
  .bg { width: 100%; height: 100%; object-fit: cover; object-position: ${focus}; display: block; }
  .media-missing { display: grid; place-items: center; height: 100%; font-size: 30px; color: #888; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}" data-base-color="#000000" data-fit="cover">
  <div class="media-box" data-media-box>${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'bg' })}</div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
