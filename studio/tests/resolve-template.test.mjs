import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, resolveTemplate } from '../lib/templates/index.mjs';

const post = { template: 'editorial-photo', format: 'carousel' };

test('slide without template falls back to post.template', () => {
  assert.equal(resolveTemplate(post, {}), TEMPLATES['editorial-photo']);
});

test('slide.template wins when registered and format-compatible', () => {
  assert.equal(resolveTemplate(post, { template: 'curation-frame' }), TEMPLATES['curation-frame']);
});

test('unknown slide.template falls back to post.template', () => {
  assert.equal(resolveTemplate(post, { template: 'does-not-exist' }), TEMPLATES['editorial-photo']);
});

test('reel-incompatible slide.template falls back to post.template', () => {
  const reel = { template: 'curation-frame', format: 'reel' };
  // editorial-photo has no reel format, so the slide override is ignored on reels
  assert.equal(resolveTemplate(reel, { template: 'editorial-photo' }), TEMPLATES['curation-frame']);
});

test('every template declares a role', () => {
  for (const [name, t] of Object.entries(TEMPLATES)) {
    assert.ok(['cover', 'inner', 'any'].includes(t.meta.role), `${name} missing role`);
  }
});
