// 속지: info table / checklist page — a title and up to ~8 "라벨 | 설명" rows on paper.
// Each textarea line is one row; text before the first `|` becomes the label chip,
// the rest the description. A line without `|` spans the full width.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';

const MARGIN_X = 110;

export const meta = {
  label: '리스트·정보 표',
  contentType: 'knowledge',
  role: 'inner',
  formats: ['carousel', 'single'],
  mediaTypes: [],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'title', label: '제목' },
    { key: 'intro', label: '한 줄 소개', hint: '비우면 표시되지 않아요.' },
    {
      key: 'items',
      label: '항목 (한 줄 = 한 항목)',
      hint: '"라벨 | 설명" 형태로 쓰면 라벨 칩이 생겨요. ==형광펜==, **굵게**도 돼요.',
    },
  ],
  options: [],
  newSlide: () => ({ template: 'info-list', title: '', intro: '', items: '', stickers: [] }),
};

export function renderSlide({ brand, post, slide, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const accent = colors.blue ?? colors.ink ?? '#111';
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');

  const rows = (slide.items ?? '')
    .split('\n')
    .map((line) => {
      if (!line.trim()) return '<div class="gap"></div>';
      const at = line.indexOf('|');
      if (at === -1) return `<div class="row"><div class="desc wide">${renderMarkup(line.trim(), palette)}</div></div>`;
      const label = line.slice(0, at).trim();
      const desc = line.slice(at + 1).trim();
      return `<div class="row">
        <div class="chip">${renderMarkup(label, palette)}</div>
        <div class="desc">${renderMarkup(desc, palette)}</div>
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${colors.paper ?? '#ffffff'}; }
  body {
    position: relative; color: ${colors.ink ?? '#111111'};
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .wrap {
    position: absolute; left: ${MARGIN_X}px; right: ${MARGIN_X}px; top: 140px; bottom: 110px;
    display: flex; flex-direction: column;
  }
  .title {
    font-family: '${fonts.headline}'; font-weight: 700;
    font-size: 44px; line-height: 1.3; letter-spacing: -0.02em; white-space: pre-wrap;
  }
  .intro { margin-top: 18px; font-size: 28px; line-height: 1.5; letter-spacing: -0.02em; opacity: .75; white-space: pre-wrap; }
  .list { margin-top: 44px; display: flex; flex-direction: column; gap: 26px; }
  .row { display: flex; align-items: flex-start; gap: 22px; }
  .gap { height: 6px; }
  .chip {
    flex: none; min-width: 150px; text-align: center;
    border: 2px solid ${colors.ink ?? '#111'}; padding: 8px 18px;
    font-weight: 700; font-size: 26px; line-height: 1.35; letter-spacing: -0.01em;
  }
  .desc { font-size: 30px; line-height: 1.5; letter-spacing: -0.02em; padding-top: 5px; white-space: pre-wrap; }
  .desc.wide { padding-top: 0; }
  .desc b { color: ${accent}; }
  /* Invisible mirror of the raw items text so the QA runtime counts real lines. */
  .items-mirror {
    position: absolute; left: 0; right: 0; top: 0; visibility: hidden; pointer-events: none;
    font-size: 30px; line-height: 1.5; letter-spacing: -0.02em; white-space: pre;
  }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="wrap">
    <div class="title" data-field="title" data-max-lines="2" data-label="제목">${renderMarkup(slide.title ?? '', palette)}</div>
    ${slide.intro ? `<div class="intro" data-field="intro" data-max-lines="2" data-label="한 줄 소개">${renderMarkup(slide.intro, palette)}</div>` : ''}
    <div class="list">${rows}</div>
    <div class="items-mirror" data-field="items" data-max-lines="10" data-label="항목">${renderMarkup(slide.items ?? '', palette)}</div>
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
