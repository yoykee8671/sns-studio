import { listLayouts, createLayout, readHidden, readFavorites, overridesOf } from '@/lib/layouts.mjs';
import { loadBrand } from '@/lib/store.mjs';

export async function GET() {
  const [all, hidden, favorites] = await Promise.all([listLayouts(), readHidden(), readFavorites()]);
  // Edited built-ins are not 내 템플릿: they replace the built-in's look in the pickers.
  return Response.json({ layouts: all.filter((l) => !l.builtinKey), overrides: overridesOf(all), hidden, favorites });
}

// { name, desc?, post } saves an edited post's design; { builtin, brand, name? } copies
// a built-in template so it can be customized.
export async function POST(req) {
  const { name, desc, post, builtin, brand, override } = await req.json();
  try {
    const brandId = post?.brand ?? brand;
    await loadBrand(brandId); // validates the brand id
    const layout = await createLayout({ name, desc, brand: brandId, post, builtin, override: Boolean(override) });
    return Response.json({ layout });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
