import Link from 'next/link';
import { listPosts, listBrands } from '@/lib/store.mjs';
import NewPost from './new-post';
import DeletePostButton from './delete-post-button';

export const dynamic = 'force-dynamic';

const STATUS = { draft: '작성 중', approved: '승인', published: '발행됨' };
const TYPE = { knowledge: '지식형', curation: '디깅형' };
const FORMAT = { carousel: '캐러셀', single: '단일', reel: '릴스' };

export default async function Home() {
  const [posts, brands] = await Promise.all([listPosts(), listBrands()]);
  return (
    <main className="home">
      <header className="home-head">
        <h1>SNS Studio</h1>
        <p>계정별 피드를 미리보고 마지막 QA를 한 뒤 내려받거나 발행해요.</p>
        <NewPost brands={brands} />
      </header>
      <ul className="post-list">
        {posts.map((p) => (
          <li key={`${p.brand}/${p.id}`} className="post-item">
            <Link href={`/posts/${p.brand}/${p.id}`} className="post-card">
              <span className="post-brand">@{p.brand}</span>
              <strong className="post-title">{p.title}</strong>
              <span className="post-meta">
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
