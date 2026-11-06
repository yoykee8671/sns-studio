import { createPost, listPosts } from '@/lib/store.mjs';
import { TEMPLATES } from '@/lib/templates/index.mjs';
import { getSet, setSlides } from '@/lib/templates/sets.mjs';
import { DEFAULT_RATIO, isRatio } from '@/lib/templates/sizes.mjs';

export async function GET() {
  return Response.json({ posts: await listPosts() });
}

// Creates an empty post from a template ({ brand, template, format, ratio?, slug, source? })
// or from a 추천 조합 ({ brand, set, ratio?, slug }) whose slides come pre-templated.
export async function POST(req) {
  const { brand, template, format, ratio, slug, source, set: setId } = await req.json();
  if (ratio !== undefined && !isRatio(ratio)) return Response.json({ error: 'unknown ratio' }, { status: 400 });
  try {
    if (setId) {
      const set = getSet(setId);
      if (!set) return Response.json({ error: 'unknown set' }, { status: 400 });
      const draft = { format: 'carousel' };
      const post = await createPost({
        brand,
        slug: slug || set.id,
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
      slug,
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
