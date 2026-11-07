import { saveFavorites } from '@/lib/layouts.mjs';

// { favorites: ['builtin:<key>' | 'mine:<id>', …] } — 즐겨찾는 템플릿, shown first in the picker.
export async function PUT(req) {
  const { favorites } = await req.json();
  if (!Array.isArray(favorites)) return Response.json({ error: 'favorites must be a list' }, { status: 400 });
  return Response.json({ favorites: await saveFavorites(favorites) });
}
