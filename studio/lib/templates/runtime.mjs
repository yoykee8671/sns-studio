// In-page runtime shared by every template. Injected as an inline <script>.
// - picks the top tone (white/black) from the photo under [data-tone-probe], if the template has one
// - reports per-field line counts (wrap-aware) and overflow for every [data-field] element
// - in preview mode: stickers drag + corner-handle resize, and the background photo pans by drag

export function slideRuntime({ toneThreshold = 0.62 } = {}) {
  return `
(() => {
  const W = innerWidth, H = innerHeight;
  const send = (msg) => { if (window.parent !== window) window.parent.postMessage(msg, '*'); };

  window.__ready = (async () => {
    await document.fonts.ready;
    const media = document.querySelector('[data-media]');
    if (media && media.tagName === 'IMG') { try { await media.decode(); } catch (e) {} }
    if (media && media.tagName === 'VIDEO' && media.readyState < 2) {
      await new Promise((r) => { media.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 4000); });
    }

    let topLum = null;
    const probe = document.querySelector('[data-tone-probe]');
    if (probe && media && media.tagName === 'IMG' && media.naturalWidth) {
      const box = media.getBoundingClientRect();
      const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
      const ctx = c.getContext('2d');
      const s = Math.max(box.width / media.naturalWidth, box.height / media.naturalHeight);
      const dw = media.naturalWidth * s, dh = media.naturalHeight * s;
      const [px, py] = getComputedStyle(media).objectPosition.split(' ').map((v) => parseFloat(v) / 100);
      ctx.drawImage(media, box.left + (box.width - dw) * px, box.top + (box.height - dh) * py, dw, dh);
      const r = probe.getBoundingClientRect();
      const { data } = ctx.getImageData(r.left - 16, r.top - 16, r.width + 32, r.height + 32);
      let sum = 0;
      for (let p = 0; p < data.length; p += 4) {
        sum += (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
      }
      topLum = sum / (data.length / 4);
      const override = document.body.dataset.toneOverride;
      document.body.dataset.topTone = override || (topLum > ${toneThreshold} ? 'dark' : 'light');
    }

    const issues = [];
    const fields = {};
    for (const el of document.querySelectorAll('[data-field]')) {
      const cs = getComputedStyle(el);
      const wraps = cs.whiteSpace === 'pre-wrap';
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
      const f = {
        // wrap-aware: rendered height tells how many lines actually show
        lines: wraps ? Math.max(1, Math.round(el.getBoundingClientRect().height / lh))
                     : el.textContent.split('\\n').length,
        maxLines: +el.dataset.maxLines || 99,
        overflowPx: wraps ? 0 : Math.max(0, Math.ceil(el.scrollWidth - el.clientWidth)),
      };
      fields[el.dataset.field] = f;
      const name = el.dataset.label || el.dataset.field;
      if (f.overflowPx) issues.push(name + ' 한 줄이 ' + f.overflowPx + 'px 넘쳐요');
      if (f.lines > f.maxLines) issues.push(name + ' ' + f.lines + '줄 (최대 ' + f.maxLines + '줄)');
    }
    for (const [a, b] of [['[data-avoid=top]', '[data-avoid=bottom]']]) {
      const ea = document.querySelector(a), eb = document.querySelector(b);
      if (ea && eb && eb.getBoundingClientRect().top < ea.getBoundingClientRect().bottom + 24) {
        issues.push('하단 텍스트가 상단 요소와 겹쳐요');
      }
    }
    for (const st of document.querySelectorAll('.sticker')) {
      // Measure the box, not the sticker root — preview-only UI (resize handle) must not count.
      const r = (st.querySelector('.st-box') ?? st).getBoundingClientRect();
      if (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H) issues.push('스티커가 화면 밖으로 나갔어요');
    }
    if (document.querySelector('[data-media-missing]')) issues.push('사진이나 영상이 없어요');
    for (const f of ['700 10px Pretendard', '600 10px Freesentation', '700 10px Poppins']) {
      if (!document.fonts.check(f)) issues.push('폰트 없음: ' + f);
    }
    const report = { tone: document.body.dataset.topTone ?? null, topLum, fields, issues };
    window.__report = report;
    send({ type: 'slide-report', report });
    return report;
  })();

  if (document.body.dataset.mode !== 'preview') return;

  // Resize handles on stickers (preview only).
  for (const st of document.querySelectorAll('.sticker')) {
    const h = document.createElement('div');
    h.className = 'st-handle';
    h.style.cssText = 'position:absolute;right:-16px;bottom:-16px;width:28px;height:28px;' +
      'border-radius:50%;background:#fff;border:2px solid #3b63bc;cursor:nwse-resize;z-index:9;' +
      'box-shadow:0 1px 6px rgba(0,0,0,.35)';
    st.appendChild(h);
  }
  const style = document.createElement('style');
  // touch-action none so finger drags pan the photo / move stickers instead of scrolling.
  style.textContent = 'body{touch-action:none}' +
    '.sticker .st-handle{opacity:0;transition:opacity .15s}' +
    '.sticker:hover .st-handle,.sticker.dragging .st-handle,.sticker:active .st-handle{opacity:1}' +
    '.sticker:hover{outline:2px dashed rgba(59,99,188,.7);outline-offset:6px}' +
    '@media (pointer: coarse){.sticker .st-handle{opacity:.85}}';
  document.head.appendChild(style);

  let drag = null;   // sticker move
  let resize = null; // sticker resize
  let pan = null;    // background photo pan

  // Pan range covers the whole zoomed image: the displayed image size vs the canvas.
  // Applying a new focus moves both the object-position and the zoomed box offset,
  // mirroring how the template positions the box from the focus value.
  const panTarget = () => {
    const img = document.querySelector('img[data-media].bg');
    if (!img || !img.naturalWidth) return null;
    const box = img.getBoundingClientRect();
    const s = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    const [px, py] = getComputedStyle(img).objectPosition.split(' ').map((v) => parseFloat(v) / 100);
    return { img, boxW: box.width, boxH: box.height, overX: dw - W, overY: dh - H, px: px * 100, py: py * 100 };
  };
  const applyFocus = (t, nx, ny) => {
    t.img.style.objectPosition = nx + '% ' + ny + '%';
    t.img.style.left = Math.round((W - t.boxW) * (nx / 100)) + 'px';
    t.img.style.top = Math.round((H - t.boxH) * (ny / 100)) + 'px';
  };

  document.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.st-handle');
    if (handle) {
      e.preventDefault();
      const el = handle.closest('.sticker');
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d0 = Math.max(24, Math.hypot(e.clientX - cx, e.clientY - cy));
      resize = {
        el, cx, cy, d0,
        font: +el.dataset.fontSize || 30,
        w: parseFloat(el.dataset.w) || 0,
        hasText: el.dataset.hasText === '1',
      };
      handle.setPointerCapture(e.pointerId);
      return;
    }
    const el = e.target.closest('.sticker');
    if (el) {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      drag = { el, dx: e.clientX - parseFloat(el.style.left), dy: e.clientY - parseFloat(el.style.top) };
      return;
    }
    // Pan the photo (only when it overflows, i.e. cover-fit or zoomed).
    const t = panTarget();
    if (t && (t.overX > 1 || t.overY > 1)) {
      e.preventDefault();
      pan = { ...t, x0: e.clientX, y0: e.clientY };
      document.body.style.cursor = 'move';
    }
  });

  document.addEventListener('pointermove', (e) => {
    if (resize) {
      const d = Math.hypot(e.clientX - resize.cx, e.clientY - resize.cy);
      const k = d / resize.d0;
      if (resize.hasText) {
        resize.next = Math.min(140, Math.max(12, Math.round(resize.font * k)));
        const text = resize.el.querySelector('.st-text');
        if (text) text.style.fontSize = resize.next + 'px';
        const box = resize.el.querySelector('.st-box');
        if (box && box.style.fontSize) box.style.fontSize = resize.next + 'px';
      } else {
        resize.nextW = Math.min(900, Math.max(80, Math.round(resize.w * k)));
      }
      return;
    }
    if (drag) {
      drag.el.style.left = Math.round(e.clientX - drag.dx) + 'px';
      drag.el.style.top = Math.round(e.clientY - drag.dy) + 'px';
      return;
    }
    if (pan) {
      const nx = pan.overX > 1 ? Math.min(100, Math.max(0, pan.px - ((e.clientX - pan.x0) / pan.overX) * 100)) : pan.px;
      const ny = pan.overY > 1 ? Math.min(100, Math.max(0, pan.py - ((e.clientY - pan.y0) / pan.overY) * 100)) : pan.py;
      applyFocus(pan, nx, ny);
      pan.nx = nx; pan.ny = ny;
    }
  });

  document.addEventListener('pointerup', () => {
    if (resize) {
      const { el, hasText, next, nextW } = resize;
      if (hasText && next) send({ type: 'sticker-resize', id: el.dataset.stickerId, fontSize: next });
      if (!hasText && nextW) send({ type: 'sticker-resize', id: el.dataset.stickerId, w: nextW });
      resize = null;
      return;
    }
    if (drag) {
      const { el } = drag;
      el.classList.remove('dragging');
      send({ type: 'sticker-move', id: el.dataset.stickerId,
        x: parseFloat(el.style.left), y: parseFloat(el.style.top) });
      drag = null;
      return;
    }
    if (pan) {
      document.body.style.cursor = '';
      if (pan.nx !== undefined || pan.ny !== undefined) {
        send({ type: 'media-pan', x: Math.round(pan.nx ?? pan.px), y: Math.round(pan.ny ?? pan.py) });
      }
      pan = null;
    }
  });
})();`;
}

export const escapeHtml = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Media element markup shared by templates; video autoplays only in the editor preview. */
export function mediaTag({ src, type, mode, className, style = '' }) {
  if (!src) return `<div class="${className} media-missing" data-media-missing>사진이나 영상을 올려주세요</div>`;
  if (type === 'video') {
    const play = mode === 'preview' ? ' autoplay loop' : '';
    return `<video class="${className}" data-media src="${escapeHtml(src)}" muted playsinline preload="auto"${play} style="${style}"></video>`;
  }
  return `<img class="${className}" data-media src="${escapeHtml(src)}" style="${style}">`;
}
