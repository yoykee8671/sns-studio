// 속지: 본문 (에세이) — paragraph text on plain paper, like a magazine page.
// Blank lines split paragraphs; the slide number sits bottom center.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

const MARGIN_X = 120;

export const meta = {
  label: '본문 (에세이)',
  contentType: 'knowledge',
  role: 'inner',
  formats: ['carousel', 'single'],
  mediaTypes: [],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'opening', label: '여는 문장', hint: '맨 위 강조 문장 (선택, 따옴표로 감싸져요)' },
    { key: 'body', label: '본문', hint: '빈 줄로 문단을 나눠요. **굵게**로 강조.' },
  ],
  options: [
    { key: 'serif', label: '글꼴', choices: [[undefined, '고딕'], ['serif', '명조']] },
  ],
  newSlide: () => ({ template: 'inner-essay', opening: '', body: '', stickers: [] }),
  sample: {
    opening: '걷다 보면 생각이 정리된다.',
    body: '이 템플릿은 긴 글을 담는 본문 양식입니다. 문단은 들여쓰기로 시작하고, 빈 줄로 문단을 나누면 카드에서도 그대로 나뉩니다.\n\n강조하고 싶은 문장은 **이렇게 굵게** 바꿔서 눈에 띄게 만들 수 있습니다.',
  },
};

export function renderSlide({ brand, post, slide, index = 0, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const serif = slide.serif === 'serif';
  const family = serif ? `'NanumMyeongjo', '${fonts.body}', serif` : `'${fonts.body}', sans-serif`;

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss([fonts.headline, fonts.body, ...(serif ? ['NanumMyeongjo'] : [])])}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${colors.paper ?? '#ffffff'}; }
  body {
    position: relative; color: ${colors.ink ?? '#111111'};
    font-family: ${family};
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .wrap { position: absolute; left: ${MARGIN_X}px; right: ${MARGIN_X}px; top: 150px; bottom: 150px; }
  .opening {
    font-weight: 700; font-size: 40px; line-height: 1.5; letter-spacing: -0.01em;
    white-space: pre-wrap; margin-bottom: 44px;
  }
  .body {
    font-size: 31px; line-height: 1.85; letter-spacing: -0.005em;
    white-space: pre-wrap; text-indent: 2em;
  }
  .page { position: absolute; bottom: 70px; left: 0; right: 0; text-align: center; font-size: 22px; opacity: .45; font-style: italic; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="wrap">
    ${slide.opening ? `<div class="opening" data-field="opening" data-max-lines="3" data-label="여는 문장" style="${fieldStyle(slide, 'opening', 40)}">&ldquo;${renderMarkup(slide.opening, palette)}&rdquo;</div>` : ''}
    ${slide.body ? `<div class="body" data-field="body" data-max-lines="16" data-label="본문" style="${fieldStyle(slide, 'body', 31)}">${renderMarkup(slide.body, palette)}</div>` : ''}
  </div>
  <div class="page">${index + 1}</div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
