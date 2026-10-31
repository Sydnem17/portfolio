import { useMemo, useState, type FormEvent } from 'react';
import { FilmCard, FilmRow } from '../components/FilmCard';
import { Icon } from '../components/Icon';
import { Dialog, EmptyState } from '../components/ui';
import { CATEGORIES } from '../data/catalogue';
import type { GenreId, MoodId } from '../data/types';
import { GENRE_LABEL, MOOD_LABEL, decadeOf } from '../lib/labels';
import { searchFilms } from '../lib/search';
import { navigate } from '../router';
import { identityKey, makeCustomFilm, uid, type ResolvedFilm, type ViewingStatus } from '../state/model';
import { useStore } from '../state/store';

interface Filters {
  q: string;
  decade: string;
  mood: string;
  status: string;
  genre: string;
  person: string;
  shelf: string;
  pick: boolean;
  archived: boolean;
  sort: 'title' | 'year' | 'recent';
}

const EMPTY: Filters = { q: '', decade: '', mood: '', status: '', genre: '', person: '', shelf: '', pick: false, archived: false, sort: 'title' };

const STATUS_FILTERS: Record<string, string> = {
  unknown: 'Not yet known',
  want: 'Want to watch',
  watched: 'Watched',
  loved: 'Loved',
  rewatch: 'Flagged for rewatch',
  'not-for-me': 'Not for me',
};

function fromQuery(q: URLSearchParams): Filters {
  return {
    ...EMPTY,
    q: q.get('q') ?? '',
    decade: q.get('decade') ?? '',
    mood: q.get('mood') ?? '',
    status: q.get('status') ?? '',
    genre: q.get('genre') ?? '',
    person: q.get('person') ?? '',
    shelf: q.get('shelf') ?? '',
    pick: q.get('pick') === '1',
    archived: q.get('archived') === '1',
    sort: (q.get('sort') as Filters['sort']) || 'title',
  };
}

function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  (['q', 'decade', 'mood', 'status', 'genre', 'person', 'shelf'] as const).forEach((k) => f[k] && p.set(k, f[k]));
  if (f.pick) p.set('pick', '1');
  if (f.archived) p.set('archived', '1');
  if (f.sort !== 'title') p.set('sort', f.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}

const sortTitle = (t: string) => t.replace(/^(the|a|an)\s+/i, '');

export function MyFilms({ query }: { query: URLSearchParams }) {
  const { films, state, commit } = useStore();
  const [filters, setFiltersState] = useState<Filters>(() => fromQuery(query));
  const [addOpen, setAddOpen] = useState(false);
  const [shelvesOpen, setShelvesOpen] = useState(false);
  // Filters start folded away on phones so films appear first; always open on wider screens.
  const [filtersOpen, setFiltersOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(min-width: 760px)').matches);
  const view = state.prefs.view;

  const setFilters = (next: Filters) => {
    setFiltersState(next);
    // Keep the address in step without adding a history entry per keystroke.
    window.history.replaceState(null, '', `#/films${toQuery(next)}`);
  };
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters({ ...filters, [k]: v });

  const people = useMemo(() => {
    const count = new Map<string, number>();
    for (const f of films) for (const n of new Set([...f.directors, ...f.cast.map((c) => c.name)])) count.set(n, (count.get(n) ?? 0) + 1);
    return [...count.entries()].filter(([, c]) => c >= 2).map(([n]) => n).sort((a, b) => a.split(' ').slice(-1)[0].localeCompare(b.split(' ').slice(-1)[0]));
  }, [films]);
  const decades = useMemo(() => Array.from(new Set(films.map((f) => decadeOf(f.year)))).sort(), [films]);

  const archivedCount = films.filter((f) => f.me.archived).length;

  const results = useMemo(() => {
    let list: ResolvedFilm[] = films.filter((f) => (filters.archived ? f.me.archived : !f.me.archived));
    if (filters.q.trim()) {
      const hits = searchFilms(list, filters.q, { includeArchived: filters.archived });
      list = hits.map((h) => h.film);
    }
    if (filters.decade) list = list.filter((f) => String(decadeOf(f.year)) === filters.decade);
    if (filters.mood) list = list.filter((f) => f.moods.includes(filters.mood as MoodId));
    if (filters.genre) list = list.filter((f) => f.genres.includes(filters.genre as GenreId));
    if (filters.person) list = list.filter((f) => f.directors.includes(filters.person) || f.cast.some((c) => c.name === filters.person));
    if (filters.status) {
      if (filters.status === 'loved') list = list.filter((f) => f.me.reaction === 'loved');
      else if (filters.status === 'rewatch') list = list.filter((f) => f.me.rewatch);
      else list = list.filter((f) => f.me.status === (filters.status as ViewingStatus));
    }
    if (filters.shelf) {
      const shelf = state.shelves.find((s) => s.id === filters.shelf);
      list = shelf ? list.filter((f) => shelf.filmIds.includes(f.id)) : [];
    }
    if (filters.pick) list = list.filter((f) => f.userPick);
    if (!filters.q.trim() || filters.sort !== 'title') {
      list = [...list].sort((a, b) => {
        if (filters.sort === 'year') return a.year - b.year || a.title.localeCompare(b.title);
        if (filters.sort === 'recent') return (b.me.updatedAt ?? '').localeCompare(a.me.updatedAt ?? '') || a.title.localeCompare(b.title);
        return sortTitle(a.title).localeCompare(sortTitle(b.title));
      });
    }
    return list;
  }, [films, filters, state.shelves]);

  const total = films.filter((f) => (filters.archived ? f.me.archived : !f.me.archived)).length;

  const chips: { label: string; clear: () => void }[] = [];
  if (filters.q) chips.push({ label: `Text: “${filters.q}”`, clear: () => set('q', '') });
  if (filters.decade) chips.push({ label: `${filters.decade}s`, clear: () => set('decade', '') });
  if (filters.mood) chips.push({ label: MOOD_LABEL[filters.mood as MoodId], clear: () => set('mood', '') });
  if (filters.status) chips.push({ label: STATUS_FILTERS[filters.status], clear: () => set('status', '') });
  if (filters.genre) chips.push({ label: GENRE_LABEL[filters.genre as GenreId], clear: () => set('genre', '') });
  if (filters.person) chips.push({ label: filters.person, clear: () => set('person', '') });
  if (filters.shelf) chips.push({ label: `Shelf: ${state.shelves.find((s) => s.id === filters.shelf)?.name ?? 'Removed shelf'}`, clear: () => set('shelf', '') });
  if (filters.pick) chips.push({ label: 'Your picks', clear: () => set('pick', false) });
  if (filters.archived) chips.push({ label: 'Archived films', clear: () => set('archived', false) });

  return (
    <div>
      <div className="page-head">
        <h1>My films</h1>
        <p>The whole collection, with your statuses, reactions and shelves. Filter it, sort it, or add something new.</p>
      </div>

      <div className="toolbar">
        <div className="row-wrap">
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label htmlFor="coll-q">Search the collection</label>
            <input id="coll-q" type="search" value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Title, person, year, mood or reference" />
          </div>
          <div className="row-wrap" style={{ alignSelf: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShelvesOpen(true)}>
              Shelves ({state.shelves.length})
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={18} /> Add a film
            </button>
          </div>
        </div>

        <details className="filters" open={filtersOpen} onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="btn btn-secondary btn-sm">
            Filters{chips.length ? ` (${chips.length} active)` : ''}
          </summary>
        <div className="filter-row">
          <div className="field">
            <label htmlFor="f-decade">Decade</label>
            <select id="f-decade" value={filters.decade} onChange={(e) => set('decade', e.target.value)}>
              <option value="">Any decade</option>
              {decades.map((d) => (
                <option key={d} value={d}>
                  {d}s
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-mood">Mood</label>
            <select id="f-mood" value={filters.mood} onChange={(e) => set('mood', e.target.value)}>
              <option value="">Any mood</option>
              {(Object.keys(MOOD_LABEL) as MoodId[]).map((m) => (
                <option key={m} value={m}>
                  {MOOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-status">Your status</label>
            <select id="f-status" value={filters.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Any status</option>
              {Object.entries(STATUS_FILTERS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-genre">Genre</label>
            <select id="f-genre" value={filters.genre} onChange={(e) => set('genre', e.target.value)}>
              <option value="">Any genre</option>
              {(Object.keys(GENRE_LABEL) as GenreId[]).map((g) => (
                <option key={g} value={g}>
                  {GENRE_LABEL[g]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-person">Person</label>
            <select id="f-person" value={filters.person} onChange={(e) => set('person', e.target.value)}>
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-shelf">Shelf</label>
            <select id="f-shelf" value={filters.shelf} onChange={(e) => set('shelf', e.target.value)}>
              <option value="">All shelves</option>
              {state.shelves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row-wrap">
          <label className="check">
            <input type="checkbox" checked={filters.pick} onChange={(e) => set('pick', e.target.checked)} /> Only your picks
          </label>
          <label className="check">
            <input type="checkbox" checked={filters.archived} onChange={(e) => set('archived', e.target.checked)} /> Show archived ({archivedCount})
          </label>
        </div>
        </details>

        {chips.length > 0 && (
          <div className="active-filters" aria-label="Active filters">
            {chips.map((c) => (
              <button key={c.label} type="button" className="chip-remove" onClick={c.clear} aria-label={`Remove filter: ${c.label}`}>
                {c.label} <Icon name="close" size={14} />
              </button>
            ))}
            <button type="button" className="link-btn" onClick={() => setFilters({ ...EMPTY, sort: filters.sort })}>
              Reset all filters
            </button>
          </div>
        )}
      </div>

      <div className="result-bar">
        <p role="status" aria-live="polite" className="small">
          Showing <strong>{results.length}</strong> of {total} {filters.archived ? 'archived ' : ''}films
        </p>
        <div className="row-wrap">
          <label className="visually-hidden" htmlFor="f-sort">
            Sort by
          </label>
          <select id="f-sort" className="select" style={{ width: 'auto', minHeight: 40 }} value={filters.sort} onChange={(e) => set('sort', e.target.value as Filters['sort'])}>
            <option value="title">Sort: Title</option>
            <option value="year">Sort: Year</option>
            <option value="recent">Sort: Recently updated</option>
          </select>
          <div role="group" aria-label="View" className="row-wrap" style={{ gap: 2 }}>
            <button
              type="button"
              className="icon-btn"
              aria-pressed={view === 'shelf'}
              aria-label="Poster shelf view"
              onClick={() => commit((s) => ({ ...s, prefs: { ...s.prefs, view: 'shelf' } }), undefined, { undoable: false })}
            >
              <Icon name="grid" />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-pressed={view === 'list'}
              aria-label="List view"
              onClick={() => commit((s) => ({ ...s, prefs: { ...s.prefs, view: 'list' } }), undefined, { undoable: false })}
            >
              <Icon name="list" />
            </button>
          </div>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState
          title={filters.archived && archivedCount === 0 ? 'Nothing archived' : 'No films match these filters'}
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setFilters({ ...EMPTY, sort: filters.sort })}>
              Reset all filters
            </button>
          }
        >
          {filters.archived && archivedCount === 0
            ? 'Films you archive appear here, ready to restore.'
            : 'Try removing a filter. Every filter you have set is listed above.'}
        </EmptyState>
      ) : view === 'list' ? (
        <ul className="film-list">
          {results.map((f) => (
            <FilmRow key={f.id} film={f} />
          ))}
        </ul>
      ) : (
        <div className="shelf-grid">
          {results.map((f) => (
            <FilmCard key={f.id} film={f} showDirector badge={f.userPick ? 'Your pick' : undefined} />
          ))}
        </div>
      )}

      <AddFilmDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ShelvesDialog open={shelvesOpen} onClose={() => setShelvesOpen(false)} onOpenShelf={(id) => { setShelvesOpen(false); setFilters({ ...EMPTY, shelf: id }); }} />
    </div>
  );
}

function AddFilmDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { films, commit } = useStore();
  const [form, setForm] = useState({ title: '', year: '', director: '', runtime: '', category: CATEGORIES[0], intro: '' });
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const year = Number(form.year);
    if (!form.title.trim()) return setError('Add a title.');
    if (!Number.isInteger(year) || year < 1880 || year > new Date().getFullYear() + 2) return setError('Add a release year, for example 1987.');
    const runtime = form.runtime.trim() ? Number(form.runtime) : null;
    if (runtime != null && (!Number.isInteger(runtime) || runtime < 1 || runtime > 600)) return setError('Runtime should be in whole minutes, or left blank if you are not sure.');
    const film = makeCustomFilm({
      title: form.title,
      year,
      directors: form.director.split(/,| and /).map((s) => s.trim()).filter(Boolean),
      runtime,
      category: form.category,
      intro: form.intro,
    });
    const dup = films.find((f) => identityKey(f) === identityKey(film));
    if (dup) return setError(`${dup.title} (${dup.year}) is already in the collection${dup.me.archived ? ' (archived — restore it from its page)' : ''}.`);
    commit((s) => ({ ...s, customFilms: { ...s.customFilms, [film.id]: film } }), `${film.title} added to your collection.`);
    setForm({ title: '', year: '', director: '', runtime: '', category: CATEGORIES[0], intro: '' });
    setError('');
    onClose();
    navigate(`/film/${film.id}`);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a film"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="add-film" className="btn btn-primary">
            Add film
          </button>
        </>
      }
    >
      <form id="add-film" className="stack" onSubmit={submit} noValidate>
        {error && (
          <p className="banner" role="alert">
            {error}
          </p>
        )}
        <div className="field">
          <label htmlFor="af-title">Title</label>
          <input id="af-title" data-autofocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="af-year">Release year</label>
            <input id="af-year" inputMode="numeric" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="af-runtime">
              Runtime in minutes <span className="hint">(leave blank if unsure)</span>
            </label>
            <input id="af-runtime" inputMode="numeric" value={form.runtime} onChange={(e) => setForm({ ...form, runtime: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="af-dir">Director</label>
          <input id="af-dir" value={form.director} onChange={(e) => setForm({ ...form, director: e.target.value })} />
          <span className="hint">Helps tell apart films with the same title.</span>
        </div>
        <div className="field">
          <label htmlFor="af-cat">Collection</label>
          <select id="af-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="af-intro">
            Short introduction <span className="hint">(keep it spoiler-free)</span>
          </label>
          <textarea id="af-intro" value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} style={{ minHeight: 90 }} />
        </div>
      </form>
    </Dialog>
  );
}

function ShelvesDialog({ open, onClose, onOpenShelf }: { open: boolean; onClose: () => void; onOpenShelf: (id: string) => void }) {
  const { state, commit } = useStore();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const create = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (state.shelves.some((s) => s.name.toLowerCase() === n.toLowerCase())) return;
    commit((s) => ({ ...s, shelves: [...s.shelves, { id: uid('shelf'), name: n, filmIds: [] }] }), `Shelf “${n}” created.`);
    setName('');
  };

  return (
    <Dialog open={open} onClose={onClose} title="Your shelves">
      <p className="small muted">A film can sit on as many shelves as you like. Add films to shelves from each film&rsquo;s page.</p>
      <form className="row-wrap" onSubmit={create}>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="new-shelf">New shelf name</label>
          <input id="new-shelf" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rainy Sunday" />
        </div>
        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={!name.trim()}>
          Create shelf
        </button>
      </form>
      <ul className="plain-list">
        {state.shelves.map((s) => (
          <li key={s.id} className="panel" style={{ padding: 14 }}>
            {editing?.id === s.id ? (
              <form
                className="row-wrap"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = editing.name.trim();
                  if (n) commit((st) => ({ ...st, shelves: st.shelves.map((x) => (x.id === s.id ? { ...x, name: n } : x)) }), `Shelf renamed to “${n}”.`);
                  setEditing(null);
                }}
              >
                <label className="visually-hidden" htmlFor={`rn-${s.id}`}>
                  Shelf name
                </label>
                <input id={`rn-${s.id}`} className="select" style={{ flex: 1 }} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
                <button type="submit" className="btn btn-primary btn-sm">
                  Save
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{s.name}</strong>
                  <p className="small muted">
                    {s.filmIds.length} {s.filmIds.length === 1 ? 'film' : 'films'}
                  </p>
                </div>
                <div className="row-wrap">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenShelf(s.id)}>
                    Show films
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: s.id, name: s.name })} aria-label={`Rename ${s.name}`}>
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    aria-label={`Delete shelf ${s.name}`}
                    onClick={() => commit((st) => ({ ...st, shelves: st.shelves.filter((x) => x.id !== s.id) }), `Shelf “${s.name}” deleted. The films are still in your collection.`)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

