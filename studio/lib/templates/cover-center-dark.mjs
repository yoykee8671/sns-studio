// 표지: 큰 제목 가운데 — dark ground (or a dimmed photo), centered title with an
// optional kicker above and a short sub line below; logo at the bottom center.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

export const meta = {
  label: '가운데 큰 제목 (다크)',
  contentType: 'knowledge',
  role: 'cover',
  formats: ['carousel', 'single'],
  mediaTypes: ['image'],
  usesMedia: (slide) => slide.photo === 'show',
  sizeFor: feedSizeFor,
  fields: [
    { key: 'kicker', label: '머리글', hint: '제목 위 작은 한 줄 (선택)' },
    { key: 'title', label: '제목', hint: '엔터로 줄을 나눠요 (최대 3줄)' },
    { key: 'sub', label: '아래 설명', hint: '제목 아래 짧은 설명 (선택)' },
  ],
  options: [
    { key: 'photo', label: '배경 사진', choices: [[undefined, '없음 (검정)'], ['show', '어둡게 깔기']] },
    { key: 'logo', label: '로고', choices: [[undefined, '표시'], ['off', '숨김']] },
  ],
  newSlide: () => ({ template: 'cover-center-dark', kicker: '', title: '', sub: '', stickers: [] }),
  sample: { kicker: '', title: '늦은 오후의\n세계 여행', sub: '카페에서 떠나는 짧은 여행기' },
};

export function renderSlide({ brand, post, slide, mediaSrc, mediaType, logoSvg, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const showPhoto = slide.photo === 'show';
  const focus = /^\d{1,3}% \d{1,3}%$/.test(slide.focus ?? '') ? slide.focus : '50% 50%';

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss()}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${colors.ink ?? '#111111'}; }
  body {
    position: relative; color: #fff;
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .media-box { position: absolute; inset: 0; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${focus}; filter: brightness(.45); }
  .media-missing { display: grid; place-items: center; background: #1c1c1c; color: #777; font-size: 32px; }
  .center {
    position: absolute; left: 100px; right: 100px; top: 0; bottom: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
  }
  .kicker { font-size: 27px; letter-spacing: 0.1em; opacity: .85; white-space: pre; margin-bottom: 30px; }
  .title {
    font-family: '${fonts.headline}'; font-weight: 800;
    font-size: 92px; line-height: 1.24; letter-spacing: -0.03em; white-space: pre;
  }
  .sub { margin-top: 34px; font-size: 30px; line-height: 1.6; letter-spacing: -0.01em; opacity: .82; white-space: pre; }
  .logo { position: absolute; bottom: 72px; left: 50%; transform: translateX(-50%); color: #fff; }
  .logo svg { display: block; width: 260px; height: auto; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  ${showPhoto ? `<div class="media-box" data-media-box>${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'bg' })}</div>` : ''}
  <div class="center">
    ${slide.kicker ? `<div class="kicker" data-field="kicker" data-max-lines="1" data-label="머리글" style="${fieldStyle(slide, 'kicker', 27)}">${renderMarkup(slide.kicker, palette)}</div>` : ''}
    <div class="title" data-field="title" data-max-lines="3" data-label="제목" style="${fieldStyle(slide, 'title', 92)}">${renderMarkup(slide.title ?? '', palette)}</div>
    ${slide.sub ? `<div class="sub" data-field="sub" data-max-lines="2" data-label="아래 설명" style="${fieldStyle(slide, 'sub', 30)}">${renderMarkup(slide.sub, palette)}</div>` : ''}
  </div>
  ${slide.logo !== 'off' ? `<div class="logo">${logoSvg}</div>` : ''}
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
