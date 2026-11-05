import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldStyle } from '../lib/templates/runtime.mjs';

test('no textStyle → empty string', () => {
  assert.equal(fieldStyle({}, 'headline', 36), '');
  assert.equal(fieldStyle({ textStyle: {} }, 'headline', 36), '');
});

test('size delta adds to the template base px', () => {
  assert.equal(fieldStyle({ textStyle: { body: { size: 4 } } }, 'body', 32), 'font-size:36px;');
  assert.equal(fieldStyle({ textStyle: { body: { size: -2.5 } } }, 'body', 32), 'font-size:29.5px;');
});

test('letter-spacing and line-height are absolute overrides', () => {
  assert.equal(
    fieldStyle({ textStyle: { title: { ls: -0.05, lh: 1.7 } } }, 'title', 44),
    'letter-spacing:-0.05em;line-height:1.7;',
  );
});

test('zero letter-spacing is still emitted (0 is a valid value)', () => {
  assert.equal(fieldStyle({ textStyle: { t: { ls: 0 } } }, 't', 30), 'letter-spacing:0em;');
});

test('other fields are untouched', () => {
  assert.equal(fieldStyle({ textStyle: { body: { size: 4 } } }, 'headline', 36), '');
});
