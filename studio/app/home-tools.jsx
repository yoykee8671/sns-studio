'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NewPost from './new-post';
import SeriesSection from './series-section';
import BrandStyleSection from './brand-style-section';
import TemplateGallery from './posts/[brand]/[id]/template-gallery';

/**
 * 홈 상단 도구 줄: 새 게시물 · 시리즈 발행관리 · 공통 템플릿 관리 · 계정별 스타일 관리.
 * One panel opens below the row at a time; pressing the same button closes it. The post
 * list (children) shows with no panel or 새 게시물, and stays out of the other three.
 */
export default function HomeTools({ newPost, series, templates, styles, children }) {
  const router = useRouter();
  const [panel, setPanel] = useState(null);
  // The template editor's back link lands on /#my-templates: reopen that panel.
  useEffect(() => {
    if (window.location.hash === '#my-templates') setPanel('templates');
  }, []);
  const toggle = (id) => setPanel((p) => (p === id ? null : id));
  const tabs = [
    ['series', '시리즈 발행관리'],
    ['templates', '공통 템플릿 관리'],
    ['styles', '계정별 스타일 관리'],
  ];
  return (
    <>
      <div className="home-tools">
        <button className={`primary ${panel === 'new' ? 'on' : ''}`} onClick={() => toggle('new')} aria-expanded={panel === 'new'}>
          + 새 게시물
        </button>
        {tabs.map(([id, label]) => (
          <button key={id} className={`tool-dark ${panel === id ? 'on' : ''}`} onClick={() => toggle(id)} aria-expanded={panel === id}>
            {label}
          </button>
        ))}
      </div>
      {panel === 'new' && <NewPost {...newPost} embedded onClose={() => setPanel(null)} />}
      {panel === 'series' && <SeriesSection {...series} embedded />}
      {panel === 'templates' && <TemplatesManager {...templates} onOpen={(url) => router.push(url)} />}
      {panel === 'styles' && <BrandStyleSection {...styles} embedded />}
      {(panel === null || panel === 'new') && children}
    </>
  );
}

/** 공통 템플릿 관리 — the same window as the editor's template picker, in manage mode. */
function TemplatesManager({ brand, logoSvg, onOpen }) {
  const [library, setLibrary] = useState(null);
  const [toast, setToast] = useState(null);
  const load = useCallback(() => {
    fetch('/api/layouts')
      .then((r) => r.json())
      .then((d) => setLibrary({ layouts: d.layouts ?? [], hidden: d.hidden ?? [], favorites: d.favorites ?? [] }))
      .catch(() => setLibrary({ layouts: [], hidden: [], favorites: [] }));
  }, []);
  useEffect(load, [load]);
  const notify = (text, kind = 'info') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 3500);
  };
  const create = async () => {
    const res = await fetch('/api/layouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ builtin: 'editorial-photo', brand: brand.id, name: '새 템플릿' }),
    });
    const d = await res.json();
    if (!res.ok) return notify(d.error ?? '만들지 못했어요.', 'error');
    onOpen(`/templates/${d.layout.id}`);
  };
  if (!library) return <p className="note">불러오는 중…</p>;
  return (
    <>
      <TemplateGallery
        mode="manage"
        post={{ brand: brand.id, format: 'carousel', ratio: '3:4', template: 'editorial-photo', slides: [] }}
        brand={brand}
        logoSvg={logoSvg}
        hidden={library.hidden}
        favorites={library.favorites}
        mine={library.layouts}
        onLibraryChange={load}
        notify={notify}
        onNavigate={onOpen}
        onCreate={create}
      />
      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
    </>
  );
}
