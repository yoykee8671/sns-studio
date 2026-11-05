import Link from 'next/link';
import { listPosts, listBrands, mediaUsage } from '@/lib/store.mjs';
import { loadSeries } from '@/lib/series.mjs';
import NewPost from './new-post';
import SeriesSection from './series-section';
import DeletePostButton from './delete-post-button';

export const dynamic = 'force-dynamic';

const STATUS = { draft: '작성 중', approved: '승인', published: '발행됨' };
const TYPE = { knowledge: '지식형', curation: '디깅형' };
const FORMAT = { carousel: '캐러셀', single: '단일', reel: '릴스' };

const fmtMB = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes > 104857600 ? 0 : 1)}MB`;

export default async function Home() {
  const [posts, brands, usage] = await Promise.all([listPosts(), listBrands(), mediaUsage()]);
  const usedTotal = usage.reduce((n, u) => n + u.bytes, 0);
  const seriesData = await Promise.all(
    brands.map(async (b) => ({
      brand: b.id,
      handle: b.handle ?? `@${b.id}`,
      series: (await loadSeries(b.id)).series,
    })),
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
            <span className="note"> — 발행 끝난 게시물은 에디터에서 &lsquo;발행됨 + 미디어 정리&rsquo;로 비울 수 있어요.</span>
          </p>
        )}
        <NewPost brands={brands} />
      </header>
      <SeriesSection data={seriesData} posts={posts} />
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
            </Link>
            <DeletePostButton brand={p.brand} id={p.id} />
          </li>
        ))}
        {posts.length === 0 && <li className="empty">content/ 폴더에 게시물이 없어요.</li>}
      </ul>
    </main>
  );
}
