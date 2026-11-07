import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../lib/templates/index.mjs';
import { carryText } from '../lib/templates/carry-text.mjs';

const carry = (from, to, slide) => carryText(from, TEMPLATES[from].meta, to, TEMPLATES[to].meta, slide);

test('text follows its role when the template changes', () => {
  const slide = { headline: '산책 전에 챙길 것', body: '물과 봉투', source: '출처 | @a' };
  // body → body is the same field and already shows; the headline moves to 소제목.
  assert.deepEqual(carry('editorial-photo', 'numbered-section', slide), { title: '산책 전에 챙길 것' });
  assert.deepEqual(carry('editorial-photo', 'cover-minimal', slide), { title: '산책 전에 챙길 것' });
  assert.deepEqual(carry('cover-minimal', 'editorial-photo', { kicker: '주말', title: '단풍길' }), { headline: '단풍길', body: '주말' });
  // body stays body (same field); the 소제목 has no 제목 slot there, so it takes the small line.
  assert.deepEqual(carry('numbered-section', 'quote-dark', { no: '1', title: '한 문장', body: '설명' }), { credit: '한 문장' });
  // headline is the same field there; 출처 moves to curation-frame's credit line.
  assert.deepEqual(carry('editorial-photo', 'curation-frame', { headline: 'h', source: '출처 | @a' }), { credit: '출처 | @a' });
});

test('fields that already have text are never overwritten', () => {
  assert.deepEqual(carry('editorial-photo', 'numbered-section', { headline: 'new', title: 'kept' }), {});
});
