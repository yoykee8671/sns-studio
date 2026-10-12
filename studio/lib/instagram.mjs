// Instagram API publishing: single image, carousel (images/videos mixed) or reel.
// The API pulls media from public URLs, so slides are uploaded to Vercel Blob first.
// Default host is the "Instagram API with Instagram Login" flavor (no Facebook Page
// needed); set IG_GRAPH_HOST=graph.facebook.com for the Facebook-Login flavor.
import { put } from '@vercel/blob';

const GRAPH = `https://${process.env.IG_GRAPH_HOST ?? 'graph.instagram.com'}/${
  process.env.META_GRAPH_VERSION ?? 'v26.0'
}`;

export function publishConfig() {
  const required = {
    IG_USER_ID: 'Instagram 비즈니스 계정 ID',
    IG_ACCESS_TOKEN: 'Meta 액세스 토큰',
    BLOB_READ_WRITE_TOKEN: '이미지 공개 URL용 Vercel Blob 토큰',
  };
  const missing = Object.entries(required)
    .filter(([key]) => !process.env[key])
    .map(([key, label]) => ({ key, label }));
  return { ready: missing.length === 0, missing };
}

async function graph(pathname, params, method = 'POST') {
  const url = new URL(`${GRAPH}/${pathname}`);
  const body = new URLSearchParams({ ...params, access_token: process.env.IG_ACCESS_TOKEN });
  const res =
    method === 'GET'
      ? await fetch(`${url}?${body}`)
      : await fetch(url, { method, body });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Graph API ${res.status}`);
  return json;
}

async function waitUntilReady(containerId) {
  // Videos can take a few minutes to process on Instagram's side.
  for (let i = 0; i < 100; i++) {
    const { status_code: status } = await graph(containerId, { fields: 'status_code' }, 'GET');
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`컨테이너 상태: ${status}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Instagram 처리 대기 시간 초과');
}

/** @param {{name: string, data: Buffer, type: string}[]} files */
export async function uploadMedia(prefix, files) {
  return Promise.all(
    files.map(async (f) => {
      const blob = await put(`${prefix}/${f.name}`, f.data, {
        access: 'public',
        contentType: f.type,
        addRandomSuffix: true,
      });
      return { url: blob.url, kind: f.type.startsWith('video/') ? 'video' : 'image' };
    }),
  );
}

const itemParams = (item) =>
  item.kind === 'video' ? { media_type: 'VIDEO', video_url: item.url } : { image_url: item.url };

/**
 * A single video is always published as a reel (Instagram no longer has plain feed videos).
 * @param {{ items: {url: string, kind: 'image'|'video'}[], caption: string }} o
 */
export async function publish({ items, caption }) {
  const user = process.env.IG_USER_ID;
  let creationId;
  if (items.length === 1) {
    const [item] = items;
    const params =
      item.kind === 'video'
        ? { media_type: 'REELS', video_url: item.url, share_to_feed: 'true', caption }
        : { image_url: item.url, caption };
    ({ id: creationId } = await graph(`${user}/media`, params));
  } else {
    const children = [];
    for (const item of items) {
      const { id } = await graph(`${user}/media`, { ...itemParams(item), is_carousel_item: 'true' });
      children.push(id);
    }
    for (const id of children) await waitUntilReady(id);
    ({ id: creationId } = await graph(`${user}/media`, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption,
    }));
  }
  await waitUntilReady(creationId);
  const { id: mediaId } = await graph(`${user}/media_publish`, { creation_id: creationId });
  const { permalink } = await graph(mediaId, { fields: 'permalink' }, 'GET');
  return { mediaId, permalink };
}
