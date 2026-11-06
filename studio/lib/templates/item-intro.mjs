// 속지: item introduction page — accent "01." + item name, a boxed product photo,
// a one-line quote and a short body, all centered on paper. For 추천템 content.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

const MARGIN_X = 110;

export const meta = {
  label: '아이템 소개',
  contentType: 'knowledge',
  role: 'inner',
  formats: ['carousel', 'single'],
  mediaTypes: ['image'],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'no', label: '번호', hint: '예: 01 — 비우면 번호 없이 이름만 나와요.' },
    { key: 'name', label: '아이템 이름' },
    { key: 'tagline', label: '한 줄 설명 (사진 아래 따옴표)' },
    { key: 'body', label: '본문', hint: '네다섯 줄 정도가 보기 좋아요.' },
  ],
  options: [],
  newSlide: (post) => ({
    template: 'item-intro',
    no: String((post?.slides?.length ?? 0) + 1).padStart(2, '0'),
    name: '',
    tagline: '',
    body: '',
    stickers: [],
  }),
  sample: { no: '1', name: '아이템 이름', tagline: '한 줄 소개가 들어가는 자리', body: '사진과 함께 아이템을 소개하는 양식이에요.' },
};

export function renderSlide({ brand, post, slide, mediaSrc, mediaType, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const accent = colors.blue ?? colors.ink ?? '#111';
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const focus = /^\d{1,3}% \d{1,3}%$/.test(slide.focus ?? '') ? slide.focus : '50% 50%';
  const zoom = Math.min(3, Math.max(1, Number(slide.zoom) || 1));
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
    text-align: center;
  }
  .wrap {
    position: absolute; left: ${MARGIN_X}px; right: ${MARGIN_X}px; top: 130px; bottom: 110px;
    display: flex; flex-direction: column; align-items: center;
  }
  .head {
    font-family: '${fonts.headline}'; font-weight: 700;
    font-size: 46px; line-height: 1.3; letter-spacing: -0.02em; white-space: pre-wrap;
  }
  .head .num { color: ${accent}; display: block; font-family: '${fonts.latin ?? fonts.headline}'; font-size: 38px; margin-bottom: 10px; }
  .photo-box {
    position: relative; margin-top: 44px; width: 560px; height: 560px; overflow: hidden;
    border-radius: 10px; background: #ecebe6;
  }
  .photo-box .media {
    position: absolute; left: ${Math.round((560 - zoom * 560) * (parseInt(focus) / 100))}px;
    top: ${Math.round((560 - zoom * 560) * (parseInt(focus.split(' ')[1]) / 100))}px;
    width: ${zoom * 560}px; height: ${zoom * 560}px; object-fit: cover; object-position: ${focus};
  }
  .media-missing { display: grid; place-items: center; color: #8a877f; font-size: 26px; width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; }
  .tagline {
    margin-top: 40px; font-size: 32px; line-height: 1.45; letter-spacing: -0.02em; font-weight: 600;
    white-space: pre-wrap;
  }
  .tagline::before { content: '“'; opacity: .45; margin-right: 2px; }
  .tagline::after { content: '”'; opacity: .45; margin-left: 2px; }
  .body {
    margin-top: 26px; font-size: 29px; line-height: 1.55; letter-spacing: -0.02em; opacity: .85;
    white-space: pre-wrap;
  }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="wrap">
    <div class="head">
      ${no ? `<span class="num" data-field="no" data-max-lines="1" data-label="번호" style="${fieldStyle(slide, 'no', 38)}">${renderMarkup(no, palette)}.</span>` : ''}
      <span data-field="name" data-max-lines="2" data-label="아이템 이름" style="${fieldStyle(slide, 'name', 46)}">${renderMarkup(slide.name ?? '', palette)}</span>
    </div>
    <div class="photo-box" data-media-box>${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'media' })}</div>
    ${slide.tagline ? `<div class="tagline" data-field="tagline" data-max-lines="2" data-label="한 줄 설명" style="${fieldStyle(slide, 'tagline', 32)}">${renderMarkup(slide.tagline, palette)}</div>` : ''}
    ${slide.body ? `<div class="body" data-field="body" data-max-lines="5" data-label="본문" style="${fieldStyle(slide, 'body', 29)}">${renderMarkup(slide.body, palette)}</div>` : ''}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
