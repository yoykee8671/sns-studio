// 지식형: full-bleed photo carousel slide. Centered logo on the cover (toggleable), source line
// top-left, bottom headline/body, optional stickers. Layout matches the reference feed design:
// 110px side margins, text block anchored ~210px above the bottom edge.
// Runs identically in the editor preview (iframe) and the exporter (Playwright).
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, escapeHtml, mediaTag } from './runtime.mjs';
import { feedSizeFor } from './sizes.mjs';

const MARGIN_X = 110; // left/right margin, from the reference layout
const MARGIN_BOTTOM = 210; // headline block bottom offset

export const meta = {
  label: '지식형 (사진 풀블리드)',
  contentType: 'knowledge',
  formats: ['carousel', 'single'],
  mediaTypes: ['image'],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'headline', label: '헤드라인' },
    { key: 'body', label: '본문' },
    { key: 'source', label: '출처 (좌측 상단)', focusDefault: '출처 | ', hint: '비우면 표시되지 않아요. 표지도 입력하면 로고와 함께 나와요.' },
  ],
  options: [
    {
      key: 'topTone',
      label: '상단 글자색',
      choices: [[undefined, '자동'], ['light', '흰색'], ['dark', '검정']],
      autoLabel: (report) => (report?.tone === 'dark' ? '검정' : '흰색'),
    },
    { key: 'logo', label: '로고 (표지)', coverOnly: true, choices: [[undefined, '표시'], ['off', '숨김']] },
    { key: 'shadow', label: '텍스트 그림자', choices: [[undefined, '켬'], ['off', '끔']] },
  ],
  sliders: [
    { key: 'shadeLevel', label: '그라데이션 음영', min: 0, max: 100, step: 5, default: 100, unit: '%' },
  ],
  newSlide: () => ({ headline: '', body: '', source: '', stickers: [] }),
};

/**
 * @param {object} o
 * @param {'preview'|'export'} o.mode  preview enables sticker dragging + reports to the parent frame
 */
export function renderSlide({ brand, post, slide, index, mediaSrc, mediaType, logoSvg, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const isCover = index === 0;
  // Values interpolated into CSS/attributes are whitelisted, never passed through raw.
  const focus = /^\d{1,3}% \d{1,3}%$/.test(slide.focus ?? '') ? slide.focus : '50% 50%';
  const zoom = Math.min(3, Math.max(1, Number(slide.zoom) || 1));
  // The zoomed box is offset by the same focus ratio as object-position, so panning
  // moves through the whole zoomed image, not only the aspect-ratio overflow.
  const [fx, fy] = focus.split(' ').map((v) => parseInt(v, 10) / 100);
  const toneOverride = ['light', 'dark'].includes(slide.topTone) ? slide.topTone : null;
  const showLogo = isCover && slide.logo !== 'off';
  // Gradient strength 0–100 (legacy slide.shade === 'off' → 0).
  const shadeLevel = Math.min(100, Math.max(0,
    slide.shadeLevel ?? (slide.shade === 'off' ? 0 : 100)));
  const k = shadeLevel / 100;
  const a = (v) => Math.round(v * k * 1000) / 1000;
  const showShade = shadeLevel > 0;
  const showShadow = slide.shadow !== 'off';
  const { fonts, colors } = brand;
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  // The tone probe sits on whatever occupies the top: logo first, else the source line.
  const source = slide.source
    ? `<div class="top source" ${showLogo ? '' : 'data-tone-probe '}data-avoid="top" data-field="source"
        data-max-lines="1" data-label="출처">${escapeHtml(slide.source)}</div>`
    : '';

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  body {
    position: relative;
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased;
    word-break: keep-all;
  }
  .bg {
    position: absolute;
    left: ${Math.round((W - zoom * W) * fx)}px; top: ${Math.round((H - zoom * H) * fy)}px;
    width: ${zoom * W}px; height: ${zoom * H}px;
    object-fit: cover; object-position: ${focus};
  }
  .media-missing { display: grid; place-items: center; background: #3a3a3a; color: #bbb; font-size: 32px; }
  .shade-bottom {
    position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(to top,
      rgba(0,0,0,${a(0.82)}) 0%, rgba(0,0,0,${a(0.62)}) 24%, rgba(0,0,0,${a(0.25)}) 44%, rgba(0,0,0,0) 60%);
  }
  .shade-top {
    position: absolute; left: 0; right: 0; top: 0; height: 260px; pointer-events: none;
    background: linear-gradient(to bottom, rgba(0,0,0,${a(0.28)}), rgba(0,0,0,0));
  }
  body[data-top-tone='dark'] .shade-top { display: none; }

  .top { position: absolute; top: 56px; color: #fff; }
  body[data-top-tone='dark'] .top { color: ${colors.ink}; }
  .logo { left: 50%; transform: translateX(-50%); }
  .logo svg { display: block; width: 300px; height: auto; }
  .source {
    left: ${MARGIN_X}px; max-width: calc(100% - ${MARGIN_X * 2}px);
    font-size: 19px; letter-spacing: -0.005em; white-space: pre-wrap;
    opacity: .9; ${showShadow ? 'text-shadow: 0 1px 6px rgba(0,0,0,.45);' : ''}
  }
  body[data-top-tone='dark'] .source { text-shadow: none; }

  .bottom {
    position: absolute; left: ${MARGIN_X}px; right: ${MARGIN_X}px; bottom: ${MARGIN_BOTTOM}px;
    display: flex; flex-direction: column; color: #fff;
  }
  .headline {
    font-family: '${fonts.headline}'; font-weight: 700;
    font-size: ${isCover ? 80 : 34}px; line-height: ${isCover ? 1.2 : 1.35};
    letter-spacing: ${isCover ? '-0.03em' : '-0.02em'}; white-space: pre-wrap;
    ${showShadow ? 'text-shadow: 0 2px 12px rgba(0,0,0,.35), 0 1px 4px rgba(0,0,0,.25);' : ''}
  }
  .body {
    margin-top: ${isCover ? 26 : 18}px;
    font-weight: 400; font-size: 30px; line-height: 1.5; letter-spacing: -0.02em;
    white-space: pre-wrap; opacity: .92;
    ${showShadow ? 'text-shadow: 0 1px 8px rgba(0,0,0,.35);' : ''}
  }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}" data-shade-level="${k}"${toneOverride ? ` data-tone-override="${toneOverride}"` : ''}>
  ${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'bg' })}
  ${showShade ? '<div class="shade-top"></div>\n  <div class="shade-bottom"></div>' : ''}
  ${showLogo ? `<div class="top logo" data-tone-probe>${logoSvg}</div>` : ''}
  ${source}
  <div class="bottom" data-avoid="bottom">
    <div class="headline" data-field="headline" data-max-lines="2" data-label="헤드라인">${escapeHtml(slide.headline ?? '')}</div>
    ${slide.body ? `<div class="body" data-field="body" data-max-lines="2" data-label="본문">${escapeHtml(slide.body)}</div>` : ''}
  </div>
  ${stickers}
<script>${slideRuntime({ toneThreshold: 0.62 })}</script>
</body></html>`;
}
