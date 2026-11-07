// Switching a slide's template keeps what was written: every text field has a role
// (머리글, 제목, 짧은 설명, 본문, 번호, 출처), and the new template's empty fields take the
// old template's text of the same role, then any leftover text in order. The old keys
// stay on the slide, so switching back shows the original arrangement again.

const ROLE = {
  kicker: 'kicker',
  headline: 'title', title: 'title', name: 'title', opening: 'title', quote: 'title',
  sub: 'sub', intro: 'sub', tagline: 'sub', quoteLine: 'sub', author: 'sub',
  body: 'body', items: 'body', qa: 'body',
  no: 'no',
  source: 'source',
};
// Per-template exceptions: curation-frame's credit is its 출처 line; the quote cards'
// credit is the small line under the sentence.
const OVERRIDE = {
  'curation-frame': { credit: 'source' },
  'quote-dark': { credit: 'sub' },
  'quote-serif': { credit: 'sub' },
};
const roleOf = (templateKey, fieldKey) => OVERRIDE[templateKey]?.[fieldKey] ?? ROLE[fieldKey] ?? 'body';
const filled = (v) => typeof v === 'string' && v.replace(/^출처\s*\|\s*/, '').trim() !== '';

/**
 * Rules, in order:
 *  - text in a field the new template also has (same name) already shows — left alone;
 *  - each empty field of the new template takes unused old text of the same role;
 *  - old text whose role the new template has no field for at all moves into the
 *    remaining empty fields, except 번호, 출처 and 머리글 (a tiny one-liner).
 * Fields that already have text are never overwritten.
 * @returns {object} patch for the slide: new field key → carried text.
 */
export function carryText(fromKey, fromMeta, toKey, toMeta, slide) {
  const toKeys = new Set(toMeta.fields.map((f) => f.key));
  const toRoles = new Set(toMeta.fields.map((f) => roleOf(toKey, f.key)));
  const sources = fromMeta.fields
    .filter((f) => filled(slide[f.key]) && !toKeys.has(f.key))
    .map((f) => ({ key: f.key, role: roleOf(fromKey, f.key), used: false }));
  const targets = toMeta.fields.filter((f) => !filled(slide[f.key]));
  const patch = {};
  for (const f of targets) {
    const src = sources.find((x) => !x.used && x.role === roleOf(toKey, f.key));
    if (src) {
      patch[f.key] = slide[src.key];
      src.used = true;
    }
  }
  const NO_FILL = ['no', 'source', 'kicker'];
  for (const f of targets) {
    if (patch[f.key] !== undefined || NO_FILL.includes(roleOf(toKey, f.key))) continue;
    const src = sources.find((x) => !x.used && !['no', 'source'].includes(x.role) && !toRoles.has(x.role));
    if (src) {
      patch[f.key] = slide[src.key];
      src.used = true;
    }
  }
  return patch;
}
