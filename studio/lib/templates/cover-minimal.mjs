// 표지: 작은 글씨 두 줄 (아래) — quiet cover: an optional kicker top-left, a modest
// two-line title bottom-left. Dark or paper, optional background photo.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

export const meta = {
  label: '미니멀 표지 (작은 제목)',
  contentType: 'knowledge',
  role: 'cover',
  formats: ['carousel', 'single'],
  mediaTypes: ['image'],
  usesMedia: (slide) => slide.photo === 'show',
  sizeFor: feedSizeFor,
  fields: [
    { key: 'kicker', label: '머리글', hint: '좌측 상단 작은 한 줄 (선택)' },
    { key: 'title', label: '제목', hint: '아래쪽 작은 제목, 엔터로 줄을 나눠요' },
  ],
  options: [
    { key: 'theme', label: '바탕', choices: [[undefined, '다크'], ['paper', '종이']] },
    { key: 'photo', label: '배경 사진', choices: [[undefined, '없음'], ['show', '어둡게 깔기']] },
    { key: 'logo', label: '로고', choices: [[undefined, '표시'], ['off', '숨김']] },
  ],
  newSlide: () => ({ template: 'cover-minimal', kicker: '', title: '', stickers: [] }),
  sample: { kicker: 'WEEKEND LOG', title: '아래쪽 작은 제목 두 줄\n이렇게 조용한 표지예요' },
};

export function renderSlide({ brand, post, slide, mediaSrc, mediaType, logoSvg, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const paper = slide.theme === 'paper';
  const showPhoto = slide.photo === 'show';
  const bg = paper ? (colors.paper ?? '#ffffff') : (colors.ink ?? '#111111');
  const fg = paper ? (colors.ink ?? '#111111') : '#ffffff';
  const focus = /^\d{1,3}% \d{1,3}%$/.test(slide.focus ?? '') ? slide.focus : '50% 50%';

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss([fonts.headline, fonts.body])}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${bg}; }
  body {
    position: relative; color: ${showPhoto ? '#fff' : fg};
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .media-box { position: absolute; inset: 0; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${focus}; filter: brightness(.5); }
  .media-missing { display: grid; place-items: center; background: #1c1c1c; color: #777; font-size: 32px; }
  .kicker { position: absolute; top: 72px; left: 110px; font-size: 26px; letter-spacing: 0.08em; white-space: pre; opacity: .85; }
  .bottom { position: absolute; left: 110px; right: 110px; bottom: 110px; }
  .title {
    font-family: '${fonts.headline}'; font-weight: 700;
    font-size: 48px; line-height: 1.45; letter-spacing: -0.02em; white-space: pre;
  }
  .logo { position: absolute; top: 64px; right: 110px; color: ${showPhoto ? '#fff' : fg}; }
  .logo svg { display: block; width: 190px; height: auto; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  ${showPhoto ? `<div class="media-box" data-media-box>${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'bg' })}</div>` : ''}
  ${slide.kicker ? `<div class="kicker" data-field="kicker" data-max-lines="1" data-label="머리글" style="${fieldStyle(slide, 'kicker', 26)}">${renderMarkup(slide.kicker, palette)}</div>` : ''}
  ${slide.logo !== 'off' ? `<div class="logo">${logoSvg}</div>` : ''}
  <div class="bottom" data-avoid="bottom">
    <div class="title" data-field="title" data-max-lines="3" data-label="제목" style="${fieldStyle(slide, 'title', 48)}">${renderMarkup(slide.title ?? '', palette)}</div>
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
