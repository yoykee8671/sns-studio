import { createPost, listPosts } from '@/lib/store.mjs';
import { TEMPLATES } from '@/lib/templates/index.mjs';

export async function GET() {
  return Response.json({ posts: await listPosts() });
}

// Creates an empty post from a template: { brand, template, format, slug, source? }
export async function POST(req) {
  const { brand, template, format, slug, source } = await req.json();
  const t = TEMPLATES[template];
  if (!t) return Response.json({ error: 'unknown template' }, { status: 400 });
  if (!t.meta.formats.includes(format)) return Response.json({ error: 'unsupported format' }, { status: 400 });
  try {
    const draft = { format, source };
    const post = await createPost({
      brand,
      slug,
      template,
      format,
      contentType: t.meta.contentType,
      source: t.meta.contentType === 'curation' ? { url: '', handle: '', permission: 'none', dm: '', note: '', ...source } : undefined,
      slides: [t.meta.newSlide(draft)],
    });
    return Response.json({ post });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
