// Rules shared by the editor (browser) and the server, so both agree on them.
import { TEMPLATES } from './templates/index.mjs';

const VIDEO = /\.(mp4|mov|m4v|webm)$/i;
const isVideo = (slide) =>
  slide.mediaType ? slide.mediaType === 'video' : VIDEO.test(slide.media ?? '');

/**
 * Format follows the content: a post that is a single video slide (on a template that
 * can be a reel) goes out as a 릴스; everything else is a carousel. The fixed last page
 * is a real slide now, so a plain one-image feed post doesn't come up.
 */
export function autoFormat(post) {
  const [only] = post.slides;
  const key = only?.template ?? post.template;
  if (post.slides.length === 1 && isVideo(only) && TEMPLATES[key]?.meta.formats.includes('reel')) return 'reel';
  return post.format === 'reel' ? 'carousel' : (post.format === 'single' ? 'single' : 'carousel');
}

/**
 * 원작자 허락: a post that names an original (link or account) can't be exported or
 * published until the permission is marked as granted. Posts without one are free.
 */
export function needsPermission(post) {
  const src = post.source ?? {};
  const named = Boolean(String(src.url ?? '').trim() || String(src.handle ?? '').trim());
  return named && src.permission !== 'granted';
}
