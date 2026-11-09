// 음영 레이어 on every template with a photo/video: a dark layer right above the media
// (below all text) to make writing readable — strength 0–100 (0 = off) and direction:
// from the bottom, from the top, both ends, or 전체 (even, full-bleed). It sits in the
// photo's own box, so it follows 요소 옮기기 and is kept in video exports.

const slider = { key: 'veil', label: '음영 레이어', min: 0, max: 100, step: 5, default: 0, unit: '%' };
const dirOption = {
  key: 'veilDir',
  label: '음영 방향',
  choices: [[undefined, '아래'], ['top', '위'], ['both', '위·아래'], ['full', '전체']],
  hidden: (slide) => !(Number(slide.veil) > 0),
};

function veilCss(level, dir) {
  const a = Math.round(Math.min(100, Math.max(0, level)) * 0.9) / 100; // strongest ≈ 90% black
  const c = (x) => `rgba(0,0,0,${x})`;
  switch (dir) {
    case 'top': return `linear-gradient(to bottom, ${c(a)} 0%, ${c(a * 0.55)} 30%, ${c(0)} 65%)`;
    case 'both': return `linear-gradient(to bottom, ${c(a)} 0%, ${c(0)} 38%, ${c(0)} 62%, ${c(a)} 100%)`;
    case 'full': return c(a);
    default: return `linear-gradient(to top, ${c(a)} 0%, ${c(a * 0.55)} 30%, ${c(0)} 65%)`;
  }
}

/** Inserts the layer right after the media element (img or video) of the rendered slide. */
function insertAfterMedia(html, layer) {
  const attr = html.indexOf(' data-media ');
  if (attr < 0) return html;
  const start = html.lastIndexOf('<', attr);
  const isVideo = html.startsWith('<video', start);
  const end = isVideo ? html.indexOf('</video>', attr) + '</video>'.length : html.indexOf('>', attr) + 1;
  if (end <= 0) return html;
  return html.slice(0, end) + layer + html.slice(end);
}

export function withShade(mod) {
  const { meta } = mod;
  if (!meta.mediaTypes.length || meta.brandClosing) return mod;
  return {
    ...mod,
    meta: {
      ...meta,
      sliders: [...(meta.sliders ?? []), slider],
      options: [...(meta.options ?? []), dirOption],
    },
    renderSlide: (o) => {
      const html = mod.renderSlide(o);
      const level = Number(o.slide.veil) || 0;
      if (level <= 0 || !o.mediaSrc) return html;
      const layer = `<div class="u-veil" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;background:${veilCss(level, o.slide.veilDir)}"></div>`;
      return insertAfterMedia(html, layer);
    },
  };
}
