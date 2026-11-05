// Lightweight inline markup for slide text fields, shared by preview and export.
// Fields stay plain textareas (one line = one design line); emphasis is written as
// **bold**, ==highlight== and {{color|text}} and converted here after HTML-escaping.
// Markers never span lines, and unmatched markers pass through verbatim so legacy
// text can never be corrupted.
import { escapeHtml } from './runtime.mjs';

const BOLD = /\*\*([^*\n]+)\*\*/g;
const MARK = /==([^=\n]+)==/g;
// Color text may not contain other markers or tags produced by earlier replacements —
// overlapping ranges would otherwise mis-nest the generated HTML.
const COLOR = /\{\{([^|{}\n]+)\|([^{}\n*=<>]+?)\}\}/g;
// Values interpolated into style="" must be plain CSS colors, nothing else.
const SAFE_CSS_COLOR = /^[#a-zA-Z0-9(),.% -]+$/;

/**
 * @param {string} text  raw field text (not yet escaped)
 * @param {object} [palette]
 * @param {string} [palette.highlight]  highlight background color
 * @param {object} [palette.colors]  brand color map for {{key|...}} lookups
 */
export function renderMarkup(text, palette = {}) {
  const highlight = palette.highlight ?? '#fff3a0';
  const colors = palette.colors ?? {};
  return escapeHtml(text)
    .replace(BOLD, '<b>$1</b>')
    .replace(MARK, `<mark style="background:${highlight};color:inherit">$1</mark>`)
    .replace(COLOR, (m, key, inner) => {
      const color = colors[key.trim()] ?? key.trim();
      if (!SAFE_CSS_COLOR.test(color)) return m;
      return `<span style="color:${color}">${inner}</span>`;
    });
}

/** Palette for a brand kit: highlight defaults to the brand's lime/accent tone. */
export function brandPalette(brand) {
  const colors = brand?.colors ?? {};
  return { highlight: colors.lime ?? colors.highlight ?? '#fff3a0', colors };
}

/** Plain text with all markers removed (for captions, AI prompts, titles). */
export function stripMarkup(text = '') {
  return String(text)
    .replace(BOLD, '$1')
    .replace(MARK, '$1')
    .replace(COLOR, '$2');
}
