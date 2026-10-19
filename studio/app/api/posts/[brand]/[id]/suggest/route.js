import { execFile } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { loadBrand, materializeMedia, mediaTypeOf } from '@/lib/store.mjs';
import { suggestCopy, suggestReady } from '@/lib/suggest.mjs';

const run = promisify(execFile);
export const maxDuration = 60;

// Generates three headline/comment drafts for one slide from its photo or
// video first frame plus the brand voice. Body: { post, index, avoid? }.
export async function POST(req, { params }) {
  const { brand: brandId, id } = await params;
  if (!suggestReady()) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY가 설정되지 않았어요. Vercel(또는 .env.local)에 키를 넣으면 문구 추천이 켜져요.' },
      { status: 412 },
    );
  }
  const { post, index, avoid } = await req.json();
  if (post?.brand !== brandId || post?.id !== id) {
    return Response.json({ error: 'brand/id mismatch' }, { status: 400 });
  }
  const slide = post.slides?.[index];
  if (!slide) return Response.json({ error: 'no such slide' }, { status: 400 });

  const tmp = await mkdtemp(path.join(tmpdir(), 'sns-suggest-'));
  try {
    const brand = await loadBrand(brandId);
    let imageBase64 = null;
    const file = await materializeMedia(brand, post, slide, tmp).catch(() => null);
    if (file) {
      // One downscaled JPEG works for both photos and videos (first frame).
      const jpg = path.join(tmp, 'frame.jpg');
      await run(ffmpegPath, ['-y', '-i', file, '-frames:v', '1', '-vf', 'scale=768:-2', '-q:v', '4', jpg]);
      imageBase64 = (await readFile(jpg)).toString('base64');
    }
    const candidates = await suggestCopy({
      brand,
      post,
      slide: { ...slide, mediaType: mediaTypeOf(slide) },
      imageBase64,
      avoid: Array.isArray(avoid) ? avoid.slice(0, 12) : [],
    });
    return Response.json({ candidates });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
