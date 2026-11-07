import { listLayouts, createLayout, readHidden, readFavorites } from '@/lib/layouts.mjs';
import { loadBrand } from '@/lib/store.mjs';

export async function GET() {
  const [layouts, hidden, favorites] = await Promise.all([listLayouts(), readHidden(), readFavorites()]);
  return Response.json({ layouts, hidden, favorites });
}

// { name, desc?, post } saves an edited post's design; { builtin, brand, name? } copies
// a built-in template so it can be customized.
export async function POST(req) {
  const { name, desc, post, builtin, brand } = await req.json();
  try {
    const brandId = post?.brand ?? brand;
    await loadBrand(brandId); // validates the brand id
    const layout = await createLayout({ name, desc, brand: brandId, post, builtin });
    return Response.json({ layout });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
