import { createPost, listPosts } from '@/lib/store.mjs';
import { TEMPLATES } from '@/lib/templates/index.mjs';
import { getSet, setSlides } from '@/lib/templates/sets.mjs';
import { DEFAULT_RATIO, isRatio } from '@/lib/templates/sizes.mjs';
import { readLayout, layoutAsPost } from '@/lib/layouts.mjs';

export async function GET() {
  return Response.json({ posts: await listPosts() });
}

// Creates a post: blank ({ brand, ratio? } — a 지식형 cover; pick templates per slide in the
// editor), from a 추천 조합 ({ brand, set, ratio? }) or from 내 템플릿 ({ brand, layout }).
// The folder name is automatic (<account>_<YYMMDD>-<NN>) and carousels end on the
// account's 끝장 이미지 unless the line-up already ends on a last-page template.
export async function POST(req) {
  const { brand, template = 'editorial-photo', format = 'carousel', ratio, source, set: setId, layout: layoutId } = await req.json();
  if (ratio !== undefined && !isRatio(ratio)) return Response.json({ error: 'unknown ratio' }, { status: 400 });
  try {
    if (layoutId) {
      const l = layoutAsPost(await readLayout(layoutId));
      const t = TEMPLATES[l.template];
      const post = await createPost({
        brand,
        template: l.template,
        format: l.format,
        ratio: l.format === 'reel' ? undefined : (ratio ?? l.ratio ?? DEFAULT_RATIO),
        contentType: l.contentType,
        source: l.contentType === 'curation' ? { url: '', handle: '', permission: 'none', dm: '', note: '' } : undefined,
        slides: l.slides.length ? l.slides : [t.meta.newSlide(l)],
      });
      return Response.json({ post });
    }
    if (setId) {
      const set = getSet(setId);
      if (!set) return Response.json({ error: 'unknown set' }, { status: 400 });
      const draft = { format: 'carousel' };
      const post = await createPost({
        brand,
        template: set.slides[0],
        format: 'carousel',
        ratio: ratio ?? DEFAULT_RATIO,
        contentType: 'knowledge',
        slides: setSlides(set, draft),
      });
      return Response.json({ post });
    }
    const t = TEMPLATES[template];
    if (!t) return Response.json({ error: 'unknown template' }, { status: 400 });
    if (!t.meta.formats.includes(format)) return Response.json({ error: 'unsupported format' }, { status: 400 });
    const draft = { format, source };
    const post = await createPost({
      brand,
      template,
      format,
      ratio: format === 'reel' ? undefined : (ratio ?? DEFAULT_RATIO),
      contentType: t.meta.contentType,
      source: t.meta.contentType === 'curation' ? { url: '', handle: '', permission: 'none', dm: '', note: '', ...source } : undefined,
      slides: [t.meta.newSlide(draft)],
    });
    return Response.json({ post });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
