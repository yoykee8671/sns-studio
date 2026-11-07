import { saveHidden } from '@/lib/layouts.mjs';

// { hidden: [templateKey...] } — built-in templates left out of the pickers.
export async function PUT(req) {
  const { hidden } = await req.json();
  if (!Array.isArray(hidden)) return Response.json({ error: 'hidden must be a list' }, { status: 400 });
  return Response.json({ hidden: await saveHidden(hidden) });
}
