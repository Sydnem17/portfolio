import { SCHEMA_VERSION, freshState, type PersonalState } from './model';
import { sanitiseState } from './io';

export const STORAGE_KEY = 'taryns-movie-club/state';

export type StorageHealth =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'full' | 'corrupt-recovered' | 'write-failed'; detail?: string };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStore(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = '__tmc_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadState(store: KeyValueStore | null): { state: PersonalState; health: StorageHealth; isFresh: boolean } {
  if (!store) return { state: freshState(), health: { ok: false, reason: 'unavailable' }, isFresh: true };
  const raw = store.getItem(STORAGE_KEY);
  if (raw == null) return { state: freshState(), health: { ok: true }, isFresh: true };
  try {
    const parsed = JSON.parse(raw);
    const { state } = sanitiseState(parsed);
    if (state.schema !== SCHEMA_VERSION) state.schema = SCHEMA_VERSION;
    return { state, health: { ok: true }, isFresh: false };
  } catch (err) {
    // Keep the unreadable copy so nothing is silently destroyed, then start clean.
    try {
      store.setItem(`${STORAGE_KEY}.unreadable-${Date.now()}`, raw);
    } catch {
      /* ignore */
    }
    return {
      state: freshState(),
      health: { ok: false, reason: 'corrupt-recovered', detail: String(err) },
      isFresh: true,
    };
  }
}

export function saveState(store: KeyValueStore | null, state: PersonalState): StorageHealth {
  if (!store) return { ok: false, reason: 'unavailable' };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    const name = (err as { name?: string })?.name ?? '';
    const full = /quota/i.test(name) || /quota/i.test(String(err));
    return { ok: false, reason: full ? 'full' : 'write-failed', detail: String(err) };
  }
}
