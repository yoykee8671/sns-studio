'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RATIOS, DEFAULT_RATIO } from '@/lib/templates/sizes.mjs';

const TYPES = [
  { template: 'curation-frame', label: '디깅형', hint: '남의 좋은 콘텐츠 + 우리 코멘트', formats: ['carousel', 'single', 'reel'] },
  { template: 'editorial-photo', label: '지식형', hint: '사진 풀블리드 + 정보', formats: ['carousel', 'single'] },
];
const FORMAT_LABEL = { carousel: '캐러셀', single: '단일 피드', reel: '릴스' };

export default function NewPost({ brands }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState(brands[0]?.id ?? '');
  const [type, setType] = useState(TYPES[0]);
  const [format, setFormat] = useState('carousel');
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [slug, setSlug] = useState('');
  const [url, setUrl] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          template: type.template,
          format,
          ratio: format === 'reel' ? undefined : ratio,
          slug: slug || handle || 'post',
          source: type.template === 'curation-frame' ? { url, handle: handle.replace(/^@/, '') } : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      router.push(`/posts/${d.post.brand}/${d.post.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="primary new-btn" onClick={() => setOpen(true)}>
        + 새 게시물
      </button>
    );
  }

  return (
    <form className="new-post" onSubmit={create}>
      <div className="field">
        <label>계정</label>
        <select value={brand} onChange={(e) => setBrand(e.target.value)}>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.handle}</option>)}
        </select>
      </div>
      <div className="field">
        <label>콘텐츠 타입</label>
        <div className="seg">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.template}
              className={type.template === t.template ? 'on' : ''}
              onClick={() => {
                setType(t);
                if (!t.formats.includes(format)) setFormat('carousel');
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="note">{type.hint}</p>
      </div>
      <div className="field">
        <label>형식</label>
        <div className="seg">
          {type.formats.map((f) => (
            <button type="button" key={f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
      </div>
      {format !== 'reel' && (
        <div className="field">
          <label>사이즈</label>
          <div className="seg">
            {RATIOS.map((r) => (
              <button type="button" key={r.key} className={ratio === r.key ? 'on' : ''} onClick={() => setRatio(r.key)}>
                {r.key}
              </button>
            ))}
          </div>
          <p className="note">
            {RATIOS.filter((r) => r.key === ratio).map((r) => `${r.width}×${r.height} · ${r.hint}`)}
          </p>
        </div>
      )}
      {type.template === 'curation-frame' && (
        <>
          <div className="field">
            <label>원본 링크</label>
            <input className="text-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/p/…" />
          </div>
          <div className="field">
            <label>원작자 계정</label>
            <input className="text-input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@mi_mi_vintage" />
          </div>
        </>
      )}
      <div className="field">
        <label>폴더 이름 <small>(영문, 비우면 자동)</small></label>
        <input className="text-input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="halloween-foods" />
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={() => setOpen(false)}>취소</button>
        <button type="submit" className="primary" disabled={busy || !brand}>{busy ? '만드는 중…' : '만들기'}</button>
      </div>
    </form>
  );
}
