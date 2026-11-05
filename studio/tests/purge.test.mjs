import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.STUDIO_CONTENT_ROOT = await mkdtemp(path.join(tmpdir(), 'sns-purge-'));
const { createPost, purgeMedia, readPost, postDir, mediaUsage } = await import('../lib/store.mjs');

const BRAND = 'testbrand';

test('purge removes uploaded media, strips slide refs, stays loadable and idempotent', async () => {
  const post = await createPost({
    brand: BRAND, slug: 'purge-me', template: 'editorial-photo', format: 'carousel',
    contentType: 'knowledge',
    slides: [
      { headline: 'h', media: 'media/photo.jpg', mediaType: 'image', imageSha256: 'abc', stickers: [] },
      { headline: 'asset', image: 'closing/x.jpg', stickers: [] },
    ],
  });
  const mediaDir = path.join(postDir(BRAND, post.id), 'media');
  await mkdir(mediaDir, { recursive: true });
  await writeFile(path.join(mediaDir, 'photo.jpg'), Buffer.alloc(2048));

  const before = await mediaUsage();
  assert.equal(before.find((u) => u.brand === BRAND)?.bytes, 2048);

  const purged = await purgeMedia(BRAND, post.id);
  assert.equal(purged.mediaPurged, true);
  assert.deepEqual(purged.purgedFiles, ['photo.jpg']);
  assert.equal(purged.slides[0].media, undefined);
  assert.equal(purged.slides[0].imageSha256, undefined);
  assert.equal(purged.slides[1].image, 'closing/x.jpg'); // brand asset untouched
  await assert.rejects(() => stat(mediaDir)); // media folder gone

  const reloaded = await readPost(BRAND, post.id);
  assert.equal(reloaded.mediaPurged, true);

  // Second purge is a no-op, not an error.
  const again = await purgeMedia(BRAND, post.id);
  assert.deepEqual(again.purgedFiles, ['photo.jpg']);

  const after = await mediaUsage();
  assert.equal(after.find((u) => u.brand === BRAND)?.bytes, 0);
});
