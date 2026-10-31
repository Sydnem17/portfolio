import { describe, expect, it } from 'vitest';
import { applyImport, exportBackup, previewImport, toCsv } from '../src/state/io';
import { freshState, makeCustomFilm, resolveFilms, updatePersonal } from '../src/state/model';

describe('backup and restore', () => {
  it('round-trips personal data through a JSON backup', () => {
    let s = freshState();
    s = updatePersonal(s, 'ghost-1990', { status: 'watched', reaction: 'liked', notes: 'With "quotes", commas, and\nnew lines', rewatch: true });
    const custom = makeCustomFilm({ title: 'Proof', year: 1991, directors: ['Jocelyn Moorhouse'], runtime: null, category: 'Australian & New Zealand favourites', intro: '' });
    s = { ...s, customFilms: { [custom.id]: custom }, shelves: [...s.shelves, { id: 'x', name: 'Sunday', filmIds: ['ghost-1990', custom.id] }] };
    s = { ...s, prefs: { ...s.prefs, tmdbToken: 'secret' } };
    const text = exportBackup(s);
    expect(text).not.toContain('secret');

    const preview = previewImport(freshState(), text);
    const restored = applyImport(freshState(), preview);
    const ghost = resolveFilms(restored).find((f) => f.id === 'ghost-1990')!;
    expect(ghost.me).toMatchObject({ status: 'watched', reaction: 'liked', rewatch: true });
    expect(ghost.me.notes).toBe('With "quotes", commas, and\nnew lines');
    expect(restored.customFilms[custom.id].title).toBe('Proof');
    expect(restored.shelves.find((x) => x.name === 'Sunday')?.filmIds).toEqual(['ghost-1990', custom.id]);
  });

  it('rejects invalid or unrelated files with a clear message', () => {
    expect(() => previewImport(freshState(), '{oops')).toThrow(/not valid JSON/);
    expect(() => previewImport(freshState(), JSON.stringify({ hello: 'world' }))).toThrow(/Movie Club backup/);
    expect(() => previewImport(freshState(), JSON.stringify({ app: 'taryns-movie-club', schema: 99, state: { films: {} } }))).toThrow(/newer version/);
  });

  it('skips invalid records and reports them', () => {
    const text = JSON.stringify({
      app: 'taryns-movie-club',
      schema: 1,
      state: {
        films: { 'ghost-1990': { status: 'watched', reaction: 'loved', notes: 'ok' }, broken: 'nope', 'clueless-1995': { status: 'bogus' } },
        customFilms: { 'my-bad': { title: '', year: 'soon' } },
        shelves: [{ name: '' }, { name: 'Good', filmIds: ['ghost-1990', 'ghost-1990', 5] }],
      },
    });
    const p = previewImport(freshState(), text);
    expect(p.warnings.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(p.incoming.customFilms)).toHaveLength(0);
    expect(p.incoming.shelves.find((s) => s.name === 'Good')?.filmIds).toEqual(['ghost-1990']);
    expect(p.incoming.films['ghost-1990'].reaction).toBe('loved');
  });

  it('merges duplicate added films instead of duplicating them', () => {
    const film = makeCustomFilm({ title: 'Proof', year: 1991, directors: [], runtime: null, category: 'x', intro: '' });
    const mine = { ...freshState(), customFilms: { [film.id]: film } };
    const theirs = { ...freshState(), customFilms: { 'my-proof-copy': { ...film, id: 'my-proof-copy', title: 'proof' } }, films: { 'my-proof-copy': { status: 'watched', reaction: 'liked', notes: 'n', rewatch: false, spoilers: false, archived: false } } };
    const p = previewImport(mine, exportBackup(theirs as never));
    expect(p.duplicates).toHaveLength(1);
    const merged = applyImport(mine, p);
    expect(Object.keys(merged.customFilms)).toEqual([film.id]);
    expect(merged.films[film.id].reaction).toBe('liked');
  });

  it('keeps existing notes by default when both sides differ', () => {
    const mine = updatePersonal(freshState(), 'ghost-1990', { notes: 'Mine', reaction: 'loved' });
    const theirs = updatePersonal(freshState(), 'ghost-1990', { notes: 'Theirs', reaction: 'disliked' });
    const p = previewImport(mine, exportBackup(theirs));
    expect(p.conflicts.find((c) => c.id === 'ghost-1990')?.notesDiffer).toBe(true);
    expect(applyImport(mine, p).films['ghost-1990']).toMatchObject({ notes: 'Mine', reaction: 'loved' });
    expect(applyImport(mine, p, { conflicts: 'keep-mine', notes: 'combine' }).films['ghost-1990'].notes).toBe('Mine\n\nTheirs');
    expect(applyImport(mine, p, { conflicts: 'use-imported', notes: 'use-imported' }).films['ghost-1990']).toMatchObject({ notes: 'Theirs', reaction: 'disliked' });
  });

  it('exports a CSV watchlist with escaped values', () => {
    const s = updatePersonal(freshState(), 'ghost-1990', { notes: 'Line, with "quote"' });
    const csv = toCsv(s);
    const lines = csv.split('\r\n');
    expect(lines[0]).toMatch(/^Title,Year,Directors/);
    expect(lines).toHaveLength(137);
    expect(csv).toContain('"Line, with ""quote"""');
    expect(csv).toMatch(/Muriel's Wedding,1994,P\. J\. Hogan,.*Watched,Loved/);
  });
});
