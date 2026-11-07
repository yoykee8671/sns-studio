'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 연재 관리 — per-brand series with auto issue numbers. "다음 호 만들기" clones the
 * latest issue's slide composition into a fresh post and opens the editor.
 * @param {{ data: { brand: string, handle: string, series: object[] }[],
 *           posts: { brand: string, id: string, title: string, series?: object }[] }} props
 */
export default function SeriesSection({ data, posts, embedded = false }) {
  const router = useRouter();
  const [openState, setOpen] = useState(false);
  const open = embedded || openState;
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [titles, setTitles] = useState({}); // per-brand new series title
  const [picks, setPicks] = useState({}); // per-series selected post to attach

  const call = async (brand, body) => {
    setError(null);
    const res = await fetch(`/api/series/${brand}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? '요청 실패');
    return d;
  };

  const create = async (brand) => {
    setBusy(`create-${brand}`);
    try {
      await call(brand, { action: 'create', title: titles[brand] ?? '' });
      setTitles((t) => ({ ...t, [brand]: '' }));
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const attach = async (brand, seriesId) => {
    const pick = picks[seriesId];
    if (!pick) return;
    setBusy(`attach-${seriesId}`);
    try {
      const post = posts.find((p) => p.brand === brand && p.id === pick);
      await call(brand, { action: 'attach', seriesId, postId: pick, title: post?.title });
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const next = async (brand, seriesId) => {
    setBusy(`next-${seriesId}`);
    try {
      const { post } = await call(brand, { action: 'next', seriesId });
      router.push(`/posts/${post.brand}/${post.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  const total = data.reduce((n, b) => n + b.series.length, 0);

  return (
    <section className="series">
      {!embedded && (
      <button className="series-toggle" onClick={() => setOpen(!open)}>
          즐겨찾기 {total > 0 && `(${total})`} {open ? '▴' : '▾'}
        </button>
      )}
      {open && (
        <div className="series-body">
          {error && <p className="form-error">{error}</p>}
          {data.map(({ brand, handle, series }) => (
            <div className="series-brand" key={brand}>
              <h3>{handle}</h3>
              {series.map((s) => {
                const attachable = posts.filter((p) => p.brand === brand && !p.series);
                return (
                  <div className="series-row" key={s.id}>
                    <div className="series-info">
                      <strong>{s.title}</strong>
                      <span className="note">
                        {s.posts.length ? `${s.posts.length}편 · 최근 ${String(s.posts.at(-1).no).padStart(3, '0')}호` : '아직 비어 있어요'}
                      </span>
                    </div>
                    <div className="series-actions">
                      {attachable.length > 0 && (
                        <>
                          <select
                            value={picks[s.id] ?? ''}
                            onChange={(e) => setPicks((p) => ({ ...p, [s.id]: e.target.value }))}
                          >
                            <option value="">기존 게시물 선택…</option>
                            {attachable.map((p) => (
                              <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                          </select>
                          <button
                            disabled={!picks[s.id] || !!busy}
                            onClick={() => attach(brand, s.id)}
                          >
                            {busy === `attach-${s.id}` ? '넣는 중…' : '연재에 넣기'}
                          </button>
                        </>
                      )}
                      <button
                        className="primary"
                        disabled={!!busy || !s.posts.length}
                        title={s.posts.length ? '' : '먼저 게시물을 연재에 넣어주세요'}
                        onClick={() => next(brand, s.id)}
                      >
                        {busy === `next-${s.id}` ? '만드는 중…' : `${String(s.nextNo).padStart(3, '0')}호 만들기`}
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="series-new">
                <input
                  className="text-input"
                  placeholder="새 연재 이름 (예: 주간 꿀팁)"
                  value={titles[brand] ?? ''}
                  onChange={(e) => setTitles((t) => ({ ...t, [brand]: e.target.value }))}
                />
                <button
                  disabled={!(titles[brand] ?? '').trim() || !!busy}
                  onClick={() => create(brand)}
                >
                  {busy === `create-${brand}` ? '만드는 중…' : '새 연재'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
