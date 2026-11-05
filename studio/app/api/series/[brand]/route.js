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

export async function POST(req, { params }) {
  const { brand } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    if (body.action === 'create') {
      return Response.json({ series: await createSeries(brand, String(body.title ?? '').slice(0, 80)) });
    }
    if (body.action === 'attach') {
      // Validate the post up front: a bad id or an already-serialized post must not
      // burn an issue number in series.json (readPost also rejects unsafe ids).
      const post = await readPost(brand, String(body.postId ?? ''));
      if (post.series) {
        return Response.json({ error: '이미 다른 연재에 들어간 게시물이에요.' }, { status: 409 });
      }
      const { no } = await attachPost(brand, body.seriesId, post.id, String(body.title ?? '').slice(0, 80));
      post.series = { id: body.seriesId, no };
      await savePost(brand, post.id, post);
      return Response.json({ ok: true, no });
    }
    if (body.action === 'next') {
      const { post, no } = await nextIssue(brand, body.seriesId);
      post.series = { id: body.seriesId, no };
      await savePost(brand, post.id, post);
      return Response.json({ post, no });
    }
    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
