// Backup, restore and CSV export. Imports are validated, previewed and merged without
// silently overwriting personal notes.
import { SEED_FILMS } from '../data/catalogue';
import type { Film } from '../data/types';
import {
  DEFAULT_PERSONAL,
  REACTION_LABEL,
  SCHEMA_VERSION,
  STATUS_LABEL,
  freshState,
  identityKey,
  resolveFilms,
  type PersonalFilm,
  type PersonalState,
  type Reaction,
  type SavedPlan,
  type Shelf,
  type ViewingStatus,
} from './model';

export const APP_MARKER = 'taryns-movie-club';

const STATUSES: ViewingStatus[] = ['unknown', 'want', 'watched', 'not-for-me'];
const REACTIONS: Reaction[] = ['unrecorded', 'loved', 'liked', 'mixed', 'disliked'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

function sanitisePersonal(v: unknown): PersonalFilm | null {
  if (!isObj(v)) return null;
  const status = STATUSES.includes(v.status as ViewingStatus) ? (v.status as ViewingStatus) : null;
  const reaction = REACTIONS.includes(v.reaction as Reaction) ? (v.reaction as Reaction) : null;
  if (!status && !reaction && typeof v.notes !== 'string') return null;
  return {
    status: status ?? 'unknown',
    reaction: reaction ?? 'unrecorded',
    rewatch: v.rewatch === true,
    notes: str(v.notes).slice(0, 20000),
    spoilers: v.spoilers === true,
    archived: v.archived === true,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : undefined,
  };
}

function sanitiseCustomFilm(id: string, v: unknown): Film | null {
  if (!isObj(v)) return null;
  const title = str(v.title).trim();
  const year = Number(v.year);
  if (!title || !Number.isInteger(year) || year < 1880 || year > 2100) return null;
  const runtime = v.runtime == null ? null : Number(v.runtime);
  return {
    id,
    title,
    year,
    directors: Array.isArray(v.directors) ? v.directors.filter((d): d is string => typeof d === 'string') : [],
    cast: [],
    runtime: runtime != null && Number.isFinite(runtime) && runtime > 0 ? Math.round(runtime) : null,
    category: str(v.category, 'Added by you') || 'Added by you',
    genres: [],
    moods: [],
    intro: str(v.intro, 'Added by you.') || 'Added by you.',
    why: str(v.why, 'You added this to the collection.'),
    references: [],
    startingPoint: 'Added by you',
    sources: [],
    custom: true,
  };
}

/** Turn any parsed JSON into a valid PersonalState, reporting what was skipped. */
export function sanitiseState(input: unknown): { state: PersonalState; warnings: string[] } {
  const warnings: string[] = [];
  const base = freshState();
  if (!isObj(input)) throw new Error('This file does not contain a Movie Club collection.');
  const out: PersonalState = { ...base, films: {}, shelves: [] };
  out.createdAt = str(input.createdAt, base.createdAt);

  if (isObj(input.films)) {
    for (const [id, v] of Object.entries(input.films)) {
      const p = sanitisePersonal(v);
      if (p) out.films[id] = p;
      else warnings.push(`Skipped an unreadable personal record (${id}).`);
    }
  }
  if (isObj(input.customFilms)) {
    for (const [id, v] of Object.entries(input.customFilms)) {
      const f = sanitiseCustomFilm(id, v);
      if (f) out.customFilms[id] = f;
      else warnings.push(`Skipped an added film without a valid title and year (${id}).`);
    }
  }
  if (isObj(input.filmEdits)) {
    for (const [id, v] of Object.entries(input.filmEdits)) {
      if (!isObj(v)) continue;
      const edit: PersonalState['filmEdits'][string] = {};
      if (typeof v.title === 'string' && v.title.trim()) edit.title = v.title.trim();
      if (Number.isInteger(v.year)) edit.year = v.year as number;
      if (v.runtime === null || (typeof v.runtime === 'number' && v.runtime > 0)) edit.runtime = v.runtime as number | null;
      if (typeof v.intro === 'string') edit.intro = v.intro;
      if (typeof v.category === 'string') edit.category = v.category;
      if (Array.isArray(v.directors)) edit.directors = v.directors.filter((d): d is string => typeof d === 'string');
      out.filmEdits[id] = edit;
    }
  }
  if (Array.isArray(input.shelves)) {
    for (const s of input.shelves) {
      if (!isObj(s) || typeof s.name !== 'string' || !s.name.trim()) {
        warnings.push('Skipped a shelf without a name.');
        continue;
      }
      const ids = Array.isArray(s.filmIds) ? s.filmIds.filter((x): x is string => typeof x === 'string') : [];
      out.shelves.push({ id: str(s.id) || `shelf-${out.shelves.length}`, name: s.name.trim(), filmIds: Array.from(new Set(ids)) });
    }
  } else {
    out.shelves = base.shelves;
  }
  if (isObj(input.recognised)) {
    for (const [k, v] of Object.entries(input.recognised)) if (typeof v === 'string') out.recognised[k] = v;
  }
  if (Array.isArray(input.savedTrails)) out.savedTrails = input.savedTrails.filter((x): x is string => typeof x === 'string');
  if (Array.isArray(input.savedPlans)) {
    out.savedPlans = input.savedPlans.filter(
      (p): p is SavedPlan => isObj(p) && typeof p.first === 'string' && typeof p.second === 'string' && p.first !== p.second,
    );
  }
  if (isObj(input.tonight)) {
    const t = input.tonight;
    out.tonight = {
      skipped: isObj(t.skipped) ? (Object.fromEntries(Object.entries(t.skipped).filter(([, v]) => typeof v === 'string')) as Record<string, string>) : {},
      recent: Array.isArray(t.recent) ? t.recent.filter((x): x is string => typeof x === 'string').slice(0, 30) : [],
      chosen: isObj(t.chosen) && typeof t.chosen.filmId === 'string' ? { filmId: t.chosen.filmId, date: str(t.chosen.date) } : undefined,
    };
  }
  if (isObj(input.prefs)) {
    const p = input.prefs;
    out.prefs = {
      spaderWeight: p.spaderWeight === 0 || p.spaderWeight === 2 ? p.spaderWeight : 1,
      interval: typeof p.interval === 'number' && p.interval >= 0 && p.interval <= 180 ? Math.round(p.interval) : 20,
      view: p.view === 'list' ? 'list' : 'shelf',
      tmdbToken: typeof p.tmdbToken === 'string' && p.tmdbToken ? p.tmdbToken : undefined,
    };
  }
  out.schema = SCHEMA_VERSION;
  return { state: out, warnings };
}

export interface BackupFile {
  app: typeof APP_MARKER;
  schema: number;
  exportedAt: string;
  state: PersonalState;
}

export function exportBackup(state: PersonalState, opts: { includeToken?: boolean } = {}): string {
  const clean: PersonalState = { ...state, prefs: { ...state.prefs } };
  // API tokens are credentials: leave them out of backups unless explicitly requested.
  if (!opts.includeToken) delete clean.prefs.tmdbToken;
  const file: BackupFile = { app: APP_MARKER, schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), state: clean };
  return JSON.stringify(file, null, 2);
}

export interface ImportPreview {
  incoming: PersonalState;
  warnings: string[];
  exportedAt?: string;
  counts: { personal: number; customFilms: number; shelves: number; plans: number };
  /** Films where both collections have different personal data. */
  conflicts: { id: string; title: string; mine: PersonalFilm; theirs: PersonalFilm; notesDiffer: boolean }[];
  /** Added films in the import that already exist here (matched by title and year). */
  duplicates: { incomingId: string; existingId: string; title: string; year: number }[];
  newFilms: number;
}

export function parseBackup(text: string): { state: PersonalState; warnings: string[]; exportedAt?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON. Choose a backup exported from Taryn’s Movie Club.');
  }
  if (!isObj(parsed)) throw new Error('This file does not contain a Movie Club collection.');
  const looksLikeBackup = parsed.app === APP_MARKER && isObj(parsed.state);
  if (!looksLikeBackup && !isObj(parsed.films)) {
    throw new Error('This file does not look like a Movie Club backup.');
  }
  if (typeof parsed.schema === 'number' && parsed.schema > SCHEMA_VERSION) {
    throw new Error('This backup comes from a newer version of the app and cannot be read safely.');
  }
  const { state, warnings } = sanitiseState(looksLikeBackup ? parsed.state : parsed);
  return { state, warnings, exportedAt: looksLikeBackup ? str(parsed.exportedAt) : undefined };
}

const samePersonal = (a: PersonalFilm, b: PersonalFilm) =>
  a.status === b.status && a.reaction === b.reaction && a.rewatch === b.rewatch && a.notes === b.notes && a.archived === b.archived;

export function previewImport(current: PersonalState, text: string, seed: Film[] = SEED_FILMS): ImportPreview {
  const { state: incoming, warnings, exportedAt } = parseBackup(text);
  const titleOf = new Map(resolveFilms(current, seed).map((f) => [f.id, f.title]));
  for (const f of Object.values(incoming.customFilms)) if (!titleOf.has(f.id)) titleOf.set(f.id, f.title);

  // Match imported custom films against existing films by identity (title + year).
  const existingByIdentity = new Map(resolveFilms(current, seed).map((f) => [identityKey(f), f.id]));
  const duplicates: ImportPreview['duplicates'] = [];
  let newFilms = 0;
  for (const f of Object.values(incoming.customFilms)) {
    const existingId = existingByIdentity.get(identityKey(f));
    if (existingId) duplicates.push({ incomingId: f.id, existingId, title: f.title, year: f.year });
    else newFilms++;
  }
  const remap = new Map(duplicates.map((d) => [d.incomingId, d.existingId]));

  const conflicts: ImportPreview['conflicts'] = [];
  for (const [rawId, theirs] of Object.entries(incoming.films)) {
    const id = remap.get(rawId) ?? rawId;
    const mine = current.films[id];
    if (mine && !samePersonal(mine, theirs)) {
      conflicts.push({ id, title: titleOf.get(id) ?? id, mine, theirs, notesDiffer: !!mine.notes && !!theirs.notes && mine.notes !== theirs.notes });
    }
  }
  return {
    incoming,
    warnings,
    exportedAt,
    counts: {
      personal: Object.keys(incoming.films).length,
      customFilms: Object.keys(incoming.customFilms).length,
      shelves: incoming.shelves.length,
      plans: incoming.savedPlans.length,
    },
    conflicts,
    duplicates,
    newFilms,
  };
}

export interface ImportOptions {
  /** Status, reaction and flags when both sides differ. Default keeps existing data. */
  conflicts: 'keep-mine' | 'use-imported';
  /** Notes when both sides have different text. Default keeps existing notes. */
  notes: 'keep-mine' | 'combine' | 'use-imported';
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { conflicts: 'keep-mine', notes: 'keep-mine' };

export function applyImport(current: PersonalState, preview: ImportPreview, opts: ImportOptions = DEFAULT_IMPORT_OPTIONS): PersonalState {
  const { incoming } = preview;
  const remap = new Map(preview.duplicates.map((d) => [d.incomingId, d.existingId]));
  const mapId = (id: string) => remap.get(id) ?? id;

  const films: Record<string, PersonalFilm> = { ...current.films };
  for (const [rawId, theirs] of Object.entries(incoming.films)) {
    const id = mapId(rawId);
    const mine = films[id];
    if (!mine) {
      films[id] = { ...DEFAULT_PERSONAL, ...theirs };
      continue;
    }
    const base = opts.conflicts === 'use-imported' ? { ...mine, ...theirs } : { ...mine };
    let notes = mine.notes;
    if (!mine.notes) notes = theirs.notes;
    else if (theirs.notes && theirs.notes !== mine.notes) {
      if (opts.notes === 'combine') notes = `${mine.notes}\n\n${theirs.notes}`;
      else if (opts.notes === 'use-imported') notes = theirs.notes;
    }
    films[id] = { ...base, notes };
  }

  const customFilms = { ...current.customFilms };
  for (const f of Object.values(incoming.customFilms)) if (!remap.has(f.id) && !customFilms[f.id]) customFilms[f.id] = f;

  const filmEdits = { ...current.filmEdits };
  for (const [id, e] of Object.entries(incoming.filmEdits)) if (!filmEdits[id]) filmEdits[id] = e;

  const shelves: Shelf[] = current.shelves.map((s) => ({ ...s, filmIds: [...s.filmIds] }));
  for (const s of incoming.shelves) {
    const ids = s.filmIds.map(mapId);
    const match = shelves.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
    if (match) match.filmIds = Array.from(new Set([...match.filmIds, ...ids]));
    else shelves.push({ id: shelves.some((x) => x.id === s.id) ? `${s.id}-imported` : s.id, name: s.name, filmIds: ids });
  }

  const planKey = (p: SavedPlan) => `${p.first}|${p.second}|${p.date ?? ''}`;
  const plans = [...current.savedPlans];
  const known = new Set(plans.map(planKey));
  for (const p of incoming.savedPlans) {
    const mapped = { ...p, first: mapId(p.first), second: mapId(p.second) };
    if (mapped.first !== mapped.second && !known.has(planKey(mapped))) plans.push(mapped);
  }

  return {
    ...current,
    films,
    customFilms,
    filmEdits,
    shelves,
    recognised: { ...incoming.recognised, ...current.recognised },
    savedTrails: Array.from(new Set([...current.savedTrails, ...incoming.savedTrails])),
    savedPlans: plans,
  };
}

function csvCell(v: string | number | boolean | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(state: PersonalState, seed: Film[] = SEED_FILMS): string {
  const header = ['Title', 'Year', 'Directors', 'Category', 'Runtime (min)', 'Viewing status', 'Reaction', 'Rewatch', 'Your pick', 'Shelves', 'Archived', 'Notes'];
  const rows = resolveFilms(state, seed).map((f) => {
    const shelves = state.shelves.filter((s) => s.filmIds.includes(f.id)).map((s) => s.name).join('; ');
    return [
      f.title,
      f.year,
      f.directors.join('; '),
      f.category,
      f.runtime ?? '',
      STATUS_LABEL[f.me.status],
      REACTION_LABEL[f.me.reaction],
      f.me.rewatch ? 'Yes' : '',
      f.userPick ? 'Yes' : '',
      shelves,
      f.me.archived ? 'Yes' : '',
      f.me.notes,
    ].map(csvCell);
  });
  return [header.map(csvCell), ...rows].map((r) => r.join(',')).join('\r\n');
}
