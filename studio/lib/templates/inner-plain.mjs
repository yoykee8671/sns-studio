// 속지(기본): the photo or video alone, nothing on top. Made for media already cut to the
// feed ratio (3:4 / 4:5) or a reel. Every element is opt-in from 상세 설정: 머리글,
// 헤드라인, 본문 (shown once written, hideable), 로고 (off by default), 출처 (shared
// source-tag), 음영 (shared 음영 레이어, off by default). Elements move with 요소 옮기기
// and take 세부 조정 (size, spacing, color) like any other template.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

const REEL_SIZE = { width: 1080, height: 1920 };
const show = (label) => ({ choices: [[undefined, '표시'], ['off', '숨김']], label });

export const meta = {
  label: '속지 (기본)',
  contentType: 'knowledge',
  role: 'inner',
  formats: ['carousel', 'single', 'reel'],
  mediaTypes: ['image', 'video'],
  sizeFor: (post) => (post?.format === 'reel' ? REEL_SIZE : feedSizeFor(post)),
  fields: [
    { key: 'kicker', label: '머리글', hint: '쓰면 나타나요. 상세 설정에서 숨길 수 있어요.' },
    { key: 'headline', label: '헤드라인', hint: '쓰면 나타나요. 엔터로 줄을 나눠요.' },
    { key: 'body', label: '본문', hint: '쓰면 나타나요.' },
  ],
  options: [
    { key: 'fit', label: '사진·영상 맞춤', choices: [[undefined, '꽉 채우기'], ['contain', '자르지 않기']] },
    { key: 'textPos', label: '글 위치', choices: [[undefined, '아래'], ['middle', '가운데'], ['top', '위']] },
    { key: 'textAlign', label: '글 정렬', choices: [[undefined, '왼쪽'], ['center', '가운데']] },
    { key: 'kickerShow', ...show('머리글 표시') },
    { key: 'headlineShow', ...show('헤드라인 표시') },
    { key: 'bodyShow', ...show('본문 표시') },
    { key: 'logo', label: '로고', choices: [[undefined, '숨김'], ['show', '표시']] },
    { key: 'shadow', label: '글자 그림자', choices: [[undefined, '켬'], ['off', '끔']] },
  ],
  newSlide: () => ({ template: 'inner-plain', kicker: '', headline: '', body: '', stickers: [] }),
  sample: {},
};

export function renderSlide({ brand, post, slide, mediaSrc, mediaType, logoSvg, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const isReel = post?.format === 'reel';
  const { fonts } = brand;
  const palette = brandPalette(brand);
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const contain = slide.fit === 'contain';
  const focus = /^\d{1,3}% \d{1,3}%$/.test(slide.focus ?? '') ? slide.focus : '50% 50%';
  const zoom = contain ? 1 : Math.min(3, Math.max(1, Number(slide.zoom) || 1));
  const [fx, fy] = focus.split(' ').map((v) => parseInt(v, 10) / 100);
  const pos = ['middle', 'top'].includes(slide.textPos) ? slide.textPos : 'bottom';
  const center = slide.textAlign === 'center';
  const shadow = slide.shadow !== 'off';
  // Reels keep text clear of the app's own buttons at the bottom.
  const edge = isReel ? { top: 220, bottom: 380 } : { top: 110, bottom: 110 };
  const block = { bottom: `bottom: ${edge.bottom}px;`, top: `top: ${edge.top}px;`, middle: 'top: 50%; transform: translateY(-50%);' }[pos];

  const field = (key, cls, max, label, basePx) =>
    slide[key] && slide[`${key}Show`] !== 'off'
      ? `<div class="${cls}" data-field="${key}" data-max-lines="${max}" data-label="${label}" style="${fieldStyle(slide, key, basePx)}">${renderMarkup(slide[key], palette)}</div>`
      : '';
  const text = field('kicker', 'kicker', 1, '머리글', 28) + field('headline', 'headline', 3, '헤드라인', 72) + field('body', 'body', 5, '본문', 32);

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss([fonts.headline, fonts.body])}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  body {
    position: relative; color: #fff;
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .media-box { position: absolute; inset: 0; overflow: hidden; }
  .bg {
    position: absolute;
    left: ${Math.round((W - zoom * W) * fx)}px; top: ${Math.round((H - zoom * H) * fy)}px;
    width: ${zoom * W}px; height: ${zoom * H}px;
    object-fit: ${contain ? 'contain' : 'cover'}; object-position: ${focus};
  }
  .media-missing { display: grid; place-items: center; background: #2a2a2a; color: #888; font-size: 32px; }
  .logo { position: absolute; top: ${isReel ? 140 : 56}px; left: 50%; transform: translateX(-50%); color: #fff; }
  .logo svg { display: block; width: 260px; height: auto; }
  .text { position: absolute; left: 96px; right: 96px; ${block} text-align: ${center ? 'center' : 'left'}; }
  .kicker { font-size: 28px; letter-spacing: 0.02em; white-space: pre; opacity: .92; margin-bottom: 16px; }
  .headline {
    font-family: '${fonts.headline}'; font-weight: 800;
    font-size: 72px; line-height: 1.22; letter-spacing: -0.03em; white-space: pre;
  }
  .body { margin-top: 18px; font-size: 32px; line-height: 1.55; letter-spacing: -0.02em; white-space: pre; opacity: .92; }
  ${shadow ? '.text > div { text-shadow: 0 2px 12px rgba(0,0,0,.4), 0 1px 4px rgba(0,0,0,.3); }' : ''}
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="media-box" data-media-box>
    ${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'bg' })}
  </div>
  ${slide.logo === 'show' ? `<div class="logo">${logoSvg}</div>` : ''}
  ${text ? `<div class="text" data-avoid="${pos === 'top' ? 'top' : 'bottom'}">${text}</div>` : ''}
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
