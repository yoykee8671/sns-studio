// One-off migration tool: downloads every object of the old Supabase bucket into a
// local folder laid out like content/ (<brand>/<post>/post.json, media/, .history/).
// The app itself no longer talks to Supabase; this exists only for the final move.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/export-supabase.mjs <dest-dir>
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'sns-studio';
const dest = process.argv[2];
if (!BASE || !KEY || !dest) {
  console.error('usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/export-supabase.mjs <dest-dir>');
  process.exit(1);
}
const headers = { authorization: `Bearer ${KEY}`, apikey: KEY };

async function listDir(prefix) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${BASE}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: prefix ? `${prefix}/` : '', limit: 1000, offset }),
    });
    if (!res.ok) throw new Error(`list failed (${res.status}): ${prefix}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function walk(prefix) {
  const keys = [];
  for (const r of await listDir(prefix)) {
    const key = prefix ? `${prefix}/${r.name}` : r.name;
    if (r.id == null) keys.push(...(await walk(key)));
    else keys.push(key);
  }
  return keys;
}

const root = path.resolve(dest);
const keys = await walk('');
let bytes = 0;
for (const key of keys) {
  const file = path.resolve(root, key);
  if (!file.startsWith(root + path.sep)) throw new Error(`unsafe key: ${key}`);
  const res = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${key}`, { headers });
  if (!res.ok) throw new Error(`download failed (${res.status}): ${key}`);
  const data = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  bytes += data.length;
}
console.log(`${keys.length} files, ${(bytes / 1048576).toFixed(1)}MB → ${root}`);
