// 속지: 아이템 소개 (다크) — centered "01. 이름", the product photo in a framed box,
// a quoted one-liner and a short centered intro. 어두운 배경의 쇼케이스 카드.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

export const meta = {
  label: '아이템 소개 다크',
  contentType: 'knowledge',
  role: 'inner',
  formats: ['carousel', 'single'],
  mediaTypes: ['image'],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'no', label: '번호', hint: '예: 01 (선택)' },
    { key: 'name', label: '이름', hint: '제품·아이템 이름' },
    { key: 'quoteLine', label: '한 줄 설명', hint: '사진 아래 따옴표 한 줄 (선택)' },
    { key: 'body', label: '소개', hint: '너무 길지 않게, 네다섯 줄이 보기 좋아요' },
  ],
  options: [],
  newSlide: (post) => ({
    template: 'inner-item-dark',
    no: String((post?.slides?.length ?? 0) + 1).padStart(2, '0'),
    name: '',
    quoteLine: '',
    body: '',
    stickers: [],
  }),
  sample: {
    no: '01',
    name: '제품 이름',
    quoteLine: '이 자리에 한 줄 설명을 넣습니다',
    body: '이 부분에는 제품 소개를 적습니다.\n너무 길지 않게\n네다섯 줄 정도가\n가장 보기 좋습니다.',
  },
};

export function renderSlide({ brand, post, slide, mediaSrc, mediaType, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const no = (slide.no ?? '').trim();

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss()}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${colors.ink ?? '#111111'}; }
  body {
    position: relative; color: #ffffff; text-align: center;
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .wrap {
    position: absolute; left: 110px; right: 110px; top: 110px; bottom: 110px;
    display: flex; flex-direction: column; align-items: center;
  }
  .head {
    font-family: '${fonts.headline}'; font-weight: 800;
    font-size: 48px; line-height: 1.35; letter-spacing: -0.02em; white-space: pre;
  }
  .photo-box {
    position: relative; margin-top: 44px; width: 560px; height: 560px;
    overflow: hidden; border-radius: 6px; background: #1d1d1d;
  }
  .photo-box .media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .media-missing { display: grid; place-items: center; color: #777; font-size: 28px; }
  .quote-line { margin-top: 44px; font-weight: 700; font-size: 32px; line-height: 1.5; white-space: pre; }
  .body { margin-top: 28px; font-size: 28px; line-height: 1.7; letter-spacing: -0.01em; white-space: pre-wrap; opacity: .85; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="wrap">
    <div class="head">${no ? `<span data-field="no" data-max-lines="1" data-label="번호" style="${fieldStyle(slide, 'no', 48)}">${renderMarkup(no, palette)}.</span><br>` : ''}<span data-field="name" data-max-lines="2" data-label="이름" style="${fieldStyle(slide, 'name', 48)}">${renderMarkup(slide.name ?? '', palette)}</span></div>
    <div class="photo-box" data-media-box>${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'media' })}</div>
    ${slide.quoteLine ? `<div class="quote-line" data-field="quoteLine" data-max-lines="2" data-label="한 줄 설명" style="${fieldStyle(slide, 'quoteLine', 32)}">&ldquo;${renderMarkup(slide.quoteLine, palette)}&rdquo;</div>` : ''}
    ${slide.body ? `<div class="body" data-field="body" data-max-lines="6" data-label="소개" style="${fieldStyle(slide, 'body', 28)}">${renderMarkup(slide.body, palette)}</div>` : ''}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
