import { createPost, saveUpload, savePost, readPost } from '@/lib/store.mjs';
import { TEMPLATES } from '@/lib/templates/index.mjs';
import { DEFAULT_RATIO } from '@/lib/templates/sizes.mjs';
import { importFromUrl } from '@/lib/import-url.mjs';

export const maxDuration = 300;

// 링크로 가져오기: { brand, url } → a 디깅형 repost with the post's video(s)/photos on
// slides, the original account credited, and 원작자 허락 pending (export/publish stay
// locked until it is marked granted). One video becomes a 릴스, more a carousel.
export async function POST(req) {
  const { brand, url } = await req.json();
  try {
    const got = await importFromUrl(url);
    const items = got.files.slice(0, 9); // carousel: 9 items + the closing image
    const credit = got.handle ? `📷 @${got.handle}` : '';
    const t = TEMPLATES['curation-frame'];
    const reel = items.length === 1 && items[0].kind === 'video';
    const format = reel ? 'reel' : 'carousel';
    const draft = { format };
    const post = await createPost({
      brand,
      template: 'curation-frame',
      format,
      ratio: reel ? undefined : DEFAULT_RATIO,
      contentType: 'curation',
      source: { url: got.url, handle: got.handle, permission: 'none', dm: '', note: got.caption },
      slides: items.map(() => ({ ...t.meta.newSlide(draft), credit })),
    });
    const fields = [];
    for (const f of items) fields.push(await saveUpload(brand, post.id, f.name, f.data));
    const fresh = await readPost(brand, post.id);
    fields.forEach((fl, i) => Object.assign(fresh.slides[i], fl));
    const saved = await savePost(brand, post.id, fresh);
    return Response.json({ post: saved, count: items.length, skipped: got.files.length - items.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
