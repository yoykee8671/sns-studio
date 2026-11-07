import { loadBrand } from '@/lib/store.mjs';
import { loadSeries } from '@/lib/series.mjs';
import { suggestCaption, suggestReady } from '@/lib/suggest.mjs';

export const maxDuration = 60;

// Drafts an Instagram caption (detailed/short + hashtags) from the slides' text.
// Body: { post }.
export async function POST(req, { params }) {
  const { brand: brandId, id } = await params;
  if (!suggestReady()) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY가 설정되지 않았어요. 서버 .env(또는 로컬 .env.local)에 키를 넣으면 캡션 초안이 켜져요.' },
      { status: 412 },
    );
  }
  let post;
  try {
    ({ post } = await req.json());
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (post?.brand !== brandId || post?.id !== id) {
    return Response.json({ error: 'brand/id mismatch' }, { status: 400 });
  }
  try {
    const brand = await loadBrand(brandId);
    let series = null;
    if (post.series?.id) {
      const s = (await loadSeries(brandId)).series.find((x) => x.id === post.series.id);
      if (s) series = { title: s.title, no: post.series.no };
    }
    const draft = await suggestCaption({ brand, post, series });
    return Response.json({ draft });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
