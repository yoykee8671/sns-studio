'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TEMPLATES, ROLE_ORDER } from '@/lib/templates/index.mjs';

const ROLE_LABEL = { cover: '표지', any: '어디든', inner: '속지', last: '마지막 장' };
const CARD_W = 150;

// Neutral sample photo so photo templates preview as a design, not a warning box.
const SAMPLE_MEDIA =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#b9c2cd"/><stop offset="1" stop-color="#6d7f8a"/>' +
      '</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>',
  );

function renderPreview(t, post, brand, logoSvg, design = {}) {
  const slide = { ...t.meta.newSlide(post), ...design, ...(t.meta.sample ?? {}) };
  // Photo-option templates show their photo look in the gallery.
  if (t.meta.options?.some((o) => o.key === 'photo')) slide.photo = 'show';
  const size = t.meta.sizeFor(post);
  const html = t.renderSlide({
    brand,
    post,
    slide,
    index: t.meta.role === 'inner' ? 1 : 0,
    mediaSrc: t.meta.mediaTypes.length ? SAMPLE_MEDIA : null,
    mediaType: 'image',
    logoSvg,
    mode: 'export',
  });
  return { html, size };
}

/**
 * 템플릿 갤러리 — rendered previews (meta.sample) grouped by role; click to pick.
 * Built-in templates the user hid are left out (except the current one); one-slide
 * 내 템플릿 come first and are picked with onPickMine.
 * @param {{ post: object, brand: object, logoSvg: string, current?: string,
 *           title: string, quickLabel?: string, onQuick?: () => void,
 *           hidden?: string[], mine?: object[], onPickMine?: (layout: object) => void,
 *           onLibraryChange?: () => void, notify?: (text: string, kind?: string) => void,
 *           onPick: (key: string) => void, onClose: () => void }} props
 */
export default function TemplateGallery({
  post, brand, logoSvg, current, title, quickLabel, onQuick, onPick, onClose,
  hidden = [], mine = [], onPickMine, onLibraryChange, notify,
}) {
  const groups = useMemo(() => {
    const entries = Object.entries(TEMPLATES).filter(
      ([key, t]) => t.meta.formats.includes(post.format) && (!hidden.includes(key) || key === current),
    );
    return ROLE_ORDER.map((role) => ({
      role,
      items: entries.filter(([, t]) => t.meta.role === role),
    })).filter((g) => g.items.length);
  }, [post.format, hidden, current]);

  const myItems = useMemo(
    () =>
      mine
        .filter((l) => l.slide && TEMPLATES[l.slide.template]?.meta.formats.includes(post.format))
        .map((l) => ({ layout: l, ...renderPreview(TEMPLATES[l.slide.template], post, brand, logoSvg, l.slide) })),
    [mine, post, brand, logoSvg],
  );

  const previews = useMemo(
    () =>
      Object.fromEntries(
        groups.flatMap(({ items }) =>
          items.map(([key, t]) => [key, renderPreview(t, post, brand, logoSvg)]),
        ),
      ),
    [groups, brand, post, logoSvg],
  );

  // Card actions: X hides a built-in template (or deletes one of mine, after a second
  // tap), 수정 opens the template editor in a new tab (a built-in is copied into 내 템플릿
  // first — built-ins themselves can't change), 복제 adds a copy to 내 템플릿.
  const [armed, setArmed] = useState(null);
  const [busy, setBusy] = useState(null);
  const call = async (url, init) => {
    const res = await fetch(url, init);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? `요청 실패 (${res.status})`);
    return d;
  };
  const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const act = async (id, fn) => {
    setBusy(id);
    try {
      await fn();
      onLibraryChange?.();
    } catch (e) {
      notify?.(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const copyBuiltin = (key) => call('/api/layouts', json({ builtin: key, brand: post.brand }));
  const copyMine = async (layout) => {
    const { post: lp } = await call(`/api/layouts/${layout.id}`);
    return call('/api/layouts', json({ name: `${layout.name} 복사본`, post: lp }));
  };
  const onX = (item) => {
    if (item.kind === 'builtin') {
      act(item.key, async () => {
        await call('/api/layouts/hidden', { ...json({ hidden: [...hidden, item.key] }), method: 'PUT' });
        notify?.(`'${TEMPLATES[item.key].meta.label}'을 숨겼어요. 공통 템플릿 관리에서 다시 보이게 할 수 있어요.`);
      });
      return;
    }
    if (armed !== item.layout.id) {
      setArmed(item.layout.id);
      setTimeout(() => setArmed((a) => (a === item.layout.id ? null : a)), 3000);
      return;
    }
    act(item.layout.id, async () => {
      await call(`/api/layouts/${item.layout.id}`, { method: 'DELETE' });
      notify?.(`'${item.layout.name}'을 지웠어요.`);
    });
  };
  const onEdit = (item) => {
    if (item.kind === 'mine') {
      window.open(`/templates/${item.layout.id}`, '_blank');
      return;
    }
    // Open the tab inside the tap (popup blockers), point it at the copy once made.
    const tab = window.open('about:blank', '_blank');
    act(item.key, async () => {
      const { layout } = await copyBuiltin(item.key);
      if (tab) tab.location.href = `/templates/${layout.id}`;
      else window.location.href = `/templates/${layout.id}`;
    });
  };
  const onDuplicate = (item) =>
    act(item.kind === 'mine' ? item.layout.id : item.key, async () => {
      const { layout } = item.kind === 'mine' ? await copyMine(item.layout) : await copyBuiltin(item.key);
      notify?.(`'${layout.name}'을 내 템플릿에 만들었어요.`);
    });

  const sections = [
    ...(myItems.length && onPickMine
      ? [{
          id: 'mine',
          title: '내 템플릿',
          cards: myItems.map(({ layout, html, size }) => ({
            id: layout.id, item: { kind: 'mine', layout }, html, size, label: layout.name,
            on: false, pick: () => onPickMine(layout),
          })),
        }]
      : []),
    ...groups.map(({ role, items }) => ({
      id: role,
      title: ROLE_LABEL[role],
      cards: items.map(([key, t]) => ({
        id: key, item: { kind: 'builtin', key }, ...previews[key], label: t.meta.label,
        on: key === current, pick: () => onPick(key),
      })),
    })),
  ];

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal tg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tg-head">
          <h2>{title}</h2>
          <div className="tg-head-actions">
            {quickLabel && <button onClick={onQuick}>{quickLabel}</button>}
            <button onClick={onClose} aria-label="닫기">✕</button>
          </div>
        </div>
        <div className="tg-body">
          {sections.map((sec) => (
            <section key={sec.id} className="tg-section">
              <h3>{sec.title}</h3>
              {chunk(sec.cards, ROW_MAX).map((row, r) => (
                <TgRow key={r}>
                  {row.map((c) => {
                    const scale = CARD_W / c.size.width;
                    const id = c.item.kind === 'mine' ? c.item.layout.id : c.item.key;
                    return (
                      <div key={c.id} className={`tg-card ${c.on ? 'on' : ''}`}>
                        <div className="tg-frame-wrap">
                          <button className="tg-pick" onClick={c.pick} aria-label={`${c.label} 고르기`}>
                            <span className="tg-frame" style={{ width: CARD_W, height: Math.round(c.size.height * scale) }}>
                              <iframe
                                srcDoc={c.html}
                                title={c.label}
                                tabIndex={-1}
                                loading="lazy"
                                style={{ width: c.size.width, height: c.size.height, transform: `scale(${scale})` }}
                              />
                            </span>
                          </button>
                          <button
                            className={`tg-x ${armed === id ? 'armed' : ''}`}
                            aria-label={c.item.kind === 'mine' ? `${c.label} 삭제` : `${c.label} 숨기기`}
                            title={c.item.kind === 'mine' ? (armed === id ? '한 번 더 누르면 삭제' : '삭제') : '숨기기'}
                            disabled={busy === id}
                            onClick={() => onX(c.item)}
                          >
                            {armed === id ? '삭제?' : '✕'}
                          </button>
                          <div className="tg-actions">
                            <button disabled={busy === id} onClick={() => onEdit(c.item)}>수정</button>
                            <button disabled={busy === id} onClick={() => onDuplicate(c.item)}>복제</button>
                          </div>
                        </div>
                        <span className="tg-label">
                          {c.label}
                          {c.on && ' · 현재'}
                        </span>
                      </div>
                    );
                  })}
                </TgRow>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const ROW_MAX = 25; // a row holds at most 25 templates, then a new row starts
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** One sideways-scrolling row: swipe on touch, ‹ › buttons on PC. */
function TgRow({ children }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  useEffect(update, []);
  const by = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <div className={`tg-row-wrap ${edge.start && edge.end ? 'fits' : ''}`}>
      <button className="tg-arrow left" aria-label="이전" disabled={edge.start} onClick={() => by(-1)}>‹</button>
      <div className="tg-row" ref={ref} onScroll={update}>{children}</div>
      <button className="tg-arrow right" aria-label="다음" disabled={edge.end} onClick={() => by(1)}>›</button>
    </div>
  );
}
