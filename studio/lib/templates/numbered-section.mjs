// 속지: numbered tip/section page — accent "N." + bold section title, then a body
// paragraph on plain paper. Inner-only (picked per slide); no cover variant.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

const MARGIN_X = 110;

export const meta = {
  label: '넘버링 (번호 소제목)',
  contentType: 'knowledge',
  role: 'inner',
  formats: ['carousel', 'single'],
  mediaTypes: ['image'],
  // Photo only participates (pin gate, export) when the 하단 사진 option is on.
  usesMedia: (slide) => slide.photo === 'show',
  sizeFor: feedSizeFor,
  fields: [
    { key: 'no', label: '번호', hint: '예: 1 — 비우면 번호 없이 소제목만 나와요.' },
    { key: 'title', label: '소제목' },
    { key: 'body', label: '본문' },
  ],
  options: [
    { key: 'photo', label: '하단 사진', choices: [[undefined, '없음'], ['show', '표시']] },
  ],
  newSlide: (post) => ({
    template: 'numbered-section',
    no: String((post?.slides?.length ?? 0) + 1),
    title: '',
    body: '',
    stickers: [],
  }),
  sample: { no: '1', title: '번호와 소제목을 넣는 자리', body: '이 부분에는 소제목에 대한 설명을 적습니다. 번호를 매긴 팁이나 방법을 하나씩 소개할 때 쓰는 양식입니다.' },
};

export function renderSlide({ brand, post, slide, mediaSrc, mediaType, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const accent = colors.blue ?? colors.ink ?? '#111';
  const showPhoto = slide.photo === 'show';
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const no = (slide.no ?? '').trim();

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
  .wrap {
    position: absolute; left: ${MARGIN_X}px; right: ${MARGIN_X}px; top: 150px; bottom: 120px;
    display: flex; flex-direction: column;
  }
  .head {
    font-family: '${fonts.headline}'; font-weight: 700;
    font-size: 44px; line-height: 1.3; letter-spacing: -0.02em; color: ${accent};
    white-space: pre-wrap;
  }
  .head .num { margin-right: 14px; }
  .body {
    margin-top: 34px; font-size: 32px; line-height: 1.6; letter-spacing: -0.02em;
    white-space: pre-wrap;
  }
  .photo-box { position: relative; margin-top: auto; height: 420px; overflow: hidden; border-radius: 8px; }
  .photo-box .media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .media-missing { display: grid; place-items: center; background: #ecebe6; color: #8a877f; font-size: 28px; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="wrap">
    <div class="head">${no ? `<span class="num" data-field="no" data-max-lines="1" data-label="번호" style="${fieldStyle(slide, 'no', 44)}">${renderMarkup(no, palette)}.</span>` : ''}<span data-field="title" data-max-lines="2" data-label="소제목" style="${fieldStyle(slide, 'title', 44)}">${renderMarkup(slide.title ?? '', palette)}</span></div>
    ${slide.body ? `<div class="body" data-field="body" data-max-lines="10" data-label="본문" style="${fieldStyle(slide, 'body', 32)}">${renderMarkup(slide.body, palette)}</div>` : ''}
    ${showPhoto ? `<div class="photo-box" data-media-box>${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'media' })}</div>` : ''}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
