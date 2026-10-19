'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getTemplate } from '@/lib/templates/index.mjs';
import { RATIOS } from '@/lib/templates/sizes.mjs';
import { STICKER_TYPES, createSticker, resolveColor } from '@/lib/stickers.mjs';

const CAPTION_LIMIT = 2200;
const HASHTAG_LIMIT = 30;
const THUMB_W = 84;
const PRESET_KEY = 'sns-studio-sticker-presets';
const STATUS = { draft: '작성 중', approved: '승인', published: '발행됨' };
const FORMAT_LABEL = { carousel: '캐러셀', single: '단일 피드', reel: '릴스' };
const PERMISSION = [
  ['none', '요청 전'],
  ['requested', '요청함'],
  ['granted', '허락 받음'],
  ['denied', '거절'],
];
const IMAGE_STATE = {
  ok: ['고정됨', 'ok'],
  unpinned: ['고정 안 됨', 'warn'],
  changed: ['파일이 바뀌었어요', 'error'],
  missing: ['파일 없음', 'error'],
};

const assetUrl = (brandId, rel) =>
  `/api/assets/${brandId}/${rel.split('/').map(encodeURIComponent).join('/')}`;

const isVideoPath = (rel) => /\.(mp4|mov|m4v|webm)$/i.test(rel ?? '');

function mediaOf(brandId, postId, slide) {
  if (slide.media) {
    return {
      src: `/api/posts/${brandId}/${postId}/${slide.media.split('/').map(encodeURIComponent).join('/')}`,
      type: slide.mediaType ?? (isVideoPath(slide.media) ? 'video' : 'image'),
    };
  }
  if (slide.image) return { src: assetUrl(brandId, slide.image), type: 'image' };
  return { src: null, type: null };
}

const dmTemplate = (handle, brandHandle) =>
  `안녕하세요, @${handle || '계정'}님! 반려견 큐레이션 계정 ${brandHandle}입니다 🐶\n` +
  `올려주신 게시물이 너무 좋아서, 저희 계정에서 출처(@${handle || '계정'})를 표기해 소개하고 싶어 연락드렸어요.\n` +
  `괜찮으시다면 원본 파일을 DM으로 보내주실 수 있을까요?\n` +
  `원치 않으시면 언제든 편하게 말씀해 주세요. 감사합니다!`;

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// A crashed/restarting server answers with a gateway error page, not JSON.
async function errorOf(res) {
  try {
    return (await res.json()).error;
  } catch {
    return res.status >= 502
      ? '서버가 작업 중에 재시작됐어요 (메모리 부족일 수 있음). 잠시 후 다시 시도하거나, 영상·장수가 많은 내보내기는 PC에서 해주세요.'
      : `서버 오류 (${res.status})`;
  }
}

async function downloadBlob(res, fallbackName) {
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const loadPresets = () => {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]');
  } catch {
    return [];
  }
};

export default function Editor({ brandId, postId }) {
  const [ctx, setCtx] = useState(null); // { brand, logoSvg, publish, closing }
  const [post, setPost] = useState(null);
  const [images, setImages] = useState([]);
  const [sel, setSel] = useState(0);
  const [reports, setReports] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('slide');
  const [format, setFormat] = useState('png');
  const [loadError, setLoadError] = useState(null);

  const mainFrame = useRef(null);
  const thumbFrames = useRef([]);
  const selRef = useRef(sel);
  selRef.current = sel;

  const apiBase = `/api/posts/${brandId}/${postId}`;

  useEffect(() => {
    fetch(apiBase)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setCtx({ brand: d.brand, logoSvg: d.logoSvg, publish: d.publish, closing: d.closing });
        setPost(d.post);
        setImages(d.images);
        if (d.post.contentType === 'curation' && !d.post.source?.handle) setTab('source');
      })
      .catch((e) => setLoadError(e.message));
  }, [apiBase]);

  const toastTimer = useRef(null);
  const notify = useCallback((text, kind = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ text, kind });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const update = useCallback((fn) => {
    setPost((p) => {
      const next = structuredClone(p);
      fn(next);
      return next;
    });
    setDirty(true);
  }, []);
  const updateSlide = (i, patch) =>
    update((p) => {
      Object.assign(p.slides[i], patch);
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete p.slides[i][k];
    });

  // Reports, sticker drags/resizes and photo pans come from the slide iframes.
  useEffect(() => {
    const onMessage = (e) => {
      const { data } = e;
      if (data?.type === 'slide-report') {
        let index = null;
        if (e.source === mainFrame.current?.contentWindow) index = selRef.current;
        thumbFrames.current.forEach((f, i) => {
          if (f && e.source === f.contentWindow) index = i;
        });
        if (index !== null) setReports((r) => ({ ...r, [index]: data.report }));
      }
      if (e.source !== mainFrame.current?.contentWindow) return;
      if (data?.type === 'sticker-move') {
        update((p) => {
          const st = p.slides[selRef.current].stickers.find((s) => s.id === data.id);
          if (st) Object.assign(st, { x: Math.round(data.x), y: Math.round(data.y) });
        });
      }
      if (data?.type === 'sticker-resize') {
        update((p) => {
          const st = p.slides[selRef.current].stickers.find((s) => s.id === data.id);
          if (!st) return;
          if (data.fontSize) st.fontSize = data.fontSize;
          if (data.w) st.w = data.w;
        });
      }
      if (data?.type === 'media-pan') {
        update((p) => {
          p.slides[selRef.current].focus = `${data.x}% ${data.y}%`;
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [update]);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const debounced = useDebounced(post, 180);
  const template = useMemo(() => (post ? getTemplate(post.template) : null), [post?.template]);
  const size = template && post ? template.meta.sizeFor(post) : { width: 1080, height: 1350 };
  const closingUrl = ctx?.closing && post?.format === 'carousel' ? assetUrl(brandId, ctx.closing) : null;
  const slideHtml = useCallback(
    (p, i, mode) => {
      const { src, type } = mediaOf(brandId, postId, p.slides[i]);
      return template.renderSlide({
        brand: ctx.brand,
        post: p,
        slide: p.slides[i],
        index: i,
        mediaSrc: src,
        mediaType: type,
        logoSvg: ctx.logoSvg,
        mode,
      });
    },
    [template, ctx, brandId, postId],
  );
  const onClosing = post && closingUrl && sel >= post.slides.length;
  const mainHtml = useMemo(
    () =>
      debounced && ctx && !onClosing
        ? slideHtml(debounced, Math.min(sel, debounced.slides.length - 1), 'preview')
        : '',
    [debounced, ctx, sel, slideHtml, onClosing],
  );
  const thumbHtml = useMemo(
    () => (debounced && ctx ? debounced.slides.map((_, i) => slideHtml(debounced, i, 'export')) : []),
    [debounced, ctx, slideHtml],
  );

  // Fit the canvas into the center column.
  const stageRef = useRef(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    if (!stageRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min((width - 32) / size.width, (height - 48) / size.height));
    });
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [post !== null, size.width, size.height]);

  const save = useCallback(async () => {
    setBusy('save');
    try {
      const res = await fetch(apiBase, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setPost(d.post);
      setImages(d.images);
      setDirty(false);
      notify('임시 저장했어요.');
    } catch (e) {
      notify(`저장 실패: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  }, [apiBase, post, notify]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const exportAs = async (fmt) => {
    setBusy(fmt);
    try {
      const res = await fetch(`${apiBase}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post, format: fmt }),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      await downloadBlob(res, 'export.zip');
      if (fmt === 'svg') setModal({ kind: 'figma' });
      else notify(`${post.slides.length}장${closingUrl ? ' + 끝장' : ''}과 캡션을 내려받았어요.`);
    } catch (e) {
      notify(`내보내기 실패: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const exportOne = async (i) => {
    setBusy('one');
    try {
      const res = await fetch(`${apiBase}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post, format, only: i }),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      await downloadBlob(res, `${postId}_${i + 1}.${format}`);
      notify(`${i + 1}장만 내려받았어요.`);
    } catch (e) {
      notify(`내보내기 실패: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const doPublish = async () => {
    setModal(null);
    setBusy('publish');
    try {
      const res = await fetch(`${apiBase}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setPost(d.post);
      setDirty(false);
      setModal({ kind: 'published', permalink: d.permalink });
    } catch (e) {
      notify(`발행 실패: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy('upload');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${apiBase}/media`, { method: 'POST', body });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      updateSlide(sel, { ...d, image: undefined });
      setImages((im) => im.map((s, i) => (i === sel ? { state: 'ok', sha: d.imageSha256 } : s)));
      notify(`${d.mediaType === 'video' ? '영상' : '사진'}을 올렸어요.`);
    } catch (e) {
      notify(`업로드 실패: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const maxSlides = closingUrl ? 9 : 10; // Instagram carousels take 10 items incl. the closing slide
  const addSlide = () => {
    update((p) => p.slides.push(template.meta.newSlide(p)));
    setImages((im) => [...im, { state: 'missing' }]);
    setSel(post.slides.length);
  };
  const removeSlide = (i) => {
    if (post.slides.length === 1) return;
    update((p) => p.slides.splice(i, 1));
    setImages((im) => im.filter((_, k) => k !== i));
    setReports({});
    setSel(Math.max(0, i - 1));
  };
  const moveSlide = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= post.slides.length) return;
    update((p) => ([p.slides[i], p.slides[j]] = [p.slides[j], p.slides[i]]));
    setImages((im) => {
      const n = [...im];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    setReports({});
    setSel(j);
  };

  if (loadError) return <main className="center-msg">불러오지 못했어요: {loadError}</main>;
  if (!post || !ctx) return <main className="center-msg">불러오는 중…</main>;

  const { meta } = template;
  const slide = onClosing ? null : post.slides[Math.min(sel, post.slides.length - 1)];
  const report = reports[sel];
  const allIssues = Object.entries(reports).flatMap(([i, r]) => r.issues.map((t) => `${+i + 1}장: ${t}`));
  const hashtags = post.hashtags ?? [];
  const isCuration = post.contentType === 'curation';
  const blocked = isCuration && post.source?.permission !== 'granted';
  const thumbScale = THUMB_W / size.width;
  const title = post.slides[0].headline?.replace(/\n/g, ' ') || post.source?.handle && `@${post.source.handle} 소개` || post.id;

  return (
    <div className="editor">
      <header className="topbar">
        <div className="topbar-left">
          <Link href="/" className="back">←</Link>
          <div>
            <div className="crumb">@{brandId} · {meta.label} · {FORMAT_LABEL[post.format] ?? post.format}</div>
            <div className="title">
              {title}
              <span className={`badge badge-${post.status}`}>{STATUS[post.status] ?? post.status}</span>
              {dirty && <span className="dirty">저장 안 됨</span>}
            </div>
          </div>
        </div>
        <div className="actions">
          <button onClick={save} disabled={!!busy}>
            {busy === 'save' ? '저장 중…' : '임시 저장'}
          </button>
          <div className="split">
            <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="이미지 형식">
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
            <button onClick={() => exportAs(format)} disabled={!!busy || blocked} title={blocked ? '원작자 허락 후 가능해요' : ''}>
              {busy === format ? '만드는 중…' : '내려받기'}
            </button>
          </div>
          <button onClick={() => exportAs('svg')} disabled={!!busy || blocked}>
            {busy === 'svg' ? '만드는 중…' : 'Figma로 수정하기'}
          </button>
          <button
            className="primary"
            disabled={!!busy || blocked || post.status === 'published'}
            onClick={() => setModal({ kind: ctx.publish.ready ? 'confirm' : 'setup' })}
          >
            {busy === 'publish' ? '발행 중…' : post.status === 'published' ? '발행 완료' : '이대로 발행하기'}
          </button>
        </div>
      </header>

      {blocked && (
        <div className="banner">
          원작자 허락 전이라 내려받기·발행이 잠겨 있어요. <button className="link" onClick={() => setTab('source')}>소재·출처 탭</button>에서 허락 상태를 바꿔주세요.
        </div>
      )}

      <div className={`workspace ${blocked ? 'with-banner' : ''}`}>
        <nav className="thumbs">
          {post.slides.map((s, i) => (
            <button
              key={i}
              className={`thumb ${i === sel ? 'active' : ''}`}
              onClick={() => setSel(i)}
              aria-label={`${i + 1}장`}
            >
              <div className="thumb-frame" style={{ width: THUMB_W, height: size.height * thumbScale }}>
                <iframe
                  ref={(el) => (thumbFrames.current[i] = el)}
                  srcDoc={thumbHtml[i]}
                  title={`${i + 1}장 미리보기`}
                  tabIndex={-1}
                  style={{ width: size.width, height: size.height, transform: `scale(${thumbScale})` }}
                />
              </div>
              <span className="thumb-num">
                {i + 1}
                {mediaOf(brandId, postId, s).type === 'video' && ' ▶'}
                {reports[i]?.issues.length > 0 && <span className="dot" title="QA 경고" />}
              </span>
            </button>
          ))}
          {closingUrl && (
            <button
              className={`thumb ${onClosing ? 'active' : ''}`}
              onClick={() => setSel(post.slides.length)}
              aria-label="끝장"
            >
              <div className="thumb-frame" style={{ width: THUMB_W, height: size.height * thumbScale }}>
                <img className="thumb-closing" src={closingUrl} alt="끝장" />
              </div>
              <span className="thumb-num">끝</span>
            </button>
          )}
          {post.format !== 'reel' && post.format !== 'single' && post.slides.length < maxSlides && (
            <button className="add-slide" onClick={addSlide}>+ 장 추가</button>
          )}
        </nav>

        <section className="stage" ref={stageRef}>
          <div className="stage-frame" style={{ width: size.width * scale, height: size.height * scale }}>
            {onClosing ? (
              <img src={closingUrl} alt="끝장" style={{ width: size.width * scale, height: size.height * scale, objectFit: 'cover', display: 'block' }} />
            ) : (
              <iframe
                ref={mainFrame}
                srcDoc={mainHtml}
                title="슬라이드 미리보기"
                style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}
              />
            )}
          </div>
          <p className="stage-hint">
            {onClosing
              ? `끝장 (자동) · ${post.slides.length + 1} / ${post.slides.length + 1}`
              : `${sel + 1} / ${post.slides.length}${closingUrl ? '+끝' : ''} · 스티커는 드래그로 이동, 모서리 핸들로 크기 조절 · 사진은 드래그로 위치 조정`}
          </p>
          {post.format !== 'reel' && (
            <div className="stage-size">
              <div className="seg tight">
                {RATIOS.map((r) => (
                  <button
                    key={r.key}
                    className={size.width === r.width && size.height === r.height ? 'on' : ''}
                    onClick={() => update((p) => (p.ratio = r.key))}
                    title={r.hint}
                  >
                    {r.key}
                  </button>
                ))}
              </div>
              <span className="note">{size.width}×{size.height}</span>
            </div>
          )}
        </section>

        <aside className="panel">
          <div className="tabs">
            <button className={tab === 'slide' ? 'on' : ''} onClick={() => setTab('slide')}>
              {onClosing ? '끝장' : `${sel + 1}장 편집`}
            </button>
            {isCuration && (
              <button className={tab === 'source' ? 'on' : ''} onClick={() => setTab('source')}>
                소재·출처
              </button>
            )}
            <button className={tab === 'caption' ? 'on' : ''} onClick={() => setTab('caption')}>
              캡션
            </button>
          </div>

          {tab === 'slide' && onClosing && (
            <div className="panel-body">
              <p className="note">
                맨 끝장은 자동으로 붙는 고정 이미지예요. 텍스트·그라데이션 없이 이미지 그대로 나가요.
              </p>
              <p className="note">
                이미지를 바꾸려면 <code>@{brandId}/closing/</code> 폴더 안의 파일을 교체하면 돼요.
              </p>
            </div>
          )}

          {tab === 'slide' && !onClosing && (
            <div className="panel-body">
              <div className="slide-tools">
                <button onClick={() => moveSlide(sel, -1)} disabled={sel === 0}>↑</button>
                <button onClick={() => moveSlide(sel, 1)} disabled={sel === post.slides.length - 1}>↓</button>
                <button onClick={() => exportOne(sel)} disabled={!!busy || blocked}>
                  {busy === 'one' ? '만드는 중…' : `이 장만 ${format.toUpperCase()} 받기`}
                </button>
                <button className="danger" onClick={() => removeSlide(sel)} disabled={post.slides.length === 1}>이 장 삭제</button>
              </div>

              <MediaRow
                slide={slide}
                status={images[sel]}
                accept={meta.mediaTypes.includes('video') ? 'image/*,video/*' : 'image/*'}
                busy={busy === 'upload'}
                onUpload={upload}
                onPin={() => updateSlide(sel, { imageSha256: images[sel].sha })}
                onZoom={(z) => updateSlide(sel, { zoom: z === 1 ? undefined : z })}
              />

              {meta.fields.map((f) => (
                <LinesField
                  key={f.key}
                  label={f.label}
                  prefix={f.prefix}
                  hint={f.hint}
                  focusDefault={f.focusDefault}
                  value={slide[f.key] ?? ''}
                  field={report?.fields[f.key]}
                  onChange={(v) => updateSlide(sel, { [f.key]: v })}
                />
              ))}

              {(meta.sliders ?? []).map((s) => (
                <div className="field" key={s.key}>
                  <label>
                    {s.label}
                    <span className="meter">{slide[s.key] ?? s.default}{s.unit}</span>
                  </label>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={slide[s.key] ?? s.default}
                    onChange={(e) =>
                      updateSlide(sel, { [s.key]: +e.target.value === s.default ? undefined : +e.target.value })
                    }
                  />
                </div>
              ))}

              {meta.options
                .filter((o) => !o.coverOnly || sel === 0)
                .map((o) => (
                  <div className="field" key={o.key}>
                    <label>{o.label}</label>
                    <div className="seg">
                      {o.choices.map(([v, label]) => (
                        <button
                          key={label}
                          className={slide[o.key] === v ? 'on' : ''}
                          onClick={() => updateSlide(sel, { [o.key]: v })}
                        >
                          {v === undefined && o.autoLabel ? `${label} (${o.autoLabel(report)})` : label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

              <StickerPanel
                stickers={slide.stickers ?? []}
                brand={ctx.brand}
                notify={notify}
                onChange={(stickers) => updateSlide(sel, { stickers })}
                onCopyToAll={(st) => {
                  update((p) =>
                    p.slides.forEach((s, i) => {
                      if (i === sel) return;
                      (s.stickers ??= []).push({
                        ...structuredClone(st),
                        id: `${st.type}-${Math.random().toString(36).slice(2, 8)}`,
                      });
                    }),
                  );
                  notify('다른 모든 장에 같은 설정으로 붙였어요.');
                }}
              />

              {report?.issues.length > 0 && (
                <div className="issues">
                  <strong>QA 경고</strong>
                  <ul>{report.issues.map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {tab === 'source' && isCuration && (
            <SourcePanel
              post={post}
              brandHandle={ctx.brand.handle}
              formats={meta.formats}
              onSource={(patch) => update((p) => Object.assign((p.source ??= {}), patch))}
              onFormat={(f) => {
                update((p) => {
                  p.format = f;
                  if (f !== 'carousel') p.slides = p.slides.slice(0, 1);
                });
                if (f !== 'carousel') {
                  setImages((im) => im.slice(0, 1));
                  setReports({});
                  setSel(0);
                }
              }}
              onApplyCredit={() =>
                update((p) => p.slides.forEach((s) => (s.credit = `📷 @${p.source.handle}`)))
              }
              notify={notify}
            />
          )}

          {tab === 'caption' && (
            <div className="panel-body">
              <div className="field">
                <label>
                  캡션
                  <span className={`meter ${post.caption.length > CAPTION_LIMIT ? 'over' : ''}`}>
                    {post.caption.length} / {CAPTION_LIMIT}
                  </span>
                </label>
                <textarea
                  className="caption"
                  value={post.caption}
                  onChange={(e) => update((p) => (p.caption = e.target.value))}
                />
              </div>
              <div className="field">
                <label>
                  해시태그 <small>(띄어쓰기로 구분)</small>
                  <span className={`meter ${hashtags.length > HASHTAG_LIMIT ? 'over' : ''}`}>
                    {hashtags.length} / {HASHTAG_LIMIT}
                  </span>
                </label>
                <HashtagInput value={hashtags} onChange={(tags) => update((p) => (p.hashtags = tags))} />
              </div>
            </div>
          )}
        </aside>
      </div>

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}

      {modal && (
        <div className="modal-back" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {modal.kind === 'figma' && (
              <>
                <h2>Figma에서 수정하기</h2>
                <ol>
                  <li>내려받은 zip을 풀어주세요. 장마다 SVG 파일이 하나씩 있어요.</li>
                  <li>Figma 파일을 열고 SVG 파일을 캔버스로 드래그하세요.</li>
                  <li>사진, 배경, 로고, 텍스트, 스티커가 각각 레이어로 들어와요. 텍스트는 바로 수정할 수 있어요.</li>
                </ol>
                <p className="note">영상 장은 첫 프레임 이미지로 들어가요. Pretendard·Freesentation 폰트가 Figma에 설치돼 있어야 글꼴이 그대로 보여요.</p>
                <div className="modal-actions"><button onClick={() => setModal(null)}>확인</button></div>
              </>
            )}
            {modal.kind === 'setup' && (
              <>
                <h2>발행 설정이 필요해요</h2>
                <p>
                  Instagram 바로 발행은 Meta Graph API를 써요. <code>studio/.env.local</code> 파일에 아래 값을
                  넣고 <code>npm run dev</code>를 다시 켜면 버튼이 활성화돼요.
                </p>
                <ul className="missing">
                  {ctx.publish.missing.map((m) => (
                    <li key={m.key}><code>{m.key}</code> — {m.label}</li>
                  ))}
                </ul>
                <details className="setup-guide">
                  <summary>값을 구하는 방법 (자세히)</summary>
                  <ol>
                    <li><b>준비</b>: 인스타그램 계정을 <b>프로페셔널(비즈니스)</b>로 전환하고 Facebook 페이지와 연결해요.</li>
                    <li><b>앱 만들기</b>: <a href="https://developers.facebook.com" target="_blank" rel="noreferrer">developers.facebook.com</a> → 앱 만들기(비즈니스) → 제품에서 <b>Instagram Graph API</b> 추가.</li>
                    <li><b>토큰(IG_ACCESS_TOKEN)</b>: 도구 → 그래프 API 탐색기에서 권한
                      <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>pages_show_list</code>를
                      체크하고 토큰 발급 → 액세스 토큰 디버거에서 <b>장기 토큰(60일)</b>으로 연장해요.</li>
                    <li><b>계정 ID(IG_USER_ID)</b>: 탐색기에서 <code>me/accounts</code> 호출 → 페이지 ID 확인 →
                      <code>{'{페이지ID}?fields=instagram_business_account'}</code> 호출하면 나오는 숫자 ID예요.</li>
                    <li><b>BLOB_READ_WRITE_TOKEN</b>: <a href="https://vercel.com" target="_blank" rel="noreferrer">Vercel</a> 대시보드 → Storage → Blob 생성 →
                      <code>.env.local</code>용 토큰 복사. (Instagram이 이미지를 공개 URL에서 가져가기 때문에 필요해요.)</li>
                  </ol>
                </details>
                <p className="note">설정 전까지는 &lsquo;내려받기&rsquo;로 받아서 Meta Business Suite에 올려주세요.</p>
                <div className="modal-actions"><button onClick={() => setModal(null)}>닫기</button></div>
              </>
            )}
            {modal.kind === 'confirm' && (
              <>
                <h2>@{brandId}에 바로 발행할까요?</h2>
                <p>
                  {FORMAT_LABEL[post.format]} {post.slides.length}장{closingUrl ? ' + 끝장' : ''}과 캡션이
                  지금 상태 그대로 올라가요. 발행 후에는 이 앱에서 되돌릴 수 없어요.
                </p>
                {allIssues.length > 0 && (
                  <div className="issues">
                    <strong>QA 경고 {allIssues.length}개</strong>
                    <ul>{allIssues.map((t) => <li key={t}>{t}</li>)}</ul>
                  </div>
                )}
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>취소</button>
                  <button className="primary" onClick={doPublish}>발행하기</button>
                </div>
              </>
            )}
            {modal.kind === 'published' && (
              <>
                <h2>발행했어요</h2>
                <p><a href={modal.permalink} target="_blank" rel="noreferrer">{modal.permalink}</a></p>
                <div className="modal-actions"><button onClick={() => setModal(null)}>확인</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MediaRow({ slide, status, accept, busy, onUpload, onPin, onZoom }) {
  const [label, tone] = IMAGE_STATE[status?.state] ?? ['확인 중', 'warn'];
  const name = (slide.media ?? slide.image)?.split('/').pop();
  const isImage = name && !isVideoPath(slide.media ?? slide.image);
  const zoom = Math.round((Number(slide.zoom) || 1) * 100);
  return (
    <div className="field photo-row">
      <label>원본 사진·영상</label>
      <div className="photo-line">
        {name ? <code title={name}>{name}</code> : <span className="note">아직 없어요</span>}
        {name && <span className={`pill pill-${tone}`}>{label}</span>}
        {(status?.state === 'unpinned' || status?.state === 'changed') && (
          <button className="link" onClick={onPin}>이 파일로 고정</button>
        )}
      </div>
      <label className="upload">
        <input type="file" accept={accept} disabled={busy} onChange={(e) => onUpload(e.target.files?.[0])} />
        {busy ? '올리는 중…' : name ? '파일 바꾸기' : '파일 올리기'}
      </label>
      {isImage && (
        <>
          <div className="sticker-meta">
            <span>확대(크롭)</span>
            <input
              type="range"
              min={100}
              max={250}
              step={5}
              value={zoom}
              onChange={(e) => onZoom(Math.round(+e.target.value) / 100)}
            />
            <span className="deg">{zoom}%</span>
          </div>
          <p className="note">미리보기에서 사진을 드래그하면 보이는 위치를 옮길 수 있어요.</p>
        </>
      )}
    </div>
  );
}

function SourcePanel({ post, brandHandle, formats, onSource, onFormat, onApplyCredit, notify }) {
  const src = post.source ?? {};
  const copy = async () => {
    await navigator.clipboard.writeText(src.dm ?? '');
    notify('DM 문안을 복사했어요.');
  };
  return (
    <div className="panel-body">
      <div className="field">
        <label>형식</label>
        <div className="seg">
          {formats.map((f) => (
            <button key={f} className={post.format === f ? 'on' : ''} onClick={() => onFormat(f)}>
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
        {post.format !== 'carousel' && <p className="note">단일 피드·릴스는 1장만 써요. 릴스는 1080×1920, 코멘트가 위쪽에 들어가요.</p>}
      </div>
      <div className="field">
        <label>원본 링크</label>
        <input
          className="text-input"
          value={src.url ?? ''}
          placeholder="https://www.instagram.com/p/…"
          onChange={(e) => onSource({ url: e.target.value })}
        />
        {src.url && <a className="link small" href={src.url} target="_blank" rel="noreferrer">원본 열기 ↗</a>}
      </div>
      <div className="field">
        <label>원작자 계정</label>
        <div className="lines">
          <span className="prefix">@</span>
          <input
            className="text-input bare"
            value={src.handle ?? ''}
            placeholder="mi_mi_vintage"
            onChange={(e) => onSource({ handle: e.target.value.replace(/^@/, '').trim() })}
          />
        </div>
        {src.handle && (
          <button className="link small" onClick={onApplyCredit}>모든 장의 출처 표기를 「📷 @{src.handle}」로 맞추기</button>
        )}
      </div>
      <div className="field">
        <label>허락 상태</label>
        <div className="seg">
          {PERMISSION.map(([v, label]) => (
            <button key={v} className={(src.permission ?? 'none') === v ? 'on' : ''} onClick={() => onSource({ permission: v })}>
              {label}
            </button>
          ))}
        </div>
        <p className="note">「허락 받음」일 때만 내려받기와 발행이 열려요.</p>
      </div>
      <div className="field">
        <label>
          허락 요청 DM
          <span className="meter">
            <button className="link" onClick={() => onSource({ dm: dmTemplate(src.handle, brandHandle) })}>기본 문안 넣기</button>
            {' · '}
            <button className="link" onClick={copy} disabled={!src.dm}>복사</button>
          </span>
        </label>
        <textarea className="caption dm" value={src.dm ?? ''} onChange={(e) => onSource({ dm: e.target.value })} />
      </div>
      <div className="field">
        <label>메모</label>
        <textarea
          className="hashtags"
          value={src.note ?? ''}
          placeholder="허락 받은 날짜, 원본 받은 경로 등"
          onChange={(e) => onSource({ note: e.target.value })}
        />
      </div>
    </div>
  );
}

// Each line in the textarea is one manual line; the design may wrap long lines automatically.
function LinesField({ label, value, field, prefix, hint, focusDefault, onChange }) {
  const lines = value.split('\n').length;
  const over = field && (field.overflowPx > 0 || field.lines > field.maxLines);
  return (
    <div className="field">
      <label>
        {label}
        {field && (
          <span className={`meter ${over ? 'over' : ''}`}>
            {field.lines}/{field.maxLines}줄{field.overflowPx > 0 ? ` · ${field.overflowPx}px 넘침` : ''}
          </span>
        )}
      </label>
      <div className={`lines ${over ? 'over' : ''}`}>
        {prefix && <span className="prefix">{prefix}</span>}
        <textarea
          wrap="off"
          rows={Math.max(1, lines)}
          value={value}
          spellCheck={false}
          onFocus={() => {
            if (focusDefault && !value) onChange(focusDefault);
          }}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {hint && <p className="note">{hint}</p>}
    </div>
  );
}

// ---------- Sticker panel ----------

const newStickerId = (type) => `${type}-${Math.random().toString(36).slice(2, 8)}`;

function StickerPanel({ stickers, brand, onChange, onCopyToAll, notify }) {
  const [presets, setPresets] = useState([]);
  useEffect(() => setPresets(loadPresets()), []);

  const set = (id, patch) => onChange(stickers.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const savePresets = (next) => {
    setPresets(next);
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };
  const addPreset = (st) => {
    const name = window.prompt('설정 이름을 지어주세요', STICKER_TYPES[st.type]?.label ?? st.type);
    if (!name) return;
    const { id, ...sticker } = st;
    savePresets([...presets, { id: newStickerId('preset'), name, sticker }]);
    notify(`「${name}」으로 저장했어요.`);
  };
  const applyPreset = (p) => {
    onChange([...stickers, { ...structuredClone(p.sticker), id: newStickerId(p.sticker.type) }]);
  };

  return (
    <div className="field">
      <label>스티커</label>

      <div className="sticker-add">
        {Object.entries(STICKER_TYPES).map(([type, def]) => (
          <button key={type} onClick={() => onChange([...stickers, createSticker(type)])}>
            + {def.label}
          </button>
        ))}
      </div>

      {presets.length > 0 && (
        <div className="preset-row">
          <span className="preset-title">자주 쓰는 설정</span>
          {presets.map((p) => (
            <span key={p.id} className="preset-chip">
              <button className="link" onClick={() => applyPreset(p)}>★ {p.name}</button>
              <button
                className="preset-del"
                title="삭제"
                onClick={() => savePresets(presets.filter((x) => x.id !== p.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="stickers">
        {stickers.map((st) => {
          const def = STICKER_TYPES[st.type];
          if (!def) return null;
          return (
            <div key={st.id} className="sticker-card">
              <div className="sticker-card-head">
                <strong>{def.label}</strong>
                <button className="link" onClick={() => addPreset(st)}>★ 설정 저장</button>
                <button className="link" onClick={() => onCopyToAll(st)}>모든 장에 복사</button>
                <button className="link danger" onClick={() => onChange(stickers.filter((s) => s.id !== st.id))}>
                  삭제
                </button>
              </div>

              {def.hasText && (
                <RichTextArea sticker={st} onCommit={(patch) => set(st.id, patch)} />
              )}

              {def.hasText && (
                <div className="sticker-meta">
                  <span>정렬</span>
                  <div className="seg tight">
                    {[['left', '좌'], ['center', '중앙'], ['right', '우']].map(([v, l]) => (
                      <button key={v} className={(st.align ?? 'left') === v ? 'on' : ''} onClick={() => set(st.id, { align: v })}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <span>크기</span>
                  <input
                    type="number"
                    className="num"
                    min={12}
                    max={140}
                    value={st.fontSize ?? 30}
                    onChange={(e) => set(st.id, { fontSize: Math.min(140, Math.max(12, +e.target.value || 30)) })}
                  />
                </div>
              )}

              <div className="sticker-meta">
                {st.fill !== 'none' && (
                  <>
                    <span>채움</span>
                    <input
                      type="color"
                      value={toHex(resolveColor(st.fill ?? '#ffffff', brand))}
                      onChange={(e) => set(st.id, { fill: e.target.value })}
                    />
                  </>
                )}
                <span>선</span>
                <input
                  type="color"
                  value={toHex(resolveColor(st.stroke ?? '#111111', brand))}
                  onChange={(e) => set(st.id, { stroke: e.target.value })}
                />
                <input
                  type="range"
                  min={0}
                  max={14}
                  value={st.strokeWidth ?? 0}
                  onChange={(e) => set(st.id, { strokeWidth: +e.target.value })}
                />
                <span className="deg">{st.strokeWidth ?? 0}px</span>
                {def.hasText && (
                  <>
                    <span>글자</span>
                    <input
                      type="color"
                      value={toHex(resolveColor(st.color ?? '#111111', brand))}
                      onChange={(e) => set(st.id, { color: e.target.value })}
                    />
                  </>
                )}
              </div>

              <div className="sticker-meta">
                <span>회전</span>
                <input
                  type="range"
                  min={-20}
                  max={20}
                  value={st.rotate ?? 0}
                  onChange={(e) => set(st.id, { rotate: +e.target.value })}
                />
                <span className="deg">{st.rotate ?? 0}°</span>
                {!def.hasText && (
                  <>
                    <span>길이</span>
                    <input
                      type="range"
                      min={80}
                      max={700}
                      value={st.w ?? 240}
                      onChange={(e) => set(st.id, { w: +e.target.value })}
                    />
                    <span className="deg">{st.w ?? 240}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {stickers.length === 0 && <p className="note">위 버튼으로 스티커를 추가해 보세요. 미리보기에서 드래그로 옮기고, 모서리 핸들로 크기를 바꿀 수 있어요.</p>}
      </div>
    </div>
  );
}

const toHex = (c) => {
  if (/^#([0-9a-f]{6})$/i.test(c ?? '')) return c;
  if (/^#([0-9a-f]{3})$/i.test(c ?? '')) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return '#111111';
};

// Mini rich-text editor: a contentEditable whose content is parsed into styled runs.
// Select text and use the toolbar to bold it or change its size relative to the sticker.
function RichTextArea({ sticker, onCommit }) {
  const ref = useRef(null);

  // Rebuild the DOM only when switching stickers, so typing is never interrupted.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = runsToHtml(sticker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sticker.id]);

  const emit = () => {
    if (!ref.current) return;
    const runs = parseRuns(ref.current);
    onCommit({ runs, text: runs.map((l) => l.map((r) => r.t).join('')).join('\n') });
  };

  const exec = (fn) => {
    ref.current?.focus();
    fn();
    emit();
  };
  const applyRel = (rel) =>
    exec(() => {
      document.execCommand('fontSize', false, '7');
      ref.current.querySelectorAll('font[size="7"]').forEach((f) => {
        const span = document.createElement('span');
        if (Math.abs(rel - 1) > 0.01) span.style.fontSize = `${rel}em`;
        while (f.firstChild) span.appendChild(f.firstChild);
        f.replaceWith(span);
      });
    });

  return (
    <div className="richtext">
      <div className="richtext-tools">
        <button title="굵게 (선택한 글자)" onMouseDown={(e) => e.preventDefault()} onClick={() => exec(() => document.execCommand('bold'))}>
          <b>B</b>
        </button>
        <button title="선택한 글자 작게" onMouseDown={(e) => e.preventDefault()} onClick={() => applyRel(0.65)}>작게</button>
        <button title="기본 크기로" onMouseDown={(e) => e.preventDefault()} onClick={() => applyRel(1)}>기본</button>
        <button title="선택한 글자 크게" onMouseDown={(e) => e.preventDefault()} onClick={() => applyRel(1.4)}>크게</button>
        <span className="note">글자를 드래그로 선택한 뒤 눌러주세요</span>
      </div>
      <div
        ref={ref}
        className="richtext-input"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  );
}

function runsToHtml(st) {
  const esc = (s = '') =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const base = st.fontSize ?? 30;
  const lines = st.runs ?? (st.text ?? '').split('\n').map((t) => [{ t }]);
  return lines
    .map((line) => {
      const html = line
        .map((r) => {
          const rel = r.rel ?? (r.size ? r.size / base : 1);
          let h = esc(r.t);
          if (rel && Math.abs(rel - 1) > 0.01) h = `<span style="font-size:${Math.round(rel * 100) / 100}em">${h}</span>`;
          if (r.b) h = `<b>${h}</b>`;
          return h;
        })
        .join('');
      return `<div>${html || '<br>'}</div>`;
    })
    .join('');
}

function parseRuns(root) {
  const lines = [];
  let cur = [];
  const pushLine = () => {
    lines.push(cur);
    cur = [];
  };
  const walkInline = (node, ctx) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === Node.TEXT_NODE) {
        if (ch.textContent) {
          cur.push({
            t: ch.textContent.replace(/ /g, ' '),
            ...(ctx.b ? { b: true } : {}),
            ...(ctx.rel && Math.abs(ctx.rel - 1) > 0.01 ? { rel: ctx.rel } : {}),
          });
        }
        continue;
      }
      if (ch.nodeType !== Node.ELEMENT_NODE) continue;
      if (ch.tagName === 'BR') {
        pushLine();
        continue;
      }
      const fs = ch.style?.fontSize ?? '';
      let rel = ctx.rel;
      if (fs.endsWith('em')) rel = parseFloat(fs);
      const b =
        ctx.b ||
        ch.tagName === 'B' ||
        ch.tagName === 'STRONG' ||
        ch.style?.fontWeight === 'bold' ||
        +(ch.style?.fontWeight || 0) >= 700;
      walkInline(ch, { b, rel });
    }
  };
  for (const ch of root.childNodes) {
    const isBlock = ch.nodeType === Node.ELEMENT_NODE && (ch.tagName === 'DIV' || ch.tagName === 'P');
    if (isBlock) {
      if (cur.length) pushLine();
      const before = lines.length;
      walkInline(ch, {});
      if (lines.length === before) pushLine(); // block didn't end itself (no trailing BR)
    } else {
      walkInline({ childNodes: [ch] }, {});
    }
  }
  if (cur.length) pushLine();
  if (!lines.length) lines.push([{ t: '' }]);
  // merge adjacent runs with identical style
  return lines.map((line) =>
    line.reduce((acc, r) => {
      const last = acc[acc.length - 1];
      if (last && !!last.b === !!r.b && (last.rel ?? 1) === (r.rel ?? 1)) last.t += r.t;
      else acc.push({ ...r });
      return acc;
    }, []),
  );
}

function HashtagInput({ value, onChange }) {
  const [text, setText] = useState(value.map((t) => `#${t}`).join(' '));
  return (
    <textarea
      className="hashtags"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(/\s+/)
            .map((t) => t.replace(/^#+/, '').trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
