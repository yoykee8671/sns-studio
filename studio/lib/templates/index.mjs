// Template registry (static imports so both Next.js bundles and Node scripts resolve them).
import * as editorialPhoto from './editorial-photo.mjs';
import * as curationFrame from './curation-frame.mjs';
import * as numberedSection from './numbered-section.mjs';
import * as infoList from './info-list.mjs';
import * as itemIntro from './item-intro.mjs';
import * as coverBook from './cover-book.mjs';
import * as coverPhotoFull from './cover-photo-full.mjs';
import * as coverCenterDark from './cover-center-dark.mjs';
import * as coverMinimal from './cover-minimal.mjs';
import * as innerEssay from './inner-essay.mjs';
import * as innerInterview from './inner-interview.mjs';
import * as innerNumberedDark from './inner-numbered-dark.mjs';
import * as innerItemDark from './inner-item-dark.mjs';
import * as innerPhotoSplit from './inner-photo-split.mjs';
import * as quoteDark from './quote-dark.mjs';
import * as quoteSerif from './quote-serif.mjs';
import * as lastFollow from './last-follow.mjs';
import * as closingImage from './closing-image.mjs';
import { withSource } from './source-tag.mjs';
import { withLayout } from './layout-overrides.mjs';
import { withBgPhoto } from './bg-photo.mjs';
import { withShade } from './shade-layer.mjs';

const MODULES = {
  'editorial-photo': editorialPhoto,
  'curation-frame': curationFrame,
  'numbered-section': numberedSection,
  'info-list': infoList,
  'item-intro': itemIntro,
  'cover-book': coverBook,
  'cover-photo-full': coverPhotoFull,
  'cover-center-dark': coverCenterDark,
  'cover-minimal': coverMinimal,
  'inner-essay': innerEssay,
  'inner-interview': innerInterview,
  'inner-numbered-dark': innerNumberedDark,
  'inner-item-dark': innerItemDark,
  'inner-photo-split': innerPhotoSplit,
  'quote-dark': quoteDark,
  'quote-serif': quoteSerif,
  'last-follow': lastFollow,
  'closing-image': closingImage,
};

// Every template gets the shared 출처 field + show/hide/position options (source-tag.mjs)
// a photo slot (text-only ones take it as a background, bg-photo.mjs) and the per-slide
// 요소 옮기기 overrides (layout-overrides.mjs).
export const TEMPLATES = Object.fromEntries(
  Object.entries(MODULES).map(([key, mod]) => [key, withLayout(withShade(withVideo(withBgPhoto(withSource(key, mod)))))]),
);

// Every photo slot also takes a video: the editor previews it playing, and the export
// composites the template (text, stickers, gradients) over it as an MP4 (render-server).
function withVideo(mod) {
  const { meta } = mod;
  if (!meta.mediaTypes.includes('image') || meta.mediaTypes.includes('video')) return mod;
  return { ...mod, meta: { ...meta, mediaTypes: [...meta.mediaTypes, 'video'] } };
}

// Gallery grouping/order: cover → any → inner → last.
export const ROLE_ORDER = ['cover', 'any', 'inner', 'last'];

// A template's cover look (big title, logo) normally follows the slide position — the
// first slide is the cover — but slide.look ('cover' | 'inner') overrides it, so any
// template works on any slide.
export { isCoverSlide } from './runtime.mjs';

export function getTemplate(name) {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`unknown template: ${name}`);
  return t;
}

// v2: slides may carry their own template. An override only applies when it is
// registered and supports the post's format, so a reel can never end up on a
// feed-only template and legacy posts keep rendering exactly as before.
export function resolveTemplate(post, slide) {
  const override = slide?.template && TEMPLATES[slide.template];
  if (override && override.meta.formats.includes(post.format)) return override;
  return getTemplate(post.template);
}
