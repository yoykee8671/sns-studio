import Link from 'next/link';
import {
  listPosts, listBrands, mediaUsage, loadBrand, loadLogoSvg, expirePublishedMedia, MEDIA_RETENTION_DAYS, clientBrand,
} from '@/lib/store.mjs';
import { hasInstagram } from '@/lib/instagram.mjs';
import { listLayouts } from '@/lib/layouts.mjs';
import { loadSeries } from '@/lib/series.mjs';
import { suggestReady } from '@/lib/suggest.mjs';
import DeletePostButton from './delete-post-button';
import HomeTools from './home-tools';

export const dynamic = 'force-dynamic';

const STATUS = { draft: '작성 중', approved: '승인', published: '발행됨' };
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

export default async function Home({ searchParams }) {
  const { account: accountParam } = await searchParams;
  // The server also runs this hourly; doing it here keeps the list honest right away.
  await expirePublishedMedia().catch(() => {});
  const [posts, brands, usage, layouts] = await Promise.all([
    listPosts(), listBrands(), mediaUsage(), listLayouts(),
  ]);
  // Posts are listed per account (tabs); the choice lives in the URL so the editor's back
  // link returns to the same account.
  const account = brands.some((b) => b.id === accountParam) ? accountParam : brands[0]?.id;
  const counts = Object.fromEntries(brands.map((b) => [b.id, posts.filter((p) => p.brand === b.id).length]));
  const shown = posts.filter((p) => p.brand === account);
  // 공통 템플릿 관리 previews render with the selected account's look.
  const previewBrand = await loadBrand(account);
  const previewLogo = await loadLogoSvg(previewBrand);
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
        avatarSrc: clientBrand(full).avatarSrc ?? null,
        igReady: hasInstagram(full),
      };
    }),
  );
  return (
    <main className="home">
      <header className="home-head">
        <h1 className="brand-title"><Link href="/">SNS Studio</Link></h1>
        {usedTotal > 0 && (
          <p className="usage">
            서버 미디어 {fmtMB(usedTotal)}
            {' · '}
            {usage.filter((u) => u.bytes > 0).map((u) => `@${u.brand} ${fmtMB(u.bytes)}`).join(' · ')}
            <span className="note"> — 발행 완료 {MEDIA_RETENTION_DAYS}일 뒤 사진·영상은 자동으로 지워져요.</span>
          </p>
        )}
      </header>
      <HomeTools
        newPost={{ brands, aiReady: suggestReady(), layouts, defaultBrand: account }}
        series={{ data: seriesData, posts }}
        templates={{ brand: clientBrand(previewBrand), logoSvg: previewLogo }}
        styles={{ data: styleData }}
      >
      <nav className="account-tabs" aria-label="계정">
        {brands.map((b) => (
          <Link
            key={b.id}
            href={`/?account=${b.id}`}
            className={`account-tab ${b.id === account ? 'on' : ''}`}
            aria-current={b.id === account ? 'page' : undefined}
          >
            {b.handle ?? `@${b.id}`}
            <span className="count">{counts[b.id] ?? 0}</span>
          </Link>
        ))}
      </nav>
      <ul className="post-list">
        {shown.map((p) => (
          <li key={`${p.brand}/${p.id}`} className="post-item">
            <Link href={`/posts/${p.brand}/${p.id}`} className="post-card">
              <strong className="post-title">{p.title}</strong>
              <span className="post-meta">
                {p.series && <span className="badge badge-series">{String(p.series.no).padStart(3, '0')}호</span>}{' '}
                {FORMAT[p.format] ?? p.format} {p.slides}장 ·{' '}
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
        {shown.length === 0 && <li className="empty">이 계정에는 아직 게시물이 없어요.</li>}
      </ul>
      </HomeTools>
    </main>
  );
}
