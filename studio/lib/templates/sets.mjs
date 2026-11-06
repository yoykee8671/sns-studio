// 추천 조합 — curated template line-ups (cover + inners + last page) that start a
// post with every slide's template already chosen. Carousel only.
import { TEMPLATES } from './index.mjs';

export const SETS = [
  {
    id: 'numbered-tips',
    label: '넘버링 꿀팁',
    desc: '번호를 매긴 팁·방법 정리 — 다크 표지와 넘버링 속지',
    slides: ['cover-center-dark', 'inner-numbered-dark', 'inner-numbered-dark', 'inner-numbered-dark', 'inner-numbered-dark', 'last-follow'],
  },
  {
    id: 'interview',
    label: '인터뷰 한 편',
    desc: '사진 표지로 시작해 질문·답을 이어가는 인터뷰',
    slides: ['cover-photo-full', 'inner-interview', 'inner-interview', 'inner-interview', 'last-follow'],
  },
  {
    id: 'item-showcase',
    label: '아이템 소개',
    desc: '책 표지 느낌으로 열고 아이템을 하나씩 소개',
    slides: ['cover-book', 'inner-item-dark', 'inner-item-dark', 'inner-item-dark', 'last-follow'],
  },
  {
    id: 'essay',
    label: '에세이 한 편',
    desc: '미니멀 표지 + 본문 문단 + 명조 인용으로 닫는 글',
    slides: ['cover-minimal', 'inner-essay', 'inner-essay', 'quote-serif', 'last-follow'],
  },
  {
    id: 'photo-log',
    label: '사진 일기',
    desc: '사진 표지 + 사진·소제목 속지로 남기는 기록',
    slides: ['cover-photo-full', 'inner-photo-split', 'inner-photo-split', 'inner-photo-split', 'last-follow'],
  },
];

export const getSet = (id) => SETS.find((s) => s.id === id) ?? null;

/**
 * Numbered templates ('no' field) count from 1 among their own kind, not from the
 * slide index — the cover doesn't consume a number. Mutates and returns `slides`;
 * each slide must already carry its template key.
 */
export function renumberSlides(slides) {
  const counts = {};
  for (const slide of slides) {
    const meta = TEMPLATES[slide.template]?.meta;
    if (!meta?.fields.some((f) => f.key === 'no')) continue;
    counts[slide.template] = (counts[slide.template] ?? 0) + 1;
    const pad = (slide.no ?? '').length > 1 ? 2 : 1;
    slide.no = String(counts[slide.template]).padStart(pad, '0');
  }
  return slides;
}

/** Builds the set's slides for a new post; every slide carries its template key. */
export function setSlides(set, post) {
  const draft = { ...post, slides: [] };
  for (const key of set.slides) {
    draft.slides.push({ ...TEMPLATES[key].meta.newSlide(draft), template: key });
  }
  return renumberSlides(draft.slides);
}
