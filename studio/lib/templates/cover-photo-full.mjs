// 표지: 사진 전체 + 큰 제목 — the photo fills the frame, a bottom gradient carries a
// kicker + big white title, the logo sits top center. The photo pans by drag (class bg).
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

export const meta = {
  label: '사진 꽉 찬 표지',
  contentType: 'knowledge',
  role: 'cover',
  formats: ['carousel', 'single'],
  mediaTypes: ['image'],
  sizeFor: feedSizeFor,
  fields: [
    { key: 'kicker', label: '머리글', hint: '제목 위 작은 한 줄 (선택)' },
    { key: 'title', label: '제목', hint: '엔터로 줄을 나눠요 (최대 2줄)' },
  ],
  options: [
    { key: 'logo', label: '로고', choices: [[undefined, '표시'], ['off', '숨김']] },
  ],
  newSlide: () => ({ template: 'cover-photo-full', kicker: '', title: '', stickers: [] }),
  sample: { kicker: '주말 산책 코스', title: '서울 근교\n단풍 숲 5곳' },
};

export function renderSlide({ brand, post, slide, mediaSrc, mediaType, logoSvg, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts } = brand;
  const palette = brandPalette(brand);
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const focus = /^\d{1,3}% \d{1,3}%$/.test(slide.focus ?? '') ? slide.focus : '50% 50%';

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss([fonts.headline, fonts.body])}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #111; }
  body {
    position: relative; color: #fff;
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .media-box { position: absolute; inset: 0; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${focus}; }
  .media-missing { display: grid; place-items: center; background: #2a2a2a; color: #888; font-size: 32px; }
  .shade {
    position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.42) 24%, rgba(0,0,0,.1) 46%, rgba(0,0,0,0) 62%);
  }
  .logo { position: absolute; top: 56px; left: 50%; transform: translateX(-50%); color: #fff; }
  .logo svg { display: block; width: 300px; height: auto; }
  .bottom { position: absolute; left: 110px; right: 110px; bottom: 96px; }
  .kicker { font-size: 28px; letter-spacing: 0.02em; white-space: pre; opacity: .92; margin-bottom: 18px; }
  .title {
    font-family: '${fonts.headline}'; font-weight: 800;
    font-size: 88px; line-height: 1.18; letter-spacing: -0.03em; white-space: pre;
    text-shadow: 0 2px 14px rgba(0,0,0,.35);
  }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  <div class="media-box" data-media-box>
    ${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'bg' })}
  </div>
  <div class="shade"></div>
  ${slide.logo !== 'off' ? `<div class="logo">${logoSvg}</div>` : ''}
  <div class="bottom" data-avoid="bottom">
    ${slide.kicker ? `<div class="kicker" data-field="kicker" data-max-lines="1" data-label="머리글" style="${fieldStyle(slide, 'kicker', 28)}">${renderMarkup(slide.kicker, palette)}</div>` : ''}
    <div class="title" data-field="title" data-max-lines="2" data-label="제목" style="${fieldStyle(slide, 'title', 88)}">${renderMarkup(slide.title ?? '', palette)}</div>
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
