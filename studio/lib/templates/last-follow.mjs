// 마지막 장: 팔로우 카드 — closing line, optional background photo, and an
// Instagram-style profile chip (avatar + handle + 팔로우 pill). role 'last'.
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

export const meta = {
  label: '팔로우 카드 (마지막 장)',
  contentType: 'knowledge',
  role: 'last',
  formats: ['carousel', 'single'],
  mediaTypes: ['image'],
  usesMedia: (slide) => slide.photo === 'show',
  sizeFor: feedSizeFor,
  fields: [
    { key: 'title', label: '마무리 문구', hint: '예: 다음 산책에서 만나요' },
    { key: 'sub', label: '짧은 설명', hint: '그 아래 두 줄 정도 (선택)' },
    { key: 'name', label: '프로필 이름', hint: '비우면 계정 핸들만 나와요' },
  ],
  options: [
    { key: 'photo', label: '배경 사진', choices: [[undefined, '없음 (다크)'], ['show', '어둡게 깔기']] },
  ],
  newSlide: () => ({ template: 'last-follow', title: '', sub: '', name: '', stickers: [] }),
  sample: {
    title: '이 자리에\n원하는 문구를\n넣어 주세요',
    sub: '그 아래에는 짧은 설명을\n두 줄 정도로 적습니다.',
    name: '프로필 이름',
  },
};

export function renderSlide({ brand, post, slide, mediaSrc, mediaType, logoSvg, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const { fonts, colors } = brand;
  const palette = brandPalette(brand);
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const showPhoto = slide.photo === 'show';
  const focus = /^\d{1,3}% \d{1,3}%$/.test(slide.focus ?? '') ? slide.focus : '50% 50%';
  const handle = brand.handle ?? `@${brand.id}`;
  const name = (slide.name ?? '').trim();

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss([fonts.headline, fonts.body])}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${colors.ink ?? '#111111'}; }
  body {
    position: relative; color: #fff;
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .media-box { position: absolute; inset: 0; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${focus}; filter: brightness(.4); }
  .media-missing { display: grid; place-items: center; background: #1c1c1c; color: #777; font-size: 32px; }
  .wrap {
    position: absolute; left: 110px; right: 110px; top: 150px; bottom: 120px;
    display: flex; flex-direction: column;
  }
  .title {
    font-family: '${fonts.headline}'; font-weight: 800;
    font-size: 62px; line-height: 1.4; letter-spacing: -0.02em; white-space: pre;
  }
  .sub { margin-top: 34px; font-size: 29px; line-height: 1.7; letter-spacing: -0.01em; white-space: pre; opacity: .8; }
  .chip {
    margin-top: auto; display: flex; align-items: center; gap: 24px;
    background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14);
    border-radius: 20px; padding: 28px 32px;
  }
  .avatar {
    width: 110px; height: 110px; border-radius: 50%; flex: none;
    background: ${colors.paper ?? '#fff'}; color: ${colors.ink ?? '#111'};
    display: grid; place-items: center; overflow: hidden;
  }
  .avatar svg { display: block; width: 86%; height: auto; }
  .who { min-width: 0; display: grid; gap: 4px; }
  .who .handle { font-weight: 800; font-size: 30px; letter-spacing: -0.01em; }
  .who .name { font-size: 24px; opacity: .7; white-space: pre; }
  .follow {
    margin-left: auto; flex: none; background: #0095F6; color: #fff;
    font-weight: 700; font-size: 28px; letter-spacing: -0.01em;
    border-radius: 14px; padding: 18px 36px;
  }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${mode === 'preview' ? 'preview' : 'export'}">
  ${showPhoto ? `<div class="media-box" data-media-box>${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'bg' })}</div>` : ''}
  <div class="wrap">
    <div class="title" data-field="title" data-max-lines="3" data-label="마무리 문구" style="${fieldStyle(slide, 'title', 62)}">${renderMarkup(slide.title ?? '', palette)}</div>
    ${slide.sub ? `<div class="sub" data-field="sub" data-max-lines="3" data-label="짧은 설명" style="${fieldStyle(slide, 'sub', 29)}">${renderMarkup(slide.sub, palette)}</div>` : ''}
    <div class="chip" data-avoid="bottom">
      <div class="avatar">${logoSvg}</div>
      <div class="who">
        <div class="handle">${handle}</div>
        ${name ? `<div class="name" data-field="name" data-max-lines="1" data-label="프로필 이름" style="${fieldStyle(slide, 'name', 24)}">${renderMarkup(name, palette)}</div>` : ''}
      </div>
      <div class="follow">팔로우</div>
    </div>
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
