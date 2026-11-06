import test from 'node:test';
import assert from 'node:assert/strict';
import { SETS, getSet, setSlides, renumberSlides } from '../lib/templates/sets.mjs';
import { TEMPLATES } from '../lib/templates/index.mjs';
import { webFontCss } from '../lib/templates/fonts.mjs';

test('every set references registered carousel templates, cover first and last-role last', () => {
  for (const s of SETS) {
    assert.ok(s.slides.length >= 3 && s.slides.length <= 9, `${s.id}: bad length`);
    for (const key of s.slides) {
      const t = TEMPLATES[key];
      assert.ok(t, `${s.id}: unknown template ${key}`);
      assert.ok(t.meta.formats.includes('carousel'), `${s.id}: ${key} not carousel`);
    }
    assert.equal(TEMPLATES[s.slides[0]].meta.role, 'cover', `${s.id}: first slide not a cover`);
    assert.equal(TEMPLATES[s.slides.at(-1)].meta.role, 'last', `${s.id}: last slide not role last`);
  }
});

test('setSlides attaches template keys and numbers inner pages from 1', () => {
  const set = getSet('numbered-tips');
  const slides = setSlides(set, { format: 'carousel' });
  assert.equal(slides.length, set.slides.length);
  slides.forEach((s, i) => assert.equal(s.template, set.slides[i]));
  const numbered = slides.filter((s) => s.template === 'inner-numbered-dark');
  assert.deepEqual(numbered.map((s) => s.no), ['1', '2', '3', '4']);
});

test('renumberSlides fixes slide-index numbering from the manuscript path', () => {
  // newSlide defaults derive from the slide index: cover eats "1", inners start at "2".
  const slides = [
    { template: 'cover-center-dark' },
    { template: 'inner-numbered-dark', no: '2' },
    { template: 'inner-numbered-dark', no: '3' },
    { template: 'inner-item-dark', no: '04' },
    { template: 'last-follow' },
  ];
  renumberSlides(slides);
  assert.deepEqual(slides.map((s) => s.no), [undefined, '1', '2', '01', undefined]);
});

test('webFontCss emits only the families a template asks for', () => {
  assert.equal(webFontCss(['Pretendard', 'Freesentation']), '');
  assert.match(webFontCss(['Pretendard', 'NanumMyeongjo']), /NanumMyeongjo-Regular\.ttf/);
  assert.equal((webFontCss(['NanumMyeongjo']).match(/@font-face/g) ?? []).length, 3);
});
