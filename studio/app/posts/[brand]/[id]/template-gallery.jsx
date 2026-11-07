'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TEMPLATES, ROLE_ORDER } from '@/lib/templates/index.mjs';

const ROLE_LABEL = { cover: '표지', any: '어디든', inner: '속지', last: '마지막 장' };
const CARD_W = 150;
const ROW_MAX = 25; // a row holds at most 25 templates, then a new row starts

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
    mediaSrc: t.meta.bgPhoto ? null : SAMPLE_MEDIA,
    mediaType: 'image',
    logoSvg,
    mode: 'export',
  });
  return { html, size };
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * 템플릿 창 — rows per category: 즐겨찾는 템플릿, 내 템플릿, then the built-ins by role.
 * Card: thumbnail (tap = pick, or open the editor in manage mode) and a footer strip with
 * 수정 · 복제 · ☆ (favourite) · ✕ (hide a built-in / delete one of mine).
 *
 * mode 'pick' (editor): onPick(key) / onPickMine(layout); hidden built-ins are left out.
 * mode 'manage' (home 공통 템플릿 관리): every template, hidden ones dimmed with 보이기.
 * onNavigate(url) leaves the page (the editor guards unsaved work first).
 */
export default function TemplateGallery({
  post, brand, logoSvg, current, subtitle, quickLabel, onQuick, onPick, onClose,
  hidden = [], favorites = [], mine = [], onPickMine, onLibraryChange, notify, onNavigate,
  mode = 'pick', onCreate,
}) {
  const manage = mode === 'manage';
  const fits = (key) => TEMPLATES[key]?.meta.formats.includes(post.format);

  const builtinCard = (key, extra = {}) => {
    const t = TEMPLATES[key];
    return {
      id: `builtin:${key}`, item: { kind: 'builtin', key }, label: t.meta.label,
      ...renderPreview(t, post, brand, logoSvg), on: key === current, hidden: hidden.includes(key),
      pick: manage ? null : () => onPick(key), ...extra,
    };
  };
  const mineCard = (l) => {
    const slide = l.slide ?? l.first;
    return {
      id: `mine:${l.id}`, item: { kind: 'mine', layout: l },
      label: l.slides > 1 ? `${l.name} · ${l.slides}장` : l.name,
      ...renderPreview(TEMPLATES[slide.template], post, brand, logoSvg, slide),
      on: false,
      // Only one-slide templates apply to a single slide; bigger ones start new posts.
      pick: manage || !l.slide ? null : () => onPickMine(l),
    };
  };

  const sections = useMemo(() => {
    const usableMine = mine.filter((l) => (l.slide ?? l.first) && TEMPLATES[(l.slide ?? l.first).template] &&
      (manage || (l.slide && fits(l.slide.template))));
    const builtins = Object.keys(TEMPLATES).filter((key) => fits(key) && (manage || !hidden.includes(key) || key === current));
    const favCards = favorites.flatMap((f) => {
      if (f.startsWith('builtin:')) {
        const key = f.slice(8);
        return builtins.includes(key) ? [builtinCard(key)] : [];
      }
      const l = usableMine.find((x) => `mine:${x.id}` === f);
      return l ? [mineCard(l)] : [];
    });
    return [
      ...(favCards.length ? [{ id: 'fav', title: '즐겨찾는 템플릿', cards: favCards }] : []),
      ...(usableMine.length ? [{ id: 'mine', title: '내 템플릿', cards: usableMine.map(mineCard) }] : []),
      ...ROLE_ORDER.map((role) => ({
        id: role,
        title: ROLE_LABEL[role],
        cards: builtins.filter((k) => TEMPLATES[k].meta.role === role).map((k) => builtinCard(k)),
      })).filter((s) => s.cards.length),
    ];
  }, [post, brand, logoSvg, mine, hidden, favorites, current, manage]); // eslint-disable-line react-hooks/exhaustive-deps

  const [armed, setArmed] = useState(null);
  const [busy, setBusy] = useState(null);
  const call = async (url, init) => {
    const res = await fetch(url, init);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? `요청 실패 (${res.status})`);
    return d;
  };
  const send = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  const copyBuiltin = (key) => call('/api/layouts', send('POST', { builtin: key, brand: post.brand }));
  const copyMine = async (layout) => {
    const { post: lp } = await call(`/api/layouts/${layout.id}`);
    return call('/api/layouts', send('POST', { name: `${layout.name} 복사본`, post: lp }));
  };
  const go = (url) => (onNavigate ? onNavigate(url) : (window.location.href = url));

  const onX = (c) => {
    const { item } = c;
    if (item.kind === 'builtin') {
      const next = c.hidden ? hidden.filter((k) => k !== item.key) : [...hidden, item.key];
      act(c.id, async () => {
        await call('/api/layouts/hidden', send('PUT', { hidden: next }));
        notify?.(c.hidden
          ? `'${c.label}'을 다시 보이게 했어요.`
          : `'${c.label}'을 숨겼어요. 공통 템플릿 관리에서 다시 보이게 할 수 있어요.`);
      });
      return;
    }
    if (armed !== c.id) {
      setArmed(c.id);
      setTimeout(() => setArmed((a) => (a === c.id ? null : a)), 3000);
      return;
    }
    act(c.id, async () => {
      await call(`/api/layouts/${item.layout.id}`, { method: 'DELETE' });
      notify?.(`'${item.layout.name}'을 지웠어요.`);
    });
  };
  // 수정: a built-in can't change, so it is copied into 내 템플릿 first.
  const onEdit = (c) => {
    if (c.item.kind === 'mine') return go(`/templates/${c.item.layout.id}`);
    act(c.id, async () => {
      const { layout } = await copyBuiltin(c.item.key);
      go(`/templates/${layout.id}`);
    });
  };
  const onDuplicate = (c) =>
    act(c.id, async () => {
      const { layout } = c.item.kind === 'mine' ? await copyMine(c.item.layout) : await copyBuiltin(c.item.key);
      notify?.(`'${layout.name}'을 내 템플릿에 만들었어요.`);
    });
  const onStar = (c) =>
    act(c.id, async () => {
      const next = favorites.includes(c.id) ? favorites.filter((f) => f !== c.id) : [...favorites, c.id];
      await call('/api/layouts/favorites', send('PUT', { favorites: next }));
    });

  const body = (
    <div className="tg-body">
      {sections.map((sec) => (
        <section key={sec.id} className="tg-section">
          <h3>{sec.title}</h3>
          {chunk(sec.cards, ROW_MAX).map((row, r) => (
            <TgRow key={r}>
              {row.map((c) => {
                const scale = CARD_W / c.size.width;
                const starred = favorites.includes(c.id);
                return (
                  <div key={`${sec.id}-${c.id}`} className={`tg-card ${c.on ? 'on' : ''} ${c.hidden ? 'is-hidden' : ''}`}>
                    <button
                      className="tg-pick"
                      onClick={c.pick ?? (() => onEdit(c))}
                      aria-label={c.pick ? `${c.label} 고르기` : `${c.label} 수정`}
                      disabled={busy === c.id}
                    >
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
                    <div className="tg-foot">
                      <div className="tg-actions">
                        <button disabled={busy === c.id} onClick={() => onEdit(c)}>수정</button>
                        <button disabled={busy === c.id} onClick={() => onDuplicate(c)}>복제</button>
                        <span className="tg-spacer" />
                        <button
                          className={`tg-icon ${starred ? 'starred' : ''}`}
                          aria-pressed={starred}
                          aria-label={starred ? '즐겨찾기에서 빼기' : '즐겨찾기'}
                          disabled={busy === c.id}
                          onClick={() => onStar(c)}
                        >
                          {starred ? '★' : '☆'}
                        </button>
                        <button
                          className={`tg-icon ${armed === c.id ? 'armed' : ''}`}
                          aria-label={c.item.kind === 'mine' ? '삭제' : c.hidden ? '다시 보이기' : '숨기기'}
                          title={c.item.kind === 'mine' ? (armed === c.id ? '한 번 더 누르면 삭제' : '삭제') : c.hidden ? '다시 보이기' : '숨기기'}
                          disabled={busy === c.id}
                          onClick={() => onX(c)}
                        >
                          {armed === c.id ? '삭제?' : c.hidden ? '↺' : '✕'}
                        </button>
                      </div>
                      <span className="tg-label">
                        {c.label}
                        {c.on && ' · 현재'}
                        {c.hidden && ' · 숨김'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </TgRow>
          ))}
        </section>
      ))}
    </div>
  );

  const head = (
    <div className="tg-head">
      <div className="tg-title">
        <h2>{manage ? 'Templates' : 'Choose Template'}</h2>
        {subtitle && <span className="tg-sub">{subtitle}</span>}
      </div>
      <div className="tg-head-actions">
        {quickLabel && <button onClick={onQuick}>{quickLabel}</button>}
        {manage && onCreate && <button className="primary" onClick={onCreate}>새 템플릿 만들기</button>}
        {onClose && <button onClick={onClose} aria-label="닫기">✕</button>}
      </div>
    </div>
  );

  if (manage) {
    return (
      <div className="tg-manage">
        {head}
        {body}
      </div>
    );
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal tg-modal" onClick={(e) => e.stopPropagation()}>
        {head}
        {body}
      </div>
    </div>
  );
}

/** One sideways-scrolling row: swipe on touch, ‹ › buttons on PC (hidden when it fits). */
function TgRow({ children }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  useEffect(update, [children]);
  const by = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <div className={`tg-row-wrap ${edge.start && edge.end ? 'fits' : ''}`}>
      <button className="tg-arrow left" aria-label="이전" disabled={edge.start} onClick={() => by(-1)}>‹</button>
      <div className="tg-row" ref={ref} onScroll={update}>{children}</div>
      <button className="tg-arrow right" aria-label="다음" disabled={edge.end} onClick={() => by(1)}>›</button>
    </div>
  );
}
