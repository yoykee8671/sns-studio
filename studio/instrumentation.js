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
  // Profile photos (팔로우 카드): fetch from Instagram once for accounts that have a
  // token but no photo yet. Uploading or re-fetching later is done from the home page.
  setTimeout(async () => {
    const { listBrands, loadBrand, saveBrandAvatar } = await import('./lib/store.mjs');
    const { fetchProfilePicture, hasInstagram } = await import('./lib/instagram.mjs');
    for (const { id } of await listBrands()) {
      try {
        const brand = await loadBrand(id);
        if (brand.avatarFile || !hasInstagram(brand)) continue;
        const { data, ext } = await fetchProfilePicture(brand);
        await saveBrandAvatar(id, data, ext);
        console.log(`profile photo: fetched for ${id}`);
      } catch (e) {
        console.warn(`profile photo ${id}: ${e.message}`);
      }
    }
  }, 45_000);
  setInterval(run, 60 * 60 * 1000).unref?.();
}
