import { describe, expect, it } from 'vitest';
import type { MoodId } from '../src/data/types';
import { NO_EXCLUSIONS, pickTonight, type PickerContext, type PickerInput } from '../src/lib/tonight';
import { freshState, resolveFilms, updatePersonal } from '../src/state/model';

const ctx = (over: Partial<PickerContext> = {}): PickerContext => ({ spaderWeight: 1, skipped: {}, today: '2026-10-31', recent: [], seed: 1, ...over });
const MOODS: (MoodId | 'surprise')[] = ['warm-funny', 'music-nostalgia', 'beautifully-strange', 'clever-unsettling', 'big-adventure', 'surprise'];

describe("Tonight's three", () => {
  it('always respects hard exclusions', () => {
    let s = freshState();
    s = updatePersonal(s, 'ghost-1990', { status: 'not-for-me' });
    s = updatePersonal(s, 'clueless-1995', { archived: true });
    const films = resolveFilms(s);
    const exclude = { horror: true, intense: true, subtitles: true, animation: true, seen: false };
    for (const mood of MOODS) {
      for (let seed = 1; seed < 40; seed++) {
        const slots = pickTonight(films, { mood, time: null, familiarity: 'mix', exclude }, ctx({ seed, skipped: { 'the-castle-1997': '2026-10-31' } }));
        for (const slot of slots) {
          const f = slot.film;
          if (!f) continue;
          expect(f.genres).not.toContain('horror');
          expect(f.genres).not.toContain('animation');
          expect(f.intense).toBeFalsy();
          expect(f.subtitled).toBeFalsy();
          expect(['ghost-1990', 'clueless-1995', 'the-castle-1997']).not.toContain(f.id);
        }
      }
    }
  });

  it('never lets an unknown runtime satisfy a strict time limit', () => {
    const films = resolveFilms(freshState());
    for (const time of [100, 120, 150] as const) {
      for (const mood of MOODS) {
        for (let seed = 1; seed < 25; seed++) {
          for (const slot of pickTonight(films, { mood, time, familiarity: 'mix', exclude: NO_EXCLUSIONS }, ctx({ seed }))) {
            if (!slot.film) continue;
            expect(slot.film.runtime).not.toBeNull();
            expect(slot.film.runtime!).toBeLessThanOrEqual(time);
          }
        }
      }
    }
  });

  it('only offers films actually watched and enjoyed as familiar favourites', () => {
    const films = resolveFilms(freshState());
    const [familiar, discovery, wildcard] = pickTonight(films, { mood: 'warm-funny', time: null, familiarity: 'mix', exclude: NO_EXCLUSIONS }, ctx());
    expect(['muriels-wedding-1994', 'the-breakfast-club-1985']).toContain(familiar.film?.id);
    expect(discovery.film?.me.status).toBe('unknown');
    const ids = [familiar, discovery, wildcard].map((s) => s.film?.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('says so when a category has no valid candidate instead of disguising one', () => {
    const films = resolveFilms(freshState());
    const slots = pickTonight(films, { mood: 'big-adventure', time: null, familiarity: 'mix', exclude: NO_EXCLUSIONS }, ctx());
    expect(slots[0].film).toBeNull();
    expect(slots[0].empty).toBeTruthy();
    const newOnly = pickTonight(films, { mood: 'warm-funny', time: null, familiarity: 'new', exclude: NO_EXCLUSIONS }, ctx());
    expect(newOnly[0].film).toBeNull();
    expect(newOnly[0].empty).toMatch(/new/);
  });

  it('avoids repeating the previous set when alternatives exist', () => {
    const films = resolveFilms(freshState());
    const input: PickerInput = { mood: 'music-nostalgia', time: null, familiarity: 'mix', exclude: NO_EXCLUSIONS };
    const first = pickTonight(films, input, ctx());
    const shown = first.flatMap((s) => (s.film ? [s.film.id] : []));
    const second = pickTonight(films, input, ctx({ avoid: shown, seed: 99 }));
    const discovery = second.find((s) => s.kind === 'discovery')!;
    expect(shown).not.toContain(discovery.film!.id);
  });

  it('explains each choice from the filters and confirmed preferences', () => {
    const films = resolveFilms(freshState());
    const slots = pickTonight(films, { mood: 'music-nostalgia', time: 120, familiarity: 'mix', exclude: NO_EXCLUSIONS }, ctx());
    for (const s of slots) if (s.film) expect(s.explanation.length).toBeGreaterThan(10);
  });
});
