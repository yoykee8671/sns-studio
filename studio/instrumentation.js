// Runs once when the server starts. Schedules the hourly media expiry: published
// posts lose their photos/videos 7 days after publishing (see store.mjs).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { expirePublishedMedia } = await import('./lib/store.mjs');
  const run = () =>
    expirePublishedMedia()
      .then((ids) => ids.length && console.log(`media expiry: purged ${ids.join(', ')}`))
      .catch((e) => console.warn(`media expiry failed: ${e.message}`));
  setTimeout(run, 30_000); // shortly after boot, then hourly
  setInterval(run, 60 * 60 * 1000).unref?.();
}
