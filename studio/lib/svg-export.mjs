// Runs inside the rendered slide page (Playwright) and rebuilds it as a layered SVG for Figma:
// photo, gradients, logo, and every text block as real <text> so it stays editable after import.
// Must stay self-contained — it is serialized and evaluated in the browser.

export function exportSlideSvg() {
  const W = innerWidth;
  const H = innerHeight;
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (v) => Math.round(v * 100) / 100;

  const colorOf = (cs) => {
    const m = cs.color.match(/rgba?\(([^)]+)\)/);
    const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
    return { fill: `rgb(${r},${g},${b})`, alpha: parseFloat(a) * parseFloat(cs.opacity) };
  };

  // Walks every text node in the block. Each visual line fragment (manual \n or auto-wrap)
  // becomes a tspan; each differently-styled node becomes its own <text>.
  const textToSvg = (el, layerName) => {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let n = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const content = node.textContent;
      if (!content.trim()) continue;
      const cs = getComputedStyle(node.parentElement);
      const size = parseFloat(cs.fontSize);
      const { fill, alpha } = colorOf(cs);
      const spacing = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing);
      const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      const spans = [];
      let i = 0;
      while (i < content.length) {
        if (content[i] === '\n') { i += 1; continue; }
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r0 = range.getBoundingClientRect();
        let j = i + 1;
        let left = r0.left;
        while (j < content.length && content[j] !== '\n') {
          range.setStart(node, j);
          range.setEnd(node, j + 1);
          const r = range.getBoundingClientRect();
          if (Math.abs(r.top - r0.top) > 2) break; // wrapped to the next visual line
          j += 1;
        }
        const text = content.slice(i, j);
        if (text.trim() || spans.length) {
          const baseline = r0.top + r0.height / 2 + size * 0.35;
          spans.push(`<tspan x="${num(left)}" y="${num(baseline)}">${esc(text)}</tspan>`);
        }
        i = j;
      }
      if (spans.length) {
        out.push(`<text id="${esc(layerName)}${n ? `-${n}` : ''}" font-family="${esc(family)}"
          font-weight="${cs.fontWeight}" font-size="${size}" letter-spacing="${num(spacing)}"
          fill="${fill}" fill-opacity="${num(alpha)}" xml:space="preserve">${spans.join('')}</text>`);
        n += 1;
      }
    }
    return out.join('');
  };

  const nestedSvg = (svgEl, layerName, color) => {
    const r = svgEl.getBoundingClientRect();
    const clone = svgEl.cloneNode(true);
    clone.removeAttribute('class');
    clone.removeAttribute('style');
    clone.setAttribute('id', layerName);
    clone.setAttribute('x', num(r.left));
    clone.setAttribute('y', num(r.top));
    clone.setAttribute('width', num(r.width));
    clone.setAttribute('height', num(r.height));
    if (color) clone.setAttribute('fill', color);
    return clone.outerHTML;
  };

  const layers = [];
  const defs = [`<clipPath id="canvas"><rect width="${W}" height="${H}"/></clipPath>`];

  // Page background (solid band color for 디깅형), then the photo with its object-fit replicated.
  const pageBg = getComputedStyle(document.body).backgroundColor;
  if (pageBg !== 'rgba(0, 0, 0, 0)') layers.push(`<rect id="background" width="${W}" height="${H}" fill="${pageBg}"/>`);
  const img = document.querySelector('img[data-media]');
  if (img) {
    const box = img.getBoundingClientRect();
    const ics = getComputedStyle(img);
    const fitFn = ics.objectFit === 'contain' ? Math.min : Math.max;
    const s = fitFn(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    const [px, py] = ics.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
    defs.push(`<clipPath id="media-box"><rect x="${num(Math.max(0, box.left))}" y="${num(Math.max(0, box.top))}"
      width="${num(Math.min(W, box.width))}" height="${num(Math.min(H, box.height))}"/></clipPath>`);
    layers.push(`<g id="photo" clip-path="url(#media-box)"><image href="${img.src}"
      x="${num(box.left + (box.width - dw) * px)}" y="${num(box.top + (box.height - dh) * py)}"
      width="${num(dw)}" height="${num(dh)}" preserveAspectRatio="none"/></g>`);
  }

  // Gradients (same stops as the template, scaled by the shade level). Absent when 0%.
  const shadeK = parseFloat(document.body.dataset.shadeLevel ?? '1');
  if (document.querySelector('.shade-bottom')) {
    defs.push(`<linearGradient id="shade-bottom" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="${num(0.82 * shadeK)}"/><stop offset=".24" stop-color="#000" stop-opacity="${num(0.62 * shadeK)}"/>
      <stop offset=".44" stop-color="#000" stop-opacity="${num(0.25 * shadeK)}"/><stop offset=".6" stop-color="#000" stop-opacity="0"/>
    </linearGradient>`);
    layers.push(`<rect id="shade-bottom" width="${W}" height="${H}" fill="url(#shade-bottom)"/>`);
  }
  const shadeTop = document.querySelector('.shade-top');
  if (shadeTop && getComputedStyle(shadeTop).display !== 'none') {
    defs.push(`<linearGradient id="shade-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="${num(0.28 * shadeK)}"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>`);
    layers.push(`<rect id="shade-top" width="${W}" height="260" fill="url(#shade-top)"/>`);
  }

  const logo = document.querySelector('.logo svg');
  if (logo) layers.push(nestedSvg(logo, 'logo', colorOf(getComputedStyle(logo.parentElement)).fill));
  for (const el of document.querySelectorAll('[data-field]')) layers.push(textToSvg(el, el.dataset.field));

  // Stickers: measure unrotated, then rotate the whole group around its center.
  for (const st of document.querySelectorAll('.sticker')) {
    const rotate = parseFloat(st.dataset.rotate || '0');
    const saved = st.style.transform;
    st.style.transform = 'translate(-50%, -50%)';
    const parts = [];
    const box = st.querySelector('.st-box');
    const bcs = getComputedStyle(box);
    if (bcs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      const r = box.getBoundingClientRect();
      const bw = parseFloat(bcs.borderTopWidth) || 0;
      const stroke = bw ? ` stroke="${bcs.borderTopColor}" stroke-width="${bw}"` : '';
      parts.push(`<rect x="${num(r.left)}" y="${num(r.top)}" width="${num(r.width)}" height="${num(r.height)}"
        rx="${parseFloat(bcs.borderTopLeftRadius) || 0}" fill="${bcs.backgroundColor}"${stroke}/>`);
    }
    for (const deco of st.querySelectorAll('.st-deco, .st-shape')) parts.push(nestedSvg(deco, 'deco'));
    const text = st.querySelector('.st-text');
    if (text) parts.push(textToSvg(text, 'sticker-text'));
    const c = st.getBoundingClientRect();
    st.style.transform = saved;
    layers.push(`<g id="${esc(st.dataset.stickerId)}"
      transform="rotate(${rotate} ${num(c.left + c.width / 2)} ${num(c.top + c.height / 2)})">${parts.join('')}</g>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join('')}</defs>${layers.join('\n')}</svg>`;
}
