import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkup, stripMarkup } from '../lib/templates/markup.mjs';

const palette = { accent: '#d84315', highlight: '#fff3a0', colors: { blue: '#1d4ed8' } };

test('bold marker becomes <b>', () => {
  assert.equal(renderMarkup('딱 **세 가지**만 기억하세요', palette),
    '딱 <b>세 가지</b>만 기억하세요');
});

test('highlight marker becomes <mark> with brand highlight color', () => {
  assert.equal(renderMarkup('핵심은 ==여기==', palette),
    '핵심은 <mark style="background:#fff3a0;color:inherit">여기</mark>');
});

test('color marker uses palette key, falls back to raw value', () => {
  assert.equal(renderMarkup('{{blue|파란 글씨}}', palette),
    '<span style="color:#1d4ed8">파란 글씨</span>');
  assert.equal(renderMarkup('{{#ff0000|빨강}}', palette),
    '<span style="color:#ff0000">빨강</span>');
});

test('HTML in input is escaped before conversion', () => {
  assert.equal(renderMarkup('<b>원래 태그</b> & **진짜 굵게**', palette),
    '&lt;b&gt;원래 태그&lt;/b&gt; &amp; <b>진짜 굵게</b>');
});

test('unmatched markers pass through verbatim', () => {
  assert.equal(renderMarkup('별표 ** 두 개', palette), '별표 ** 두 개');
  assert.equal(renderMarkup('등호 ==만 있음', palette), '등호 ==만 있음');
  assert.equal(renderMarkup('{{깨진 괄호', palette), '{{깨진 괄호');
});

test('newlines are preserved and markers do not span lines', () => {
  assert.equal(renderMarkup('첫 줄 **굵게**\n둘째 줄', palette), '첫 줄 <b>굵게</b>\n둘째 줄');
  assert.equal(renderMarkup('**줄을\n넘는 마커**', palette), '**줄을\n넘는 마커**');
});

test('stripMarkup removes markers, keeps text', () => {
  assert.equal(stripMarkup('딱 **세 가지**와 ==형광== {{blue|파랑}}'), '딱 세 가지와 형광 파랑');
  assert.equal(stripMarkup('마커 없음 | 그대로'), '마커 없음 | 그대로');
});

test('plain text without markers is just escaped', () => {
  assert.equal(renderMarkup('라벨 | 설명', palette), '라벨 | 설명');
});

test('overlapping markers cannot produce mis-nested tags', () => {
  // color text may not contain other markers, so this stays a plain bold match
  assert.equal(renderMarkup('**a{{red|b**}}', palette), '<b>a{{red|b</b>}}');
});
