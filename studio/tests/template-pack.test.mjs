import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, ROLE_ORDER } from '../lib/templates/index.mjs';

const brand = {
  id: 'pickydoggyclub',
  handle: '@pickydoggyclub',
  colors: { blue: '#3B63BC', lime: '#EBFA6A', lightBlue: '#D6DEF8', ink: '#111111', paper: '#FFFFFF' },
  fonts: { headline: 'Pretendard', body: 'Pretendard', comment: 'Freesentation', latin: 'Poppins' },
};
const logoSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';

test('every template renders a complete HTML document from its sample/newSlide', () => {
  for (const [key, t] of Object.entries(TEMPLATES)) {
    const post = { brand: brand.id, format: t.meta.formats[0], template: key, slides: [] };
    const slide = { ...t.meta.newSlide(post), ...(t.meta.sample ?? {}) };
    const html = t.renderSlide({
      brand, post, slide, index: 0, mediaSrc: null, mediaType: 'image', logoSvg, mode: 'export',
    });
    assert.ok(html.startsWith('<!doctype html>'), `${key}: not a document`);
    assert.ok(html.includes('</html>'), `${key}: unterminated document`);
    assert.ok(html.includes('data-field'), `${key}: no QA fields`);
    // the inline runtime <script> legitimately says "undefined"; only markup counts
    assert.ok(!html.split('<script>')[0].includes('undefined'), `${key}: leaked "undefined" into markup`);
  }
});

test('template meta is well-formed (role, formats, fields)', () => {
  for (const [key, t] of Object.entries(TEMPLATES)) {
    assert.ok(ROLE_ORDER.includes(t.meta.role), `${key}: unknown role ${t.meta.role}`);
    assert.ok(t.meta.formats.length > 0, `${key}: no formats`);
    assert.ok(t.meta.fields.length > 0, `${key}: no fields`);
    assert.ok(typeof t.meta.label === 'string' && t.meta.label, `${key}: no label`);
    const size = t.meta.sizeFor({ format: t.meta.formats[0] });
    assert.ok(size.width > 0 && size.height > 0, `${key}: bad size`);
  }
});

test('serif templates reference the bundled NanumMyeongjo web font', () => {
  for (const key of ['cover-book', 'quote-serif']) {
    const t = TEMPLATES[key];
    const post = { brand: brand.id, format: 'carousel', template: key, slides: [] };
    const slide = { ...t.meta.newSlide(post), ...(t.meta.sample ?? {}) };
    const html = t.renderSlide({ brand, post, slide, index: 0, logoSvg, mode: 'export' });
    assert.ok(html.includes("font-family: 'NanumMyeongjo'"), `${key}: serif stack missing`);
    assert.ok(html.includes('/fonts/NanumMyeongjo-Regular.ttf'), `${key}: @font-face missing`);
  }
});
