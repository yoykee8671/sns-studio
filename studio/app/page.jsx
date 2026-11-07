import Link from 'next/link';
import {
  listPosts, listBrands, mediaUsage, loadBrand, expirePublishedMedia, MEDIA_RETENTION_DAYS,
} from '@/lib/store.mjs';
import { listLayouts, readHidden } from '@/lib/layouts.mjs';
import { TEMPLATES, ROLE_ORDER } from '@/lib/templates/index.mjs';
import { loadSeries } from '@/lib/series.mjs';
import { suggestReady } from '@/lib/suggest.mjs';
import NewPost from './new-post';
import SeriesSection from './series-section';
import BrandStyleSection from './brand-style-section';
import DeletePostButton from './delete-post-button';
import TemplatesSection from './templates-section';

export const dynamic = 'force-dynamic';

const STATUS = { draft: '작성 중', approved: '승인', published: '발행됨' };
const TYPE = { knowledge: '지식형', curation: '디깅형' };
const FORMAT = { carousel: '캐러셀', single: '단일', reel: '릴스' };

const fmtMB = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes > 104857600 ? 0 : 1)}MB`;

// 2026.11.07 16:34 (Korea time — the server container runs in UTC).
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const fmtDate = (iso) => {
  if (!iso) return '—';
  const p = Object.fromEntries(dateFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
};
const daysLeft = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400000));

export default async function Home() {
  // The server also runs this hourly; doing it here keeps the list honest right away.
  await expirePublishedMedia().catch(() => {});
  const [posts, brands, usage, layouts, hidden] = await Promise.all([
    listPosts(), listBrands(), mediaUsage(), listLayouts(), readHidden(),
  ]);
  const builtins = Object.entries(TEMPLATES)
    .map(([key, t]) => ({ key, label: t.meta.label, role: t.meta.role }))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const usedTotal = usage.reduce((n, u) => n + u.bytes, 0);
  const seriesData = await Promise.all(
    brands.map(async (b) => ({
      brand: b.id,
      handle: b.handle ?? `@${b.id}`,
      series: (await loadSeries(b.id)).series,
    })),
  );
  const styleData = await Promise.all(
    brands.map(async (b) => {
      const full = await loadBrand(b.id); // colors/fonts already merged with overrides
      return {
        brand: b.id,
        handle: b.handle ?? `@${b.id}`,
        effective: {
          point: full.colors.blue,
          highlight: full.colors.lime,
          headline: full.fonts.headline,
          body: full.fonts.body,
        },
        overrides: full.style ?? {},
      };
    }),
  );
  return (
    <main className="home">
      <header className="home-head">
        <h1>SNS Studio</h1>
        <p>계정별 피드를 미리보고 마지막 QA를 한 뒤 내려받거나 발행해요.</p>
        {usedTotal > 0 && (
          <p className="usage">
            서버 미디어 {fmtMB(usedTotal)}
            {' · '}
            {usage.filter((u) => u.bytes > 0).map((u) => `@${u.brand} ${fmtMB(u.bytes)}`).join(' · ')}
            <span className="note"> — 발행 완료 {MEDIA_RETENTION_DAYS}일 뒤 사진·영상은 자동으로 지워져요.</span>
          </p>
        )}
        <NewPost brands={brands} aiReady={suggestReady()} layouts={layouts} />
      </header>
      <SeriesSection data={seriesData} posts={posts} />
      <TemplatesSection layouts={layouts} hidden={hidden} builtins={builtins} previewBrand={brands[0]?.id} />
      <BrandStyleSection data={styleData} />
      <ul className="post-list">
        {posts.map((p) => (
          <li key={`${p.brand}/${p.id}`} className="post-item">
            <Link href={`/posts/${p.brand}/${p.id}`} className="post-card">
              <span className="post-brand">@{p.brand}</span>
              <strong className="post-title">{p.title}</strong>
              <span className="post-meta">
                {p.series && <span className="badge badge-series">{String(p.series.no).padStart(3, '0')}호</span>}{' '}
                {TYPE[p.contentType] ?? p.contentType} · {FORMAT[p.format] ?? p.format} {p.slides}장 ·{' '}
                <span className={`badge badge-${p.status}`}>{STATUS[p.status] ?? p.status}</span>
              </span>
              <span className="post-dates">
                최종 저장 {fmtDate(p.updatedAt)}
                {p.publishedAt && <> · 발행 완료 {fmtDate(p.publishedAt)}</>}
                {p.mediaPurged && <> · 사진·영상 정리됨</>}
                {p.mediaExpiresAt && <> · 사진·영상 {daysLeft(p.mediaExpiresAt)}일 뒤 삭제</>}
              </span>
            </Link>
            <DeletePostButton brand={p.brand} id={p.id} />
          </li>
        ))}
        {posts.length === 0 && <li className="empty">content/ 폴더에 게시물이 없어요.</li>}
      </ul>
    </main>
  );
}
