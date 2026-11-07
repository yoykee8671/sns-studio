// 요소 옮기기: per-slide position/size overrides for a template's text blocks and photo
// box, applied the same way in the editor preview and the export (it's plain CSS).
// slide.arrange = { [field key | 'media']: { x?, y?, w?, h? } } — x/y are an offset from
// the template's own position (CSS `translate`, so it never fights the template's
// transforms or flow), w/h resize the photo box.

const KEY = /^[a-z][a-z0-9_-]{0,30}$/i;
const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : null;
};

export function layoutCss(slide) {
  const rules = [];
  // (Stored as slide.layout for a few hours before curation-frame's own `layout` option
  // was noticed; an object there is read as arrange.)
  const arrange = slide?.arrange ?? (slide?.layout && typeof slide.layout === 'object' ? slide.layout : {});
  for (const [key, v] of Object.entries(arrange)) {
    if (!KEY.test(key) || !v || typeof v !== 'object') continue;
    const sel = key === 'media' ? '[data-media-box]' : `[data-field="${key}"]`;
    const parts = [];
    const x = num(v.x, -3000, 3000);
    const y = num(v.y, -3000, 3000);
    if (x || y) parts.push(`translate: ${x ?? 0}px ${y ?? 0}px`);
    if (key === 'media') {
      const w = num(v.w, 80, 3000);
      const h = num(v.h, 80, 3000);
      // A box sized by inset/flex gets an explicit size; its far edge stops pinning it.
      if (w) parts.push(`width: ${w}px`, 'max-width: none', 'right: auto', 'flex: none');
      if (h) parts.push(`height: ${h}px`, 'max-height: none', 'bottom: auto', 'flex: none');
    }
    // !important: wins over any template rule; the editor's live drag sets the same
    // properties inline with !important while a finger is down.
    if (parts.length) rules.push(`${sel} { ${parts.map((p) => `${p} !important`).join('; ')}; }`);
  }
  // Photos inside a box (not the full-bleed .bg ones, which place themselves) follow the
  // panned focus point.
  const focus = /^\d{1,3}% \d{1,3}%$/.test(slide?.focus ?? '') ? slide.focus : null;
  if (focus) rules.push(`[data-media-box] img[data-media]:not(.bg) { object-position: ${focus}; }`);
  return rules.length ? `<style data-layout>\n${rules.join('\n')}\n</style>` : '';
}

/** Wraps a template module so its rendered HTML carries the slide's layout overrides. */
export function withLayout(mod) {
  return {
    ...mod,
    renderSlide: (o) => {
      const html = mod.renderSlide(o);
      const css = layoutCss(o.slide);
      if (!css) return html;
      const at = html.lastIndexOf('</head>');
      return at > 0 ? html.slice(0, at) + css + html.slice(at) : css + html;
    },
  };
}
