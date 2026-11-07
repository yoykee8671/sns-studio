'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RATIOS, DEFAULT_RATIO } from '@/lib/templates/sizes.mjs';
import { SETS } from '@/lib/templates/sets.mjs';

// YYMMDD in Korea time, matching the server's folder-name rule (store.newPostId).
const todayCode = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit' })
    .format(new Date()).replaceAll('-', '');

const MODES = [
  ['blank', '빈 게시물'],
  ['set', '추천 조합'],
  ['layout', '내 템플릿'],
  ['link', '인스타 링크'],
  ['manuscript', '원고로 시작'],
];

export default function NewPost({ brands, aiReady = false, layouts = [], embedded = false, onClose, defaultBrand }) {
  const router = useRouter();
  const [openState, setOpen] = useState(false);
  const open = embedded || openState;
  const [mode, setMode] = useState('blank');
  const [brand, setBrand] = useState(defaultBrand ?? brands[0]?.id ?? '');
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [setId, setSetId] = useState(SETS[0].id);
  const [pickedLayout, setLayoutId] = useState(layouts[0]?.id ?? null);
  // The list refreshes without resetting state; a deleted pick falls back to the first.
  const layoutId = layouts.some((l) => l.id === pickedLayout) ? pickedLayout : (layouts[0]?.id ?? null);
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // A manuscript being written can't be lost by closing or reloading the page.
  useEffect(() => {
    if (!text.trim()) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [text]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const endpoint = mode === 'manuscript' ? '/api/manuscript' : mode === 'link' ? '/api/import' : '/api/posts';
      const body =
        mode === 'link'
          ? { brand, url: link }
          : mode === 'layout'
          ? { brand, layout: layoutId }
          : mode === 'set'
            ? { brand, set: setId, ratio }
            : mode === 'manuscript'
              ? { brand, set: setId, text, ratio }
              : { brand, ratio };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const modes = MODES.filter(([m]) => (m !== 'manuscript' || aiReady) && (m !== 'layout' || layouts.length));

  return (
    <form className="new-post" onSubmit={create}>
      <div className="field">
        <label>시작 방식</label>
        <div className="seg">
          {modes.map(([m, label]) => (
            <button type="button" key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
        {mode === 'set' && <p className="note">표지부터 마지막 장까지 템플릿이 짜인 세트로 한 번에 시작해요.</p>}
        {mode === 'layout' && <p className="note">저장해 둔 장 구성과 디자인으로 시작해요. 글과 사진만 채우면 돼요.</p>}
        {mode === 'link' && (
          <p className="note">
            공개 인스타그램 게시물·릴스 링크를 넣으면 영상(사진)을 가져와 원작자 표기가 된 리포스트를 만들어요.
            원작자 허락을 &lsquo;허락 받음&rsquo;으로 바꾸기 전까지 내려받기·발행은 잠겨요.
          </p>
        )}
        {mode === 'manuscript' && <p className="note">긴 글을 붙여넣으면 AI가 세트 구성에 맞춰 장별로 나눠 담아요.</p>}
      </div>
      <div className="field">
        <label>계정</label>
        <select value={brand} onChange={(e) => setBrand(e.target.value)}>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.handle}</option>)}
        </select>
      </div>

      {mode === 'blank' && (
        <p className="note">
          표지 한 장과 계정의 끝장 이미지로 시작해요. 장마다 템플릿을 고르고, 사진·영상을 올리면
          캐러셀/릴스는 자동으로 정해져요.
        </p>
      )}

      {(mode === 'set' || mode === 'manuscript') && (
        <div className="field">
          <label>세트</label>
          <div className="set-list">
            {SETS.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`set-card ${setId === s.id ? 'on' : ''}`}
                onClick={() => setSetId(s.id)}
              >
                <strong>{s.label} <small>{s.slides.length}장</small></strong>
                <span>{s.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'layout' && (
        <div className="field">
          <label>내 템플릿</label>
          <div className="set-list">
            {layouts.map((l) => (
              <button
                type="button"
                key={l.id}
                className={`set-card ${layoutId === l.id ? 'on' : ''}`}
                onClick={() => setLayoutId(l.id)}
              >
                <strong>{l.name} <small>{l.slides}장</small></strong>
                <span>{l.desc || ' '}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'link' && (
        <div className="field">
          <label>인스타그램 링크</label>
          <input
            className="text-input"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.instagram.com/reel/…"
          />
        </div>
      )}

      {mode === 'manuscript' && (
        <div className="field">
          <label>원고</label>
          <textarea
            className="text-input manuscript"
            rows={8}
            maxLength={20000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="여기에 쓴 글을 붙여 넣으세요. 메모, 블로그, 캡션 무엇이든 괜찮아요. (최대 2만 자)"
          />
        </div>
      )}

      {mode !== 'layout' && mode !== 'link' && (
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
      <p className="note">폴더 이름은 자동으로 정해져요: 계정_날짜-번호 (예: {brand}_{todayCode()}-01)</p>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={() => (embedded ? onClose?.() : setOpen(false))}>취소</button>
        <button
          type="submit"
          className="primary"
          disabled={busy || !brand || (mode === 'manuscript' && text.trim().length < 80) || (mode === 'layout' && !layoutId) || (mode === 'link' && !/instagram\.com\//.test(link))}
        >
          {busy
            ? (mode === 'manuscript' ? '원고 나누는 중…' : mode === 'link' ? '가져오는 중… (10~60초)' : '만드는 중…')
            : mode === 'link' ? '가져오기' : '만들기'}
        </button>
      </div>
    </form>
  );
}
