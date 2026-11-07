'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FONT_CHOICES } from '@/lib/templates/fonts.mjs';

/**
 * 내 매거진 스타일 — brand-wide point/highlight colors and fonts, applied to every
 * template at render time (loadBrand merges the overrides). Empty field = brand default.
 * @param {{ data: { brand: string, handle: string, effective: object, overrides: object }[] }} props
 */
export default function BrandStyleSection({ data, embedded = false }) {
  const router = useRouter();
  const [openState, setOpen] = useState(false);
  const open = embedded || openState;
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
      {!embedded && (
      <button className="series-toggle" onClick={() => setOpen(!open)}>
          계정별 스타일 관리 {overridden > 0 && `(${overridden})`} {open ? '▴' : '▾'}
        </button>
      )}
      {open && (
        <div className="series-body">
          <p className="note">색과 글꼴을 한 번 정하면 그 계정의 모든 카드에 입혀요. 비워두면 브랜드 기본값.</p>
          {error && <p className="form-error">{error}</p>}
          {data.map(({ brand, handle, effective, avatarSrc, igReady }) => {
            const t = drafts[brand] ?? {};
            return (
              <div className="series-brand" key={brand}>
                <h3>{handle}</h3>
                <AvatarRow brand={brand} src={avatarSrc} igReady={igReady} onError={setError} onDone={() => router.refresh()} />
                <div className="style-grid">
                  {[
                    ['point', '포인트 색'],
                    ['highlight', '형광펜 색'],
                  ].map(([key, label]) => (
                    <label className="style-field" key={key}>
                      <span>{label}</span>
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(t[key] ?? effective[key] ?? '') ? (t[key] ?? effective[key]) : '#000000'}
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

/**
 * 프로필 사진 — used by the 팔로우 카드 (and anything else showing the account).
 * Fetched from Instagram when the account has a token, or uploaded by hand.
 */
function AvatarRow({ brand, src, igReady, onError, onDone }) {
  const [busy, setBusy] = useState(null);
  const call = async (key, init) => {
    setBusy(key);
    onError(null);
    try {
      const res = await fetch(`/api/brand-style/${brand}/avatar`, init);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `요청 실패 (${res.status})`);
      onDone();
    } catch (e) {
      onError(`${brand} 프로필 사진: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };
  const upload = (file) => {
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    call('upload', { method: 'POST', body });
  };
  return (
    <div className="avatar-row">
      <span className="avatar-preview">
        {src ? <img src={src} alt={`${brand} 프로필 사진`} /> : <span className="note">없음</span>}
      </span>
      <div className="avatar-info">
        <strong>프로필 사진</strong>
        <span className="note">팔로우 카드의 동그란 사진에 들어가요. 없으면 로고가 나와요.</span>
        <div className="series-actions">
          <button
            disabled={!!busy || !igReady}
            title={igReady ? '' : '이 계정은 Instagram 토큰이 없어서 직접 올려야 해요'}
            onClick={() => call('ig', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source: 'instagram' }),
            })}
          >
            {busy === 'ig' ? '가져오는 중…' : '인스타그램에서 가져오기'}
          </button>
          <label className="upload">
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!busy}
              onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            {busy === 'upload' ? '올리는 중…' : '직접 올리기'}
          </label>
          {src && (
            <button className="btn-plain topbar-danger" disabled={!!busy} onClick={() => call('del', { method: 'DELETE' })}>
              지우기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
