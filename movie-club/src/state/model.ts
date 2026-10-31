// Personal state: everything Taryn changes. Kept separate from the seed catalogue so
// catalogue updates can never erase statuses, reactions, notes or shelves.
import { CONFIRMED_FAVOURITES, SEED_FILMS, filmId as makeFilmId } from '../data/catalogue';
import type { Film } from '../data/types';

export const SCHEMA_VERSION = 1;

export type ViewingStatus = 'unknown' | 'want' | 'watched' | 'not-for-me';
export type Reaction = 'unrecorded' | 'loved' | 'liked' | 'mixed' | 'disliked';

export const STATUS_LABEL: Record<ViewingStatus, string> = {
  unknown: 'Not yet known',
  want: 'Want to watch',
  watched: 'Watched',
  'not-for-me': 'Not for me',
};
export const REACTION_LABEL: Record<Reaction, string> = {
  unrecorded: 'Not recorded',
  loved: 'Loved',
  liked: 'Liked',
  mixed: 'Mixed',
  disliked: 'Disliked',
};

export interface PersonalFilm {
  status: ViewingStatus;
  reaction: Reaction;
  rewatch: boolean;
  notes: string;
  /** Spoilers revealed for this film. Independent of viewing status. */
  spoilers: boolean;
  archived: boolean;
  updatedAt?: string;
}

export const DEFAULT_PERSONAL: PersonalFilm = {
  status: 'unknown',
  reaction: 'unrecorded',
  rewatch: false,
  notes: '',
  spoilers: false,
  archived: false,
};

export interface Shelf {
  id: string;
  name: string;
  filmIds: string[];
}

export interface SavedPlan {
  id: string;
  first: string;
  second: string;
  note: string;
  date?: string;
  interval: number;
  savedAt: string;
}

export type EditableFields = Pick<Film, 'title' | 'year' | 'runtime' | 'intro' | 'category'> & {
  directors: string[];
};

export interface PersonalState {
  schema: number;
  createdAt: string;
  films: Record<string, PersonalFilm>;
  /** Films Taryn added herself. */
  customFilms: Record<string, Film>;
  /** Corrections to seed records. Applied on top of the catalogue, never written into it. */
  filmEdits: Record<string, Partial<EditableFields>>;
  shelves: Shelf[];
  /** Reference trails or cues marked "I recognise that". Never touches viewing status. */
  recognised: Record<string, string>;
  savedTrails: string[];
  savedPlans: SavedPlan[];
  tonight: {
    skipped: Record<string, string>;
    recent: string[];
    chosen?: { filmId: string; date: string };
  };
  prefs: {
    /** 0 = less, 1 = normal, 2 = more. */
    spaderWeight: 0 | 1 | 2;
    interval: number;
    view: 'shelf' | 'list';
    tmdbToken?: string;
  };
}

export function freshState(now = new Date()): PersonalState {
  const iso = now.toISOString();
  const films: Record<string, PersonalFilm> = {};
  for (const id of CONFIRMED_FAVOURITES) {
    films[id] = { ...DEFAULT_PERSONAL, status: 'watched', reaction: 'loved', updatedAt: iso };
  }
  return {
    schema: SCHEMA_VERSION,
    createdAt: iso,
    films,
    customFilms: {},
    filmEdits: {},
    shelves: [
      { id: 'shelf-always', name: 'Always a favourite', filmIds: [...CONFIRMED_FAVOURITES] },
    ],
    recognised: {},
    savedTrails: [],
    savedPlans: [],
    tonight: { skipped: {}, recent: [] },
    prefs: { spaderWeight: 1, interval: 20, view: 'shelf' },
  };
}

export function personal(state: PersonalState, id: string): PersonalFilm {
  return state.films[id] ?? DEFAULT_PERSONAL;
}

export function updatePersonal(
  state: PersonalState,
  id: string,
  patch: Partial<PersonalFilm>,
  now = new Date(),
): PersonalState {
  const current = personal(state, id);
  return {
    ...state,
    films: { ...state.films, [id]: { ...current, ...patch, updatedAt: now.toISOString() } },
  };
}

/** Mark a reference as recognised. Deliberately does not touch any film's viewing status. */
export function recogniseReference(state: PersonalState, key: string, on: boolean, now = new Date()): PersonalState {
  const recognised = { ...state.recognised };
  if (on) recognised[key] = now.toISOString();
  else delete recognised[key];
  return { ...state, recognised };
}

export interface ResolvedFilm extends Film {
  me: PersonalFilm;
}

/** Seed films (with Taryn's corrections) plus her own films, each joined with personal state. */
export function resolveFilms(state: PersonalState, seed: Film[] = SEED_FILMS): ResolvedFilm[] {
  const seeded = seed.map((f) => ({ ...f, ...(state.filmEdits[f.id] ?? {}), me: personal(state, f.id) }));
  const custom = Object.values(state.customFilms).map((f) => ({ ...f, me: personal(state, f.id) }));
  return [...seeded, ...custom];
}

export function makeCustomFilm(input: {
  title: string;
  year: number;
  directors: string[];
  runtime: number | null;
  category: string;
  intro: string;
}): Film {
  return {
    id: `my-${makeFilmId(input.title, input.year)}`,
    title: input.title.trim(),
    year: input.year,
    directors: input.directors,
    cast: [],
    runtime: input.runtime,
    category: input.category,
    genres: [],
    moods: [],
    intro: input.intro.trim() || 'Added by you.',
    why: 'You added this to the collection.',
    references: [],
    startingPoint: 'Added by you',
    sources: [],
    custom: true,
  };
}

export function identityKey(f: { title: string; year: number }): string {
  return `${normaliseTitle(f.title)}|${f.year}`;
}

export function normaliseTitle(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
