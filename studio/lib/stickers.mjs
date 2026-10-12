// Sticker catalog shared by the editor UI, the slide template and the SVG exporter.
// A sticker on a slide:
//   { id, type, x, y, rotate, fontSize, align, fill, stroke, strokeWidth, color,
//     text,            // plain text (\n = line break) — always kept in sync
//     runs,            // optional rich text: [[{ t, b?, size? }, …] per line] (size in px)
//     w }              // arrows only: width in px
// x/y is the center in canvas px. Colors are hex, or a brand token (lime/ink/blue/paper).

export const STICKER_TYPES = {
  postit: {
    label: '포스트잇',
    hasText: true,
    defaults: {
      text: '한 줄 코멘트를\n적어주세요.', x: 820, y: 880, rotate: -3,
      fontSize: 30, align: 'left', fill: 'lime', stroke: '#111111', strokeWidth: 0, color: 'ink',
    },
  },
  bubble: {
    label: '말풍선',
    hasText: true,
    defaults: {
      text: '저는 안 먹을래요.', x: 760, y: 520, rotate: 0,
      fontSize: 30, align: 'left', fill: '#ffffff', stroke: '#111111', strokeWidth: 0, color: 'ink',
    },
  },
  cloud: {
    label: '구름말풍선',
    hasText: true,
    defaults: {
      text: '멍…?', x: 760, y: 420, rotate: 0,
      fontSize: 30, align: 'center', fill: '#ffffff', stroke: '#111111', strokeWidth: 4, color: 'ink',
    },
  },
  rect: {
    label: '사각형',
    hasText: true,
    defaults: {
      text: '내용을 적어주세요', x: 540, y: 700, rotate: 0,
      fontSize: 30, align: 'center', fill: '#ffffff', stroke: '#111111', strokeWidth: 4, color: 'ink',
    },
  },
  circle: {
    label: '원형',
    hasText: true,
    defaults: {
      text: 'CHECK', x: 540, y: 500, rotate: 0,
      fontSize: 30, align: 'center', fill: '#ffffff', stroke: '#111111', strokeWidth: 4, color: 'ink',
    },
  },
  arrow: {
    label: '화살표',
    hasText: false,
    defaults: {
      text: '', x: 540, y: 820, rotate: 0, w: 240,
      fill: 'none', stroke: '#ffffff', strokeWidth: 8,
    },
  },
  squiggle: {
    label: '꼬불화살표',
    hasText: false,
    defaults: {
      text: '', x: 540, y: 820, rotate: 0, w: 240,
      fill: 'none', stroke: '#ffffff', strokeWidth: 7,
    },
  },
  label: {
    label: '라벨',
    hasText: true,
    defaults: {
      text: 'PICKY CHECK', x: 240, y: 300, rotate: -2,
      fontSize: 28, align: 'center', fill: 'blue', stroke: '#111111', strokeWidth: 0, color: '#ffffff',
    },
  },
};

// Older posts stored color variants as separate types.
export const LEGACY_TYPES = {
  'postit-lime': { type: 'postit', fill: 'lime', color: 'ink' },
  'postit-white': { type: 'postit', fill: '#ffffff', color: 'ink' },
  'bubble-white': { type: 'bubble', fill: '#ffffff', color: 'ink' },
  'bubble-ink': { type: 'bubble', fill: 'ink', color: '#ffffff' },
  'label-blue': { type: 'label', fill: 'blue', color: '#ffffff' },
  'x-bubble': null, // removed from the catalog
};

const escapeHtml = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function createSticker(type, overrides = {}) {
  const { defaults } = STICKER_TYPES[type];
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    ...structuredClone(defaults),
    ...structuredClone(overrides),
  };
}

/** Upgrades a stored sticker to the current model; returns null if the type is gone. */
export function normalizeSticker(st) {
  let next = st;
  if (!STICKER_TYPES[st.type]) {
    const legacy = LEGACY_TYPES[st.type];
    if (!legacy) return null;
    next = { ...st, ...legacy };
  }
  const { defaults } = STICKER_TYPES[next.type];
  return { ...structuredClone(defaults), ...next };
}

export const resolveColor = (v, brand) =>
  ({ lime: brand.colors.lime, ink: brand.colors.ink, blue: brand.colors.blue, paper: brand.colors.paper }[v] ?? v);

/** Plain text (\n lines) of a sticker, from runs when present. */
export const stickerText = (st) =>
  st.runs ? st.runs.map((line) => line.map((r) => r.t).join('')).join('\n') : (st.text ?? '');

// Rich text: one <div class="st-line"> per line, one <span> per styled run.
// Run sizes are stored as a multiplier (rel) of the sticker's base font size and rendered in em,
// so mouse-resizing the sticker scales every run together.
function richHtml(st) {
  const base = st.fontSize || 30;
  const lines = st.runs ?? (st.text ?? '').split('\n').map((t) => [{ t }]);
  return lines
    .map((line) => {
      const spans = line
        .map((r) => {
          const rel = r.rel ?? (r.size ? r.size / base : 1);
          const styles = [];
          if (rel && Math.abs(rel - 1) > 0.01) styles.push(`font-size:${Math.round(rel * 1000) / 1000}em`);
          if (r.b) styles.push('font-weight:800');
          const open = styles.length ? `<span style="${styles.join(';')}">` : '<span>';
          return `${open}${escapeHtml(r.t)}</span>`;
        })
        .join('');
      return `<div class="st-line">${spans || '<span>&nbsp;</span>'}</div>`;
    })
    .join('');
}

export function stickerCss(brand) {
  const { fonts } = brand;
  return `
  .sticker { position: absolute; z-index: 5; cursor: grab; user-select: none; }
  .sticker.dragging { cursor: grabbing; }
  .st-box { position: relative; }
  .st-text { position: relative; z-index: 1; }
  .st-line { white-space: pre; min-height: 1em; }
  .st-deco { position: absolute; display: block; overflow: visible; }
  .st-shape { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }

  .st-postit .st-text, .st-bubble .st-text, .st-cloud .st-text,
  .st-rect .st-text, .st-circle .st-text {
    font-family: '${fonts.comment}'; font-weight: 600; line-height: 1.35;
  }
  .st-postit .st-box { padding: .9em 1em .8em; box-shadow: 0 10px 24px rgba(0,0,0,.28); }
  .st-tape { left: 50%; top: -14px; margin-left: -55px; width: 110px; height: 30px; }

  .st-bubble .st-box { padding: .7em 1em .75em; border-radius: .95em; box-shadow: 0 8px 20px rgba(0,0,0,.22); }
  .st-tail { left: 1.1em; bottom: -0.78em; width: 1.45em; height: .85em; }

  .st-cloud .st-box { padding: 1.5em 2.1em 1.9em; }
  .st-rect .st-box { padding: .7em 1em; }
  .st-circle .st-box { padding: 1.3em 1.8em; }

  .st-label .st-box { padding: .36em .8em .42em; border-radius: .22em; }
  .st-label .st-text {
    font-family: '${fonts.latin}', '${fonts.body}'; font-weight: 700; letter-spacing: 0.02em; line-height: 1.2;
  }
  .st-arrow .st-box, .st-squiggle .st-box { position: relative; }
  `;
}

const tape = `<svg class="st-deco st-tape" viewBox="0 0 110 30" style="transform: rotate(2deg)">
  <rect width="110" height="30" fill="rgba(255,255,255,0.55)"/></svg>`;

const tail = (fill, stroke, sw) => `<svg class="st-deco st-tail" viewBox="0 0 44 26" preserveAspectRatio="none">
  <path d="M0 0 L44 0 L6 26 Z" fill="${fill}"${sw ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/></svg>`;

// Shape layers stretch with the text box (preserveAspectRatio="none").
const cloudShape = (fill, stroke, sw) => `<svg class="st-shape" viewBox="0 0 200 120" preserveAspectRatio="none">
  <path d="M46 34 C 38 14, 70 4, 84 16 C 92 2, 124 2, 132 16 C 148 6, 176 18, 168 36
           C 190 42, 190 68, 170 76 C 180 94, 156 108, 140 100 C 132 114, 100 116, 90 104
           C 72 116, 44 108, 46 90 C 24 90, 14 68, 32 56 C 18 46, 28 34, 46 34 Z"
    fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  <ellipse cx="34" cy="112" rx="10" ry="6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>
  <ellipse cx="16" cy="124" rx="6" ry="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>
</svg>`;

const rectShape = (fill, stroke, sw) => `<svg class="st-shape" viewBox="0 0 100 100" preserveAspectRatio="none">
  <rect x="1" y="1" width="98" height="98" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>
</svg>`;

const circleShape = (fill, stroke, sw) => `<svg class="st-shape" viewBox="0 0 100 100" preserveAspectRatio="none">
  <ellipse cx="50" cy="50" rx="49" ry="49" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>
</svg>`;

const arrowShape = (stroke, sw, w) => {
  const h = Math.max(40, Math.round(w * 0.22));
  const y = h / 2;
  return `<svg class="st-deco st-arrow-line" style="left:0;top:0" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <g fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${sw} ${y} L${w - sw * 2} ${y}"/>
    <path d="M${w - h * 0.72} ${y - h * 0.34} L${w - sw * 2} ${y} L${w - h * 0.72} ${y + h * 0.34}"/>
  </g></svg>`;
};

const squiggleShape = (stroke, sw, w) => {
  const h = Math.max(56, Math.round(w * 0.34));
  const y = h / 2;
  const a = h * 0.3;
  return `<svg class="st-deco st-arrow-line" style="left:0;top:0" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <g fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${sw} ${y} C ${w * 0.18} ${y - a}, ${w * 0.3} ${y - a}, ${w * 0.4} ${y}
             S ${w * 0.62} ${y + a}, ${w * 0.74} ${y} S ${w * 0.86} ${y - a * 0.6}, ${w - sw * 2} ${y - a * 0.4}"/>
    <path d="M${w - h * 0.6} ${y - a * 0.4 - h * 0.3} L${w - sw * 2} ${y - a * 0.4} L${w - h * 0.52} ${y - a * 0.4 + h * 0.26}"/>
  </g></svg>`;
};

export function renderSticker(st, brand) {
  const s = normalizeSticker(st);
  if (!s) return '';
  const fill = resolveColor(s.fill, brand);
  const stroke = resolveColor(s.stroke, brand);
  const color = resolveColor(s.color ?? 'ink', brand);
  const sw = s.strokeWidth ?? 0;
  const style = `left:${s.x}px;top:${s.y}px;transform:translate(-50%,-50%) rotate(${s.rotate ?? 0}deg)`;
  const textStyle = `font-size:${s.fontSize || 30}px;color:${color};text-align:${s.align ?? 'left'}`;
  const text = `<div class="st-text" style="${textStyle}">${richHtml(s)}</div>`;
  let inner;
  switch (s.type) {
    case 'postit':
      inner = `<div class="st-box" style="background:${fill};${sw ? `border:${sw}px solid ${stroke}` : ''}">${text}</div>${tape}`;
      break;
    case 'bubble':
      inner = `<div class="st-box" style="background:${fill};font-size:${s.fontSize || 30}px;${sw ? `border:${sw}px solid ${stroke}` : ''}">${text}${tail(fill, stroke, sw)}</div>`;
      break;
    case 'cloud':
      inner = `<div class="st-box" style="font-size:${s.fontSize || 30}px">${cloudShape(fill, stroke, sw)}${text}</div>`;
      break;
    case 'rect':
      inner = `<div class="st-box" style="font-size:${s.fontSize || 30}px">${rectShape(fill, stroke, sw)}${text}</div>`;
      break;
    case 'circle':
      inner = `<div class="st-box" style="font-size:${s.fontSize || 30}px">${circleShape(fill, stroke, sw)}${text}</div>`;
      break;
    case 'label':
      inner = `<div class="st-box" style="background:${fill};font-size:${s.fontSize || 28}px;${sw ? `border:${sw}px solid ${stroke}` : ''}">${text}</div>`;
      break;
    case 'arrow': {
      const w = s.w ?? 240;
      const h = Math.max(40, Math.round(w * 0.22));
      inner = `<div class="st-box" style="width:${w}px;height:${h}px">${arrowShape(stroke, sw || 8, w)}</div>`;
      break;
    }
    case 'squiggle': {
      const w = s.w ?? 240;
      const h = Math.max(56, Math.round(w * 0.34));
      inner = `<div class="st-box" style="width:${w}px;height:${h}px">${squiggleShape(stroke, sw || 7, w)}</div>`;
      break;
    }
    default:
      return '';
  }
  return `<div class="sticker st-${s.type}" data-sticker-id="${escapeHtml(s.id)}"
    data-rotate="${s.rotate ?? 0}" data-font-size="${s.fontSize || 30}" data-w="${s.w ?? ''}"
    data-has-text="${STICKER_TYPES[s.type].hasText ? '1' : ''}" style="${style}">${inner}</div>`;
}
