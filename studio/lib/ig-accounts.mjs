// Instagram connections per account, entered in the app (계정별 스타일 관리 → Instagram
// 연결) instead of server env vars. Stored only on the server volume, file mode 0600:
// <CONTENT_ROOT>/_secrets/instagram.json = { [brandId]: { userId, token, username, savedAt, refreshedAt } }.
// Tokens never leave the server: the API only reports username / connected state.
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_ROOT } from './store.mjs';

const FILE = path.join(CONTENT_ROOT, '_secrets', 'instagram.json');

export async function readAccounts() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeAccounts(all) {
  await mkdir(path.dirname(FILE), { recursive: true, mode: 0o700 });
  await writeFile(FILE, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  await chmod(FILE, 0o600);
}

export async function saveAccount(brandId, entry) {
  const all = await readAccounts();
  all[brandId] = { ...all[brandId], ...entry };
  await writeAccounts(all);
}

export async function removeAccount(brandId) {
  const all = await readAccounts();
  delete all[brandId];
  await writeAccounts(all);
}

/**
 * The account's credentials: the in-app connection first, else the env vars the brand
 * JSON names (brand.ig.userIdEnv / tokenEnv). null when neither has a token.
 */
export async function credentials(brand) {
  const saved = (await readAccounts())[brand?.id];
  if (saved?.token) return { userId: saved.userId || 'me', token: saved.token, username: saved.username, source: 'app' };
  const ig = brand?.ig;
  const token = ig?.tokenEnv && process.env[ig.tokenEnv];
  const userId = ig?.userIdEnv && process.env[ig.userIdEnv];
  return token ? { userId: userId || 'me', token, source: 'env' } : null;
}
