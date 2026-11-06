import { createPost, loadBrand } from '@/lib/store.mjs';
import { TEMPLATES } from '@/lib/templates/index.mjs';
import { getSet } from '@/lib/templates/sets.mjs';
import { DEFAULT_RATIO, isRatio } from '@/lib/templates/sizes.mjs';
import { suggestReady, draftFromManuscript } from '@/lib/suggest.mjs';

// 원고로 시작하기: { brand, text, set, ratio?, slug? } → AI가 원고를 세트의
// 템플릿 장들로 나눠 담은 초안 게시물을 만든다.
export async function POST(req) {
  if (!suggestReady()) return Response.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았어요.' }, { status: 400 });
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '잘못된 요청이에요.' }, { status: 400 });
  }
  const { brand: brandId, text, set: setId, ratio, slug } = body ?? {};
  const set = getSet(setId);
  if (!set) return Response.json({ error: 'unknown set' }, { status: 400 });
  if (!text?.trim() || text.trim().length < 80) {
    return Response.json({ error: '원고가 너무 짧아요. 몇 문단은 있어야 카드로 나눌 수 있어요.' }, { status: 400 });
  }
  if (ratio !== undefined && !isRatio(ratio)) return Response.json({ error: 'unknown ratio' }, { status: 400 });

  try {
    const brand = await loadBrand(brandId);
    const drafts = await draftFromManuscript({ brand, text: text.trim(), set });
    const draftPost = { format: 'carousel', slides: [] };
    const slides = drafts.slice(0, 9).map((d) => {
      const meta = TEMPLATES[d.template].meta;
      const slide = { ...meta.newSlide(draftPost), template: d.template };
      for (const { key, text: value } of d.fields) {
        if (meta.fields.some((f) => f.key === key)) slide[key] = value;
      }
      draftPost.slides.push(slide);
      return slide;
    });
    const post = await createPost({
      brand: brandId,
      slug: slug || 'manuscript',
      template: slides[0].template,
      format: 'carousel',
      ratio: ratio ?? DEFAULT_RATIO,
      contentType: 'knowledge',
      slides,
    });
    return Response.json({ post });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
