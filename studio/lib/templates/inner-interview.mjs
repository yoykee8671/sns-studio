// 속지: 인터뷰 — a quoted key line, an intro paragraph, then Q&A rows where the
// speaker name is set in the point color. 문답은 `이름 | 내용` 한 줄 규칙 (info-list와 동일).
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

const MARGIN_X = 110;

export const meta = {
  label: '인터뷰 (문답)',
  contentType: 'knowledge',
  role: 'inner',
  formats: ['carousel', 'single'],
  mediaTypes: [],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'quote', label: '핵심 한마디', hint: '맨 위에 따옴표로 들어가요 (선택)' },
    { key: 'intro', label: '소개', hint: '누구와 어떤 이야기를 나눴는지 (선택)' },
    { key: 'qa', label: '문답', hint: '한 줄에 하나: 이름 | 말한 내용' },
  ],
  options: [],
  newSlide: () => ({ template: 'inner-interview', quote: '', intro: '', qa: '', stickers: [] }),
  sample: {
    quote: '이 자리에는 인터뷰의\n핵심 한마디를 넣습니다',
    intro: '이 부분에는 인터뷰를 소개하는 글이 들어갑니다. 어떤 사람인지 두세 줄로 적어 주세요.',
    qa: 'Q | 요즘 가장 집중하는 일은 무엇인가요?\n김산책 | 매일 아침 동네 숲을 걷는 일이요. 강조는 **이렇게 굵게** 바꿀 수 있어요.',
  },
};

// `이름 | 내용` per line; lines without the bar are plain paragraphs.
const parseQa = (text) =>
  (text ?? '')
    .split('\n')
    .map((line) => {
      const m = line.match(/^([^|]{1,24})\|(.*)$/);
      return m ? { name: m[1].trim(), text: m[2].trim() } : { name: null, text: line };
    });

export function renderSlide({ brand, post, slide, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const accent = colors.blue ?? '#1b3a93';
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const rows = parseQa(slide.qa).filter((r) => r.text || r.name);

  const qaHtml = rows
    .map(
      (r) =>
        `<div class="row">${r.name ? `<span class="name">${renderMarkup(r.name, palette)}</span> ` : ''}${renderMarkup(r.text, palette)}</div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss([fonts.headline, fonts.body, 'NanumMyeongjo'])}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${colors.paper ?? '#ffffff'}; }
  body {
    position: relative; color: ${colors.ink ?? '#111111'};
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .wrap { position: absolute; left: ${MARGIN_X}px; right: ${MARGIN_X}px; top: 140px; bottom: 130px; }
  .quote {
    font-family: 'NanumMyeongjo', serif; font-weight: 700; text-align: center;
    font-size: 44px; line-height: 1.5; letter-spacing: -0.01em; white-space: pre;
    margin-bottom: 48px;
  }
  .intro { font-size: 29px; line-height: 1.7; letter-spacing: -0.01em; white-space: pre-wrap; opacity: .85; margin-bottom: 44px; }
  .qa { font-size: 30px; line-height: 1.7; letter-spacing: -0.01em; }
  .qa .row { white-space: pre-wrap; margin-bottom: 26px; }
  .qa .name { color: ${accent}; font-weight: 800; margin-right: 6px; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="wrap">
    ${slide.quote ? `<div class="quote" data-field="quote" data-max-lines="3" data-label="핵심 한마디" style="${fieldStyle(slide, 'quote', 44)}">&ldquo;${renderMarkup(slide.quote, palette)}&rdquo;</div>` : ''}
    ${slide.intro ? `<div class="intro" data-field="intro" data-max-lines="4" data-label="소개" style="${fieldStyle(slide, 'intro', 29)}">${renderMarkup(slide.intro, palette)}</div>` : ''}
    ${qaHtml ? `<div class="qa" data-field="qa" data-max-lines="12" data-label="문답" style="${fieldStyle(slide, 'qa', 30)}">${qaHtml}</div>` : ''}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
