// Optional official artwork from TMDB, using a token Taryn supplies herself in Settings.
// The token lives only in this browser's storage; nothing is bundled into the app.
// Without a token, the app uses its own title-led covers.

const CACHE_KEY = 'taryns-movie-club/tmdb-posters';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

interface CacheEntry {
  path: string | null;
  checked: string;
}

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeCache(c: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* cache is optional */
  }
}

export function cachedPoster(id: string): string | null | undefined {
  const e = readCache()[id];
  if (!e) return undefined;
  return e.path ? IMAGE_BASE + e.path : null;
}

const inflight = new Map<string, Promise<string | null>>();

export function fetchPoster(id: string, title: string, year: number, token: string): Promise<string | null> {
  const cached = cachedPoster(id);
  if (cached !== undefined) return Promise.resolve(cached);
  if (inflight.has(id)) return inflight.get(id)!;
  const isBearer = token.length > 40;
  const params = new URLSearchParams({ query: title, year: String(year), include_adult: 'false' });
  if (!isBearer) params.set('api_key', token);
  const p = fetch(`https://api.themoviedb.org/3/search/movie?${params}`, {
    headers: isBearer ? { Authorization: `Bearer ${token}`, accept: 'application/json' } : { accept: 'application/json' },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`TMDB ${res.status}`);
      const data = (await res.json()) as { results?: { poster_path: string | null; release_date?: string }[] };
      const match = data.results?.find((r) => r.release_date?.startsWith(String(year))) ?? data.results?.[0];
      const path = match?.poster_path ?? null;
      const c = readCache();
      c[id] = { path, checked: new Date().toISOString() };
      writeCache(c);
      return path ? IMAGE_BASE + path : null;
    })
    .catch(() => null)
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export function clearPosterCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
