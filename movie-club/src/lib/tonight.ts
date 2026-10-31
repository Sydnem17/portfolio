// Tonight's three: a transparent, rule-based picker. No AI service is involved.
// Hard filters always win; scoring only orders what survives them.
import { MUSIC_BY_FILM } from '../data/connections';
import type { MoodId } from '../data/types';
import type { ResolvedFilm } from '../state/model';
import { MOOD_LABEL, formatRuntime } from './labels';

export type Familiarity = 'mix' | 'familiar' | 'new';
export type TimeLimit = null | 100 | 120 | 150;

export interface Exclusions {
  horror: boolean;
  intense: boolean;
  subtitles: boolean;
  animation: boolean;
  /** Skip anything already marked watched. */
  seen: boolean;
}

export const NO_EXCLUSIONS: Exclusions = { horror: false, intense: false, subtitles: false, animation: false, seen: false };

export interface PickerInput {
  mood: MoodId | 'surprise';
  time: TimeLimit;
  familiarity: Familiarity;
  exclude: Exclusions;
}

export interface PickerContext {
  spaderWeight: 0 | 1 | 2;
  /** Film id → date (YYYY-MM-DD) skipped. Skips last for that day only. */
  skipped: Record<string, string>;
  today: string;
  /** Recently shown, most recent first. Penalised to avoid immediate repeats. */
  recent: string[];
  /** Shown in the current set; excluded when asking for a different three if alternatives exist. */
  avoid?: string[];
  seed?: number;
}

export type SlotKind = 'familiar' | 'discovery' | 'wildcard';

export interface Slot {
  kind: SlotKind;
  film: ResolvedFilm | null;
  explanation: string;
  /** Why the slot is empty, when it is. */
  empty?: string;
}

export const SLOT_TITLE: Record<SlotKind, string> = {
  familiar: 'A familiar favourite',
  discovery: 'A new discovery',
  wildcard: 'A wildcard',
};

const hasSpader = (f: ResolvedFilm) => f.cast.some((c) => c.name === 'James Spader');
const spaderLead = (f: ResolvedFilm) => f.cast.some((c) => c.name === 'James Spader' && !c.supporting);
const hasTalkingHeads = (f: ResolvedFilm) => (MUSIC_BY_FILM[f.id] ?? []).some((m) => m.artistId === 'talking-heads');

/** Hard filters. Anything failing these can never be offered. */
export function passesHardFilters(f: ResolvedFilm, input: PickerInput, ctx: PickerContext): boolean {
  if (f.me.archived) return false;
  if (f.me.status === 'not-for-me') return false;
  if (ctx.skipped[f.id] === ctx.today) return false;
  if (input.time != null) {
    // A strict time budget needs a verified runtime. Unknown runtimes never qualify.
    if (f.runtime == null || f.runtime > input.time) return false;
  }
  const ex = input.exclude;
  if (ex.horror && f.genres.includes('horror')) return false;
  if (ex.intense && f.intense) return false;
  if (ex.subtitles && f.subtitled) return false;
  if (ex.animation && f.genres.includes('animation')) return false;
  if (ex.seen && f.me.status === 'watched') return false;
  return true;
}

export const isFamiliarFavourite = (f: ResolvedFilm) =>
  f.me.status === 'watched' && (f.me.reaction === 'loved' || f.me.reaction === 'liked' || f.me.rewatch);

const isUnseen = (f: ResolvedFilm) => f.me.status === 'unknown' || f.me.status === 'want';

function moodMatch(f: ResolvedFilm, mood: PickerInput['mood']): boolean {
  return mood === 'surprise' || f.moods.includes(mood);
}

// Small deterministic PRNG so "Different three" varies but tests stay reproducible.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Scored {
  film: ResolvedFilm;
  score: number;
  reasons: string[];
}

function score(f: ResolvedFilm, all: ResolvedFilm[], input: PickerInput, ctx: PickerContext, jitter: () => number): Scored {
  const reasons: string[] = [];
  let s = 0;
  if (input.mood !== 'surprise' && f.moods.includes(input.mood)) {
    s += f.moods[0] === input.mood ? 4 : 3;
    reasons.push(`it fits "${MOOD_LABEL[input.mood]}"`);
  }
  if (f.userPick) {
    s += 2.5;
    reasons.push('it is one of the films you asked for');
  }
  if (f.me.status === 'want') {
    s += 2;
    reasons.push('you marked it Want to watch');
  }
  if (hasTalkingHeads(f)) {
    s += 2;
    reasons.push('you love Talking Heads, and this is their concert film');
  }
  if (hasSpader(f)) {
    const boost = [-2.5, 1, 2.5][ctx.spaderWeight];
    s += boost;
    if (ctx.spaderWeight > 0) reasons.push(spaderLead(f) ? 'James Spader has a lead role' : 'James Spader has a supporting role');
  }
  if (f.startingPoint === 'Suggested next') s += 1;
  if (f.year >= 1980 && f.year <= 1999) s += 1;

  // Shared people with films Taryn loved.
  const loved = all.filter((x) => x.id !== f.id && x.me.reaction === 'loved');
  const people = new Set([...f.directors, ...f.cast.map((c) => c.name)]);
  for (const l of loved) {
    const shared = [...l.directors].find((d) => people.has(d));
    if (shared) {
      s += 1.5;
      reasons.push(`it shares a filmmaker with ${l.title} (${shared}), which you loved`);
      break;
    }
    const sharedCast = l.cast.find((c) => people.has(c.name));
    if (sharedCast) {
      s += 1;
      reasons.push(`${sharedCast.name} is also in ${l.title}, which you loved`);
      break;
    }
  }
  if (f.me.reaction === 'loved') s += 2;
  if (f.me.rewatch) {
    s += 1.5;
    reasons.push('you flagged it for a rewatch');
  }
  const recentIdx = ctx.recent.indexOf(f.id);
  if (recentIdx >= 0) s -= 4 - Math.min(3, recentIdx * 0.3);
  s += jitter() * 1.2;
  return { film: f, score: s, reasons };
}

function explain(kind: SlotKind, sc: Scored, input: PickerInput): string {
  const r = [...sc.reasons];
  if (input.time != null && sc.film.runtime != null) r.push(`at ${formatRuntime(sc.film.runtime)} it fits your time`);
  const lead =
    kind === 'familiar'
      ? sc.film.me.reaction === 'loved'
        ? 'You have seen this and loved it'
        : 'You have seen this and enjoyed it'
      : kind === 'discovery'
        ? 'New to you'
        : 'A curveball';
  const body = r.slice(0, 3);
  if (!body.length) return `${lead}.`;
  const text = body.length === 1 ? body[0] : `${body.slice(0, -1).join(', ')} and ${body[body.length - 1]}`;
  return `${lead}: ${text}.`;
}

export function pickTonight(films: ResolvedFilm[], input: PickerInput, ctx: PickerContext): Slot[] {
  const jitter = rng(ctx.seed ?? 1);
  const eligible = films.filter((f) => passesHardFilters(f, input, ctx));
  const avoid = new Set(ctx.avoid ?? []);
  const scored = eligible.map((f) => score(f, films, input, ctx, jitter)).sort((a, b) => b.score - a.score);
  const preferFresh = (list: Scored[]) => {
    const fresh = list.filter((x) => !avoid.has(x.film.id));
    return fresh.length ? fresh : list;
  };
  const used = new Set<string>();
  const slots: Slot[] = [];

  // 1. Familiar favourite: only films actually watched and liked, loved or flagged for rewatch.
  if (input.familiarity === 'new') {
    slots.push({ kind: 'familiar', film: null, explanation: '', empty: 'You asked for something new, so no familiar favourite tonight.' });
  } else if (input.exclude.seen) {
    slots.push({ kind: 'familiar', film: null, explanation: '', empty: 'You excluded films you have seen, so there is no familiar favourite.' });
  } else {
    const pool = preferFresh(scored.filter((x) => isFamiliarFavourite(x.film) && moodMatch(x.film, input.mood)));
    const pick = pool[0];
    if (pick) {
      used.add(pick.film.id);
      slots.push({ kind: 'familiar', film: pick.film, explanation: explain('familiar', pick, input) });
    } else {
      const anyFav = scored.some((x) => isFamiliarFavourite(x.film));
      slots.push({
        kind: 'familiar',
        film: null,
        explanation: '',
        empty: anyFav
          ? 'None of the films you have seen and enjoyed fit tonight’s choices.'
          : 'No film you have seen and enjoyed fits these filters yet. Mark films as watched to fill this spot.',
      });
    }
  }

  // 2. New discovery: unseen, matching the mood.
  if (input.familiarity === 'familiar') {
    slots.push({ kind: 'discovery', film: null, explanation: '', empty: 'You asked for something familiar, so no new discovery tonight.' });
  } else {
    const pool = preferFresh(scored.filter((x) => isUnseen(x.film) && moodMatch(x.film, input.mood) && !used.has(x.film.id)));
    const pick = pool[0];
    if (pick) {
      used.add(pick.film.id);
      slots.push({ kind: 'discovery', film: pick.film, explanation: explain('discovery', pick, input) });
    } else {
      slots.push({ kind: 'discovery', film: null, explanation: '', empty: 'No unseen film matches every choice. Try a longer time or fewer exclusions.' });
    }
  }

  // 3. Wildcard: passes every hard filter, but steps outside the obvious, from a different collection.
  const chosenCats = new Set(slots.filter((s) => s.film).map((s) => s.film!.category));
  const wildPool = scored.filter((x) => {
    if (used.has(x.film.id)) return false;
    if (input.familiarity === 'familiar' && !isFamiliarFavourite(x.film)) return false;
    if (input.familiarity === 'new' && !isUnseen(x.film)) return false;
    return true;
  });
  const different = wildPool.filter(
    (x) => !chosenCats.has(x.film.category) && (input.mood === 'surprise' || !x.film.moods.includes(input.mood)),
  );
  const candidates = preferFresh(different.length ? different : wildPool);
  if (candidates.length) {
    // Take from the top handful at random so the wildcard really is a little wild.
    const top = candidates.slice(0, Math.min(6, candidates.length));
    const pick = top[Math.floor(jitter() * top.length)];
    const outside = input.mood !== 'surprise' && !pick.film.moods.includes(input.mood);
    const sc = { ...pick, reasons: outside ? [`it steps away from "${MOOD_LABEL[input.mood as MoodId]}"`, ...pick.reasons] : pick.reasons };
    slots.push({ kind: 'wildcard', film: pick.film, explanation: explain('wildcard', sc, input) });
  } else {
    slots.push({ kind: 'wildcard', film: null, explanation: '', empty: 'Nothing else passes tonight’s filters, so there is no wildcard.' });
  }
  return slots;
}
