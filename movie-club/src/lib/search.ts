// Punctuation-insensitive search over titles, people, years, moods and verified references.
// Spoiler fields are never indexed, so they can never surface in results or snippets.
import { ARTIST_BY_ID, MUSIC_BY_FILM, TRAILS } from '../data/connections';
import type { ReferenceTrail } from '../data/types';
import type { ResolvedFilm } from '../state/model';
import { GENRE_LABEL, MOOD_LABEL, decadeOf } from './labels';

export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(['the', 'and', 'a', 'an', 'of', 'in', 'on', 'to', 'with', 'film', 'movie']);

function tokenMatches(q: string, h: string): boolean {
  if (h.startsWith(q)) return true;
  // Tolerate a stray plural: "videotapes" still finds "videotape".
  if (q.length > 3 && q.endsWith('s') && h.startsWith(q.slice(0, -1))) return true;
  return false;
}

interface Field {
  label: string;
  text: string;
  tokens: string[];
  weight: number;
}

function field(label: string, text: string, weight: number): Field {
  const n = normalise(text);
  return { label, text, tokens: n.split(' ').filter(Boolean), weight };
}

export interface FilmHit {
  film: ResolvedFilm;
  score: number;
  /** Why it matched, e.g. "Cast: James Spader". Always spoiler-free. */
  matched: string;
}

function filmFields(f: ResolvedFilm): Field[] {
  const fields: Field[] = [
    field('Title', f.title, 10),
    field('Year', `${f.year} ${decadeOf(f.year)}s ${String(decadeOf(f.year)).slice(2)}s`, 5),
  ];
  for (const d of f.directors) fields.push(field('Director', d, 5));
  for (const c of f.cast) fields.push(field('Cast', c.role ? `${c.name} (${c.role})` : c.name, 5));
  for (const a of f.aliases ?? []) fields.push(field('Reference', a, 6));
  for (const r of f.references) fields.push(field('Reference', r, 4));
  for (const m of MUSIC_BY_FILM[f.id] ?? []) {
    fields.push(field('Music', `${m.song} by ${ARTIST_BY_ID[m.artistId]?.name ?? ''}`, 4));
  }
  for (const m of f.moods) fields.push(field('Mood', MOOD_LABEL[m], 2));
  for (const g of f.genres) fields.push(field('Genre', GENRE_LABEL[g], 2));
  fields.push(field('Collection', f.category, 1));
  for (const t of TRAILS) {
    if (t.spoilerTeaser) continue; // spoiler trail aliases never point at a film in search
    if ([t.connection.filmId].includes(f.id)) for (const a of t.aliases) fields.push(field('Reference', a, 4));
  }
  fields.push(field('About', `${f.intro} ${f.why}`, 1));
  return fields;
}

function scoreFields(fields: Field[], qTokens: string[]): { score: number; matched: string } | null {
  let total = 0;
  let best: Field | null = null;
  let bestScore = 0;
  const meaningful = qTokens.filter((t) => !STOPWORDS.has(t));
  const required = meaningful.length ? meaningful : qTokens;
  for (const qt of required) {
    let tokenBest = 0;
    let tokenField: Field | null = null;
    for (const f of fields) {
      if (f.tokens.some((h) => tokenMatches(qt, h)) && f.weight > tokenBest) {
        tokenBest = f.weight;
        tokenField = f;
      }
    }
    if (!tokenBest) return null;
    total += tokenBest;
    if (tokenBest > bestScore) {
      bestScore = tokenBest;
      best = tokenField;
    }
  }
  // Phrase bonus: the whole query appears in one field.
  const phrase = qTokens.join(' ');
  for (const f of fields) {
    if (f.tokens.join(' ').includes(phrase)) {
      total += f.weight * 2;
      if (f.weight >= bestScore) best = f;
      break;
    }
  }
  return { score: total, matched: best ? `${best.label}: ${best.text}` : '' };
}

export function searchFilms(films: ResolvedFilm[], query: string, opts: { includeArchived?: boolean } = {}): FilmHit[] {
  const qTokens = normalise(query).split(' ').filter(Boolean);
  if (!qTokens.length) return [];
  const hits: FilmHit[] = [];
  for (const film of films) {
    if (film.me.archived && !opts.includeArchived) continue;
    const r = scoreFields(filmFields(film), qTokens);
    if (r) hits.push({ film, score: r.score, matched: r.matched });
  }
  return hits.sort((a, b) => b.score - a.score || a.film.title.localeCompare(b.film.title));
}

export function searchTrails(query: string, trails: ReferenceTrail[] = TRAILS): ReferenceTrail[] {
  const qTokens = normalise(query).split(' ').filter(Boolean);
  if (!qTokens.length) return [];
  const scored: { t: ReferenceTrail; s: number }[] = [];
  for (const t of trails) {
    const fields = [field('Cue', t.cue, 6), ...t.aliases.map((a) => field('Alias', a, 5))];
    const r = scoreFields(fields, qTokens);
    if (r) scored.push({ t, s: r.score });
  }
  return scored.sort((a, b) => b.s - a.s).map((x) => x.t);
}
