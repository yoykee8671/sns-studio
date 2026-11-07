import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutCss } from '../lib/templates/layout-overrides.mjs';

test('layout overrides become CSS; bad keys and values are dropped or clamped', () => {
  const css = layoutCss({
    focus: '20% 70%',
    arrange: {
      title: { x: 12.4, y: -30 },
      media: { w: 600, h: 10, x: 99999 },
      'x"]{}body{': { x: 5 },
      body: { x: 'nope' },
    },
  });
  assert.match(css, /\[data-field="title"\] \{ translate: 12px -30px !important; \}/);
  assert.match(css, /\[data-media-box\] \{ translate: 3000px 0px !important; width: 600px !important;/);
  assert.match(css, /height: 80px !important/); // clamped to the minimum
  assert.match(css, /img\[data-media\]:not\(\.bg\) \{ object-position: 20% 70%; \}/);
  assert.ok(!css.includes('body{'));
  assert.ok(!css.includes('data-field="body"'));
  assert.equal(layoutCss({}), '');
  // curation-frame's own string option is not an arrangement; the first version's object is.
  assert.equal(layoutCss({ layout: 'overlay' }), '');
  assert.match(layoutCss({ layout: { title: { x: 5 } } }), /translate: 5px 0px/);
});
