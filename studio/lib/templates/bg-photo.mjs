// 사진 올리기 on every template: text-only templates (no photo slot of their own) take
// an uploaded photo as a full-bleed background behind their content, veiled so the text
// keeps reading — dark templates get a dark veil, paper ones a light one (overridable).
// The layer is a [data-media-box], so 요소 옮기기 can move/resize it and the photo pans.
import { mediaTag } from './runtime.mjs';

const option = {
  key: 'bgPhoto',
  label: '배경 사진 효과',
  choices: [[undefined, '자동'], ['dark', '어둡게'], ['light', '밝게'], ['none', '그대로']],
  hidden: (slide) => !slide.media && !slide.image,
};

// The template's page color, read from its `html, body { … background: X }` rule.
function pageIsDark(html) {
  const m = /html,\s*body\s*\{[^}]*background:\s*(#[0-9a-fA-F]{3,6})/.exec(html);
  if (!m) return false;
  let hex = m[1].slice(1);
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.5;
}

export function withBgPhoto(mod) {
  const { meta } = mod;
  if (meta.mediaTypes.length || meta.brandClosing) return mod;
  return {
    ...mod,
    meta: {
      ...meta,
      mediaTypes: ['image'],
      bgPhoto: true,
      // Only a slide that actually has a photo uses one: no photo = the template as is.
      usesMedia: (slide) => Boolean(slide.media || slide.image),
      options: [...(meta.options ?? []), option],
    },
    renderSlide: (o) => {
      const html = mod.renderSlide(o);
      if (!o.mediaSrc || !(o.slide.media || o.slide.image)) return html;
      const veil = o.slide.bgPhoto && o.slide.bgPhoto !== 'auto' ? o.slide.bgPhoto : pageIsDark(html) ? 'dark' : 'light';
      const veilCss = { dark: 'rgba(0,0,0,.55)', light: 'rgba(255,255,255,.72)', none: 'transparent' }[veil] ?? 'transparent';
      const focus = /^\d{1,3}% \d{1,3}%$/.test(o.slide.focus ?? '') ? o.slide.focus : '50% 50%';
      // body becomes its own stacking context so the layer sits above the page color but
      // below every piece of the template's content.
      const css = `<style>
  body { isolation: isolate; }
  .u-bg { position: absolute; inset: 0; z-index: -1; overflow: hidden; }
  .u-bg [data-media] { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${focus}; }
  .u-bg::after { content: ''; position: absolute; inset: 0; background: ${veilCss}; pointer-events: none; }
</style>`;
      const layer = `<div class="u-bg" data-media-box>${mediaTag({ src: o.mediaSrc, type: o.mediaType, mode: o.mode, className: 'u-bg-media' })}</div>`;
      const head = html.lastIndexOf('</head>');
      let out = head > 0 ? html.slice(0, head) + css + html.slice(head) : html;
      const bodyAt = out.indexOf('<body');
      const open = bodyAt >= 0 ? out.indexOf('>', bodyAt) + 1 : 0;
      out = out.slice(0, open) + layer + out.slice(open);
      return out;
    },
  };
}
