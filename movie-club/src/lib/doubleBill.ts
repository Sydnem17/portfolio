import { ARTIST_BY_ID, DOUBLE_BILLS, MUSIC_BY_FILM } from '../data/connections';
import type { DoubleBill } from '../data/types';
import type { ResolvedFilm } from '../state/model';
import { MOOD_LABEL, decadeOf } from './labels';
import { NO_EXCLUSIONS, type Exclusions } from './tonight';

export type BillMode = 'same' | 'change';

export interface SecondFeature {
  film: ResolvedFilm;
  note: string;
  editorial: boolean;
  curated?: DoubleBill;
}

export function allowedInBill(f: ResolvedFilm, ex: Exclusions = NO_EXCLUSIONS): boolean {
  if (f.me.archived || f.me.status === 'not-for-me') return false;
  if (ex.horror && f.genres.includes('horror')) return false;
  if (ex.intense && f.intense) return false;
  if (ex.subtitles && f.subtitled) return false;
  if (ex.animation && f.genres.includes('animation')) return false;
  if (ex.seen && f.me.status === 'watched') return false;
  return true;
}

function sharedPerson(a: ResolvedFilm, b: ResolvedFilm): string | null {
  const dirs = a.directors.find((d) => b.directors.includes(d));
  if (dirs) return `Both are directed by ${dirs}`;
  const cast = a.cast.find((c) => b.cast.some((x) => x.name === c.name));
  if (cast) return `${cast.name} appears in both`;
  return null;
}

function sharedArtist(a: ResolvedFilm, b: ResolvedFilm): string | null {
  const am = MUSIC_BY_FILM[a.id] ?? [];
  const bm = MUSIC_BY_FILM[b.id] ?? [];
  const hit = am.find((m) => bm.some((x) => x.artistId === m.artistId));
  return hit ? hit.artistId : null;
}

/**
 * Suggest second features for a first film. Never returns the first film itself and always
 * respects exclusions. Curated pairings come first; the rest are rule-based and labelled editorial.
 */
export function suggestSecond(
  first: ResolvedFilm,
  films: ResolvedFilm[],
  mode: BillMode,
  ex: Exclusions = NO_EXCLUSIONS,
  limit = 4,
): SecondFeature[] {
  const byId = new Map(films.map((f) => [f.id, f]));
  const out: SecondFeature[] = [];
  const seen = new Set<string>([first.id]);

  for (const b of DOUBLE_BILLS) {
    if (b.feeling !== mode) continue;
    const otherId = b.first === first.id ? b.second : b.second === first.id ? b.first : null;
    const other = otherId ? byId.get(otherId) : undefined;
    if (other && !seen.has(other.id) && allowedInBill(other, ex)) {
      out.push({ film: other, note: b.note, editorial: b.editorial, curated: b });
      seen.add(other.id);
    }
  }

  const ranked: { f: ResolvedFilm; s: number; note: string }[] = [];
  for (const f of films) {
    if (seen.has(f.id) || !allowedInBill(f, ex)) continue;
    const overlap = f.moods.filter((m) => first.moods.includes(m));
    const person = sharedPerson(first, f);
    const artist = sharedArtist(first, f);
    if (mode === 'same') {
      let s = overlap.length * 2 + (person ? 3 : 0) + (artist ? 3 : 0) + (f.category === first.category ? 1 : 0);
      if (s < 4) continue;
      if (decadeOf(f.year) === decadeOf(first.year)) s += 0.5;
      const feel = overlap.length
        ? `both feel ${overlap.slice(0, 2).map((m) => MOOD_LABEL[m].toLowerCase()).join(' and ')}`
        : 'they sit on the same shelf';
      const why = person
        ? `${person}, and ${feel}.`
        : artist
          ? `Both feature music by ${ARTIST_BY_ID[artist]?.name}, and ${feel}.`
          : `${feel[0].toUpperCase()}${feel.slice(1)}.`;
      ranked.push({ f, s, note: why });
    } else {
      if (overlap.length > 0) continue;
      // A change of mood still needs a thread connecting the two.
      let link: string | null = person ? `${person}` : null;
      if (!link && decadeOf(f.year) === decadeOf(first.year)) link = `Both come from the ${decadeOf(f.year)}s`;
      if (!link) continue;
      const s = (person ? 3 : 1) + (f.userPick ? 1 : 0);
      const toMood = f.moods[0] ? MOOD_LABEL[f.moods[0]].toLowerCase() : 'different';
      ranked.push({ f, s, note: `${link}, but film two turns ${toMood}.` });
    }
  }
  ranked.sort((a, b) => b.s - a.s || a.f.title.localeCompare(b.f.title));
  for (const r of ranked) {
    if (out.length >= limit) break;
    out.push({ film: r.f, note: r.note, editorial: true });
  }
  return out.slice(0, limit);
}

export interface EveningLength {
  total: number | null;
  /** Explains why a total cannot be calculated. */
  missing: string[];
}

/** Total evening length. Never invents a runtime: if either is unknown the total is null. */
export function eveningLength(a: ResolvedFilm, b: ResolvedFilm, interval: number): EveningLength {
  const missing = [a, b].filter((f) => f.runtime == null).map((f) => f.title);
  if (missing.length) return { total: null, missing };
  return { total: (a.runtime as number) + interval + (b.runtime as number), missing: [] };
}

export function curatedBills(films: ResolvedFilm[], ex: Exclusions = NO_EXCLUSIONS) {
  const byId = new Map(films.map((f) => [f.id, f]));
  return DOUBLE_BILLS.flatMap((b) => {
    const a = byId.get(b.first);
    const c = byId.get(b.second);
    if (!a || !c || a.id === c.id || !allowedInBill(a, ex) || !allowedInBill(c, ex)) return [];
    return [{ bill: b, first: a, second: c }];
  });
}
