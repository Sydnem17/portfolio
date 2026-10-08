import "server-only";
import { num, one, query } from "../db";
import { NEEDS_BROWSER_TAGS } from "./browser-tags";

export interface PhotoRef {
  id: string;
  name: string;
  accountLabel: string;
  takenAt: string | null;
  caption: string | null;
}

export interface PhotoCollection {
  key: string;
  title: string;
  subtitle: string;
  count: number;
  photos: PhotoRef[];
  /** Centroid for place collections (map markers). */
  lat?: number;
  lng?: number;
}

const PHOTO_SELECT = `SELECT i.id, i.name, a.label AS account_label, i.taken_at, t.caption, t.pets, t.things, t.scene, t.event, t.people_count, t.place_hint, i.lat, i.lng
  FROM items i JOIN accounts a ON a.id = i.account_id LEFT JOIN photo_tags t ON t.item_id = i.id
  WHERE i.kind = 'image' AND NOT i.trashed`;

function ref(r: any): PhotoRef {
  return { id: r.id, name: r.name, accountLabel: r.account_label, takenAt: r.taken_at ? new Date(r.taken_at).toISOString() : null, caption: r.caption };
}

function collect(rows: any[], keyOf: (r: any) => string[] | string | null, title: (k: string) => string, subtitle: (k: string, n: number) => string, min = 1): PhotoCollection[] {
  const map = new Map<string, any[]>();
  for (const r of rows) {
    const ks = keyOf(r);
    for (const k of Array.isArray(ks) ? ks : ks ? [ks] : []) map.get(k)?.push(r) ?? map.set(k, [r]);
  }
  return [...map.entries()]
    .filter(([, v]) => v.length >= min)
    .map(([k, v]) => ({
      key: k,
      title: title(k),
      subtitle: subtitle(k, v.length),
      count: v.length,
      photos: v.sort((a, b) => String(b.taken_at ?? "").localeCompare(String(a.taken_at ?? ""))).slice(0, 60).map(ref),
      ...centroid(v),
    }))
    .sort((a, b) => b.count - a.count);
}

function centroid(rows: any[]): { lat?: number; lng?: number } {
  const geo = rows.filter((r) => r.lat != null);
  if (!geo.length) return {};
  return { lat: geo.reduce((s, r) => s + r.lat, 0) / geo.length, lng: geo.reduce((s, r) => s + r.lng, 0) / geo.length };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Clusters geotagged photos into ~5 km cells and labels each with reverse geocoding. */
async function places(rows: any[]): Promise<PhotoCollection[]> {
  const cell = (r: any) => (r.lat == null ? (r.place_hint ? `hint:${r.place_hint}` : null) : `${Math.round(r.lat * 20) / 20},${Math.round(r.lng * 20) / 20}`);
  const groups = collect(rows, cell, (k) => k, (_, n) => `${n} photo${n === 1 ? "" : "s"}`);
  // Look up at most a few new places per page load to respect Nominatim's 1 req/s policy.
  const budget = { lookups: 5 };
  const hints = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const k = cell(r);
    if (!k || !r.place_hint) continue;
    const m = hints.get(k) ?? hints.set(k, new Map()).get(k)!;
    m.set(r.place_hint, (m.get(r.place_hint) ?? 0) + 1);
  }
  for (const g of groups.slice(0, 60)) {
    // A landmark named in the photos themselves beats a reverse-geocoded suburb.
    const hint = [...(hints.get(g.key) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    g.title = g.key.startsWith("hint:") ? g.key.slice(5) : (hint ?? (await placeLabel(g.key, budget)));
  }
  // Merge cells that resolve to the same place name.
  const merged = new Map<string, PhotoCollection>();
  for (const g of groups) {
    const m = merged.get(g.title);
    if (m) {
      m.count += g.count;
      m.photos = [...m.photos, ...g.photos].slice(0, 60);
      m.subtitle = `${m.count} photos`;
    } else merged.set(g.title, { ...g, key: g.title });
  }
  return [...merged.values()].sort((a, b) => b.count - a.count);
}

/** Place name for a photo's coordinates, or null while it hasn't been looked up yet. */
export async function placeNameAt(lat: number, lng: number, budget: { lookups: number }): Promise<string | null> {
  const label = await placeLabel(`${Math.round(lat * 20) / 20},${Math.round(lng * 20) / 20}`, budget);
  return /^-?\d+\.\d+, -?\d+\.\d+$/.test(label) ? null : label;
}

async function placeLabel(key: string, budget: { lookups: number }): Promise<string> {
  const cached = await one<{ label: string }>("SELECT label FROM geocache WHERE key = $1", [key]);
  if (cached) return cached.label;
  const [lat, lng] = key.split(",").map(Number);
  let label = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
  if (budget.lookups-- <= 0) return label;
  try {
    // OpenStreetMap Nominatim: free, 1 request/second, results cached forever.
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${lat}&lon=${lng}`, {
      headers: { "User-Agent": "CloudSweep/0.1 (personal storage organiser)" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const j = await res.json();
      const a = j.address ?? {};
      const local = a.suburb ?? a.town ?? a.city ?? a.village ?? a.county ?? a.state;
      const region = a.city && local !== a.city ? a.city : (a.state ?? a.country);
      if (local) label = region && region !== local ? `${local}, ${region}` : local;
    }
  } catch {
    return label; // offline: show coordinates now, retry on a later visit
  }
  await query("INSERT INTO geocache (key, label) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [key, label]);
  return label;
}

export async function photoCollections() {
  const rows = await query<any>(PHOTO_SELECT);
  const tagged = rows.filter((r) => r.scene !== null || r.caption !== null);
  const status = await one<any>(
    `SELECT COUNT(*) FILTER (WHERE i.lat IS NOT NULL) AS located,
            COUNT(*) FILTER (WHERE i.lat IS NULL AND NOT i.exif_checked AND a.provider NOT IN ('local', 'demo')) AS gps_to_check,
            COUNT(*) FILTER (WHERE i.phash IS NULL) AS lookalike_pending,
            COUNT(*) FILTER (WHERE a.provider NOT IN ('demo', 'local') AND ${NEEDS_BROWSER_TAGS}) AS to_tag
     FROM items i JOIN accounts a ON a.id = i.account_id LEFT JOIN photo_tags t ON t.item_id = i.id WHERE i.kind = 'image' AND NOT i.trashed`,
  );
  return {
    total: rows.length,
    analysed: tagged.length,
    located: num(status?.located),
    gpsToCheck: num(status?.gps_to_check),
    lookalikePending: num(status?.lookalike_pending),
    toTag: num(status?.to_tag),
    places: await places(rows),
    pets: collect(
      tagged,
      (r) => (r.pets ?? []).map((p: any) => `${p.species}|${p.description}`),
      (k) => cap(k.split("|")[1]),
      (k, n) => `${cap(k.split("|")[0])} · ${n} photo${n === 1 ? "" : "s"}`,
    ),
    people: collect(
      tagged,
      (r) => (r.people_count === 0 ? null : r.people_count === 1 ? "solo" : r.people_count <= 4 ? "small" : "group"),
      (k) => ({ solo: "Portraits & solo shots", small: "Couples & small groups", group: "Big groups & gatherings" })[k] ?? k,
      (_, n) => `${n} photos`,
    ),
    events: collect(tagged, (r) => r.event, cap, (_, n) => `${n} photos`),
    scenes: collect(tagged, (r) => r.scene, cap, (_, n) => `${n} photos`),
    things: collect(tagged, (r) => r.things ?? [], cap, (_, n) => `${n} photos`, 3).slice(0, 30),
  };
}
