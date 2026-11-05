// Template registry (static imports so both Next.js bundles and Node scripts resolve them).
import * as editorialPhoto from './editorial-photo.mjs';
import * as curationFrame from './curation-frame.mjs';

export const TEMPLATES = {
  'editorial-photo': editorialPhoto,
  'curation-frame': curationFrame,
};

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
