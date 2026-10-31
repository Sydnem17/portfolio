import { describe, expect, it } from 'vitest';
import { eveningLength, suggestSecond } from '../src/lib/doubleBill';
import { NO_EXCLUSIONS } from '../src/lib/tonight';
import { freshState, resolveFilms } from '../src/state/model';

const films = resolveFilms(freshState());
const byId = new Map(films.map((f) => [f.id, f]));

describe('double bills', () => {
  it('never pairs a film with itself, in either mode, for any first film', () => {
    for (const f of films) {
      for (const mode of ['same', 'change'] as const) {
        const list = suggestSecond(f, films, mode);
        for (const s of list) expect(s.film.id).not.toBe(f.id);
        expect(new Set(list.map((s) => s.film.id)).size).toBe(list.length);
      }
    }
  });

  it('respects exclusions for film two', () => {
    const ex = { ...NO_EXCLUSIONS, horror: true, intense: true };
    for (const f of films.slice(0, 60)) {
      for (const s of suggestSecond(f, films, 'same', ex)) {
        expect(s.film.genres).not.toContain('horror');
        expect(s.film.intense).toBeFalsy();
      }
    }
  });

  it('offers the curated Muriel’s Wedding pairing first', () => {
    const muriel = byId.get('muriels-wedding-1994')!;
    expect(suggestSecond(muriel, films, 'same')[0].film.id).toBe('the-adventures-of-priscilla-queen-of-the-desert-1994');
  });

  it('adds the interval, and never invents a missing runtime', () => {
    const a = byId.get('ghost-1990')!;
    const b = byId.get('dirty-dancing-1987')!;
    expect(eveningLength(a, b, 20)).toEqual({ total: 127 + 20 + 100, missing: [] });
    const unknown = byId.get('dream-lover-1993')!;
    expect(eveningLength(a, unknown, 20)).toEqual({ total: null, missing: ['Dream Lover'] });
  });
});
