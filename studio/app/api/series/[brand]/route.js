import { loadSeries, createSeries, attachPost, nextIssue } from '@/lib/series.mjs';
import { readPost, savePost } from '@/lib/store.mjs';

export async function GET(_req, { params }) {
  const { brand } = await params;
  try {
    return Response.json(await loadSeries(brand));
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}

// Stamps the issue number onto the post itself so the home list can show it.
async function stamp(brand, postId, seriesId, no) {
  const post = await readPost(brand, postId);
  post.series = { id: seriesId, no };
  await savePost(brand, postId, post);
}

export async function POST(req, { params }) {
  const { brand } = await params;
  const body = await req.json();
  try {
    if (body.action === 'create') {
      return Response.json({ series: await createSeries(brand, body.title) });
    }
    if (body.action === 'attach') {
      const { no } = await attachPost(brand, body.seriesId, body.postId, body.title);
      await stamp(brand, body.postId, body.seriesId, no);
      return Response.json({ ok: true, no });
    }
    if (body.action === 'next') {
      const { post, no } = await nextIssue(brand, body.seriesId);
      await stamp(brand, post.id, body.seriesId, no);
      return Response.json({ post: { ...post, series: { id: body.seriesId, no } }, no });
    }
    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
