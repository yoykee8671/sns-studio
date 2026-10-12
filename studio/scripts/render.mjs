// Usage: node scripts/render.mjs <brand> <post-id> [--format png|jpg|svg] [--pin]
// Renders every slide to content/<brand>/<post>/out/ plus caption.txt — same engine as the web app.
// --pin records the current photo hashes into post.json (use after approving the images).
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { readPost, savePost, postDir, loadBrand, imageStatus } from '../lib/store.mjs';
import { renderPost, captionText } from '../lib/render-server.mjs';

const [brandId, postId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name) => process.argv.includes(`--${name}`);
const format = flag('format') ? process.argv[process.argv.indexOf('--format') + 1] : 'png';

let post = await readPost(brandId, postId);
if (flag('pin')) {
  const status = await imageStatus(await loadBrand(brandId), post);
  post.slides.forEach((s, i) => {
    if (status[i].sha) s.imageSha256 = status[i].sha;
  });
  post = await savePost(brandId, postId, post);
  console.log('pinned image hashes → post.json');
}

const { files, reports } = await renderPost(post, { format });
const out = path.join(postDir(brandId, postId), 'out');
await mkdir(out, { recursive: true });
for (const f of files) await writeFile(path.join(out, f.name), f.data);
await writeFile(path.join(out, 'caption.txt'), captionText(post));

let issues = 0;
reports.forEach((r, i) => {
  console.log(`slide ${i + 1}: top ${r.topLum?.toFixed(3) ?? '-'} → ${r.tone === 'dark' ? 'black' : 'white'}`);
  for (const issue of r.issues) {
    console.error(`  ! ${issue}`);
    issues++;
  }
});
console.log(issues ? `\n${issues} issue(s)` : `\nOK → ${out}`);
process.exitCode = issues ? 1 : 0;
