import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Point the store at a throwaway content root before importing it (module-level const).
process.env.STUDIO_CONTENT_ROOT = await mkdtemp(path.join(tmpdir(), 'sns-series-'));
const { createSeries, attachPost, nextIssue, loadSeries } = await import('../lib/series.mjs');
const { createPost, deletePost } = await import('../lib/store.mjs');

const BRAND = 'testbrand';
const slide = { template: 'numbered-section', no: '1', title: '제목', body: '본문', stickers: [] };

test('create + attach numbers issues sequentially', async () => {
  const s = await createSeries(BRAND, '주간 테스트');
  const p1 = await createPost({
    brand: BRAND, slug: 'ep-one', template: 'editorial-photo', format: 'carousel',
    contentType: 'knowledge', slides: [structuredClone(slide)],
  });
  const a = await attachPost(BRAND, s.id, p1.id, '1호');
  assert.equal(a.no, 1);
  const { post, no } = await nextIssue(BRAND, s.id);
  assert.equal(no, 2);
  assert.deepEqual(post.series ?? null, null); // series stamp is applied by the API layer
  assert.equal(post.slides[0].template, 'numbered-section');
  assert.equal(post.slides[0].title, undefined); // content blanked
  assert.equal(post.slides[0].no, '1'); // slide numbering is layout, kept for the next issue
  const data = await loadSeries(BRAND);
  assert.equal(data.series[0].nextNo, 3);
});

test('next issue falls back to newest existing post when latest was deleted', async () => {
  const data = await loadSeries(BRAND);
  const s = data.series[0];
  const latest = s.posts.at(-1);
  await deletePost(BRAND, latest.postId);
  const { no } = await nextIssue(BRAND, s.id);
  assert.equal(no, 3);
});

test('next issue on an empty series is a clear error', async () => {
  const s = await createSeries(BRAND, '빈 연재');
  await assert.rejects(() => nextIssue(BRAND, s.id), /게시물이 없어요/);
});

before(() => {
  process.on('exit', () => {
    rm(process.env.STUDIO_CONTENT_ROOT, { recursive: true, force: true }).catch(() => {});
  });
});
