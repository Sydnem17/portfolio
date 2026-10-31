import { describe, expect, it } from 'vitest';
import { SEED_FILMS } from '../src/data/catalogue';
import type { Film } from '../src/data/types';
import { freshState, recogniseReference, resolveFilms, updatePersonal } from '../src/state/model';
import { STORAGE_KEY, loadState, saveState } from '../src/state/storage';
import { memoryStore } from './helpers';

describe('first run', () => {
  it('starts with exactly two films watched and loved: Muriel’s Wedding and The Breakfast Club', () => {
    const films = resolveFilms(freshState());
    const loved = films.filter((f) => f.me.status === 'watched' && f.me.reaction === 'loved');
    expect(loved.map((f) => f.id).sort()).toEqual(['muriels-wedding-1994', 'the-breakfast-club-1985']);
    expect(films.filter((f) => f.me.status !== 'unknown')).toHaveLength(2);
  });

  it('never resets later edits to the starting favourites', () => {
    const store = memoryStore();
    let { state } = loadState(store);
    state = updatePersonal(state, 'muriels-wedding-1994', { reaction: 'liked', status: 'want' });
    saveState(store, state);
    const reloaded = loadState(store);
    expect(reloaded.isFresh).toBe(false);
    const muriel = resolveFilms(reloaded.state).find((f) => f.id === 'muriels-wedding-1994')!;
    expect(muriel.me.reaction).toBe('liked');
    expect(muriel.me.status).toBe('want');
  });
});

describe('reference recognition', () => {
  it('does not change any viewing status', () => {
    const before = freshState();
    const after = recogniseReference(before, 'pottery-wheel', true);
    expect(after.recognised['pottery-wheel']).toBeTruthy();
    expect(after.films).toEqual(before.films);
    const ghost = resolveFilms(after).find((f) => f.id === 'ghost-1990')!;
    expect(ghost.me.status).toBe('unknown');
  });
});

describe('persistence', () => {
  it('keeps notes and reactions across a reload', () => {
    const store = memoryStore();
    let { state } = loadState(store);
    state = updatePersonal(state, 'ghost-1990', { notes: 'Watch with Mum', reaction: 'mixed', status: 'watched', rewatch: true });
    expect(saveState(store, state).ok).toBe(true);
    const ghost = resolveFilms(loadState(store).state).find((f) => f.id === 'ghost-1990')!;
    expect(ghost.me).toMatchObject({ notes: 'Watch with Mum', reaction: 'mixed', status: 'watched', rewatch: true });
  });

  it('keeps personal data when the catalogue is updated', () => {
    const store = memoryStore();
    let { state } = loadState(store);
    state = updatePersonal(state, 'ghost-1990', { notes: 'Pottery!', reaction: 'loved' });
    state = { ...state, shelves: [...state.shelves, { id: 's1', name: 'Rainy day', filmIds: ['ghost-1990'] }] };
    saveState(store, state);

    // A later catalogue: Ghost's text changes, a film is added, another is removed.
    const updated: Film[] = SEED_FILMS.filter((f) => f.id !== 'friday-1995').map((f) => (f.id === 'ghost-1990' ? { ...f, intro: 'New text.' } : f));
    updated.push({ ...SEED_FILMS[0], id: 'new-film-2026', title: 'New Film', year: 2026 });
    const reloaded = loadState(store).state;
    const ghost = resolveFilms(reloaded, updated).find((f) => f.id === 'ghost-1990')!;
    expect(ghost.intro).toBe('New text.');
    expect(ghost.me.notes).toBe('Pottery!');
    expect(ghost.me.reaction).toBe('loved');
    expect(reloaded.shelves.find((s) => s.name === 'Rainy day')?.filmIds).toEqual(['ghost-1990']);
    // The starting favourites are not re-applied over existing state.
    expect(resolveFilms(reloaded, updated).filter((f) => f.me.reaction === 'loved').map((f) => f.id).sort()).toEqual(
      ['ghost-1990', 'muriels-wedding-1994', 'the-breakfast-club-1985'],
    );
  });

  it('keeps title corrections separate from the catalogue', () => {
    const s = { ...freshState(), filmEdits: { 'ghost-1990': { runtime: 128 } } };
    const ghost = resolveFilms(s).find((f) => f.id === 'ghost-1990')!;
    expect(ghost.runtime).toBe(128);
    expect(SEED_FILMS.find((f) => f.id === 'ghost-1990')!.runtime).toBe(127);
  });

  it('recovers when storage is unavailable, full or unreadable', () => {
    expect(loadState(null).health).toEqual({ ok: false, reason: 'unavailable' });
    const full = memoryStore();
    full.setItem = () => {
      const e = new Error('quota');
      e.name = 'QuotaExceededError';
      throw e;
    };
    expect(saveState(full, freshState())).toMatchObject({ ok: false, reason: 'full' });

    const corrupt = memoryStore({ [STORAGE_KEY]: '{not json' });
    const r = loadState(corrupt);
    expect(r.health).toMatchObject({ ok: false, reason: 'corrupt-recovered' });
    expect(Object.keys(corrupt.data).some((k) => k.startsWith(`${STORAGE_KEY}.unreadable-`))).toBe(true);
    expect(resolveFilms(r.state).filter((f) => f.me.reaction === 'loved')).toHaveLength(2);
  });
});
