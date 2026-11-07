import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../lib/templates/index.mjs';

const brand = { id: 'b', handle: '@b', colors: { paper: '#ffffff', ink: '#111111', blue: '#3b63bc', lime: '#ebfa6a' }, fonts: { headline: 'Pretendard', body: 'Pretendard' } };
const render = (key, slide, mediaSrc = null) => {
  const t = TEMPLATES[key];
  const post = { format: 'carousel', template: key, slides: [] };
  return t.renderSlide({ brand, post, slide: { ...t.meta.newSlide(post), ...slide }, index: 1, mediaSrc, mediaType: 'image', logoSvg: '', mode: 'export' });
};

test('every template has a photo slot', () => {
  for (const [key, t] of Object.entries(TEMPLATES)) assert.ok(t.meta.mediaTypes.length > 0, key);
});

test('text-only templates take an uploaded photo as a veiled background', () => {
  const dark = render('quote-dark', { media: 'media/a.jpg' }, '/m/a.jpg');
  assert.match(dark, /class="u-bg" data-media-box><img class="u-bg-media" data-media src="\/m\/a\.jpg"/);
  assert.match(dark, /rgba\(0,0,0,\.55\)/); // dark page → dark veil
  const paper = render('inner-essay', { media: 'media/a.jpg' }, '/m/a.jpg');
  assert.match(paper, /rgba\(255,255,255,\.72\)/); // paper page → light veil
  assert.match(render('inner-essay', { media: 'media/a.jpg', bgPhoto: 'none' }, '/m/a.jpg'), /background: transparent/);
  // no photo: the template exactly as before
  assert.ok(!render('inner-essay', {}).includes('u-bg'));
  assert.equal(TEMPLATES['inner-essay'].meta.usesMedia({}), false);
});

test('a photo template without a photo exports an empty slot, no hint text', () => {
  const html = render('cover-photo-full', {});
  assert.ok(!html.includes('사진이나 영상을 올려주세요'));
  assert.match(html, /media-empty/);
});
