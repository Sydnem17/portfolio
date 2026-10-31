import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Film } from '../data/types';
import { resolveFilms, type PersonalState, type ResolvedFilm } from './model';
import { browserStore, loadState, saveState, type KeyValueStore, type StorageHealth } from './storage';

export interface Toast {
  id: number;
  message: string;
  undoable: boolean;
}

interface StoreValue {
  state: PersonalState;
  films: ResolvedFilm[];
  byId: Map<string, ResolvedFilm>;
  health: StorageHealth;
  /** Apply a change. Undoable changes get an Undo button on the confirmation. */
  commit: (fn: (s: PersonalState) => PersonalState, message?: string, opts?: { undoable?: boolean; quiet?: boolean }) => void;
  undo: () => void;
  canUndo: boolean;
  toast: Toast | null;
  dismissToast: () => void;
  announce: (message: string) => void;
  announcement: string;
  retrySave: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const MAX_UNDO = 30;

export function StoreProvider({
  children,
  store: injected,
  seed,
}: {
  children: ReactNode;
  store?: KeyValueStore | null;
  seed?: Film[];
}) {
  const kv = useRef<KeyValueStore | null>(injected !== undefined ? injected : browserStore());
  const initial = useMemo(() => loadState(kv.current), []);
  const [state, setState] = useState<PersonalState>(initial.state);
  const [health, setHealth] = useState<StorageHealth>(initial.health);
  const stateRef = useRef(state);
  const historyRef = useRef<PersonalState[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const toastId = useRef(0);
  const firstSave = useRef(true);

  // Persist after every change, and on first run so the starting favourites are recorded once.
  useEffect(() => {
    if (firstSave.current && !initial.isFresh) {
      firstSave.current = false;
      return;
    }
    firstSave.current = false;
    const h = saveState(kv.current, state);
    setHealth((prev) => (prev.ok === h.ok && (prev as { reason?: string }).reason === (h as { reason?: string }).reason ? prev : h));
  }, [state, initial.isFresh]);

  const announce = useCallback((message: string) => {
    // Clear then set so repeated identical messages are still announced, once.
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(message), 30);
  }, []);

  const commit = useCallback<StoreValue['commit']>(
    (fn, message, opts = {}) => {
      const prev = stateRef.current;
      const next = fn(prev);
      if (next === prev) return;
      stateRef.current = next;
      setState(next);
      if (opts.undoable !== false) {
        historyRef.current = [prev, ...historyRef.current].slice(0, MAX_UNDO);
        setCanUndo(true);
      }
      if (message && !opts.quiet) {
        toastId.current += 1;
        setToast({ id: toastId.current, message, undoable: opts.undoable !== false });
        announce(message);
      }
    },
    [announce],
  );

  const undo = useCallback(() => {
    const [prev, ...rest] = historyRef.current;
    if (!prev) return;
    historyRef.current = rest;
    stateRef.current = prev;
    setState(prev);
    setCanUndo(rest.length > 0);
    toastId.current += 1;
    setToast({ id: toastId.current, message: 'Undone.', undoable: false });
    announce('Undone.');
  }, [announce]);

  const retrySave = useCallback(() => {
    setHealth(saveState(kv.current, state));
  }, [state]);

  const films = useMemo(() => resolveFilms(state, seed), [state, seed]);
  const byId = useMemo(() => new Map(films.map((f) => [f.id, f])), [films]);

  const value: StoreValue = {
    state,
    films,
    byId,
    health,
    commit,
    undo,
    canUndo,
    toast,
    dismissToast: () => setToast(null),
    announce,
    announcement,
    retrySave,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}
