'use client';

import { useMemo } from 'react';
import { TEMPLATES, ROLE_ORDER } from '@/lib/templates/index.mjs';

const ROLE_LABEL = { cover: '표지', any: '어디든', inner: '속지', last: '마지막 장' };
const CARD_W = 190;

// Neutral sample photo so photo templates preview as a design, not a warning box.
const SAMPLE_MEDIA =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#b9c2cd"/><stop offset="1" stop-color="#6d7f8a"/>' +
      '</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>',
  );

/**
 * 템플릿 갤러리 — rendered previews (meta.sample) grouped by role; click to pick.
 * @param {{ post: object, brand: object, logoSvg: string, current?: string,
 *           title: string, quickLabel?: string, onQuick?: () => void,
 *           onPick: (key: string) => void, onClose: () => void }} props
 */
export default function TemplateGallery({ post, brand, logoSvg, current, title, quickLabel, onQuick, onPick, onClose }) {
  const groups = useMemo(() => {
    const entries = Object.entries(TEMPLATES).filter(([, t]) => t.meta.formats.includes(post.format));
    return ROLE_ORDER.map((role) => ({
      role,
      items: entries.filter(([, t]) => t.meta.role === role),
    })).filter((g) => g.items.length);
  }, [post.format]);

  const previews = useMemo(
    () =>
      Object.fromEntries(
        groups.flatMap(({ items }) =>
          items.map(([key, t]) => {
            const slide = { ...t.meta.newSlide(post), ...(t.meta.sample ?? {}) };
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
            return [key, { html, size }];
          }),
        ),
      ),
    [groups, brand, post, logoSvg],
  );

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
          {groups.map(({ role, items }) => (
            <section key={role}>
              <h3>{ROLE_LABEL[role]}</h3>
              <div className="tg-grid">
                {items.map(([key, t]) => {
                  const p = previews[key];
                  const scale = CARD_W / p.size.width;
                  return (
                    <button
                      key={key}
                      className={`tg-card ${key === current ? 'on' : ''}`}
                      onClick={() => onPick(key)}
                    >
                      <span className="tg-frame" style={{ width: CARD_W, height: Math.round(p.size.height * scale) }}>
                        <iframe
                          srcDoc={p.html}
                          title={t.meta.label}
                          tabIndex={-1}
                          loading="lazy"
                          style={{ width: p.size.width, height: p.size.height, transform: `scale(${scale})` }}
                        />
                      </span>
                      <span className="tg-label">
                        {t.meta.label}
                        {key === current && ' · 현재'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
