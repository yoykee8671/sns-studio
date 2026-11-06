import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrandStyle } from '../lib/store.mjs';

test('normalizeBrandStyle keeps valid hex colors and known fonts only', () => {
  const out = normalizeBrandStyle({
    colors: { point: '#AA3366', highlight: 'lime', extra: '#000000' },
    fonts: { headline: 'NanumMyeongjo', body: 'Comic Sans' },
  });
  assert.deepEqual(out, { colors: { point: '#AA3366' }, fonts: { headline: 'NanumMyeongjo' } });
});

test('normalizeBrandStyle of empty/garbage input is {}', () => {
  assert.deepEqual(normalizeBrandStyle({}), {});
  assert.deepEqual(normalizeBrandStyle({ colors: { point: 'javascript:alert(1)' } }), {});
  assert.deepEqual(normalizeBrandStyle(null), {});
});
