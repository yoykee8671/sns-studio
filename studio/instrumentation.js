// Runs once when the server starts. Schedules the hourly media expiry (published posts
// lose their photos/videos 7 days after publishing, see store.mjs) and fills in missing
// account profile photos from Instagram.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { expirePublishedMedia } = await import('./lib/store.mjs');
  const run = () =>
    expirePublishedMedia()
      .then((ids) => ids.length && console.log(`media expiry: purged ${ids.join(', ')}`))
      .catch((e) => console.warn(`media expiry failed: ${e.message}`));
  setTimeout(run, 30_000); // shortly after boot, then hourly
  // Instagram tokens connected in the app last 60 days: extend them weekly (checked daily).
  const renew = async () => {
    const { readAccounts, saveAccount } = await import('./lib/ig-accounts.mjs');
    const { refreshToken } = await import('./lib/instagram.mjs');
    for (const [id, acc] of Object.entries(await readAccounts())) {
      if (!acc.token || /^EAA/.test(acc.token) || Date.now() - Date.parse(acc.refreshedAt ?? 0) < 7 * 86400000) continue;
      try {
        await saveAccount(id, { token: await refreshToken(acc.token), refreshedAt: new Date().toISOString() });
        console.log(`instagram token renewed: ${id}`);
      } catch (e) {
        console.warn(`instagram token renew ${id}: ${e.message}`);
      }
    }
  };
  setTimeout(renew, 60_000);
  setInterval(renew, 24 * 60 * 60 * 1000).unref?.();
  // Profile photos (팔로우 카드): fetch from Instagram once for accounts that have a
  // token but no photo yet. Uploading or re-fetching later is done from the home page.
  setTimeout(async () => {
    const { listBrands, loadBrand, saveBrandAvatar } = await import('./lib/store.mjs');
    const { fetchProfilePicture, hasInstagram } = await import('./lib/instagram.mjs');
    for (const { id } of await listBrands()) {
      try {
        const brand = await loadBrand(id);
        if (brand.avatarFile || !(await hasInstagram(brand))) continue;
        const { data, ext } = await fetchProfilePicture(brand);
        await saveBrandAvatar(id, data, ext);
        console.log(`profile photo: fetched for ${id}`);
      } catch (e) {
        console.warn(`profile photo ${id}: ${e.message}`);
      }
    }
  }, 45_000);
  setInterval(run, 60 * 60 * 1000).unref?.();
  // 예약 발행: check every minute for posts whose booked time has come.
  const { runDueSchedules, recoverInterrupted } = await import('./lib/publish-post.mjs');
  await recoverInterrupted().catch((e) => console.warn(`schedule recovery: ${e.message}`));
  let ticking = false;
  setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      const done = await runDueSchedules();
      if (done.length) console.log(`scheduled publish: ${done.join(', ')}`);
    } catch (e) {
      console.warn(`scheduled publish check failed: ${e.message}`);
    } finally {
      ticking = false;
    }
  }, 60_000).unref?.();
}
