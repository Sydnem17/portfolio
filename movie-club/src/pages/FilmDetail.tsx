import { useEffect, useState, type FormEvent } from 'react';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { MusicCard } from '../components/MusicCard';
import { Dialog, EmptyState, ExternalLink, RadioGroup, SourceList } from '../components/ui';
import { CATEGORIES, CONFIRMED_FAVOURITES } from '../data/catalogue';
import { MUSIC_BY_FILM, TRAILS } from '../data/connections';
import { CONNECTION_LABEL } from '../data/types';
import { GENRE_LABEL, MOOD_LABEL, formatRuntime, joinNames } from '../lib/labels';
import { whereToWatchAu } from '../lib/links';
import { relatedFor } from '../lib/related';
import { filmHref, href } from '../router';
import {
  REACTION_LABEL,
  STATUS_LABEL,
  recogniseReference,
  uid,
  updatePersonal,
  type Reaction,
  type ResolvedFilm,
  type ViewingStatus,
} from '../state/model';
import { useStore } from '../state/store';

export function FilmDetail({ id }: { id: string }) {
  const { byId } = useStore();
  const film = byId.get(id);
  if (!film) {
    return (
      <EmptyState title="We couldn’t find that film" action={<a className="btn btn-primary" href={href('/films')}>Browse my films</a>}>
        It may have been removed, or the link may be incomplete.
      </EmptyState>
    );
  }
  return <FilmView film={film} key={film.id} />;
}

function FilmView({ film }: { film: ResolvedFilm }) {
  const { byId, state, commit } = useStore();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmSpoiler, setConfirmSpoiler] = useState(false);
  const music = MUSIC_BY_FILM[film.id] ?? [];
  const trails = TRAILS.filter((t) => t.connection.filmId === film.id);
  const related = relatedFor(film, byId);
  const isAllTime = film.id === 'muriels-wedding-1994';
  const directors = film.directors;
  const sameTitle = [...byId.values()].filter((f) => f.id !== film.id && f.title.toLowerCase() === film.title.toLowerCase());
  const chosenTonight = state.tonight.chosen?.filmId === film.id;

  const setStatus = (status: ViewingStatus) =>
    commit((s) => updatePersonal(s, film.id, { status }), `${film.title}: ${STATUS_LABEL[status]}.`);
  const setReaction = (reaction: Reaction) =>
    commit((s) => updatePersonal(s, film.id, { reaction }), `${film.title}: reaction ${REACTION_LABEL[reaction].toLowerCase()}.`);

  return (
    <article>
      <a className="back-link" href={href('/films')} onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back(); } }}>
        <Icon name="back" size={18} /> Back
      </a>

      {chosenTonight && (
        <p className="banner info" role="note">
          <span>
            <strong>Tonight&rsquo;s pick.</strong> Enjoy it. Come back afterwards to record your reaction.
          </span>
        </p>
      )}
      {film.me.archived && (
        <div className="banner" role="note">
          <span>This film is archived, so it is hidden from shelves and suggestions.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => commit((s) => updatePersonal(s, film.id, { archived: false }), `${film.title} restored.`)}>
            Restore
          </button>
        </div>
      )}

      <header className="detail-hero">
        <Cover film={film} />
        <div style={{ minWidth: 0 }}>
          <div className="detail-tags" style={{ marginTop: 0, marginBottom: 10 }}>
            {isAllTime && <span className="tag cherry">One of your all-time favourites</span>}
            {film.userPick && <span className="tag cherry">Your pick</span>}
            <span className="tag">{film.category}</span>
            {film.custom && <span className="tag outline">Added by you</span>}
          </div>
          <h1>{film.title}</h1>
          <p className="detail-meta dot-list">
            <span>{film.year}</span>
            {directors.length > 0 && <span>Directed by {joinNames(directors)}</span>}
            <span>{formatRuntime(film.runtime)}</span>
          </p>
          {film.yearNote && <p className="small muted" style={{ marginTop: 6 }}>{film.yearNote}</p>}
          {film.versionNote && <p className="small muted" style={{ marginTop: 4 }}>Version: {film.versionNote}</p>}
          {sameTitle.length > 0 && (
            <p className="small muted" style={{ marginTop: 4 }}>
              Not to be confused with{' '}
              {sameTitle.map((f, i) => (
                <span key={f.id}>
                  {i > 0 && ', '}
                  <a href={filmHref(f.id)}>
                    {f.title} ({f.year}{f.directors[0] ? `, ${f.directors[0]}` : ''})
                  </a>
                </span>
              ))}
              .
            </p>
          )}
          <p className="detail-intro">{film.intro}</p>
          <div className="why-box">
            <p className="eyebrow cherry">Why it&rsquo;s here</p>
            <p>{film.why}</p>
          </div>
          {film.moods.length > 0 && (
            <div className="detail-tags">
              {film.moods.map((m) => (
                <a key={m} className="tag cobalt" style={{ textDecoration: 'none' }} href={href(`/films?mood=${m}`)}>
                  {MOOD_LABEL[m]}
                </a>
              ))}
            </div>
          )}
          {film.contentNote && (
            <p className="small" style={{ marginTop: 14, maxWidth: '62ch' }}>
              <strong>Content note:</strong> {film.contentNote}
            </p>
          )}
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-col">
          {(film.cast.length > 0 || directors.length > 0) && (
            <section className="panel" aria-labelledby="credits-h">
              <h2 id="credits-h">Credits</h2>
              <dl className="credits">
                {directors.length > 0 && (
                  <div>
                    <dt>Director{directors.length > 1 ? 's' : ''}</dt>
                    <dd>
                      {directors.map((d, i) => (
                        <span key={d}>
                          {i > 0 && ', '}
                          <a href={href(`/films?person=${encodeURIComponent(d)}`)}>{d}</a>
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {film.cast.length > 0 && (
                  <div>
                    <dt>Cast</dt>
                    <dd>
                      {film.cast.map((c, i) => (
                        <span key={c.name}>
                          {i > 0 && ', '}
                          <a href={href(`/films?person=${encodeURIComponent(c.name)}`)}>{c.name}</a>
                          {c.role && <span className="muted"> as {c.role}{c.supporting ? ' (supporting)' : ''}</span>}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {film.genres.length > 0 && (
                  <div>
                    <dt>Genre</dt>
                    <dd>{film.genres.map((g) => GENRE_LABEL[g]).join(', ')}</dd>
                  </div>
                )}
                {film.storySetting && (
                  <div>
                    <dt>Set in</dt>
                    <dd>
                      {film.storySetting.label}
                      {film.storySetting.place ? `, ${film.storySetting.place}` : ''}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {(music.length > 0 || trails.length > 0 || film.references.length > 0) && (
            <section className="panel" aria-labelledby="music-h">
              <h2 id="music-h">Music and references</h2>
              {film.references.length > 0 && (
                <p className="small" style={{ marginBottom: 12 }}>
                  <span className="muted">From your watchlist:</span> {film.references.join(' · ')}
                </p>
              )}
              {trails.length > 0 && (
                <ul className="plain-list" style={{ marginBottom: music.length ? 16 : 0 }}>
                  {trails.map((t) => {
                    const spoilerHidden = !!t.spoilerTeaser && !film.me.spoilers;
                    return (
                      <li key={t.id} className="row-wrap" style={{ justifyContent: 'space-between' }}>
                        <span>
                          <span className="tag outline">Reference trail</span>{' '}
                          {spoilerHidden ? 'A spoiler-bearing trail (hidden)' : t.cue}
                        </span>
                        <a className="btn btn-ghost btn-sm" href={href(`/connections/trails/${t.id}`)}>
                          Follow it <Icon name="arrow" size={16} />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
              {music.length > 0 && (
                <div className="music-grid">
                  {music.map((m) => (
                    <MusicCard key={m.id} link={m} showFilm={false} />
                  ))}
                </div>
              )}
            </section>
          )}

          {related.length > 0 && (
            <section className="panel" aria-labelledby="rel-h">
              <h2 id="rel-h">Related discoveries</h2>
              <ul className="related-list">
                {related.map((r) => (
                  <li key={r.film.id} className="related-item">
                    <Cover film={r.film} label={false} decorative />
                    <div>
                      <a href={filmHref(r.film.id)}>
                        {r.film.title} ({r.film.year})
                      </a>
                      <p className="tiny" style={{ margin: '2px 0' }}>
                        <span className="tag outline">{CONNECTION_LABEL[r.type]}</span>
                      </p>
                      <p className="small muted">{r.why}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {film.spoiler && (
            <section className="panel" aria-labelledby="spoil-h">
              <h2 id="spoil-h">Spoilers</h2>
              {film.me.spoilers ? (
                <div className="stack">
                  <p>{film.spoiler}</p>
                  <div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => commit((s) => updatePersonal(s, film.id, { spoilers: false }), 'Spoilers hidden again.')}>
                      Hide spoilers again
                    </button>
                  </div>
                </div>
              ) : (
                <div className="spoiler-box stack">
                  <p className="small">There is a well-known plot detail for this film. It stays hidden until you ask, even after you mark the film watched.</p>
                  <div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmSpoiler(true)}>
                      <Icon name="eye" size={16} /> Reveal spoilers for this film
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="panel" aria-labelledby="watch-h">
            <h2 id="watch-h">Where to watch</h2>
            <p className="small">
              We don&rsquo;t track streaming services, so this opens a search of Australian availability on JustWatch. Results there may change.
            </p>
            <p style={{ marginTop: 10 }}>
              <ExternalLink className="btn btn-secondary btn-sm" href={whereToWatchAu(film.title, film.year)}>
                Search Australian availability
              </ExternalLink>
            </p>
          </section>

          {film.sources.length > 0 && (
            <section className="panel" aria-label="Sources">
              <SourceList sources={film.sources} summary="Sources for this record" />
              {film.watchlistNote && <p className="small muted" style={{ marginTop: 8 }}>Watchlist note: {film.watchlistNote}</p>}
            </section>
          )}
        </div>

        <aside className="detail-col" aria-label="Your details for this film">
          <section className="panel control-stack" aria-labelledby="mine-h">
            <h2 id="mine-h">Yours</h2>
            <RadioGroup<ViewingStatus>
              legend="Viewing status"
              name={`status-${film.id}`}
              value={film.me.status}
              options={(Object.keys(STATUS_LABEL) as ViewingStatus[]).map((k) => ({ value: k, label: STATUS_LABEL[k] }))}
              onChange={setStatus}
            />
            <RadioGroup<Reaction>
              legend="Your reaction"
              name={`reaction-${film.id}`}
              value={film.me.reaction}
              options={(Object.keys(REACTION_LABEL) as Reaction[]).map((k) => ({ value: k, label: REACTION_LABEL[k] }))}
              onChange={setReaction}
            />
            {film.me.reaction !== 'unrecorded' && film.me.status !== 'watched' && (
              <p className="tiny muted">Your reaction is saved separately from viewing status.</p>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={film.me.rewatch}
                onChange={(e) =>
                  commit((s) => updatePersonal(s, film.id, { rewatch: e.target.checked }), e.target.checked ? `${film.title} flagged for a rewatch.` : `Rewatch flag removed.`)
                }
              />
              I&rsquo;d like to rewatch this
            </label>
            {trails.filter((t) => !t.spoilerTeaser || film.me.spoilers).map((t) => (
              <label className="check" key={t.id}>
                <input
                  type="checkbox"
                  checked={!!state.recognised[t.id]}
                  onChange={(e) => commit((s) => recogniseReference(s, t.id, e.target.checked), e.target.checked ? 'Marked as recognised. Viewing status unchanged.' : 'Recognition removed.')}
                />
                I recognise: {t.cue}
              </label>
            ))}
            <NotesField film={film} />
            <ShelfPicker film={film} />
            <div className="row-wrap">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditOpen(true)}>
                Edit details
              </button>
              {film.me.archived ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => commit((s) => updatePersonal(s, film.id, { archived: false }), `${film.title} restored.`)}>
                  Restore film
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => commit((s) => updatePersonal(s, film.id, { archived: true }), `${film.title} archived. Find it under My films, Show archived.`)}
                >
                  Archive film
                </button>
              )}
            </div>
            {CONFIRMED_FAVOURITES.includes(film.id as (typeof CONFIRMED_FAVOURITES)[number]) && (
              <p className="tiny muted">This started as a confirmed favourite. Any change you make here is kept.</p>
            )}
          </section>
        </aside>
      </div>

      <Dialog
        open={confirmSpoiler}
        onClose={() => setConfirmSpoiler(false)}
        title="Reveal spoilers?"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmSpoiler(false)}>
              Keep hidden
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                commit((s) => updatePersonal(s, film.id, { spoilers: true }), `Spoilers shown for ${film.title}.`);
                setConfirmSpoiler(false);
              }}
            >
              Show spoilers
            </button>
          </>
        }
      >
        <p>This shows a key plot detail for {film.title}. You can hide it again afterwards.</p>
      </Dialog>
      <EditFilmDialog film={film} open={editOpen} onClose={() => setEditOpen(false)} />
    </article>
  );
}

function NotesField({ film }: { film: ResolvedFilm }) {
  const { commit } = useStore();
  const [text, setText] = useState(film.me.notes);
  const [status, setStatus] = useState('');
  useEffect(() => setText(film.me.notes), [film.me.notes]);
  const dirty = text !== film.me.notes;

  const save = () => {
    if (!dirty) return;
    commit((s) => updatePersonal(s, film.id, { notes: text }), 'Notes saved.');
    setStatus('Saved');
  };

  // Save after a pause in typing, so nothing is lost if the tab closes.
  useEffect(() => {
    if (!dirty) return;
    setStatus('Unsaved changes');
    const t = window.setTimeout(() => {
      commit((s) => updatePersonal(s, film.id, { notes: text }), undefined, { quiet: true });
      setStatus('Saved');
    }, 1200);
    return () => window.clearTimeout(t);
  }, [text]); // eslint-disable-line

  return (
    <div className="field">
      <label htmlFor={`notes-${film.id}`}>Your notes</label>
      <textarea id={`notes-${film.id}`} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} placeholder="Who you watched it with, a line you loved, what to look out for..." />
      <span className="notes-status" aria-live="off">
        {status}
      </span>
    </div>
  );
}

function ShelfPicker({ film }: { film: ResolvedFilm }) {
  const { state, commit } = useStore();
  const [name, setName] = useState('');
  const toggle = (shelfId: string, on: boolean) => {
    const shelf = state.shelves.find((s) => s.id === shelfId)!;
    commit(
      (s) => ({
        ...s,
        shelves: s.shelves.map((x) =>
          x.id === shelfId ? { ...x, filmIds: on ? Array.from(new Set([...x.filmIds, film.id])) : x.filmIds.filter((i) => i !== film.id) } : x,
        ),
      }),
      on ? `Added to “${shelf.name}”.` : `Removed from “${shelf.name}”.`,
    );
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const existing = state.shelves.find((s) => s.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      toggle(existing.id, true);
    } else {
      commit((s) => ({ ...s, shelves: [...s.shelves, { id: uid('shelf'), name: n, filmIds: [film.id] }] }), `New shelf “${n}” with ${film.title}.`);
    }
    setName('');
  };
  return (
    <fieldset className="segmented" style={{ display: 'grid', gap: 2 }}>
      <legend>Shelves</legend>
      {state.shelves.map((s) => (
        <label className="check" key={s.id}>
          <input type="checkbox" checked={s.filmIds.includes(film.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
          {s.name}
        </label>
      ))}
      <form className="row-wrap" onSubmit={create} style={{ marginTop: 6 }}>
        <label className="visually-hidden" htmlFor={`ns-${film.id}`}>
          New shelf name
        </label>
        <input id={`ns-${film.id}`} className="select" style={{ flex: '1 1 140px', width: 'auto' }} placeholder="New shelf" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={!name.trim()}>
          Add shelf
        </button>
      </form>
    </fieldset>
  );
}

function EditFilmDialog({ film, open, onClose }: { film: ResolvedFilm; open: boolean; onClose: () => void }) {
  const { commit } = useStore();
  const [form, setForm] = useState({ title: film.title, year: String(film.year), runtime: film.runtime == null ? '' : String(film.runtime), director: film.directors.join(', '), category: film.category, intro: film.intro });
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) setForm({ title: film.title, year: String(film.year), runtime: film.runtime == null ? '' : String(film.runtime), director: film.directors.join(', '), category: film.category, intro: film.intro });
  }, [open]); // eslint-disable-line

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const year = Number(form.year);
    if (!form.title.trim()) return setError('A title is required.');
    if (!Number.isInteger(year) || year < 1880 || year > 2100) return setError('Enter a valid year.');
    const runtime = form.runtime.trim() ? Number(form.runtime) : null;
    if (runtime != null && (!Number.isInteger(runtime) || runtime < 1 || runtime > 600)) return setError('Runtime should be whole minutes, or blank if unknown.');
    const patch = { title: form.title.trim(), year, runtime, directors: form.director.split(',').map((s) => s.trim()).filter(Boolean), category: form.category, intro: form.intro.trim() || film.intro };
    if (film.custom) {
      commit((s) => ({ ...s, customFilms: { ...s.customFilms, [film.id]: { ...s.customFilms[film.id], ...patch } } }), 'Film details updated.');
    } else {
      commit((s) => ({ ...s, filmEdits: { ...s.filmEdits, [film.id]: { ...(s.filmEdits[film.id] ?? {}), ...patch } } }), 'Film details updated.');
    }
    setError('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit ${film.title}`}
      footer={
        <>
          {!film.custom && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                commit((s) => {
                  const edits = { ...s.filmEdits };
                  delete edits[film.id];
                  return { ...s, filmEdits: edits };
                }, 'Catalogue details restored.');
                onClose();
              }}
            >
              Restore catalogue details
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={`edit-${film.id}`} className="btn btn-primary">
            Save changes
          </button>
        </>
      }
    >
      <form id={`edit-${film.id}`} className="stack" onSubmit={submit} noValidate>
        {!film.custom && <p className="small muted">Your corrections are kept separately, so catalogue updates never overwrite them.</p>}
        {error && (
          <p className="banner" role="alert">
            {error}
          </p>
        )}
        <div className="field">
          <label htmlFor="ed-title">Title</label>
          <input id="ed-title" data-autofocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="ed-year">Year</label>
            <input id="ed-year" inputMode="numeric" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ed-rt">
              Runtime (minutes) <span className="hint">blank if unknown</span>
            </label>
            <input id="ed-rt" inputMode="numeric" value={form.runtime} onChange={(e) => setForm({ ...form, runtime: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ed-dir">Director(s), separated by commas</label>
          <input id="ed-dir" value={form.director} onChange={(e) => setForm({ ...form, director: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ed-cat">Collection</label>
          <select id="ed-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {Array.from(new Set([...CATEGORIES, form.category])).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ed-intro">Introduction (spoiler-free)</label>
          <textarea id="ed-intro" value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} />
        </div>
      </form>
    </Dialog>
  );
}
