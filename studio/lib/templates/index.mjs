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
