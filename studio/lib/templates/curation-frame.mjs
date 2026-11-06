// 디깅형: introduces someone else's post. The original stays uncropped (contain) in the media area,
// and our comment sits in a solid band — below the media for feed posts, above it for reels
// (the bottom of a reel is covered by Instagram's UI). Credit line is always visible.
// The per-slide 'overlay' layout instead puts the media full-bleed and overlays the text:
// credit top-left, headline/comment on a bottom gradient (reference: biscit.co.kr feed).
import { renderSticker, stickerCss } from '../stickers.mjs';
import { slideRuntime, mediaTag, fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';
import { feedSizeFor } from './sizes.mjs';
import { webFontCss } from './fonts.mjs';

const REEL_SIZE = { width: 1080, height: 1920 };

export const meta = {
  label: '디깅형 (원본 + 코멘트)',
  contentType: 'curation',
  role: 'any', // cover/inner split is built into the template (index === 0)
  formats: ['carousel', 'single', 'reel'],
  mediaTypes: ['image', 'video'],
  sizeFor: (post) => (post?.format === 'reel' ? REEL_SIZE : feedSizeFor(post)),
  fields: [
    { key: 'headline', label: '헤드라인' },
    { key: 'body', label: '코멘트' },
    { key: 'credit', label: '출처 표기' },
  ],
  options: [
    { key: 'layout', label: '레이아웃', choices: [[undefined, '밴드 분리'], ['overlay', '영상 위 텍스트']] },
    {
      key: 'theme',
      label: '코멘트 영역',
      choices: [[undefined, '화이트'], ['dark', '블랙']],
      hidden: (slide) => slide.layout === 'overlay',
    },
    { key: 'fit', label: '원본 맞춤', choices: [[undefined, '자르지 않기'], ['cover', '꽉 채우기']] },
    {
      key: 'logo',
      label: '로고 (표지)',
      coverOnly: true,
      choices: [[undefined, '표시'], ['off', '숨김']],
      hidden: (slide) => slide.layout !== 'overlay',
    },
    {
      key: 'creditTag',
      label: '출처 (좌측 상단)',
      choices: [[undefined, '표시'], ['off', '숨김']],
      hidden: (slide) => slide.layout !== 'overlay',
    },
  ],
  newSlide: (post) => ({
    headline: '',
    body: '',
    credit: post?.source?.handle ? `📷 @${post.source.handle}` : '',
    stickers: [],
  }),
  sample: { headline: '이 계정의 산책 영상,\n저장 각입니다', body: '원본 위에 우리 코멘트가 붙는 디깅형이에요.', credit: '📷 @creator_handle' },
};

/**
 * @param {object} o
 * @param {'preview'|'export'|'overlay'} o.mode
 *   overlay = everything except the media, on a transparent page (composited over video by ffmpeg)
 */
export function renderSlide({ brand, post, slide, index, mediaSrc, mediaType, logoSvg, mode = 'export' }) {
  const { width: W, height: H } = meta.sizeFor(post);
  const isReel = post?.format === 'reel';
  const isCover = index === 0;
  const dark = slide.theme === 'dark';
  const fit = slide.fit === 'cover' ? 'cover' : 'contain';
  const { fonts, colors } = brand;
  const bg = dark ? colors.ink : '#ffffff';
  const fg = dark ? '#ffffff' : colors.ink;
  const stickers = (slide.stickers ?? []).map((st) => renderSticker(st, brand)).join('');
  const palette = brandPalette(brand);
  const field = (key, cls, max, label, text, basePx) =>
    text ? `<div class="${cls}" data-field="${key}" data-max-lines="${max}" data-label="${label}" style="${basePx ? fieldStyle(slide, key, basePx) : ''}">${renderMarkup(text, palette)}</div>` : '';

  const onVideo = slide.layout === 'overlay';
  // Full-bleed layout letterboxes on black; the band layout keeps the theme color.
  const baseColor = onVideo ? '#000000' : bg;

  // v2: the first slide is a real cover — its headline matches the 지식형 cover (80px
  // on feed, scaled up on reels); inner slides keep the original 46/58px.
  const headlinePx = isCover ? (isReel ? 96 : 80) : (isReel ? 58 : 46);
  const ovHeadlinePx = isCover ? (isReel ? 88 : 80) : (isReel ? 54 : 46);
  const band = `<div class="band">
      ${field('headline', 'headline', 2, '헤드라인', slide.headline, headlinePx)}
      ${field('body', 'body', 2, '코멘트', slide.body, isReel ? 34 : 32)}
      <div class="foot">
        ${field('credit', 'credit', 1, '출처 표기', slide.credit, isReel ? 27.5 : 23.5) || '<span></span>'}
        ${isCover ? `<div class="logo">${logoSvg}</div>` : ''}
      </div>
    </div>`;
  const media = `<div class="media-box" data-media-box>
      ${mediaTag({ src: mediaSrc, type: mediaType, mode, className: 'media' })}
    </div>`;
  // Top placement mirrors the 지식형 carousel: centered logo (cover, toggleable)
  // and the source line top-left (toggleable).
  const showOvLogo = isCover && slide.logo !== 'off';
  const showOvCredit = slide.creditTag !== 'off';
  const overlaid = `${media}
    <div class="ov-shade"></div>
    <div class="ov-shade-top"></div>
    ${showOvCredit ? field('credit', 'ov-credit', 1, '출처 표기', slide.credit, 20.5) : ''}
    ${showOvLogo ? `<div class="ov-logo">${logoSvg}</div>` : ''}
    <div class="ov-bottom" data-avoid="bottom">
      ${field('headline', 'ov-headline', 2, '헤드라인', slide.headline, ovHeadlinePx)}
      ${field('body', 'ov-body', 4, '코멘트', slide.body, 32)}
    </div>`;

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  ${webFontCss([fonts.headline, fonts.body])}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${mode === 'overlay' ? 'transparent' : baseColor}; }
  body {
    position: relative; color: ${fg};
    font-family: '${fonts.body}', sans-serif;
    -webkit-font-smoothing: antialiased; word-break: keep-all;
  }
  .frame { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .media-box { position: relative; flex: 1; min-height: 0; background: ${baseColor}; }
  .media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: ${fit}; }
  .media-missing {
    display: grid; place-items: center; background: ${dark || onVideo ? '#2a2a2a' : '#ecebe6'};
    color: ${dark || onVideo ? '#888' : '#8a877f'}; font-size: 32px;
  }
  .band { flex: none; padding: ${isReel ? '190px 72px 56px' : '40px 64px 46px'}; }
  .headline {
    font-family: '${fonts.headline}'; font-weight: 700;
    font-size: ${headlinePx}px; line-height: ${isCover ? 1.22 : 1.3};
    letter-spacing: -0.03em; white-space: pre;
  }
  .body {
    margin-top: 14px; font-size: ${isReel ? 34 : 32}px; line-height: 1.5; letter-spacing: -0.02em;
    white-space: pre; opacity: .82;
  }
  .foot { margin-top: 26px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .credit { font-size: ${isReel ? 27.5 : 23.5}px; letter-spacing: -0.01em; white-space: pre; opacity: .6; min-width: 0; }
  .logo svg { display: block; width: ${isReel ? 240 : 200}px; height: auto; }

  /* 영상 위 텍스트: media fills the frame, text sits on a bottom gradient. */
  .ov-shade {
    position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(to top,
      rgba(0,0,0,.78) 0%, rgba(0,0,0,.52) ${isReel ? 20 : 22}%, rgba(0,0,0,.18) ${isReel ? 36 : 42}%, rgba(0,0,0,0) ${isReel ? 52 : 58}%);
  }
  .ov-shade-top {
    position: absolute; left: 0; right: 0; top: 0; height: 260px; pointer-events: none;
    background: linear-gradient(to bottom, rgba(0,0,0,.28), rgba(0,0,0,0));
  }
  .ov-credit {
    position: absolute; top: 56px; left: 110px; max-width: calc(100% - 220px);
    color: #fff; font-size: 20.5px; letter-spacing: -0.005em; white-space: pre;
    opacity: .9; text-shadow: 0 1px 6px rgba(0,0,0,.45);
  }
  .ov-logo { position: absolute; top: 56px; left: 50%; transform: translateX(-50%); color: #fff; }
  .ov-logo svg { display: block; width: 300px; height: auto; }
  .ov-bottom {
    position: absolute; left: 64px; right: 64px; bottom: ${isReel ? 330 : 76}px; color: #fff;
  }
  .ov-headline {
    font-family: '${fonts.headline}'; font-weight: 700;
    font-size: ${ovHeadlinePx}px; line-height: ${isCover ? 1.22 : 1.3};
    letter-spacing: -0.03em; white-space: pre;
    text-shadow: 0 2px 12px rgba(0,0,0,.35), 0 1px 4px rgba(0,0,0,.25);
  }
  .ov-body {
    margin-top: 16px; font-size: 32px; line-height: 1.55; letter-spacing: -0.02em;
    white-space: pre; opacity: .92; text-shadow: 0 1px 8px rgba(0,0,0,.35);
  }

  body[data-mode='overlay'] .media-box { background: transparent; }
  body[data-mode='overlay'] .media { visibility: hidden; }
  ${stickerCss(brand)}
</style></head>
<body data-mode="${['preview', 'overlay'].includes(mode) ? mode : 'export'}" data-base-color="${baseColor}"
  data-fit="${fit}">
  <div class="frame">
    ${onVideo ? overlaid : isReel ? band + media : media + band}
  </div>
  ${stickers}
<script>${slideRuntime()}</script>
</body></html>`;
}
