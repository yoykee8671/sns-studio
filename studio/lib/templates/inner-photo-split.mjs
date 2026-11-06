// 속지: 사진 + 소제목 — photo on the top half, subtitle and body on paper below.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

export const meta = {
  label: '사진 + 소제목',
  contentType: 'knowledge',
  role: 'inner',
  formats: ['carousel', 'single'],
  mediaTypes: ['image'],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'title', label: '소제목' },
    { key: 'body', label: '본문', hint: '문단 사이는 한 줄을 띄우면 읽기 편해요' },
  ],
  options: [],
  newSlide: () => ({ template: 'inner-photo-split', title: '', body: '', stickers: [] }),
  sample: {
    title: '소제목을 넣는 자리',
    body: '이 부분에는 본문 문단을 적습니다. 위쪽 사진 칸에는 내용과 어울리는 사진을 넣어 주세요.',
  },
};

export function renderSlide({ brand, post, slide, mediaSrc, mediaType, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const photoH = Math.round(H * 0.52);
  const focus = /^\d{1,3}% \d{1,3}%$/.test(slide.focus ?? '') ? slide.focus : '50% 50%';

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss()}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${colors.paper ?? '#ffffff'}; }
  body {
    position: relative; color: ${colors.ink ?? '#111111'};
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .media-box { position: absolute; left: 0; right: 0; top: 0; height: ${photoH}px; overflow: hidden; background: #ecebe6; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${focus}; }
  .media-missing { display: grid; place-items: center; color: #8a877f; font-size: 30px; }
  .text { position: absolute; left: 110px; right: 110px; top: ${photoH + 70}px; bottom: 90px; }
  .title {
    font-family: '${fonts.headline}'; font-weight: 700;
    font-size: 40px; line-height: 1.35; letter-spacing: -0.02em; white-space: pre-wrap;
  }
  .body { margin-top: 26px; font-size: 30px; line-height: 1.7; letter-spacing: -0.015em; white-space: pre-wrap; opacity: .9; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="media-box" data-media-box>
    ${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'bg' })}
  </div>
  <div class="text">
    <div class="title" data-field="title" data-max-lines="2" data-label="소제목" style="${fieldStyle(slide, 'title', 40)}">${renderMarkup(slide.title ?? '', palette)}</div>
    ${slide.body ? `<div class="body" data-field="body" data-max-lines="8" data-label="본문" style="${fieldStyle(slide, 'body', 30)}">${renderMarkup(slide.body, palette)}</div>` : ''}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
