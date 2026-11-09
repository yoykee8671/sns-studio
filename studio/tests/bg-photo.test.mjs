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

test('음영 레이어: off by default, sits right after the media, direction and strength apply', () => {
  for (const [key, t] of Object.entries(TEMPLATES)) {
    if (t.meta.brandClosing) continue;
    assert.ok(t.meta.sliders?.some((s) => s.key === 'veil'), `${key} has 음영 레이어`);
  }
  assert.ok(!render('cover-photo-full', { media: 'media/a.jpg' }, '/m/a.jpg').includes('u-veil'));
  const bottom = render('cover-photo-full', { media: 'media/a.jpg', veil: 50 }, '/m/a.jpg');
  assert.match(bottom, /data-media[^>]*>\s*<div class="u-veil"[^>]*linear-gradient\(to top, rgba\(0,0,0,0\.45\)/);
  assert.match(render('numbered-section', { media: 'media/a.jpg', photo: 'show', veil: 100, veilDir: 'full' }, '/m/a.jpg'),
    /class="u-veil"[^>]*background:rgba\(0,0,0,0\.9\)/);
  assert.match(render('inner-essay', { media: 'media/a.jpg', veil: 40, veilDir: 'both' }, '/m/a.jpg'), /u-veil[^>]*to bottom/);
  // video: placed after </video>
  const vid = TEMPLATES['editorial-photo'].renderSlide({ brand, post: { format: 'carousel', template: 'editorial-photo', slides: [] },
    slide: { headline: '', body: '', stickers: [], media: 'media/a.mp4', mediaType: 'video', veil: 30 }, index: 1,
    mediaSrc: '/m/a.mp4', mediaType: 'video', logoSvg: '', mode: 'preview' });
  assert.match(vid, /<\/video><div class="u-veil"/);
});
