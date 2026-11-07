import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoFormat, needsPermission } from '../lib/post-rules.mjs';
import { isCoverSlide, TEMPLATES } from '../lib/templates/index.mjs';

test('format follows content: one video slide on a reel-capable template is a reel', () => {
  const video = { media: 'media/a.mp4', mediaType: 'video' };
  assert.equal(autoFormat({ format: 'carousel', template: 'curation-frame', slides: [video] }), 'reel');
  assert.equal(autoFormat({ format: 'reel', template: 'curation-frame', slides: [video, {}] }), 'carousel');
  assert.equal(autoFormat({ format: 'carousel', template: 'editorial-photo', slides: [video] }), 'carousel');
  assert.equal(autoFormat({ format: 'carousel', template: 'curation-frame', slides: [{ media: 'media/a.jpg' }] }), 'carousel');
  assert.equal(autoFormat({ format: 'single', template: 'editorial-photo', slides: [{}] }), 'single');
});

test('permission is needed only when an original is named and not yet granted', () => {
  assert.equal(needsPermission({}), false);
  assert.equal(needsPermission({ source: { url: '', handle: ' ' } }), false);
  assert.equal(needsPermission({ source: { handle: 'someone', permission: 'requested' } }), true);
  assert.equal(needsPermission({ source: { url: 'https://x', permission: 'granted' } }), false);
});

test('cover look follows position unless the slide overrides it', () => {
  assert.equal(isCoverSlide({}, 0), true);
  assert.equal(isCoverSlide({}, 3), false);
  assert.equal(isCoverSlide({ look: 'cover' }, 3), true);
  assert.equal(isCoverSlide({ look: 'inner' }, 0), false);
  assert.equal(TEMPLATES['closing-image'].meta.role, 'last');
});
