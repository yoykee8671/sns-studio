'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const ROLE_LABEL = { cover: '표지', any: '어디든', inner: '속지', last: '마지막 장' };

/**
 * 템플릿 관리 — 내 템플릿 (rename / edit / delete) and the built-in templates
 * (hide from the pickers, or copy into 내 템플릿 to customize).
 * @param {{ layouts: object[], hidden: string[], builtins: {key: string, label: string, role: string}[],
 *           previewBrand: string }} props
 */
export default function TemplatesSection({ layouts, hidden, builtins, previewBrand }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [names, setNames] = useState({}); // id -> name being edited
  const [armed, setArmed] = useState(null); // id armed for delete

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };
  const json = async (res) => {
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? `요청 실패 (${res.status})`);
    return d;
  };

  const rename = (id) =>
    run(`rename-${id}`, async () => {
      await json(await fetch(`/api/layouts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: names[id] }),
      }));
      setNames(({ [id]: _, ...rest }) => rest);
      router.refresh();
    });

  const remove = (id) => {
    if (armed !== id) {
      setArmed(id);
      setTimeout(() => setArmed((a) => (a === id ? null : a)), 3500);
      return;
    }
    run(`delete-${id}`, async () => {
      await json(await fetch(`/api/layouts/${id}`, { method: 'DELETE' }));
      setArmed(null);
      router.refresh();
    });
  };

  const toggleHidden = (key) =>
    run(`hide-${key}`, async () => {
      const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
      await json(await fetch('/api/layouts/hidden', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: next }),
      }));
      router.refresh();
    });

  const copy = (key) =>
    run(`copy-${key}`, async () => {
      const { layout } = await json(await fetch('/api/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ builtin: key, brand: previewBrand }),
      }));
      router.push(`/templates/${layout.id}`);
    });

  return (
    <section className="series" id="my-templates">
      <button className="series-toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} 템플릿 관리 <small>내 템플릿 {layouts.length}개 · 숨긴 기본 템플릿 {hidden.length}개</small>
      </button>
      {open && (
        <div className="series-body">
          {error && <p className="form-error">{error}</p>}

          <div className="series-brand">
            <strong>내 템플릿</strong>
            {layouts.length === 0 && (
              <p className="note">
                아직 없어요. 에디터의 &lsquo;템플릿으로 저장&rsquo;이나 아래 기본 템플릿의
                &lsquo;복사해서 수정&rsquo;으로 만들 수 있어요.
              </p>
            )}
            {layouts.map((l) => (
              <div className="series-row" key={l.id}>
                <div className="series-info">
                  {names[l.id] !== undefined ? (
                    <input
                      className="text-input"
                      value={names[l.id]}
                      maxLength={40}
                      autoFocus
                      onChange={(e) => setNames((n) => ({ ...n, [l.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && names[l.id].trim() && rename(l.id)}
                    />
                  ) : (
                    <strong>{l.name}</strong>
                  )}
                  <span className="note">
                    {l.slides}장{l.desc ? ` · ${l.desc}` : ''}
                  </span>
                </div>
                <div className="series-actions">
                  {names[l.id] !== undefined ? (
                    <>
                      <button onClick={() => rename(l.id)} disabled={!!busy || !names[l.id].trim()}>저장</button>
                      <button onClick={() => setNames(({ [l.id]: _, ...rest }) => rest)}>취소</button>
                    </>
                  ) : (
                    <button onClick={() => setNames((n) => ({ ...n, [l.id]: l.name }))}>이름 바꾸기</button>
                  )}
                  <Link className="button-link" href={`/templates/${l.id}`}>수정</Link>
                  <button className={armed === l.id ? 'modal-danger' : 'topbar-danger'} onClick={() => remove(l.id)} disabled={!!busy}>
                    {armed === l.id ? '한 번 더 누르면 삭제' : '삭제'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="series-brand">
            <strong>기본 템플릿</strong>
            <p className="note">
              숨기면 템플릿 고르기 목록에서 빠져요(언제든 다시 보이기 가능). 기본 템플릿 자체는
              바꿀 수 없어서, 고치고 싶으면 &lsquo;복사해서 수정&rsquo;으로 내 템플릿을 만들어요.
            </p>
            {builtins.map((b) => {
              const isHidden = hidden.includes(b.key);
              return (
                <div className={`series-row ${isHidden ? 'muted' : ''}`} key={b.key}>
                  <div className="series-info">
                    <strong>{b.label}</strong>
                    <span className="note">{ROLE_LABEL[b.role] ?? b.role}{isHidden ? ' · 숨김' : ''}</span>
                  </div>
                  <div className="series-actions">
                    <button onClick={() => toggleHidden(b.key)} disabled={!!busy}>
                      {isHidden ? '다시 보이기' : '숨기기'}
                    </button>
                    <button onClick={() => copy(b.key)} disabled={!!busy}>
                      {busy === `copy-${b.key}` ? '복사 중…' : '복사해서 수정'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
