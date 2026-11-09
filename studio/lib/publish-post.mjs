// Publishing a saved post to Instagram (render → stage at public URLs → Graph API), used
// by 바로 발행 and by 예약 발행. Instagram's API has no scheduling of its own, so a
// schedule is kept on the post (post.schedule) and this server publishes it when due.
import { readPost, savePost, loadBrand, listPosts } from './store.mjs';
import { renderPost, captionText, permissionError } from './render-server.mjs';
import { publishConfig, publish } from './instagram.mjs';
import { stagePublic, removeStaged, sweepStaged } from './public-media.mjs';

/** Why this post cannot be published right now (null = it can). */
export async function publishBlocker(brand, post) {
  const config = await publishConfig(brand);
  if (!config.ready) return { status: 412, error: 'not configured', missing: config.missing };
  const denied = permissionError(post);
  if (denied) return { status: 403, error: denied };
  if (post.status === 'published') return { status: 409, error: '이미 발행된 게시물이에요.' };
  return null;
}

/** Publishes the post as saved on disk; returns the saved post plus { mediaId, permalink }. */
export async function publishSaved(brandId, id) {
  const brand = await loadBrand(brandId);
  let saved = await readPost(brandId, id);
  const blocked = await publishBlocker(brand, saved);
  if (blocked) throw Object.assign(new Error(blocked.error), { status: blocked.status, missing: blocked.missing });
  let token = null;
  try {
    await sweepStaged();
    const { files } = await renderPost(saved, { format: 'jpg', quality: 95 });
    const staged = await stagePublic(files);
    token = staged.token;
    const result = await publish({ brand, items: staged.items, caption: captionText(saved).trim() });
    // Re-read: the post may have been edited meanwhile; publishing still closes it.
    const latest = await readPost(brandId, id).catch(() => saved);
    const { schedule, ...rest } = latest;
    saved = await savePost(brandId, id, {
      ...rest,
      status: 'published',
      publishedAt: new Date().toISOString(),
      instagram: result,
      ...(schedule ? { scheduledFor: schedule.at } : {}),
    });
    return { post: saved, ...result };
  } finally {
    // publish() returns after media_publish, so Instagram is done fetching by now.
    if (token) await removeStaged(token).catch(() => {});
  }
}

// ---- 예약 발행 ----
// post.schedule = { at: ISO time, state: 'scheduled' | 'publishing' | 'failed', error? }

export const MIN_LEAD_MS = 60_000; // at least a minute ahead
export const MAX_AHEAD_MS = 180 * 86400000; // up to ~6 months

export function checkScheduleTime(at, now = Date.now()) {
  const t = Date.parse(at ?? '');
  if (!Number.isFinite(t)) return '예약 시각을 알 수 없어요.';
  if (t < now + MIN_LEAD_MS) return '예약은 지금부터 1분 뒤 이후로 잡아주세요.';
  if (t > now + MAX_AHEAD_MS) return '예약은 6개월 안으로 잡아주세요.';
  return null;
}

const running = new Set();

/**
 * Publishes every post whose schedule is due. A failure is kept on the post (state
 * 'failed') instead of being retried, so nothing goes up twice; the user reschedules.
 */
export async function runDueSchedules(now = Date.now(), { publishFn = publishSaved } = {}) {
  const done = [];
  for (const p of await listPosts()) {
    if (p.schedule?.state !== 'scheduled' || Date.parse(p.schedule.at) > now) continue;
    const key = `${p.brand}/${p.id}`;
    if (running.has(key)) continue;
    running.add(key);
    try {
      const post = await readPost(p.brand, p.id);
      if (post.schedule?.state !== 'scheduled' || post.status === 'published') continue;
      await savePost(p.brand, p.id, { ...post, schedule: { ...post.schedule, state: 'publishing' } }, { touch: false });
      try {
        await publishFn(p.brand, p.id);
        done.push(key);
      } catch (e) {
        const cur = await readPost(p.brand, p.id);
        await savePost(p.brand, p.id, {
          ...cur,
          schedule: { ...post.schedule, state: 'failed', error: e.message, failedAt: new Date().toISOString() },
        }, { touch: false });
        console.warn(`scheduled publish ${key} failed: ${e.message}`);
      }
    } finally {
      running.delete(key);
    }
  }
  return done;
}

/**
 * After a restart, a post left 'publishing' may or may not have reached Instagram:
 * mark it failed with a note to check, rather than publishing it again.
 */
export async function recoverInterrupted() {
  for (const p of await listPosts()) {
    if (p.schedule?.state !== 'publishing') continue;
    const post = await readPost(p.brand, p.id);
    await savePost(p.brand, p.id, {
      ...post,
      schedule: { ...post.schedule, state: 'failed', error: '발행 도중 서버가 다시 켜졌어요. Instagram에 올라갔는지 확인한 뒤 다시 예약해 주세요.' },
    }, { touch: false });
  }
}
