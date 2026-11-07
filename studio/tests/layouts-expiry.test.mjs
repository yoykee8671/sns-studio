import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.STUDIO_CONTENT_ROOT = await mkdtemp(path.join(tmpdir(), 'sns-layouts-'));
const store = await import('../lib/store.mjs');
const layouts = await import('../lib/layouts.mjs');

const BRAND = 'testbrand';
const DAY = 86400000;
const exists = (p) => stat(p).then(() => true, () => false);

test('savePost stamps publishedAt once and drops it when unpublished', async () => {
  const post = await store.createPost({
    brand: BRAND, slug: 'stamp', template: 'editorial-photo', format: 'carousel',
    contentType: 'knowledge', slides: [{ headline: 'h', stickers: [] }],
  });
  assert.equal(post.publishedAt, undefined);
  const pub = await store.savePost(BRAND, post.id, { ...post, status: 'published' });
  assert.ok(pub.publishedAt);
  const again = await store.savePost(BRAND, post.id, { ...pub, caption: 'x' });
  assert.equal(again.publishedAt, pub.publishedAt);
  const back = await store.savePost(BRAND, post.id, { ...again, status: 'draft' });
  assert.equal(back.publishedAt, undefined);
});

test('media of posts published 7+ days ago are purged; text and updatedAt stay', async () => {
  const mk = async (slug, publishedAt) => {
    const p = await store.createPost({
      brand: BRAND, slug, template: 'editorial-photo', format: 'carousel', contentType: 'knowledge',
      slides: [{ headline: `keep ${slug}`, media: 'media/a.jpg', mediaType: 'image', stickers: [] }],
    });
    const dir = store.postDir(BRAND, p.id);
    await mkdir(path.join(dir, 'media'), { recursive: true });
    await mkdir(path.join(dir, 'out'), { recursive: true });
    await writeFile(path.join(dir, 'media', 'a.jpg'), Buffer.alloc(10));
    await writeFile(path.join(dir, 'out', '01.jpg'), Buffer.alloc(10));
    // Write the published state directly so publishedAt can sit in the past.
    const raw = { ...p, status: 'published', publishedAt, updatedAt: publishedAt };
    await writeFile(path.join(dir, 'post.json'), JSON.stringify(raw));
    return p.id;
  };
  const old = await mk('old', new Date(Date.now() - 8 * DAY).toISOString());
  const fresh = await mk('fresh', new Date(Date.now() - 2 * DAY).toISOString());

  const purged = await store.expirePublishedMedia();
  assert.deepEqual(purged, [`${BRAND}/${old}`]);

  const o = await store.readPost(BRAND, old);
  assert.equal(o.mediaPurged, true);
  assert.equal(o.slides[0].headline, 'keep old');
  assert.equal(o.slides[0].media, undefined);
  assert.equal(o.updatedAt, o.publishedAt, 'housekeeping keeps the last-saved date');
  assert.equal(await exists(path.join(store.postDir(BRAND, old), 'media')), false);
  assert.equal(await exists(path.join(store.postDir(BRAND, old), 'out')), false);

  const f = await store.readPost(BRAND, fresh);
  assert.equal(f.slides[0].media, 'media/a.jpg');
  assert.ok(store.mediaExpiresAt(f));
  assert.deepEqual(await store.expirePublishedMedia(), [], 'second run is a no-op');
});

test('a layout keeps design and slide order but drops text and media', async () => {
  const post = {
    brand: BRAND, format: 'carousel', ratio: '4:5', contentType: 'knowledge', template: 'cover-minimal',
    slides: [
      { title: '표지 제목', photo: 'show', media: 'media/x.jpg', mediaType: 'image', zoom: 2, stickers: [{ id: 's', type: 'label' }] },
      { template: 'inner-numbered-dark', no: '7', title: '소제목', body: '본문', textStyle: { body: { size: 2 } } },
      { template: 'inner-numbered-dark', no: '9', title: 'b', body: 'c' },
    ],
  };
  const l = await layouts.createLayout({ name: '  주간   꿀팁 ', brand: BRAND, post });
  assert.equal(l.name, '주간 꿀팁');
  assert.equal(l.ratio, '4:5');
  const [cover, a, b] = l.slides;
  assert.equal(cover.photo, 'show');
  assert.deepEqual(cover.stickers, [{ id: 's', type: 'label' }]);
  for (const k of ['title', 'media', 'mediaType', 'zoom']) assert.ok(!cover[k], `cover.${k} stripped`);
  assert.equal(a.template, 'inner-numbered-dark');
  assert.deepEqual(a.textStyle, { body: { size: 2 } });
  assert.ok(!a.title && !a.body);
  assert.deepEqual([a.no, b.no], ['1', '2'], 'numbering restarts');

  const listed = await layouts.listLayouts();
  assert.equal(listed.length, 1);

  const renamed = await layouts.updateLayout(l.id, { name: '새 이름' });
  assert.equal(renamed.name, '새 이름');
  assert.equal(renamed.slides.length, 3);

  const fromPost = layouts.layoutAsPost(renamed);
  const created = await store.createPost({
    brand: BRAND, slug: 'from-layout', template: fromPost.template, format: fromPost.format,
    ratio: fromPost.ratio, contentType: fromPost.contentType, slides: fromPost.slides,
  });
  assert.equal(created.slides.length, 3);

  await layouts.deleteLayout(l.id);
  assert.equal((await layouts.listLayouts()).length, 0);
});

test('a built-in copy becomes a one-slide layout; hidden list keeps known keys only', async () => {
  const l = await layouts.createLayout({ builtin: 'quote-dark', brand: BRAND });
  assert.equal(l.slides.length, 1);
  assert.match(l.name, /복사본$/);
  assert.equal((await layouts.listLayouts())[0].slide.template, 'quote-dark');
  assert.deepEqual(await layouts.saveHidden(['quote-dark', 'nope', 'quote-dark']), ['quote-dark']);
  assert.deepEqual(await layouts.readHidden(), ['quote-dark']);
  assert.equal(layouts.isLayoutId('../x'), false);
  JSON.parse(await readFile(path.join(process.env.STUDIO_CONTENT_ROOT, '_layouts', `${l.id}.json`), 'utf8'));
});

test('legacy published posts without publishedAt get a fresh 7 days, not an instant purge', async () => {
  const p = await store.createPost({
    brand: BRAND, slug: 'legacy', template: 'editorial-photo', format: 'carousel', contentType: 'knowledge',
    slides: [{ headline: 'x', media: 'media/a.jpg', mediaType: 'image', stickers: [] }],
  });
  const dir = store.postDir(BRAND, p.id);
  const old = new Date(Date.now() - 30 * DAY).toISOString();
  await writeFile(path.join(dir, 'post.json'), JSON.stringify({ ...p, status: 'published', updatedAt: old }));
  const purged = await store.expirePublishedMedia();
  assert.ok(!purged.includes(`${BRAND}/${p.id}`));
  const after = await store.readPost(BRAND, p.id);
  assert.equal(after.slides[0].media, 'media/a.jpg');
  assert.ok(after.publishedAt && Date.now() - Date.parse(after.publishedAt) < 60000);
  assert.equal(after.updatedAt, old);
});

test('text left over from a previous template and sticker text are not saved into a layout', async () => {
  const post = {
    brand: BRAND, format: 'carousel', contentType: 'knowledge', template: 'editorial-photo',
    slides: [{
      template: 'quote-dark', headline: 'old headline', source: '출처 | someone',
      stickers: [{ id: 'p', type: 'postit', text: 'my note', x: 10, y: 20 }],
    }, { template: 'no-such-template', headline: 'x' }],
  };
  const [a, b] = layouts.stripSlides(post);
  assert.ok(!a.headline && !a.source);
  assert.notEqual(a.stickers[0].text, 'my note');
  assert.equal(a.stickers[0].x, 10);
  assert.equal(a.template, 'quote-dark');
  assert.equal(b.template, undefined, 'unknown template keys fall back to the post template');
});

test('new post ids follow <account>_<YYMMDD>-<NN> in Korea time', async () => {
  // A day no other test creates posts on (they use the real clock), across the KST rollover.
  const id1 = await store.newPostId(BRAND, new Date('2031-03-09T16:30:00Z')); // 03-10 01:30 KST
  assert.equal(id1, `${BRAND}_310310-01`); // the folder is claimed by newPostId itself
  assert.equal(await store.newPostId(BRAND, new Date('2031-03-09T16:30:00Z')), `${BRAND}_310310-02`);
});
