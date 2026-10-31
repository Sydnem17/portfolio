import { describe, expect, it } from 'vitest';
import { CONFIRMED_FAVOURITES, SEED_BY_ID, SEED_FILMS } from '../src/data/catalogue';
import { ARTIST_BY_ID, DOUBLE_BILLS, MUSIC, TRAILS } from '../src/data/connections';

describe('seed catalogue', () => {
  it('contains 136 distinct films with stable, unique ids', () => {
    expect(SEED_FILMS).toHaveLength(136);
    expect(new Set(SEED_FILMS.map((f) => f.id)).size).toBe(136);
    expect(SEED_BY_ID['muriels-wedding-1994']?.title).toBe("Muriel's Wedding");
  });

  it('gives every film a title, year, category, spoiler-free intro and editorial reason', () => {
    for (const f of SEED_FILMS) {
      expect(f.title, f.id).toBeTruthy();
      expect(f.year, f.id).toBeGreaterThan(1900);
      expect(f.category, f.id).toBeTruthy();
      expect(f.intro.length, f.id).toBeGreaterThan(30);
      expect(f.why, f.id).toBeTruthy();
      if (f.spoiler) expect(f.intro + f.why).not.toContain(f.spoiler);
    }
  });

  it('flags exactly the five requested films as your picks', () => {
    expect(SEED_FILMS.filter((f) => f.userPick).map((f) => f.id).sort()).toEqual(
      ['dirty-dancing-1987', 'empire-records-1995', 'ghost-1990', 'sex-lies-and-videotape-1989', 'the-wedding-singer-1998'].sort(),
    );
  });

  it('preserves release-year and identity distinctions', () => {
    const crash = SEED_BY_ID['crash-1996'];
    expect(crash.directors).toEqual(['David Cronenberg']);
    expect(crash.versionNote).toMatch(/2004/);
    expect(SEED_BY_ID['dream-lover-1993'].yearNote).toMatch(/1994/);
    expect(SEED_BY_ID['heathers-1989'].yearNote).toMatch(/1988/);
  });

  it('never guesses runtimes: unknown runtimes stay null', () => {
    const unknown = SEED_FILMS.filter((f) => f.runtime === null);
    expect(unknown.length).toBeGreaterThan(0);
    for (const f of SEED_FILMS) if (f.runtime !== null) expect(f.runtime).toBeGreaterThan(60);
  });

  it('has at least six verified story-setting periods', () => {
    expect(SEED_FILMS.filter((f) => f.storySetting).length).toBeGreaterThanOrEqual(6);
  });

  it('includes the James Spader titles with credited roles', () => {
    const spader = SEED_FILMS.filter((f) => f.cast.some((c) => c.name === 'James Spader'));
    for (const id of ['sex-lies-and-videotape-1989', 'white-palace-1990', 'bad-influence-1990', 'less-than-zero-1987', 'pretty-in-pink-1986', 'crash-1996', 'dream-lover-1993']) {
      expect(spader.map((f) => f.id)).toContain(id);
    }
    for (const f of spader) expect(f.cast.find((c) => c.name === 'James Spader')?.role, f.id).toBeTruthy();
  });
});

describe('connections', () => {
  const ids = new Set(SEED_FILMS.map((f) => f.id));

  it('only references films that exist', () => {
    for (const id of CONFIRMED_FAVOURITES) expect(ids.has(id), id).toBe(true);
    for (const m of MUSIC) {
      if (m.filmId) expect(ids.has(m.filmId), m.id).toBe(true);
      expect(ARTIST_BY_ID[m.artistId], m.id).toBeTruthy();
    }
    for (const t of TRAILS) for (const s of [t.recognise, t.connection, t.memorable, t.next]) if (s.filmId) expect(ids.has(s.filmId), `${t.id}:${s.filmId}`).toBe(true);
    for (const b of DOUBLE_BILLS) {
      expect(ids.has(b.first), b.id).toBe(true);
      expect(ids.has(b.second), b.id).toBe(true);
      expect(b.first).not.toBe(b.second);
    }
  });

  it('has at least 12 complete, sourced reference trails with stated connection types', () => {
    expect(TRAILS.length).toBeGreaterThanOrEqual(12);
    for (const t of TRAILS) {
      expect(t.sources.length, t.id).toBeGreaterThan(0);
      expect(t.connection.filmId, t.id).toBeTruthy();
      expect(t.connection.type, t.id).toBeTruthy();
      expect(t.next.filmId, t.id).toBeTruthy();
      expect(t.next.type, t.id).toBeTruthy();
      expect(t.next.filmId).not.toBe(t.connection.filmId);
    }
  });

  it('has at least 12 music connections, with Talking Heads prominent', () => {
    expect(MUSIC.length).toBeGreaterThanOrEqual(12);
    expect(MUSIC.filter((m) => m.artistId === 'talking-heads').length).toBeGreaterThanOrEqual(4);
    for (const m of MUSIC) expect(m.sources.length, m.id).toBeGreaterThan(0);
  });

  it('has six or more double bills, including Muriel’s Wedding and a music pairing', () => {
    expect(DOUBLE_BILLS.length).toBeGreaterThanOrEqual(6);
    expect(DOUBLE_BILLS.some((b) => b.first === 'muriels-wedding-1994' || b.second === 'muriels-wedding-1994')).toBe(true);
    expect(DOUBLE_BILLS.some((b) => b.basis === 'music')).toBe(true);
  });
});
