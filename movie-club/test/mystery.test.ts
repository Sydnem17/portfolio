import { describe, expect, it } from 'vitest';
import { mysteryClues, mysteryPool } from '../src/lib/mystery';
import { normalise } from '../src/lib/search';
import { freshState, resolveFilms } from '../src/state/model';

describe('mystery shelf', () => {
  const films = resolveFilms(freshState());
  it('gives three clues that never contain the title or spoiler text', () => {
    for (const f of mysteryPool(films)) {
      const clues = mysteryClues(f, films);
      expect(clues.length, f.id).toBeGreaterThanOrEqual(2);
      for (const c of clues) {
        expect(normalise(c)).not.toContain(normalise(f.title));
        if (f.spoiler) expect(c).not.toContain(f.spoiler);
      }
    }
  });
  it('only draws from films not yet seen', () => {
    expect(mysteryPool(films).some((f) => f.me.status === 'watched')).toBe(false);
  });
});
