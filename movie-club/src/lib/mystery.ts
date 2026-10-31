// "Surprise me without showing the cover". Clues come from verified data and editorial
// mood tags, and never contain the title, aliases or spoiler text.
import { ARTIST_BY_ID, MUSIC_BY_FILM } from '../data/connections';
import type { ResolvedFilm } from '../state/model';
import { GENRE_LABEL, MOOD_LABEL, decadeOf } from './labels';
import { normalise } from './search';

export function mysteryPool(films: ResolvedFilm[]): ResolvedFilm[] {
  return films.filter((f) => !f.me.archived && (f.me.status === 'unknown' || f.me.status === 'want') && !f.custom);
}

export function pickMystery(films: ResolvedFilm[], exclude: string[], random: () => number = Math.random): ResolvedFilm | null {
  const pool = mysteryPool(films);
  const fresh = pool.filter((f) => !exclude.includes(f.id));
  const list = fresh.length ? fresh : pool;
  if (!list.length) return null;
  return list[Math.floor(random() * list.length)];
}

function safe(clue: string, film: ResolvedFilm): boolean {
  const c = normalise(clue);
  const title = normalise(film.title);
  const titleWords = title.split(' ').filter((w) => w.length > 3);
  if (c.includes(title)) return false;
  // Reject clues that give away a distinctive word of the title.
  if (titleWords.some((w) => c.split(' ').includes(w) && !['with', 'from', 'that', 'this'].includes(w))) return false;
  return true;
}

export function mysteryClues(film: ResolvedFilm, all: ResolvedFilm[]): string[] {
  const decade = `${decadeOf(film.year)}s`;
  const genre = film.genres[0] ? GENRE_LABEL[film.genres[0]].toLowerCase() : 'film';
  const moods = film.moods.map((m) => MOOD_LABEL[m].toLowerCase());
  const music = MUSIC_BY_FILM[film.id]?.find((m) => m.kind !== 'suggested');
  const director = film.directors[0];
  const other = director ? all.find((f) => f.id !== film.id && f.directors.includes(director)) : undefined;

  // Ordered from gentlest to most revealing; the first three that don't give the title away win.
  const candidates = [
    `A ${genre} from the ${decade}, filed under "${film.category}".`,
    `A ${genre} from the ${decade}.`,
    moods.length >= 2 ? `The mood: ${moods[0]} and ${moods[1]}.` : '',
    ...moods.map((m) => `The mood: ${m}.`),
    music ? `Listen for a song by ${ARTIST_BY_ID[music.artistId]?.name}.` : '',
    other ? `Same director as ${other.title} (${other.year}).` : '',
    film.cast[0] ? `Stars ${film.cast[0].name}.` : '',
    film.runtime ? `Runs ${film.runtime} minutes.` : '',
    film.storySetting ? `The story is set in ${film.storySetting.label.toLowerCase()}.` : '',
  ].filter(Boolean);

  const clues: string[] = [];
  for (const c of candidates) {
    if (clues.length >= 3) break;
    if (!safe(c, film)) continue;
    // Skip a broader version of a clue already used (e.g. genre and decade twice).
    if (clues.some((x) => x.startsWith(c.slice(0, 12)))) continue;
    clues.push(c);
  }
  return clues;
}
