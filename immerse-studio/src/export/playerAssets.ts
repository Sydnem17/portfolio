/**
 * Loads the prebuilt single-file player bundle (built by
 * `npm run build:player` into public/player/). The editor inlines these
 * assets into every export so packages are fully self-contained — no CDN,
 * no server, nothing to host.
 */
let cache: { js: string; css: string } | null = null;

export async function loadPlayerAssets(): Promise<{ js: string; css: string }> {
  if (cache) return cache;
  const [jsRes, cssRes] = await Promise.all([
    fetch('player/immerse-player.js'),
    fetch('player/immerse-player.css'),
  ]);
  if (!jsRes.ok || !cssRes.ok) {
    throw new Error(
      'Player bundle not found. Run "npm run build:player" first (the dev and build scripts do this automatically).'
    );
  }
  cache = { js: await jsRes.text(), css: await cssRes.text() };
  return cache;
}
