import { notFound } from 'next/navigation';
import { readLayout, isLayoutId } from '@/lib/layouts.mjs';
import { listBrands } from '@/lib/store.mjs';
import Editor from '../../posts/[brand]/[id]/editor';

export const dynamic = 'force-dynamic';

// 내 템플릿 편집 — the post editor in layout mode (design only, no media/publishing).
export default async function TemplatePage({ params }) {
  const { id } = await params;
  if (!isLayoutId(id)) notFound();
  const layout = await readLayout(id).catch(() => null);
  if (!layout) notFound();
  const brandId = layout.brand ?? (await listBrands())[0]?.id;
  return <Editor brandId={brandId} postId={id} kind="layout" />;
}
