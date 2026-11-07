'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getTemplate, resolveTemplate, TEMPLATES, isCoverSlide } from '@/lib/templates/index.mjs';
import { autoFormat, needsPermission } from '@/lib/post-rules.mjs';
import { RATIOS } from '@/lib/templates/sizes.mjs';
import { STICKER_TYPES, createSticker, resolveColor } from '@/lib/stickers.mjs';
import TemplateGallery from './template-gallery';

const CAPTION_LIMIT = 2200;
const HASHTAG_LIMIT = 30;
const THUMB_W = 60;
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
  none: ['사진 없이 가요', 'ok'],
};

const assetUrl = (brandId, rel) =>
  `/api/assets/${brandId}/${rel.split('/').map(encodeURIComponent).join('/')}`;

const isVideoPath = (rel) => /\.(mp4|mov|m4v|webm)$/i.test(rel ?? '');

// closingRel: the account's closing file, shown by 끝장 이미지 slides without a photo.
function mediaOf(brandId, postId, slide, closingRel = null, tMeta = null) {
  if (!slide.media && tMeta?.brandClosing && closingRel) return { src: assetUrl(brandId, closingRel), type: 'image' };
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

// Templates with a '배경 사진' option hide the photo until it is switched on. A slide that
// already carries a photo/video keeps showing it after a template switch or an upload.
const photoPatch = (tMeta, slide) =>
  (slide.media || slide.image) && tMeta.options?.some((o) => o.key === 'photo') && slide.photo !== 'show'
    ? { photo: 'show' }
    : {};

// Slide keys that hold content (kept when a 내 템플릿 design is applied to a slide).
const MEDIA_KEYS = ['media', 'mediaType', 'imageSha256', 'image', 'focus', 'zoom'];

const reorder = (arr, from, to) => {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const Icon = ({ d, size = 20 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const CHEVRON_LEFT = <path d="M15 18l-6-6 6-6" />;
const CHEVRON_RIGHT = <path d="M9 18l6-6-6-6" />;
const MORE = <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>;
const PLUS = <path d="M12 5v14M5 12h14" />;

const loadPresets = () => {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]');
  } catch {
    return [];
  }
};

/**
 * kind 'post' edits content/<brand>/<postId>; kind 'layout' edits a 내 템플릿 (postId = its
 * id) with the same canvas, but without media, export, publishing or captions.
 */
export default function Editor({ brandId, postId, kind = 'post' }) {
  const isLayout = kind === 'layout';
  const router = useRouter();
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
  const [capDraft, setCapDraft] = useState(null); // { detailed, short, hashtags, view }
  const [gallery, setGallery] = useState(null); // null | 'switch' (현재 장) | 'add' (새 장)
  const [loadError, setLoadError] = useState(null);
  const [library, setLibrary] = useState({ layouts: [], hidden: [] }); // 내 템플릿 + hidden built-ins
  const [dragging, setDragging] = useState(null); // { from, to } while a thumbnail is dragged
  const [uploadNote, setUploadNote] = useState(null); // "2/5" while a batch uploads
  const [menuOpen, setMenuOpen] = useState(false); // phone: the "더보기" action sheet

  const mainFrame = useRef(null);
  const thumbFrames = useRef([]);
  const selRef = useRef(sel);
  selRef.current = sel;

  const apiBase = isLayout ? `/api/layouts/${postId}` : `/api/posts/${brandId}/${postId}`;

  const loadLibrary = useCallback(() => {
    fetch('/api/layouts')
      .then((r) => r.json())
      .then((d) => setLibrary({ layouts: d.layouts ?? [], hidden: d.hidden ?? [] }))
      .catch(() => {});
  }, []);
  useEffect(loadLibrary, [loadLibrary]);

  useEffect(() => {
    fetch(apiBase)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setCtx({ brand: d.brand, logoSvg: d.logoSvg, publish: d.publish, closing: d.closing });
        setPost(kind === 'layout' ? d.post : { ...d.post, format: autoFormat(d.post) });
        setImages(d.images);
      })
      .catch((e) => setLoadError(e.message));
  }, [apiBase, kind]);

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

  // 캐러셀/릴스 follows the content (a single video slide = 릴스); no manual switch.
  useEffect(() => {
    if (!post || isLayout) return;
    const next = autoFormat(post);
    if (next !== post.format) {
      setPost((p) => ({ ...p, format: next }));
      setDirty(true);
    }
  }, [post, isLayout]);

  const debounced = useDebounced(post, 180);
  const template = useMemo(() => (post ? getTemplate(post.template) : null), [post?.template]);
  const size = template && post ? template.meta.sizeFor(post) : { width: 1080, height: 1350 };
  const slideHtml = useCallback(
    (p, i, mode) => {
      const t = resolveTemplate(p, p.slides[i]);
      const { src, type } = mediaOf(brandId, postId, p.slides[i], ctx.closing, t.meta);
      return t.renderSlide({
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
    [ctx, brandId, postId],
  );
  const mainHtml = useMemo(
    () =>
      debounced && ctx
        ? slideHtml(debounced, Math.min(sel, debounced.slides.length - 1), 'preview')
        : '',
    [debounced, ctx, sel, slideHtml],
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
      if (window.innerWidth <= 920) {
        // Phone: the preview spans ~72% of the screen width (ratio kept); the stage grows
        // to fit it, capped at 66% of the screen height for tall 9:16 slides.
        const maxH = window.innerHeight * 0.66 - 52; // 52 = ratio switch under the preview
        setScale(Math.max(0.1, Math.min(Math.min(width, window.innerWidth * 0.72) / size.width, maxH / size.height)));
        return;
      }
      const arrows = 120; // prev/next buttons beside the preview (PC)
      const below = 96; // ratio switch + hint under it
      setScale(Math.max(0.1, Math.min((width - 32 - arrows) / size.width, (height - below) / size.height)));
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
      notify(isLayout ? '템플릿을 저장했어요.' : '임시 저장했어요.');
    } catch (e) {
      notify(`저장 실패: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  }, [apiBase, post, notify, isLayout]);

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

  // Drafts an Instagram caption (detailed/short + hashtags) from all slides' text.
  const suggestCaption = async () => {
    setBusy('caption');
    try {
      const res = await fetch(`${apiBase}/caption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post }),
      });
      if (!res.ok) throw new Error(await errorOf(res));
      const { draft } = await res.json();
      setCapDraft({ ...draft, view: 'detailed' });
    } catch (e) {
      notify(`캡션 초안 실패: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  // Manual publish marking (실제 발행은 Meta Business Suite 예약발행이라 앱이 시점을 모름).
  // Optionally frees server storage by deleting the post's uploaded media.
  const markPublished = async (purge) => {
    setModal(null);
    setBusy('status');
    try {
      const next = structuredClone(post);
      next.status = 'published';
      const res = await fetch(apiBase, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post: next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setPost(d.post);
      setImages(d.images);
      setDirty(false);
      if (purge) {
        const r2 = await fetch(`${apiBase}/purge`, { method: 'POST' });
        const d2 = await r2.json();
        if (!r2.ok) throw new Error(d2.error);
        setPost(d2.post);
        setImages(d2.images);
        notify('발행됨으로 표시하고 원본 미디어를 정리했어요.');
      } else {
        notify('발행됨으로 표시했어요.');
      }
    } catch (e) {
      notify(`상태 변경 실패: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async () => {
    setBusy('delete');
    try {
      const res = await fetch(apiBase, { method: 'DELETE' });
      if (!res.ok) throw new Error(await errorOf(res));
      setDirty(false);
      router.push(isLayout ? '/#my-templates' : `/?account=${brandId}`);
    } catch (e) {
      notify(`삭제 실패: ${e.message}`, 'error');
      setBusy(null);
      setModal(null);
    }
  };

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
      else notify(`${post.slides.length}장과 캡션을 내려받았어요.`);
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

  const maxSlides = 10; // Instagram carousels take up to 10 items

  const usesMediaAt = (p, i) => {
    const t = resolveTemplate(p, p.slides[i]).meta;
    return t.mediaTypes.length > 0;
  };
  // Template for slides created by a multi-file upload: the current slide's, when it
  // shows photos; otherwise the post's, otherwise any photo template of this format.
  const photoTemplateKey = (p, i) => {
    const fits = (k) =>
      TEMPLATES[k]?.meta.mediaTypes.length && TEMPLATES[k].meta.formats.includes(p.format) && TEMPLATES[k].meta.role !== 'last';
    const candidates = [p.slides[i]?.template ?? p.template, p.template, 'inner-photo-split', 'editorial-photo'];
    return candidates.find(fits) ?? Object.keys(TEMPLATES).find(fits);
  };

  /**
   * Uploads one or many photos/videos. The first goes on the selected slide; the rest
   * fill the following slides that still lack a photo, then become new slides (carousel
   * only, up to the Instagram limit). Files upload one by one (each ≤ 100MB through the
   * tunnel) and the slides change in a single step once they are on the server.
   */
  const uploadFiles = async (fileList) => {
    const files = [...(fileList ?? [])];
    if (!files.length) return;
    const multi = post.format !== 'single';
    // New slides go in before a trailing last-page slide (끝장 이미지, 팔로우 카드).
    const lastRole = (p) => resolveTemplate(p, p.slides[p.slides.length - 1]).meta.role === 'last';
    const tail = post.slides.length > 1 && lastRole(post) ? 1 : 0;
    const scanEnd = post.slides.length - tail;
    const selIsLast = resolveTemplate(post, post.slides[sel]).meta.role === 'last';
    const plan = [files.length > 1 && selIsLast && multi ? { isNew: true } : { index: sel }];
    let total = post.slides.length;
    if (plan[0].isNew) {
      if (total >= maxSlides) {
        notify(`장 수가 이미 ${maxSlides}장이라 더 추가할 수 없어요.`, 'error');
        return;
      }
      total++;
    }
    for (let k = 1; k < files.length && multi; k++) {
      const prev = plan[plan.length - 1];
      let j = prev.isNew ? scanEnd : prev.index + 1;
      // Fill only empty photo slides — never a last-page slide (끝장 이미지, 팔로우 카드).
      const free = (x) =>
        usesMediaAt(post, x) && !post.slides[x].media && !post.slides[x].image &&
        resolveTemplate(post, post.slides[x]).meta.role !== 'last';
      while (j < scanEnd && !free(j)) j++;
      if (j < scanEnd) plan.push({ index: j });
      else if (total < maxSlides) {
        plan.push({ isNew: true });
        total++;
      } else break;
    }
    const skipped = files.length - plan.length;
    setBusy('upload');
    const done = [];
    try {
      for (let k = 0; k < plan.length; k++) {
        if (plan.length > 1) setUploadNote(`${k + 1}/${plan.length}`);
        const body = new FormData();
        body.append('file', files[k]);
        const res = await fetch(`${apiBase}/media`, { method: 'POST', body });
        if (res.status === 413) throw new Error(`${files[k].name}: 파일이 너무 커요 (최대 100MB). 영상을 압축해서 다시 올려주세요.`);
        if (!res.ok) throw new Error(`${files[k].name}: ${await errorOf(res)}`);
        done.push({ ...plan[k], fields: await res.json() });
      }
    } catch (e) {
      notify(`업로드 실패: ${e.message}${done.length ? ` (앞의 ${done.length}개는 올라갔어요)` : ''}`, 'error');
    } finally {
      setBusy(null);
      setUploadNote(null);
    }
    if (!done.length) return;
    // Slides can't be moved, added or deleted while busy, so the planned indices still hold;
    // new slides are inserted at the end of the content, before the trailing last page.
    update((p) => {
      const key = photoTemplateKey(p, sel);
      let insertAt = p.slides.length - (p.slides.length > 1 && lastRole(p) ? 1 : 0);
      for (const d of done) {
        let index = d.index;
        if (d.isNew) {
          const s = TEMPLATES[key].meta.newSlide(p);
          if (key !== p.template) s.template = key;
          p.slides.splice(insertAt, 0, s);
          index = insertAt++;
        } else if (index >= p.slides.length) continue;
        const slide = p.slides[index];
        Object.assign(slide, d.fields);
        delete slide.image;
        Object.assign(slide, photoPatch(resolveTemplate(p, slide).meta, slide));
      }
    });
    setImages((im) => {
      const next = [...im];
      let insertAt = next.length - tail;
      for (const d of done) {
        if (d.isNew) next.splice(insertAt++, 0, { state: 'ok', sha: d.fields.imageSha256 });
        else if (d.index < next.length) next[d.index] = { state: 'ok', sha: d.fields.imageSha256 };
      }
      return next;
    });
    setReports({});
    const added = done.filter((d) => d.isNew).length;
    notify(
      done.length === 1
        ? `${done[0].fields.mediaType === 'video' ? '영상' : '사진'}을 올렸어요. 저장을 눌러야 게시물에 남아요.`
        : `${done.length}개를 올렸어요${added ? ` (새 장 ${added}개 추가)` : ''}.` +
            `${skipped > 0 ? ` 장 수 제한으로 ${skipped}개는 빠졌어요.` : ''} 저장을 눌러야 남아요.`,
    );
  };
  // templateKey undefined = inherit the previous slide's template so a chosen layout continues.
  const addSlide = (templateKey) => {
    const prevSlide = post.slides[post.slides.length - 1];
    const picked = templateKey ? TEMPLATES[templateKey] : resolveTemplate(post, prevSlide);
    const tMeta = picked.meta;
    update((p) => {
      const s = tMeta.newSlide(p);
      const key = templateKey ?? prevSlide?.template;
      if (key && key !== p.template) s.template = key;
      else delete s.template;
      p.slides.push(s);
    });
    setImages((im) => [...im, { state: tMeta.mediaTypes.length && tMeta.usesMedia?.(tMeta.newSlide(post)) !== false ? 'missing' : 'none' }]);
    setSel(post.slides.length);
  };
  const removeSlide = (i) => {
    if (post.slides.length === 1 || busy === 'upload') return;
    update((p) => p.slides.splice(i, 1));
    setImages((im) => im.filter((_, k) => k !== i));
    setReports({});
    setSel(Math.max(0, i - 1));
  };
  const moveSlideTo = (from, to) => {
    if (busy === 'upload' || from === to || to < 0 || to >= post.slides.length) return;
    update((p) => (p.slides = reorder(p.slides, from, to)));
    setImages((im) => reorder(im, from, to));
    setReports({});
    setSel(to);
  };
  const moveSlide = (i, d) => moveSlideTo(i, i + d);

  // Drag to reorder thumbnails (mouse: the whole card; touch: the ⠿ handle, so the
  // strip still scrolls). A 6px move turns a press into a drag; the click is then eaten.
  const thumbEls = useRef([]);
  const dragRef = useRef(null);
  const onThumbPointerDown = (e, i) => {
    if (e.button !== 0 || busy === 'upload') return;
    if (e.pointerType !== 'mouse' && !e.target.closest('.drag-handle')) return;
    dragRef.current = { from: i, to: i, x: e.clientX, y: e.clientY, active: false };
    const targetAt = (x, y) => {
      let best = dragRef.current.to;
      let bestD = Infinity;
      thumbEls.current.forEach((el, k) => {
        if (!el || k >= post.slides.length) return;
        const r = el.getBoundingClientRect();
        const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        if (d < bestD) [best, bestD] = [k, d];
      });
      return best;
    };
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return;
      d.active = true;
      ev.preventDefault();
      d.to = targetAt(ev.clientX, ev.clientY);
      setDragging({ from: d.from, to: d.to });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const d = dragRef.current;
      setDragging(null);
      if (d?.active) {
        moveSlideTo(d.from, d.to);
        d.eatClick = true;
        setTimeout(() => (dragRef.current = null), 0);
      } else dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // 내 템플릿 (one-slide) applied to a slide: its design replaces the slide's, while the
  // slide keeps its photo/video and any text the new template also has.
  const designSlide = (p, layoutSlide, keep = {}) => {
    const { template: key, ...design } = structuredClone(layoutSlide);
    const t = TEMPLATES[key];
    const next = { ...t.meta.newSlide(p), ...design };
    for (const k of MEDIA_KEYS) if (keep[k] !== undefined) next[k] = keep[k];
    for (const f of t.meta.fields) if (keep[f.key]) next[f.key] = keep[f.key];
    if (key !== p.template) next.template = key;
    else delete next.template;
    return { ...next, ...photoPatch(t.meta, next) };
  };

  const saveAsLayout = async (name) => {
    setBusy('layout');
    try {
      const res = await fetch('/api/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, post }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setModal(null);
      loadLibrary();
      notify(`'${d.layout.name}' 템플릿으로 저장했어요. 새 게시물 만들 때 '내 템플릿'에서 고를 수 있어요.`);
    } catch (e) {
      notify(`템플릿 저장 실패: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loadError) return <main className="center-msg">불러오지 못했어요: {loadError}</main>;
  if (!post || !ctx) return <main className="center-msg">불러오는 중…</main>;

  const { meta } = template;
  const slide = post.slides[Math.min(sel, post.slides.length - 1)];
  // Panel fields/options follow the slide's own template; crumb and format switching stay post-level.
  const sMeta = (slide ? resolveTemplate(post, slide) : template).meta;
  // Template choices for this slide: compatible with the post format, grouped by role
  // (cover/any first on slide 1, inner/any first elsewhere) — grouping only, nothing hidden.
  const templateChoices = Object.entries(TEMPLATES)
    .filter(([, t]) => t.meta.formats.includes(post.format))
    .sort(([, a], [, b]) => {
      const rank = (r) => (sel === 0 ? { cover: 0, any: 1, inner: 2 } : { inner: 0, any: 1, cover: 2 })[r] ?? 1;
      return rank(a.meta.role) - rank(b.meta.role);
    });
  const report = reports[sel];
  const allIssues = Object.entries(reports).flatMap(([i, r]) => r.issues.map((t) => `${+i + 1}장: ${t}`));
  const hashtags = post.hashtags ?? [];
  const blocked = !isLayout && needsPermission(post);
  const thumbScale = THUMB_W / size.width;
  const title = isLayout
    ? post.layoutName
    : (post.slides[0].headline || post.slides[0].title || post.slides[0].name || '').replace(/\n/g, ' ') ||
      (post.source?.handle && `@${post.source.handle} 소개`) || post.id;

  return (
    <div className="editor">
      <header className="topbar">
        <div className="topbar-left">
          <Link href={isLayout ? '/#my-templates' : `/?account=${brandId}`} className="back" aria-label="목록으로"><Icon d={CHEVRON_LEFT} size={22} /></Link>
          <div className="topbar-title">
            <div className="crumb">
              {isLayout ? '내 템플릿 편집 · 미리보기 계정 ' : ''}@{brandId} · {meta.label} · {FORMAT_LABEL[post.format] ?? post.format}
            </div>
            {isLayout ? (
              <div className="title">
                <input
                  className="text-input title-input"
                  value={post.layoutName ?? ''}
                  maxLength={40}
                  aria-label="템플릿 이름"
                  onChange={(e) => update((p) => (p.layoutName = e.target.value))}
                />
                {dirty && <span className="dirty">저장 안 됨</span>}
              </div>
            ) : (
            <div className="title">
              <span className="title-text">{title}</span>
              <select
                className={`status-select badge badge-${post.status}`}
                value={post.status}
                aria-label="게시물 상태"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'published') setModal({ kind: 'markPublished' });
                  else update((p) => (p.status = v));
                }}
              >
                {Object.entries(STATUS).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
              {post.mediaPurged && <span className="badge">미디어 정리됨</span>}
              {dirty && <span className="dirty">저장 안 됨</span>}
            </div>
            )}
          </div>
        </div>
        <button className="more-btn btn-icon" aria-label="더보기" onClick={() => setMenuOpen(true)}>
          <Icon d={MORE} size={22} />
        </button>
        <div className="actions">
          <button className="btn-plain topbar-danger" onClick={() => setModal({ kind: 'delete' })} disabled={!!busy}>
            삭제
          </button>
          {isLayout ? (
            <button className="primary" onClick={save} disabled={!!busy}>
              {busy === 'save' ? '저장 중…' : '템플릿 저장'}
            </button>
          ) : (
          <>
          <button className="btn-plain" onClick={save} disabled={!!busy}>
            {busy === 'save' ? '저장 중…' : '임시 저장'}
          </button>
          <button className="btn-plain" onClick={() => setModal({ kind: 'saveLayout', name: '' })} disabled={!!busy}>
            템플릿으로 저장
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
            {busy === 'svg' ? '만드는 중…' : 'Figma로 수정'}
          </button>
          <button
            className="primary"
            disabled={!!busy || blocked || post.status === 'published'}
            onClick={() => setModal({ kind: ctx.publish.ready ? 'confirm' : 'setup' })}
          >
            {busy === 'publish' ? '발행 중…' : post.status === 'published' ? '발행 완료' : '발행하기'}
          </button>
          </>
          )}
        </div>
      </header>

      {blocked && !isLayout && (
        <div className="banner">
          원작자 허락 전이라 내려받기·발행이 잠겨 있어요. <button className="link" onClick={() => setTab('source')}>출처·허락 탭</button>에서 허락 상태를 바꿔주세요.
        </div>
      )}

      <div className={`workspace ${blocked ? 'with-banner' : ''}`}>

        <section className="stage" ref={stageRef}>
          <div className="stage-row">
          <button
            className="btn-icon stage-nav"
            aria-label="이전 장"
            disabled={sel === 0}
            onClick={() => setSel(Math.max(0, sel - 1))}
          >
            <Icon d={CHEVRON_LEFT} size={18} />
          </button>
          <div className="stage-frame" style={{ width: size.width * scale, height: size.height * scale }}>
            {(
              <iframe
                ref={mainFrame}
                srcDoc={mainHtml}
                title="슬라이드 미리보기"
                style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}
              />
            )}
          </div>
          <button
            className="btn-icon stage-nav"
            aria-label="다음 장"
            disabled={sel >= post.slides.length - 1}
            onClick={() => setSel(Math.min(post.slides.length - 1, sel + 1))}
          >
            <Icon d={CHEVRON_RIGHT} size={18} />
          </button>
          </div>
          <p className="stage-hint">
            {`${sel + 1} / ${post.slides.length} · 스티커는 드래그로 이동, 모서리 핸들로 크기 조절 · 사진은 드래그로 위치 조정`}
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
              <span className="note">
                {`${sel + 1} / ${post.slides.length}장`} · {size.width}×{size.height}
              </span>
            </div>
          )}
        </section>

        <aside className="panel">
          <div className="panel-head">
          <nav className="thumbs" aria-label="장 목록 (끌어서 순서 변경)">
            {post.slides.map((s, i) => (
              <button
                key={i}
                ref={(el) => (thumbEls.current[i] = el)}
                className={[
                  'thumb',
                  i === sel && 'active',
                  dragging?.from === i && 'dragging',
                  dragging && dragging.to === i && dragging.from !== i && (dragging.from < i ? 'drop-after' : 'drop-before'),
                ].filter(Boolean).join(' ')}
                onPointerDown={(e) => onThumbPointerDown(e, i)}
                onClick={() => {
                  if (dragRef.current?.eatClick) return;
                  setSel(i);
                }}
                aria-label={`${i + 1}장`}
                title="끌어서 순서를 바꿀 수 있어요"
              >
                {post.slides.length > 1 && <span className="drag-handle" aria-hidden>⠿</span>}
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
                  {mediaOf(brandId, postId, s, ctx.closing).type === 'video' && ' ▶'}
                  {reports[i]?.issues.length > 0 && <span className="dot" title="QA 경고" />}
                </span>
              </button>
            ))}
            {/* A reel is just a one-video post: adding a slide turns it back into a carousel. */}
            {post.format !== 'single' && post.slides.length < maxSlides && (
              <button className="add-slide" onClick={() => setGallery('add')} disabled={busy === 'upload'}>
                <Icon d={PLUS} size={16} />장 추가
              </button>
            )}
          </nav>
          <div className="tabs" role="tablist">
            <button className={tab === 'slide' ? 'on' : ''} onClick={() => setTab('slide')}>
              {`${sel + 1}장 편집`}
            </button>
            {!isLayout && (
              <button className={tab === 'source' ? 'on' : ''} onClick={() => setTab('source')}>
                출처·허락
              </button>
            )}
            {!isLayout && (
              <button className={tab === 'caption' ? 'on' : ''} onClick={() => setTab('caption')}>
                캡션
              </button>
            )}
          </div>
          </div>

          {tab === 'slide' && (
            <div className="panel-body">
              <div className="slide-tools">
                <button onClick={() => moveSlide(sel, -1)} disabled={sel === 0 || busy === 'upload'}>↑</button>
                <button onClick={() => moveSlide(sel, 1)} disabled={sel === post.slides.length - 1 || busy === 'upload'}>↓</button>
                {!isLayout && (
                  <button onClick={() => exportOne(sel)} disabled={!!busy || blocked}>
                    {busy === 'one' ? '만드는 중…' : `이 장만 ${format.toUpperCase()} 받기`}
                  </button>
                )}
                <button className="danger" onClick={() => removeSlide(sel)} disabled={post.slides.length === 1 || busy === 'upload'}>이 장 삭제</button>
              </div>

              {templateChoices.length > 1 && (
                <div className="field">
                  <label>이 장의 템플릿</label>
                  <div className="card row-card">
                    <div className="row-card-text">
                      <strong>{sMeta.label}</strong>
                      <span className="note">{{ cover: '표지', inner: '속지', any: '어디든', last: '마지막 장' }[sMeta.role] ?? ''}</span>
                    </div>
                    <button onClick={() => setGallery('switch')}>템플릿 바꾸기</button>
                  </div>
                  <p className="note">장마다 다른 템플릿을 쓸 수 있어요. 표지는 1장에 어울리는 템플릿을 골라주세요.</p>
                </div>
              )}

              {isLayout && (
                <div className="field">
                  <label>설명 <small>(선택)</small></label>
                  <input
                    className="text-input"
                    value={post.layoutDesc ?? ''}
                    maxLength={120}
                    placeholder="어떤 게시물에 쓰는 템플릿인지"
                    onChange={(e) => update((p) => (p.layoutDesc = e.target.value))}
                  />
                  <p className="note">
                    템플릿에는 장 구성과 디자인 설정만 저장돼요. 글과 사진은 새 게시물에서 채워요.
                    여기서 입력한 글은 저장할 때 비워져요.
                  </p>
                </div>
              )}

              {!isLayout && sMeta.mediaTypes.length === 0 && (slide.media || slide.image) && (
                <p className="note">이 템플릿은 사진을 쓰지 않아요. 올린 사진은 보관돼서 사진 템플릿으로 바꾸면 다시 보여요.</p>
              )}

              {!isLayout && sMeta.mediaTypes.length > 0 && (
                <MediaRow
                  slide={slide}
                  status={images[sel]}
                  accept={sMeta.mediaTypes.includes('video') ? 'image/*,video/*' : 'image/*'}
                  multiple={post.format !== 'single'}
                  busy={busy === 'upload'}
                  progress={uploadNote}
                  onUpload={uploadFiles}
                  onPin={() => updateSlide(sel, { imageSha256: images[sel].sha })}
                  onZoom={(z) => updateSlide(sel, { zoom: z === 1 ? undefined : z })}
                />
              )}

              {sMeta.fields.map((f) => (
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

              <AdjustPanel
                key={`${sel}-${slide.template ?? post.template}`}
                fields={sMeta.fields}
                sliders={sMeta.sliders ?? []}
                slide={slide}
                onSlider={(k, v) => updateSlide(sel, { [k]: v })}
                onTextStyle={(textStyle) => updateSlide(sel, { textStyle })}
              />

              {sMeta.options
                .filter((o) => (!o.coverOnly || isCoverSlide(slide, sel)) && !o.hidden?.(slide))
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

          {tab === 'source' && !isLayout && (
            <SourcePanel
              post={post}
              brandHandle={ctx.brand.handle}
              onSource={(patch) => update((p) => Object.assign((p.source ??= {}), patch))}
              onApplyCredit={() =>
                update((p) => p.slides.forEach((s) => {
                  s.credit = `📷 @${p.source.handle}`;
                  s.source = `📷 @${p.source.handle}`;
                }))
              }
              notify={notify}
            />
          )}

          {tab === 'caption' && (
            <div className="panel-body">
              <div className="field suggest-row">
                <button onClick={suggestCaption} disabled={!!busy}>
                  {busy === 'caption' ? '초안 만드는 중…' : '✨ 캡션 초안'}
                </button>
                <p className="note">카드에 쓴 글로 캡션과 해시태그 초안을 만들어요.</p>
              </div>
              {capDraft && (
                <div className="field cap-draft">
                  <div className="seg tight">
                    {[['detailed', '자세히'], ['short', '짧게']].map(([v, label]) => (
                      <button
                        key={v}
                        className={capDraft.view === v ? 'on' : ''}
                        onClick={() => setCapDraft((d) => ({ ...d, view: v }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <pre className="cap-preview">{capDraft[capDraft.view]}</pre>
                  <p className="note">{capDraft.hashtags.map((t) => `#${t}`).join(' ')}</p>
                  <div className="slide-tools">
                    <button
                      onClick={() => {
                        update((p) => (p.caption = capDraft[capDraft.view]));
                        notify('캡션에 넣었어요. 저장을 눌러야 남아요.');
                      }}
                    >
                      캡션에 넣기
                    </button>
                    <button
                      onClick={() => {
                        update((p) => (p.hashtags = capDraft.hashtags));
                        notify('해시태그를 바꿨어요. 저장을 눌러야 남아요.');
                      }}
                    >
                      해시태그 넣기
                    </button>
                  </div>
                </div>
              )}
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

      {/* Phone only (CSS): fixed bottom bar with the main actions. */}
      <div className="mobile-bar">
        {isLayout ? (
          <button className="primary" onClick={save} disabled={!!busy}>
            {busy === 'save' ? '저장 중…' : '템플릿 저장'}
          </button>
        ) : (
          <>
            <button onClick={save} disabled={!!busy}>{busy === 'save' ? '저장 중…' : '저장'}</button>
            <button onClick={() => exportAs(format)} disabled={!!busy || blocked}>
              {busy === format ? '만드는 중…' : '내려받기'}
            </button>
            <button
              className="primary"
              disabled={!!busy || blocked || post.status === 'published'}
              onClick={() => setModal({ kind: ctx.publish.ready ? 'confirm' : 'setup' })}
            >
              {busy === 'publish' ? '발행 중…' : post.status === 'published' ? '발행 완료' : '발행하기'}
            </button>
          </>
        )}
      </div>

      {menuOpen && (
        <div className="modal-back sheet-back" onClick={() => setMenuOpen(false)}>
          <div className="sheet" role="menu" onClick={(e) => e.stopPropagation()}>
            {!isLayout && (
              <>
                <div className="sheet-group">
                  <label className="sheet-row">
                    <span>상태</span>
                    <select
                      value={post.status}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMenuOpen(false);
                        if (v === 'published') setModal({ kind: 'markPublished' });
                        else update((p) => (p.status = v));
                      }}
                    >
                      {Object.entries(STATUS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </label>
                  <label className="sheet-row">
                    <span>내려받기 형식</span>
                    <select value={format} onChange={(e) => setFormat(e.target.value)}>
                      <option value="png">PNG</option>
                      <option value="jpg">JPG</option>
                    </select>
                  </label>
                </div>
                <div className="sheet-group">
                  <button className="sheet-row" onClick={() => { setMenuOpen(false); setModal({ kind: 'saveLayout', name: '' }); }} disabled={!!busy}>
                    템플릿으로 저장
                  </button>
                  <button className="sheet-row" onClick={() => { setMenuOpen(false); exportAs('svg'); }} disabled={!!busy || blocked}>
                    Figma로 수정 (SVG 받기)
                  </button>
                </div>
              </>
            )}
            <div className="sheet-group">
              <button className="sheet-row danger" onClick={() => { setMenuOpen(false); setModal({ kind: 'delete' }); }} disabled={!!busy}>
                {isLayout ? '템플릿 삭제' : '게시물 삭제'}
              </button>
            </div>
            <div className="sheet-group">
              <button className="sheet-row strong" onClick={() => setMenuOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}

      {gallery && (
        <TemplateGallery
          post={post}
          brand={ctx.brand}
          logoSvg={ctx.logoSvg}
          current={gallery === 'switch' ? (slide?.template ?? post.template) : undefined}
          title={gallery === 'switch' ? `${sel + 1}장의 템플릿 고르기` : '새 장의 템플릿 고르기'}
          quickLabel={gallery === 'add' ? '직전 장과 같게 추가' : undefined}
          hidden={library.hidden}
          mine={library.layouts}
          onQuick={() => {
            addSlide();
            setGallery(null);
          }}
          onPick={(key) => {
            if (gallery === 'switch') {
              updateSlide(sel, {
                template: key === post.template ? undefined : key,
                ...photoPatch(TEMPLATES[key].meta, slide),
                ...(key === 'closing-image'
                  ? { media: undefined, mediaType: undefined, imageSha256: undefined, image: undefined }
                  : {}),
              });
            } else addSlide(key);
            setGallery(null);
          }}
          onPickMine={(layout) => {
            if (gallery === 'switch') {
              update((p) => (p.slides[sel] = designSlide(p, layout.slide, p.slides[sel])));
            } else {
              update((p) => p.slides.push(designSlide(p, layout.slide)));
              const t = TEMPLATES[layout.slide.template].meta;
              setImages((im) => [...im, { state: t.mediaTypes.length ? 'missing' : 'none' }]);
              setSel(post.slides.length);
            }
            setGallery(null);
          }}
          onClose={() => setGallery(null)}
        />
      )}

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
                    <li><b>PUBLIC_BASE_URL</b>: 이 서버의 공개 주소(예: <code>https://sns.gnuol.com</code>)를
                      서버 <code>.env</code>에 넣어요. (Instagram이 발행할 이미지를 이 주소에서 가져가요.)</li>
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
                  {FORMAT_LABEL[post.format]} {post.slides.length}장과 캡션이
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
            {modal.kind === 'saveLayout' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveAsLayout(modal.name);
                }}
              >
                <h2>내 템플릿으로 저장</h2>
                <p>
                  지금 게시물의 장 구성({post.slides.length}장)과 장마다 고른 템플릿·디자인 설정
                  (글자 크기·색·음영·스티커 등)을 저장해요. 글과 사진은 저장하지 않아요.
                </p>
                <div className="field">
                  <label>템플릿 이름</label>
                  <input
                    className="text-input"
                    autoFocus
                    maxLength={40}
                    value={modal.name}
                    placeholder="예: 주간 꿀팁 5장"
                    onChange={(e) => setModal({ ...modal, name: e.target.value })}
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setModal(null)}>취소</button>
                  <button type="submit" className="primary" disabled={busy === 'layout' || !modal.name.trim()}>
                    {busy === 'layout' ? '저장 중…' : '저장'}
                  </button>
                </div>
              </form>
            )}
            {modal.kind === 'markPublished' && (
              <>
                <h2>발행됨으로 표시할까요?</h2>
                <p>
                  Instagram에 올린 뒤 기록용으로 상태를 바꿔요. 발행됨으로 표시하고 7일이 지나면
                  사진·영상은 서버에서 자동으로 지워져요(글과 레이아웃은 남아요). 지금 바로
                  정리할 수도 있어요 — 정리는 되돌릴 수 없어요.
                </p>
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>취소</button>
                  <button onClick={() => markPublished(false)}>표시만 하기</button>
                  <button className="primary" onClick={() => markPublished(true)}>
                    표시 + 미디어 정리
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'delete' && (
              <>
                <h2>{isLayout ? '이 템플릿을 삭제할까요?' : '이 게시물을 삭제할까요?'}</h2>
                <p>
                  {isLayout
                    ? '내 템플릿 목록에서 지워지고 되돌릴 수 없어요. 이 템플릿으로 만든 게시물은 그대로 남아요.'
                    : '장 내용과 올린 사진·영상, 수정 기록이 모두 지워지고 되돌릴 수 없어요.'}
                  {!isLayout && post.status === 'published' && ' 이미 발행된 Instagram 게시물은 그대로 남아요.'}
                </p>
                <div className="modal-actions">
                  <button onClick={() => setModal(null)} disabled={busy === 'delete'}>취소</button>
                  <button className="modal-danger" onClick={doDelete} disabled={busy === 'delete'}>
                    {busy === 'delete' ? '삭제 중…' : '삭제하기'}
                  </button>
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

// 세부 조정 — photo-editor style: a strip of round tools (template sliders such as
// 그라데이션 음영, then 크기 · 자간 · 행간 for text), one big slider for the selected
// tool, and for text tools a row of chips choosing which text it applies to. A dot marks
// anything changed; tapping the value resets it.
// Text values live in slide.textStyle[field] = { size: px delta, ls: em, lh: unitless };
// an unset value means "the template's own".
const TEXT_TOOLS = [
  { id: 'size', label: '크기', min: -8, max: 8, step: 0.5, base: 0, fmt: (v) => `${v > 0 ? '+' : ''}${v}px`,
    icon: <><path d="M4 18L9 6l5 12" /><path d="M5.8 14h6.4" /><path d="M15.5 18l3-7.5 3 7.5" /></> },
  { id: 'ls', label: '자간', min: -0.1, max: 0.1, step: 0.005, base: -0.02, fmt: (v) => `${v}em`,
    icon: <><path d="M3 12h18" /><path d="M6 9l-3 3 3 3" /><path d="M18 9l3 3-3 3" /></> },
  { id: 'lh', label: '행간', min: 1.1, max: 2, step: 0.05, base: 1.5, fmt: (v) => `${v}`,
    icon: <><path d="M12 3v18" /><path d="M9 6l3-3 3 3" /><path d="M9 18l3 3 3-3" /></> },
];
const SLIDER_ICON = <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></>;

function AdjustPanel({ fields, sliders, slide, onSlider, onTextStyle }) {
  const tools = [
    ...sliders.map((s) => ({ ...s, id: `slider:${s.key}`, kind: 'slider', icon: SLIDER_ICON })),
    ...(fields.length ? TEXT_TOOLS.map((t) => ({ ...t, kind: 'text' })) : []),
  ];
  const [toolId, setToolId] = useState(tools[0]?.id);
  // Text target: the first field that has text, else the first field.
  const [fieldKey, setFieldKey] = useState(
    () => (fields.find((f) => String(slide[f.key] ?? '').trim()) ?? fields[0])?.key,
  );
  if (!tools.length) return null;
  const tool = tools.find((t) => t.id === toolId) ?? tools[0];
  const styles = slide.textStyle ?? {};

  const changed = (t) =>
    t.kind === 'slider' ? slide[t.key] !== undefined : fields.some((f) => styles[f.key]?.[t.id] !== undefined);

  let value;
  let isSet;
  let label;
  if (tool.kind === 'slider') {
    isSet = slide[tool.key] !== undefined;
    value = slide[tool.key] ?? tool.default;
    label = `${value}${tool.unit ?? ''}`;
  } else {
    const cur = styles[fieldKey]?.[tool.id];
    isSet = cur !== undefined;
    value = cur ?? tool.base;
    label = isSet ? tool.fmt(value) : '기본';
  }
  const min = tool.min;
  const max = tool.max;
  const step = tool.step;
  const round = (v) => Math.round(v / step) * step;
  const clamp = (v) => Math.min(max, Math.max(min, +round(v).toFixed(4)));

  const set = (raw) => {
    const v = raw === undefined ? undefined : clamp(raw);
    if (tool.kind === 'slider') {
      onSlider(tool.key, v === undefined || v === tool.default ? undefined : v);
      return;
    }
    const next = { ...styles };
    const fieldStyle = { ...(next[fieldKey] ?? {}) };
    if (v === undefined || v === tool.base) delete fieldStyle[tool.id];
    else fieldStyle[tool.id] = v;
    if (Object.keys(fieldStyle).length) next[fieldKey] = fieldStyle;
    else delete next[fieldKey];
    onTextStyle(Object.keys(next).length ? next : undefined);
  };
  const base = tool.kind === 'slider' ? tool.default : tool.base;
  const pct = ((base - min) / (max - min)) * 100;

  return (
    <div className="field">
      <label>세부 조정</label>
      <div className="card adjust">
        <div className="adj-tools" role="tablist" aria-label="조정 도구">
          {tools.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tool.id}
              className={`adj-tool ${t.id === tool.id ? 'on' : ''}`}
              onClick={() => setToolId(t.id)}
            >
              <span className="adj-icon">
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
                {changed(t) && <i className="adj-dot" />}
              </span>
              <span className="adj-name">{t.label}</span>
            </button>
          ))}
        </div>

        {tool.kind === 'text' && fields.length > 1 && (
          <div className="adj-targets" aria-label="적용할 글">
            {fields.map((f) => (
              <button
                key={f.key}
                className={`chip ${f.key === fieldKey ? 'on' : ''}`}
                onClick={() => setFieldKey(f.key)}
              >
                {f.label.replace(/\s*\(.*\)$/, '')}
                {styles[f.key]?.[tool.id] !== undefined && <i className="chip-dot" />}
              </button>
            ))}
          </div>
        )}

        <div className="adj-dial">
          <button className="btn-icon adj-step" aria-label="줄이기" onClick={() => set(value - step)} disabled={value <= min}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <div className="adj-track">
            <span className="adj-zero" style={{ left: `${pct}%` }} aria-hidden="true" />
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              aria-label={`${tool.label} 조정`}
              onChange={(e) => set(+e.target.value)}
              onDoubleClick={() => set(undefined)}
            />
          </div>
          <button className="btn-icon adj-step" aria-label="늘리기" onClick={() => set(value + step)} disabled={value >= max}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
        <div className="adj-foot">
          <span className="adj-value">{tool.label} <b>{label}</b></span>
          <button className="link" onClick={() => set(undefined)} disabled={!isSet}>기본값으로</button>
        </div>
      </div>
    </div>
  );
}

function MediaRow({ slide, status, accept, multiple, busy, progress, onUpload, onPin, onZoom }) {
  const [label, tone] = IMAGE_STATE[status?.state] ?? ['확인 중', 'warn'];
  const name = (slide.media ?? slide.image)?.split('/').pop();
  const isImage = name && !isVideoPath(slide.media ?? slide.image);
  const zoom = Math.round((Number(slide.zoom) || 1) * 100);
  return (
    <div className="field photo-row">
      <label>원본 사진·영상</label>
      <div className="card">
      <div className="photo-line">
        {name ? <code title={name}>{name}</code> : <span className="note">아직 없어요</span>}
        {name && <span className={`pill pill-${tone}`}>{label}</span>}
        {(status?.state === 'unpinned' || status?.state === 'changed') && (
          <button className="link" onClick={onPin}>이 파일로 고정</button>
        )}
      </div>
      <label className="upload">
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={busy}
          onChange={(e) => {
            onUpload(e.target.files);
            e.target.value = ''; // the same file can be picked again
          }}
        />
        {busy ? `올리는 중…${progress ? ` (${progress})` : ''}` : name ? '파일 바꾸기' : multiple ? '파일 올리기 (여러 개 가능)' : '파일 올리기'}
      </label>
      {multiple && !busy && (
        <p className="note">여러 개를 고르면 이 장부터 차례로 채우고, 모자라면 장을 새로 만들어요.</p>
      )}
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
    </div>
  );
}

function SourcePanel({ post, brandHandle, onSource, onApplyCredit, notify }) {
  const src = post.source ?? {};
  const copy = async () => {
    await navigator.clipboard.writeText(src.dm ?? '');
    notify('DM 문안을 복사했어요.');
  };
  return (
    <div className="panel-body">
      <p className="note">
        다른 계정의 게시물을 소개할 때 써요. 원본 링크나 계정을 적으면 원작자 허락을 &lsquo;허락 받음&rsquo;으로
        바꾸기 전까지 내려받기·발행이 잠겨요.
      </p>
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
