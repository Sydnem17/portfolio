import { describe, expect, it } from 'vitest';
import { searchFilms, searchTrails } from '../src/lib/search';
import { freshState, resolveFilms } from '../src/state/model';

const films = resolveFilms(freshState());

describe('search', () => {
  it('ignores punctuation and a stray plural', () => {
    expect(searchFilms(films, 'sex lies and videotapes')[0].film.id).toBe('sex-lies-and-videotape-1989');
    expect(searchFilms(films, 'say anything')[0].film.id).toBe('say-anything-1989');
    expect(searchFilms(films, 'muriels wedding')[0].film.id).toBe('muriels-wedding-1994');
    expect(searchFilms(films, 'amelie')[0].film.id).toBe('amelie-2001');
  });

  it('searches people, years, moods and references', () => {
    expect(searchFilms(films, 'spader').length).toBe(12);
    expect(searchFilms(films, '1989').map((h) => h.film.id)).toContain('heathers-1989');
    expect(searchFilms(films, 'beautifully strange').length).toBeGreaterThan(5);
    expect(searchFilms(films, 'unchained melody')[0].film.id).toBe('ghost-1990');
    expect(searchFilms(films, 'talking heads')[0].film.id).toBe('stop-making-sense-1984');
  });

  it('distinguishes same-title films by keeping year and director on the record', () => {
    const crash = searchFilms(films, 'crash')[0].film;
    expect(crash.year).toBe(1996);
    expect(crash.directors).toContain('David Cronenberg');
  });

  it('never surfaces spoiler text in results or match snippets', () => {
    const spoilerFilms = films.filter((f) => f.spoiler);
    expect(spoilerFilms.length).toBeGreaterThan(0);
    for (const f of spoilerFilms) {
      const words = f.spoiler!.split(/\s+/).filter((w) => w.length > 4).slice(0, 6);
      for (const w of [...words, f.spoiler!]) {
        for (const hit of searchFilms(films, w)) expect(hit.matched).not.toContain(f.spoiler!);
      }
    }
    // The misquoted line is only reachable via its spoiler-gated trail, never as a film result.
    expect(searchFilms(films, 'luke i am your father').map((h) => h.film.id)).not.toContain('the-empire-strikes-back-1980');
  });

  it('finds reference trails by curated alias, and nothing for unknown references', () => {
    expect(searchTrails('boombox')[0].id).toBe('boombox');
    expect(searchTrails('goes to eleven')[0].id).toBe('up-to-eleven');
    expect(searchTrails('zzz nothing like this')).toEqual([]);
  });
});
