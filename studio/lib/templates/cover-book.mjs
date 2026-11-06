// 표지: 책 표지 느낌 — paper ground, a small kicker line, the title set in serif
// between two point-color bands, author/handle at the bottom. No photo.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

const MARGIN_X = 110;

export const meta = {
  label: '책 표지 (명조)',
  contentType: 'knowledge',
  role: 'cover',
  formats: ['carousel', 'single'],
  mediaTypes: [],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'kicker', label: '머리글', hint: '예: VOL. 001 — 호수·연재 이름 한 줄' },
    { key: 'title', label: '제목', hint: '엔터로 줄을 나눠요 (2~4줄)' },
    { key: 'author', label: '지은이', hint: '비우면 계정 핸들이 들어가요' },
  ],
  options: [],
  newSlide: () => ({ template: 'cover-book', kicker: '', title: '', author: '', stickers: [] }),
  sample: { kicker: 'VOL. 001', title: '마음이 쉬는\n산책의 기술', author: '' },
};

export function renderSlide({ brand, post, slide, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const accent = colors.blue ?? '#1b3a93';
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const author = (slide.author ?? '').trim() || brand.handle || '';

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss([fonts.headline, fonts.body, 'NanumMyeongjo'])}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${colors.paper ?? '#ffffff'}; }
  body {
    position: relative; color: ${colors.ink ?? '#111111'};
    font-family: 'NanumMyeongjo', '${fonts.body}', serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .wrap { position: absolute; left: ${MARGIN_X}px; right: ${MARGIN_X}px; top: 140px; bottom: 130px; display: flex; flex-direction: column; }
  .kicker {
    font-family: '${fonts.body}', sans-serif; font-size: 26px; letter-spacing: 0.08em;
    white-space: pre; color: ${colors.ink ?? '#111'};
  }
  .band { height: 18px; background: ${accent}; }
  .band.top { margin-top: 26px; }
  .title {
    font-family: 'NanumMyeongjo', serif; font-weight: 800;
    font-size: 84px; line-height: 1.38; letter-spacing: -0.015em;
    white-space: pre; padding: 54px 6px;
  }
  .band.bottom { margin-bottom: auto; }
  .author { font-size: 28px; letter-spacing: 0.02em; white-space: pre; opacity: .85; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="wrap">
    ${slide.kicker ? `<div class="kicker" data-field="kicker" data-max-lines="1" data-label="머리글" style="${fieldStyle(slide, 'kicker', 26)}">${renderMarkup(slide.kicker, palette)}</div>` : ''}
    <div class="band top"></div>
    <div class="title" data-field="title" data-max-lines="4" data-label="제목" style="${fieldStyle(slide, 'title', 84)}">${renderMarkup(slide.title ?? '', palette)}</div>
    <div class="band bottom"></div>
    ${author ? `<div class="author" data-field="author" data-max-lines="1" data-label="지은이" style="${fieldStyle(slide, 'author', 28)}">${renderMarkup(author, palette)}</div>` : ''}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
