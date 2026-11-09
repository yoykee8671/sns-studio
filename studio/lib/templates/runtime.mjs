// In-page runtime shared by every template. Injected as an inline <script>.
// - picks the top tone (white/black) from the photo under [data-tone-probe], if the template has one
// - reports per-field line counts (wrap-aware) and overflow for every [data-field] element
// - in preview mode: stickers drag + corner-handle resize, and the photo pans by drag
// - in 요소 옮기기 mode (body[data-layout-edit]): text blocks and the photo box move by drag
//   with snapping guides (+ haptic tick), and the photo box resizes by its corner handle

export function slideRuntime({ toneThreshold = 0.62 } = {}) {
  return `
(() => {
  const W = innerWidth, H = innerHeight;
  const send = (msg) => { if (window.parent !== window) window.parent.postMessage(msg, '*'); };

  // 요소 옮기기 offsets arrive as CSS \`translate\` (layout-overrides.mjs), which inline
  // text (a <span> title) ignores; those move with relative left/top instead.
  const isInline = (el) => getComputedStyle(el).display === 'inline';
  const readTranslate = (el) => {
    const t = getComputedStyle(el).translate;
    if (!t || t === 'none') return [0, 0];
    const [x, y] = t.split(' ').map(parseFloat);
    return [x || 0, y || 0];
  };
  const offsetOf = (el) =>
    isInline(el) && el.dataset.offX !== undefined ? [+el.dataset.offX, +el.dataset.offY] : readTranslate(el);
  const setOffset = (el, x, y) => {
    if (isInline(el)) {
      el.style.setProperty('translate', 'none', 'important');
      el.style.setProperty('position', 'relative', 'important');
      el.style.setProperty('left', x + 'px', 'important');
      el.style.setProperty('top', y + 'px', 'important');
      el.dataset.offX = x; el.dataset.offY = y;
    } else {
      el.style.setProperty('translate', x + 'px ' + y + 'px', 'important');
    }
  };
  for (const el of document.querySelectorAll('[data-field]')) {
    if (!isInline(el)) continue;
    const [x, y] = readTranslate(el);
    if (x || y) setOffset(el, x, y);
  }

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
    // On phones the preview is scaled to ~1/4: handles get much bigger so a finger can
    // still grab them (28px on the canvas would be ~7px on screen).
    '@media (pointer: coarse){.sticker .st-handle{opacity:.9;width:96px!important;height:96px!important;' +
    'right:-48px!important;bottom:-48px!important;border-width:6px!important}}';
  document.head.appendChild(style);

  // ---- 요소 옮기기 ----
  const layoutEdit = document.body.dataset.layoutEdit === '1';
  const MOVABLE = '[data-field], [data-media-box]';
  const keyOf = (el) => (el.matches('[data-media-box]') ? 'media' : el.dataset.field);
  const SNAP = 12; // canvas px
  let lay = null;
  let guides = null;
  // Haptic tick when a guide catches: Vibration API (Android); on iPhone (no vibrate),
  // toggling an iOS 18+ switch control produces the system haptic.
  let hapticSwitch = null;
  const haptic = () => {
    if (navigator.vibrate && navigator.vibrate(8)) return;
    if (!hapticSwitch) {
      const label = document.createElement('label');
      label.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.appendChild(input);
      document.body.appendChild(label);
      hapticSwitch = label;
    }
    hapticSwitch.click();
  };
  if (layoutEdit) {
    const st = document.createElement('style');
    st.textContent = 'body{touch-action:none}' + MOVABLE.split(',').map((q) => q.trim() + '{outline:2px dashed rgba(41,41,191,.55);outline-offset:4px;cursor:move}').join('') +
      '.lay-active{outline:3px solid #2929BF!important}' +
      '.lay-guide{position:fixed;background:#ff2d78;z-index:99;pointer-events:none;display:none}' +
      '.lay-handle{position:absolute;right:8px;bottom:8px;width:40px;height:40px;border-radius:8px;background:#fff;' +
      'border:3px solid #2929BF;cursor:nwse-resize;z-index:9;box-shadow:0 1px 6px rgba(0,0,0,.35)}' +
      '@media (pointer: coarse){.lay-handle{width:110px;height:110px;border-width:7px;border-radius:18px}}';
    document.head.appendChild(st);
    const gx = document.createElement('div'); gx.className = 'lay-guide'; gx.style.cssText += 'top:0;bottom:0;width:3px';
    const gy = document.createElement('div'); gy.className = 'lay-guide'; gy.style.cssText += 'left:0;right:0;height:3px';
    document.body.append(gx, gy);
    guides = { gx, gy };
    const box = document.querySelector('[data-media-box]');
    if (box) {
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      const h = document.createElement('div');
      h.className = 'lay-handle';
      box.appendChild(h);
    }
  }
  // Snap lines: canvas edges and centre, the common margins, every other element's edges/centre.
  const snapLines = (self) => {
    const xs = [0, W / 2, W], ys = [0, H / 2, H];
    let minLeft = W;
    for (const el of document.querySelectorAll(MOVABLE)) {
      if (el === self || el.contains(self) || self.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      xs.push(r.left, r.left + r.width / 2, r.right);
      ys.push(r.top, r.top + r.height / 2, r.bottom);
      minLeft = Math.min(minLeft, r.left);
    }
    if (minLeft > 0 && minLeft < W / 2) xs.push(minLeft, W - minLeft);
    return { xs, ys };
  };
  const nearest = (edges, lines) => {
    let best = null;
    for (const e of edges) for (const l of lines) {
      const d = l - e;
      if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line: l };
    }
    return best;
  };
  const showGuides = (sx, sy) => {
    guides.gx.style.display = sx ? 'block' : 'none';
    if (sx) guides.gx.style.left = Math.round(sx.line - 1) + 'px';
    guides.gy.style.display = sy ? 'block' : 'none';
    if (sy) guides.gy.style.top = Math.round(sy.line - 1) + 'px';
  };

  let drag = null;   // sticker move
  let resize = null; // sticker resize
  let pan = null;    // background photo pan

  // Pan range covers the whole zoomed image: the displayed image size vs the canvas.
  // Applying a new focus moves both the object-position and the zoomed box offset,
  // mirroring how the template positions the box from the focus value.
  const panTarget = () => {
    const boxed = document.querySelector('[data-media-box] img[data-media]:not(.bg)');
    if (!document.querySelector('img[data-media].bg') && boxed && boxed.naturalWidth) {
      // A photo inside a box: object-fit cover, panned by object-position only.
      const box = boxed.getBoundingClientRect();
      const s = Math.max(box.width / boxed.naturalWidth, box.height / boxed.naturalHeight);
      const [px, py] = getComputedStyle(boxed).objectPosition.split(' ').map((v) => parseFloat(v) / 100);
      return { img: boxed, boxed: true, boxW: box.width, boxH: box.height,
        overX: boxed.naturalWidth * s - box.width, overY: boxed.naturalHeight * s - box.height,
        px: (isFinite(px) ? px : 0.5) * 100, py: (isFinite(py) ? py : 0.5) * 100 };
    }
    const img = document.querySelector('img[data-media].bg');
    if (!img || !img.naturalWidth) return null;
    const box = img.getBoundingClientRect();
    const s = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    const [px, py] = getComputedStyle(img).objectPosition.split(' ').map((v) => parseFloat(v) / 100);
    return { img, boxW: box.width, boxH: box.height, overX: dw - W, overY: dh - H, px: px * 100, py: py * 100 };
  };
  const applyFocus = (t, nx, ny) => {
    if (t.boxed) {
      t.img.style.setProperty('object-position', nx + '% ' + ny + '%', 'important');
      return;
    }
    t.img.style.objectPosition = nx + '% ' + ny + '%';
    t.img.style.left = Math.round((W - t.boxW) * (nx / 100)) + 'px';
    t.img.style.top = Math.round((H - t.boxH) * (ny / 100)) + 'px';
  };

  document.addEventListener('pointerdown', (e) => {
    // Stickers keep their own drag/resize even while 요소 옮기기 is on.
    if (layoutEdit && !e.target.closest('.sticker')) {
      const resizing = e.target.closest('.lay-handle');
      const el = resizing ? resizing.closest('[data-media-box]') : e.target.closest(MOVABLE);
      if (!el) return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      const r = el.getBoundingClientRect();
      const [tx, ty] = offsetOf(el);
      lay = { el, key: keyOf(el), resizing: Boolean(resizing), x0: e.clientX, y0: e.clientY, tx, ty,
        r, w0: r.width, h0: r.height, lines: snapLines(el), snapKey: '' };
      el.classList.add('lay-active');
      return;
    }
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
    if (t && t.boxed && !e.target.closest('[data-media-box]')) return;
    if (t && (t.overX > 1 || t.overY > 1)) {
      e.preventDefault();
      pan = { ...t, x0: e.clientX, y0: e.clientY };
      document.body.style.cursor = 'move';
    }
  });

  document.addEventListener('pointermove', (e) => {
    if (lay) {
      const dx = e.clientX - lay.x0, dy = e.clientY - lay.y0;
      let sx = null, sy = null;
      if (lay.resizing) {
        sx = nearest([lay.r.right + dx], lay.lines.xs);
        sy = nearest([lay.r.bottom + dy], lay.lines.ys);
        lay.w = Math.max(120, Math.round(lay.w0 + dx + (sx ? sx.d : 0)));
        lay.h = Math.max(120, Math.round(lay.h0 + dy + (sy ? sy.d : 0)));
        lay.el.style.setProperty('width', lay.w + 'px', 'important');
        lay.el.style.setProperty('height', lay.h + 'px', 'important');
        lay.el.style.setProperty('right', 'auto', 'important');
        lay.el.style.setProperty('bottom', 'auto', 'important');
        lay.el.style.setProperty('flex', 'none', 'important');
      } else {
        const L = lay.r.left + dx, T = lay.r.top + dy;
        sx = nearest([L, L + lay.r.width / 2, L + lay.r.width], lay.lines.xs);
        sy = nearest([T, T + lay.r.height / 2, T + lay.r.height], lay.lines.ys);
        lay.x = Math.round(lay.tx + dx + (sx ? sx.d : 0));
        lay.y = Math.round(lay.ty + dy + (sy ? sy.d : 0));
        setOffset(lay.el, lay.x, lay.y);
      }
      showGuides(sx, sy);
      const snapKey = (sx ? 'x' + sx.line : '') + (sy ? 'y' + sy.line : '');
      if (snapKey && snapKey !== lay.snapKey) haptic();
      lay.snapKey = snapKey;
      return;
    }
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

  // A cancelled touch (e.g. the system took over) ends the gesture like a release.
  const endGesture = () => {
    if (lay) {
      lay.el.classList.remove('lay-active');
      showGuides(null, null);
      const msg = { type: 'layout-move', key: lay.key };
      if (lay.x !== undefined) Object.assign(msg, { x: lay.x, y: lay.y });
      if (lay.w !== undefined) Object.assign(msg, { w: lay.w, h: lay.h });
      if (msg.x !== undefined || msg.w !== undefined) send(msg);
      lay = null;
      return;
    }
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
  };
  document.addEventListener('pointerup', endGesture);
  document.addEventListener('pointercancel', endGesture);
})();`;
}

/**
 * Per-field typography overrides from the editor's 글자 세부 조정 panel.
 * slide.textStyle[key] = { size?: px delta from the template base, ls?: em, lh?: unitless,
 *   color?: '#rrggbb' }.
 * Returns CSS text for a style attribute ('' when the field has no overrides).
 */
export function fieldStyle(slide, key, basePx) {
  const s = slide?.textStyle?.[key];
  if (!s) return '';
  // Values land inside a style="" attribute: coerce to finite numbers and clamp,
  // so stored JSON can never break out of the attribute or blow up the layout.
  const num = (v, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
  };
  const parts = [];
  const size = num(s.size, -12, 12);
  if (size) parts.push(`font-size:${basePx + size}px`);
  const ls = s.ls !== undefined ? num(s.ls, -0.3, 0.3) : null;
  if (ls !== null) parts.push(`letter-spacing:${ls}em`);
  const lh = s.lh !== undefined ? num(s.lh, 0.8, 3) : null;
  if (lh !== null) parts.push(`line-height:${lh}`);
  if (/^#[0-9a-fA-F]{6}$/.test(s.color ?? '')) parts.push(`color:${s.color}`);
  return parts.length ? `${parts.join(';')};` : '';
}

/** Cover look: slide.look ('cover' | 'inner') wins, else the first slide is the cover. */
export const isCoverSlide = (slide, index) =>
  slide?.look === 'cover' ? true : slide?.look === 'inner' ? false : index === 0;

export const LOOK_OPTION = {
  key: 'look',
  label: '표지/속지 스타일',
  choices: [[undefined, '자동 (첫 장이면 표지)'], ['cover', '표지'], ['inner', '속지']],
};

export const escapeHtml = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Media element markup shared by templates; video autoplays only in the editor preview. */
export function mediaTag({ src, type, mode, className, style = '' }) {
  // No photo: the editor preview shows a hint; exports leave the slot empty (no text).
  if (!src) {
    return mode === 'preview'
      ? `<div class="${className} media-missing" data-media-missing>사진이나 영상을 올려주세요</div>`
      : `<div class="${className} media-missing media-empty" style="background:transparent"></div>`;
  }
  if (type === 'video') {
    const play = mode === 'preview' ? ' autoplay loop' : '';
    return `<video class="${className}" data-media src="${escapeHtml(src)}" muted playsinline preload="auto"${play} style="${style}"></video>`;
  }
  return `<img class="${className}" data-media src="${escapeHtml(src)}" style="${style}">`;
}
