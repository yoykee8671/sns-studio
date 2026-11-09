// Instagram API publishing: single image, carousel (images/videos mixed) or reel.
// The API pulls media from public URLs, so slides are staged on this server first
// (see public-media.mjs; PUBLIC_BASE_URL must be reachable from the internet).
// Both token kinds work, told apart by their shape: Instagram-Login tokens (IG…) go to
// graph.instagram.com; Facebook-Login / business portfolio tokens (EAA…, e.g. a system
// user's) go to graph.facebook.com, where the same media endpoints exist.

const VERSION = process.env.META_GRAPH_VERSION ?? 'v26.0';
export const isFacebookToken = (token) => /^EAA/.test(token ?? '');
const graphBase = (token) =>
  `https://${isFacebookToken(token) ? 'graph.facebook.com' : process.env.IG_GRAPH_HOST ?? 'graph.instagram.com'}/${VERSION}`;

import { credentials } from './ig-accounts.mjs';

// Each brand publishes to its own Instagram account, connected in the app (계정별 스타일
// 관리 → Instagram 연결; see ig-accounts.mjs) or through the env vars its brand JSON names.
export async function publishConfig(brand) {
  const missing = [];
  if (!(await credentials(brand))) {
    missing.push({ key: 'Instagram 연결', label: `${brand?.handle ?? brand?.id} — 홈 › 계정별 스타일 관리에서 토큰을 넣어 연결` });
  }
  if (!process.env.PUBLIC_BASE_URL) {
    missing.push({ key: 'PUBLIC_BASE_URL', label: '이 서버의 공개 주소 (서버 .env)' });
  }
  return { ready: missing.length === 0, missing };
}

async function graph(pathname, params, token, method = 'POST') {
  const url = new URL(`${graphBase(token)}/${pathname}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  const res =
    method === 'GET'
      ? await fetch(`${url}?${body}`)
      : await fetch(url, { method, body });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Graph API ${res.status}`);
  return json;
}

async function waitUntilReady(containerId, token) {
  // Videos can take a few minutes to process on Instagram's side.
  for (let i = 0; i < 100; i++) {
    const { status_code: status } = await graph(containerId, { fields: 'status_code' }, token, 'GET');
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`컨테이너 상태: ${status}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Instagram 처리 대기 시간 초과');
}

const itemParams = (item) =>
  item.kind === 'video' ? { media_type: 'VIDEO', video_url: item.url } : { image_url: item.url };

/**
 * A single video is always published as a reel (Instagram no longer has plain feed videos).
 * @param {{ brand: object, items: {url: string, kind: 'image'|'video'}[], caption: string }} o
 */
export async function publish({ brand, items, caption }) {
  const cred = await credentials(brand);
  if (!cred) throw new Error('Instagram 연결이 없어요. 계정별 스타일 관리에서 연결해 주세요.');
  const { userId: user, token } = cred;
  let creationId;
  if (items.length === 1) {
    const [item] = items;
    const params =
      item.kind === 'video'
        ? { media_type: 'REELS', video_url: item.url, share_to_feed: 'true', caption }
        : { image_url: item.url, caption };
    ({ id: creationId } = await graph(`${user}/media`, params, token));
  } else {
    const children = [];
    for (const item of items) {
      const { id } = await graph(`${user}/media`, { ...itemParams(item), is_carousel_item: 'true' }, token);
      children.push(id);
    }
    for (const id of children) await waitUntilReady(id, token);
    ({ id: creationId } = await graph(`${user}/media`, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption,
    }, token));
  }
  await waitUntilReady(creationId, token);
  const { id: mediaId } = await graph(`${user}/media_publish`, { creation_id: creationId }, token);
  const { permalink } = await graph(mediaId, { fields: 'permalink' }, token, 'GET');
  return { mediaId, permalink };
}

/**
 * The account's current Instagram profile picture (bytes + extension), via the same
 * user id/token the brand publishes with. Throws when the account has no token.
 */
export async function fetchProfilePicture(brand) {
  const cred = await credentials(brand);
  if (!cred) throw new Error('이 계정은 Instagram 연결(토큰)이 없어요. 사진을 직접 올리거나 먼저 연결해 주세요.');
  const { userId: user, token } = cred;
  const { profile_picture_url: url } = await graph(user, { fields: 'profile_picture_url' }, token, 'GET');
  if (!url) throw new Error('Instagram이 프로필 사진 주소를 주지 않았어요.');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`프로필 사진을 받지 못했어요 (${res.status})`);
  const type = res.headers.get('content-type') ?? '';
  const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
  return { data: Buffer.from(await res.arrayBuffer()), ext };
}

/** True when the brand has Instagram credentials (in-app or env; no network call). */
export const hasInstagram = async (brand) => Boolean(await credentials(brand));

/**
 * Checks a token with Instagram and returns the account it belongs to
 * ({ userId, username }). Throws Instagram's own message when it is invalid.
 */
export async function verifyToken(token, handle) {
  if (!isFacebookToken(token)) {
    const me = await graph('me', { fields: 'user_id,username' }, token, 'GET');
    return { userId: String(me.user_id ?? me.id ?? ''), username: me.username ?? '' };
  }
  // A Facebook token reaches Instagram through the Pages it manages: pick the linked
  // Instagram account that matches this brand's handle (or the only one there is).
  const { data = [] } = await graph('me/accounts', { fields: 'name,instagram_business_account{id,username}', limit: '100' }, token, 'GET');
  const found = data.map((p) => p.instagram_business_account).filter(Boolean);
  if (!found.length) {
    throw new Error('이 토큰으로 볼 수 있는 Facebook 페이지에 연결된 Instagram 비즈니스 계정이 없어요. 토큰 권한(pages_show_list, instagram_basic, instagram_content_publish)과 페이지·Instagram 연결을 확인해 주세요.');
  }
  const want = String(handle ?? '').replace(/^@/, '').toLowerCase();
  const ig = found.find((a) => a.username?.toLowerCase() === want) ?? (found.length === 1 ? found[0] : null);
  if (!ig) throw new Error(`이 토큰에 연결된 계정(${found.map((a) => a.username).join(', ')}) 중에 ${want || '이 계정'}이 없어요.`);
  return { userId: String(ig.id), username: ig.username ?? '' };
}

/**
 * Extends a long-lived Instagram Login token for another 60 days (allowed once it is a
 * day old and not yet expired). Returns the new token.
 */
export async function refreshToken(token) {
  if (isFacebookToken(token)) return token; // Facebook tokens are not renewed this way
  const url = new URL(`https://${process.env.IG_GRAPH_HOST ?? 'graph.instagram.com'}/refresh_access_token`);
  url.search = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error || !json.access_token) throw new Error(json.error?.message ?? `refresh ${res.status}`);
  return json.access_token;
}
