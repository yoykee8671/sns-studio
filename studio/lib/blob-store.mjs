// Supabase Storage backend for post content (post.json + uploaded media).
// Active only when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set; local dev
// keeps the file-based store. Everything lives in one private bucket.
const BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const BUCKET = process.env.SUPABASE_BUCKET ?? 'sns-studio';
export const supabaseEnabled = Boolean(BASE && KEY);

const headers = (extra = {}) => ({ authorization: `Bearer ${KEY}`, apikey: KEY, ...extra });

async function ensureBucket() {
  await fetch(`${BASE}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  }).catch(() => {});
}

/** Raw object GET; pass a Range header value for partial video responses. */
export async function getObject(key, { range } = {}) {
  return fetch(`${BASE}/storage/v1/object/${BUCKET}/${key}`, {
    headers: headers(range ? { range } : {}),
  });
}

/** Whole object as a Buffer, or null when it does not exist. */
export async function getBytes(key) {
  const res = await getObject(key);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`storage read failed (${res.status}): ${key}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function putObject(key, data, contentType = 'application/octet-stream') {
  const send = () =>
    fetch(`${BASE}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: headers({ 'content-type': contentType, 'x-upsert': 'true' }),
      body: data,
    });
  let res = await send();
  if (!res.ok && (await res.clone().text()).includes('Bucket not found')) {
    await ensureBucket();
    res = await send();
  }
  if (!res.ok) throw new Error(`storage write failed (${res.status}): ${key}`);
}

/**
 * Signed direct-upload URL: the browser PUTs the file body straight to Supabase,
 * bypassing the 4.5MB request limit of our Vercel functions.
 */
export async function signUpload(key) {
  const send = () =>
    fetch(`${BASE}/storage/v1/object/upload/sign/${BUCKET}/${key}`, {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({}),
    });
  let res = await send();
  if (!res.ok && (await res.clone().text()).includes('Bucket not found')) {
    await ensureBucket();
    res = await send();
  }
  if (!res.ok) throw new Error(`signed upload failed (${res.status}): ${key}`);
  const { url } = await res.json(); // "/object/upload/sign/<bucket>/<key>?token=…"
  return `${BASE}/storage/v1${url.replace(/^\/storage\/v1/, '')}`;
}

/** Server-side copy (used for post.json history snapshots). Missing source is ignored. */
export async function copyObject(sourceKey, destinationKey) {
  await fetch(`${BASE}/storage/v1/object/copy`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({ bucketId: BUCKET, sourceKey, destinationKey }),
  });
}

export async function objectExists(key) {
  const res = await getObject(key, { range: 'bytes=0-0' });
  return res.ok || res.status === 206;
}

/** Every object key under `prefix`, recursively. */
export async function listKeys(prefix) {
  const out = [];
  for (const e of await listDir(prefix)) {
    const key = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.folder) out.push(...(await listKeys(key)));
    else out.push(key);
  }
  return out;
}

/** Permanently deletes every object under `prefix`. */
export async function deletePrefix(prefix) {
  const keys = await listKeys(prefix);
  if (!keys.length) return;
  const res = await fetch(`${BASE}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({ prefixes: keys }),
  });
  if (!res.ok) throw new Error(`storage delete failed (${res.status}): ${prefix}`);
}

/** One directory level under `prefix`: [{ name, folder }]. */
export async function listDir(prefix) {
  const res = await fetch(`${BASE}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({ prefix: prefix ? `${prefix}/` : '', limit: 1000, offset: 0 }),
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.map((r) => ({ name: r.name, folder: r.id == null }));
}
