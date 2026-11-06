'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FONT_CHOICES } from '@/lib/templates/fonts.mjs';

/**
 * 내 매거진 스타일 — brand-wide point/highlight colors and fonts, applied to every
 * template at render time (loadBrand merges the overrides). Empty field = brand default.
 * @param {{ data: { brand: string, handle: string, effective: object, overrides: object }[] }} props
 */
export default function BrandStyleSection({ data }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  // drafts[brand] = { point?, highlight?, headline?, body? } — only overridden fields.
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      data.map(({ brand, overrides }) => [
        brand,
        {
          point: overrides.colors?.point,
          highlight: overrides.colors?.highlight,
          headline: overrides.fonts?.headline,
          body: overrides.fonts?.body,
        },
      ]),
    ),
  );

  const set = (brand, key, value) =>
    setDrafts((d) => ({ ...d, [brand]: { ...d[brand], [key]: value } }));

  const save = async (brand) => {
    setBusy(brand);
    setError(null);
    const t = drafts[brand] ?? {};
    try {
      const res = await fetch(`/api/brand-style/${brand}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style: {
            colors: { point: t.point, highlight: t.highlight },
            fonts: { headline: t.headline, body: t.body },
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '저장 실패');
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const overridden = data.filter(({ brand }) => Object.values(drafts[brand] ?? {}).some(Boolean)).length;

  return (
    <section className="series">
      <button className="series-toggle" onClick={() => setOpen(!open)}>
        내 매거진 스타일 {overridden > 0 && `(${overridden})`} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="series-body">
          <p className="note">색과 글꼴을 한 번 정하면 그 계정의 모든 카드에 입혀요. 비워두면 브랜드 기본값.</p>
          {error && <p className="form-error">{error}</p>}
          {data.map(({ brand, handle, effective }) => {
            const t = drafts[brand] ?? {};
            return (
              <div className="series-brand" key={brand}>
                <h3>{handle}</h3>
                <div className="style-grid">
                  {[
                    ['point', '포인트 색'],
                    ['highlight', '형광펜 색'],
                  ].map(([key, label]) => (
                    <label className="style-field" key={key}>
                      <span>{label}</span>
                      <input
                        type="color"
                        value={t[key] ?? effective[key]}
                        onChange={(e) => set(brand, key, e.target.value)}
                      />
                      {t[key] && (
                        <button type="button" className="link" onClick={() => set(brand, key, undefined)}>
                          기본값
                        </button>
                      )}
                    </label>
                  ))}
                  {[
                    ['headline', '제목 글꼴'],
                    ['body', '본문 글꼴'],
                  ].map(([key, label]) => (
                    <label className="style-field" key={key}>
                      <span>{label}</span>
                      <select value={t[key] ?? ''} onChange={(e) => set(brand, key, e.target.value || undefined)}>
                        <option value="">브랜드 기본 ({effective[key]})</option>
                        {FONT_CHOICES.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <button className="primary" disabled={busy === brand} onClick={() => save(brand)}>
                    {busy === brand ? '저장 중…' : '저장'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
