// 한 장 한 문장 (다크) — one or two sentences centered on black. 짧은 글·명언용.
// role 'any': 단일 카드로도, 캐러셀 중간 쉼표 카드로도 쓴다.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

export const meta = {
  label: '한 장 한 문장 (다크)',
  contentType: 'knowledge',
  role: 'any',
  formats: ['carousel', 'single'],
  mediaTypes: [],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'body', label: '문장', hint: '줄을 바꾸고 싶은 곳에서 엔터 — 카드에 그대로 반영돼요' },
    { key: 'credit', label: '아래 작은 글', hint: '이름·출처 등 (선택)' },
  ],
  options: [
    { key: 'serif', label: '글꼴', choices: [[undefined, '고딕'], ['serif', '명조']] },
  ],
  newSlide: () => ({ template: 'quote-dark', body: '', credit: '', stickers: [] }),
  sample: {
    body: '좋아하는 문장이나 짧은 글을\n이 자리에 넣어 주세요.\n\n줄을 바꾸면\n카드에도 그대로 반영됩니다.',
    credit: '— 산책자의 노트',
  },
};

export function renderSlide({ brand, post, slide, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const serif = slide.serif === 'serif';
  const family = serif ? `'NanumMyeongjo', '${fonts.body}', serif` : `'${fonts.body}', sans-serif`;

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss()}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #0c0c0c; }
  body {
    position: relative; color: #fff; text-align: center;
    font-family: ${family};
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .center {
    position: absolute; left: 120px; right: 120px; top: 0; bottom: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .body { font-size: 36px; line-height: 2; letter-spacing: -0.005em; white-space: pre; }
  .credit { margin-top: 48px; font-size: 25px; letter-spacing: 0.02em; white-space: pre; opacity: .6; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="center">
    <div class="body" data-field="body" data-max-lines="12" data-label="문장" style="${fieldStyle(slide, 'body', 36)}">${renderMarkup(slide.body ?? '', palette)}</div>
    ${slide.credit ? `<div class="credit" data-field="credit" data-max-lines="1" data-label="아래 작은 글" style="${fieldStyle(slide, 'credit', 25)}">${renderMarkup(slide.credit, palette)}</div>` : ''}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
