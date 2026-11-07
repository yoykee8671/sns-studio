// 출처 for every template. Templates that already draw their own source line
// (editorial-photo 'source', curation-frame 'credit') only gain a show/hide switch;
// every other template gets a '출처' field drawn as a small line in a corner the user
// picks. Text color follows the template's own body color, so it reads on dark and
// paper backgrounds alike.
import { fieldStyle } from './runtime.mjs';
import { renderMarkup, brandPalette } from './markup.mjs';

const NATIVE = { 'curation-frame': 'credit' };
// Templates whose own fixed 'source' line is replaced by the shared, movable one.
const OWN_FIELD = { 'editorial-photo': 'source' };
const POSITIONS = { tl: 'top:56px;left:64px', tr: 'top:56px;right:64px;text-align:right', bl: 'bottom:56px;left:64px', br: 'bottom:56px;right:64px;text-align:right' };

const showOption = { key: 'sourceShow', label: '출처 표시', choices: [[undefined, '표시'], ['off', '숨김']] };
const posOption = {
  key: 'sourcePos',
  label: '출처 위치',
  choices: [[undefined, '왼쪽 위'], ['tr', '오른쪽 위'], ['bl', '왼쪽 아래'], ['br', '오른쪽 아래']],
  hidden: (slide) => slide.sourceShow === 'off',
};
const sourceField = {
  key: 'source',
  label: '출처',
  focusDefault: '출처 | ',
  hint: '비우거나 출처 표시를 숨기면 나오지 않아요.',
};

function tag(slide, brand, onPhoto) {
  const pos = POSITIONS[slide.sourcePos] ?? POSITIONS.tl;
  // On full-bleed photos (지식형) keep the old line's shadow so it reads on bright pictures.
  const shadow = onPhoto && slide.shadow !== 'off' ? 'text-shadow: 0 1px 8px rgba(0,0,0,.45);' : '';
  // A color picked in 세부 조정 shows at full strength (the default line is slightly muted).
  const solid = /^#[0-9a-fA-F]{6}$/.test(slide.textStyle?.source?.color ?? '') ? 'opacity: 1;' : '';
  return `<style>
  .u-source { position: absolute; ${pos}; z-index: 6; max-width: 78%; font-size: 21px; line-height: 1.3;
    font-weight: 500; opacity: .82; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${shadow} ${solid} }
</style>
<div class="u-source" data-field="source" data-max-lines="1" data-label="출처" style="${fieldStyle(slide, 'source', 21)}">${renderMarkup(slide.source, brandPalette(brand))}</div>`;
}

/** Returns the template module with the shared 출처 field/options and rendering. */
export function withSource(key, mod) {
  const native = NATIVE[key];
  const { meta } = mod;
  if (meta.brandClosing) return mod; // the 끝장 image carries nothing on top
  if (native) {
    return {
      ...mod,
      meta: { ...meta, options: [showOption, ...(meta.options ?? [])] },
      renderSlide: (o) =>
        mod.renderSlide(o.slide.sourceShow === 'off' ? { ...o, slide: { ...o.slide, [native]: '' } } : o),
    };
  }
  const own = OWN_FIELD[key];
  return {
    ...mod,
    meta: {
      ...meta,
      fields: own ? meta.fields : [...meta.fields, sourceField],
      options: [...(meta.options ?? []), showOption, posOption],
    },
    renderSlide: (o) => {
      const html = mod.renderSlide(own ? { ...o, slide: { ...o.slide, [own]: '' } } : o);
      const text = o.slide.source;
      if (!text || !String(text).replace(/^출처\s*\|\s*/, '').trim() || o.slide.sourceShow === 'off') return html;
      // Before the runtime <script> so QA measures it like any other field.
      const at = html.lastIndexOf('<script>');
      const cut = at > 0 ? at : html.lastIndexOf('</body>');
      return html.slice(0, cut) + tag(o.slide, o.brand, Boolean(own)) + html.slice(cut);
    },
  };
}
