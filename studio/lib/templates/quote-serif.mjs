// 한 장 한 문장 (명조 종이) — serif quote centered on paper, thin rules above and
// below, a small credit line. 잡지의 인용 페이지 느낌. role 'any'.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

export const meta = {
  label: '인용 (명조 종이)',
  contentType: 'knowledge',
  role: 'any',
  formats: ['carousel', 'single'],
  mediaTypes: [],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'body', label: '문장', hint: '줄을 바꾸고 싶은 곳에서 엔터' },
    { key: 'credit', label: '아래 작은 글', hint: '이름·출처 등 (선택)' },
  ],
  options: [],
  newSlide: () => ({ template: 'quote-serif', body: '', credit: '', stickers: [] }),
  sample: {
    body: '걷는 속도로 볼 때만\n보이는 것들이 있다.',
    credit: 'PICKY DOGGY CLUB',
  },
};

export function renderSlide({ brand, post, slide, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss([fonts.headline, fonts.body, 'NanumMyeongjo'])}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${colors.paper ?? '#ffffff'}; }
  body {
    position: relative; color: ${colors.ink ?? '#111111'}; text-align: center;
    font-family: 'NanumMyeongjo', '${fonts.body}', serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .center {
    position: absolute; left: 130px; right: 130px; top: 0; bottom: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .rule { width: 72px; height: 3px; background: ${colors.ink ?? '#111'}; opacity: .8; }
  .body { margin: 56px 0; font-weight: 700; font-size: 46px; line-height: 1.9; letter-spacing: -0.005em; white-space: pre; }
  .credit { margin-top: 10px; font-family: '${fonts.body}', sans-serif; font-size: 23px; letter-spacing: 0.14em; white-space: pre; opacity: .55; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="center">
    <div class="rule"></div>
    <div class="body" data-field="body" data-max-lines="8" data-label="문장" style="${fieldStyle(slide, 'body', 46)}">${renderMarkup(slide.body ?? '', palette)}</div>
    <div class="rule"></div>
    ${slide.credit ? `<div class="credit" data-field="credit" data-max-lines="1" data-label="아래 작은 글" style="margin-top:42px;${fieldStyle(slide, 'credit', 23)}">${renderMarkup(slide.credit, palette)}</div>` : ''}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
