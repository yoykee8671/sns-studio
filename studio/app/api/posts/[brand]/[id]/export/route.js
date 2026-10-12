import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { postDir } from '@/lib/store.mjs';
import { renderPost, captionText, permissionError, ImageChangedError } from '@/lib/render-server.mjs';

const FORMATS = new Set(['png', 'jpg', 'svg']);

// Renders the editor's current (possibly unsaved) post and returns a zip.
// format 'svg' is the layered file set for editing in Figma. Video slides always come out as MP4.
// body.only = a single 0-based slide index → that slide comes back as one bare file, not a zip.
export async function POST(req, { params }) {
  const { brand: brandId, id } = await params;
  const { post, format, only } = await req.json();
  if (!FORMATS.has(format)) return Response.json({ error: 'unknown format' }, { status: 400 });
  if (post?.brand !== brandId || post?.id !== id) {
    return Response.json({ error: 'brand/id mismatch' }, { status: 400 });
  }
  const denied = permissionError(post);
  if (denied) return Response.json({ error: denied }, { status: 403 });

  try {
    if (Number.isInteger(only)) {
      const { files } = await renderPost(post, { format, only: [only] });
      const f = files[0];
      if (!f) return Response.json({ error: 'slide not found' }, { status: 404 });
      return new Response(f.data, {
        headers: {
          'Content-Type': f.type,
          'Content-Disposition': `attachment; filename="${brandId}_${id}_${f.name}"`,
        },
      });
    }

    const { files } = await renderPost(post, { format });
    const out = path.join(postDir(brandId, id), 'out');
    await mkdir(out, { recursive: true });

    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.name, f.data);
      await writeFile(path.join(out, f.name), f.data);
    }
    const caption = captionText(post);
    zip.file('caption.txt', caption);
    await writeFile(path.join(out, 'caption.txt'), caption);

    const body = await zip.generateAsync({ type: 'uint8array' });
    const name = `${brandId}_${id}_${format === 'svg' ? 'figma' : format}.zip`;
    return new Response(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${name}"`,
      },
    });
  } catch (err) {
    const status = err instanceof ImageChangedError ? 409 : 500;
    return Response.json({ error: err.message }, { status });
  }
}
