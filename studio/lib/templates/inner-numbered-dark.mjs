// 속지: 본문 넘버링 (다크) — dark twin of the numbered section: highlight-색 "N."
// + bold title on near-black, body below. 밝은 글씨가 어두운 바탕 위에 올라간다.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

const MARGIN_X = 110;

export const meta = {
  label: '넘버링 다크',
  contentType: 'knowledge',
  role: 'inner',
  formats: ['carousel', 'single'],
  mediaTypes: [],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'no', label: '번호', hint: '예: 1 — 비우면 번호 없이 소제목만 나와요.' },
    { key: 'title', label: '소제목' },
    { key: 'body', label: '본문' },
  ],
  options: [],
  newSlide: (post) => ({
    template: 'inner-numbered-dark',
    no: String((post?.slides?.length ?? 0) + 1),
    title: '',
    body: '',
    stickers: [],
  }),
  sample: {
    no: '1',
    title: '번호와 소제목을 넣는 자리',
    body: '이 부분에는 소제목에 대한 설명을 적습니다. 어두운 바탕 위에 밝은 글씨로 들어가며, 서너 줄 정도가 가장 보기 좋습니다.',
  },
};

export function renderSlide({ brand, post, slide, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const accent = colors.lime ?? '#EBFA6A';
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const no = (slide.no ?? '').trim();

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss()}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${colors.ink ?? '#111111'}; }
  body {
    position: relative; color: #ffffff;
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .wrap { position: absolute; left: ${MARGIN_X}px; right: ${MARGIN_X}px; top: 150px; bottom: 120px; }
  .head {
    font-family: '${fonts.headline}'; font-weight: 700;
    font-size: 44px; line-height: 1.3; letter-spacing: -0.02em; color: ${accent};
    white-space: pre-wrap;
  }
  .head .num { margin-right: 14px; }
  .body {
    margin-top: 34px; font-size: 32px; line-height: 1.65; letter-spacing: -0.02em;
    white-space: pre-wrap; opacity: .92;
  }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="wrap">
    <div class="head">${no ? `<span class="num" data-field="no" data-max-lines="1" data-label="번호" style="${fieldStyle(slide, 'no', 44)}">${renderMarkup(no, palette)}.</span>` : ''}<span data-field="title" data-max-lines="2" data-label="소제목" style="${fieldStyle(slide, 'title', 44)}">${renderMarkup(slide.title ?? '', palette)}</span></div>
    ${slide.body ? `<div class="body" data-field="body" data-max-lines="10" data-label="본문" style="${fieldStyle(slide, 'body', 32)}">${renderMarkup(slide.body, palette)}</div>` : ''}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
