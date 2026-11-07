'use client';

import { useEffect, useState } from 'react';
import NewPost from './new-post';
import SeriesSection from './series-section';
import TemplatesSection from './templates-section';
import BrandStyleSection from './brand-style-section';

/**
 * 홈 상단 도구 줄: 새 게시물 · 즐겨찾기 · 공통 템플릿 관리 · 계정별 스타일 관리.
 * One panel opens below the row at a time; pressing the same button closes it.
 */
export default function HomeTools({ newPost, series, templates, styles }) {
  const [panel, setPanel] = useState(null);
  // The template editor's back link lands on /#my-templates: reopen that panel.
  useEffect(() => {
    if (window.location.hash === '#my-templates') setPanel('templates');
  }, []);
  const toggle = (id) => setPanel((p) => (p === id ? null : id));
  const tabs = [
    ['series', '즐겨찾기'],
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
      {panel === 'templates' && <TemplatesSection {...templates} embedded />}
      {panel === 'styles' && <BrandStyleSection {...styles} embedded />}
    </>
  );
}
