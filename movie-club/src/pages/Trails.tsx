import { useState, type FormEvent } from 'react';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { Dialog, SourceList } from '../components/ui';
import { TRAILS } from '../data/connections';
import { CONNECTION_LABEL, type ReferenceTrail, type TrailStep } from '../data/types';
import { searchFilms, searchTrails } from '../lib/search';
import { filmHref, href, navigate } from '../router';
import { STATUS_LABEL, recogniseReference } from '../state/model';
import { useStore } from '../state/store';

const KIND_LABEL: Record<ReferenceTrail['cueKind'], string> = {
  song: 'A song',
  quotation: 'A line',
  actor: 'An actor',
  prop: 'A prop',
  visual: 'An image',
  event: 'A day',
};

export function Trails({ trailId, query }: { trailId?: string; query: URLSearchParams }) {
  const { films, state } = useStore();
  const [q, setQ] = useState(query.get('q') ?? '');
  const submitted = query.get('q') ?? '';
  const results = submitted ? searchTrails(submitted) : TRAILS;
  const filmHits = submitted && !results.length ? searchFilms(films, submitted).slice(0, 4) : [];
  const trail = trailId ? TRAILS.find((t) => t.id === trailId) : undefined;
  const saved = TRAILS.filter((t) => state.savedTrails.includes(t.id));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/connections/trails${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  return (
    <div>
      {trail ? (
        <TrailView trail={trail} />
      ) : (
        <>
          <form className="row-wrap" role="search" onSubmit={submit} style={{ alignItems: 'flex-end', marginBottom: 18 }}>
            <div className="field" style={{ flex: '1 1 280px' }}>
              <label htmlFor="trail-q">Start with something you recognise</label>
              <input id="trail-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="A song, a line, a prop, an image" />
            </div>
            <button type="submit" className="btn btn-primary">
              Follow it
            </button>
          </form>

          {submitted && !results.length ? (
            <div className="empty-state" style={{ textAlign: 'left' }}>
              <h2>No reference trail for &ldquo;{submitted}&rdquo; yet</h2>
              <p style={{ margin: '0 0 12px' }}>
                We only show connections we can source, so we won&rsquo;t guess. Try a song title, a famous line or an image, like &ldquo;boombox&rdquo;, &ldquo;ABBA&rdquo; or &ldquo;goes to eleven&rdquo;.
              </p>
              {filmHits.length > 0 && (
                <>
                  <p className="small" style={{ margin: '0 0 8px' }}>
                    These films in the collection mention it:
                  </p>
                  <ul className="plain-list" style={{ gap: 6 }}>
                    {filmHits.map((h) => (
                      <li key={h.film.id}>
                        <a href={filmHref(h.film.id)}>
                          {h.film.title} ({h.film.year})
                        </a>{' '}
                        <span className="small muted">{h.matched}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p style={{ margin: '12px 0 0' }}>
                <a href={href('/connections/trails')}>See all reference trails</a>
              </p>
            </div>
          ) : (
            <>
              {submitted && (
                <p className="small" role="status" style={{ marginBottom: 10 }}>
                  {results.length} {results.length === 1 ? 'trail matches' : 'trails match'} &ldquo;{submitted}&rdquo;.{' '}
                  <a href={href('/connections/trails')}>Show all</a>
                </p>
              )}
              <div className="cue-grid">
                {results.map((t) => (
                  <a key={t.id} className="cue-card" href={href(`/connections/trails/${t.id}`)}>
                    <span className="eyebrow">
                      {KIND_LABEL[t.cueKind]}
                      {t.spoilerTeaser ? ' · contains a spoiler' : ''}
                      {state.recognised[t.id] ? ' · recognised' : ''}
                    </span>
                    <strong>{t.cue}</strong>
                    <span className="small" style={{ color: 'var(--cobalt-ink)', marginTop: 'auto', fontWeight: 600 }}>
                      Follow the reference →
                    </span>
                  </a>
                ))}
              </div>
            </>
          )}

          {saved.length > 0 && (
            <section className="section" aria-labelledby="saved-trails">
              <div className="section-head">
                <h2 id="saved-trails">Saved trails</h2>
              </div>
              <ul className="plain-list">
                {saved.map((t) => (
                  <li key={t.id}>
                    <a href={href(`/connections/trails/${t.id}`)}>{t.spoilerTeaser ? 'Spoiler trail: ' : ''}{t.cue}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TrailView({ trail }: { trail: ReferenceTrail }) {
  const { state, commit, byId } = useStore();
  const film = trail.connection.filmId ? byId.get(trail.connection.filmId) : undefined;
  const filmRevealed = film?.me.spoilers ?? false;
  const [revealed, setRevealed] = useState(!trail.spoilerTeaser || filmRevealed);
  const [confirm, setConfirm] = useState(false);
  const recognised = !!state.recognised[trail.id];
  const saved = state.savedTrails.includes(trail.id);

  return (
    <section aria-labelledby="trail-h">
      <a className="back-link" href={href('/connections/trails')}>
        <Icon name="back" size={18} /> All trails
      </a>
      <p className="eyebrow">{KIND_LABEL[trail.cueKind]}</p>
      <h2 id="trail-h" style={{ fontSize: 'clamp(24px,4vw,32px)', marginTop: 4 }}>
        {trail.cue}
      </h2>

      {!revealed ? (
        <div className="spoiler-box stack" style={{ marginTop: 16, maxWidth: 640 }}>
          <p>{trail.spoilerTeaser}</p>
          <div className="row-wrap">
            <button type="button" className="btn btn-primary" onClick={() => setConfirm(true)}>
              Reveal this trail
            </button>
            <a className="btn btn-secondary" href={href('/connections/trails')}>
              Keep it unspoiled
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="trail">
            <TrailCard n={1} label="Something you recognise" step={trail.recognise} />
            <TrailCard n={2} label="Its film" step={trail.connection} variant="is-film" />
            <TrailCard n={3} label="Why it became memorable" step={trail.memorable} />
            <TrailCard n={4} label="Your next discovery" step={trail.next} variant="is-next" />
          </div>
          <div className="trail-actions">
            <button
              type="button"
              className="btn btn-secondary"
              aria-pressed={recognised}
              onClick={() =>
                commit(
                  (s) => recogniseReference(s, trail.id, !recognised),
                  !recognised ? 'Marked as recognised. Viewing status unchanged.' : 'Recognition removed.',
                )
              }
            >
              {recognised ? '✓ You recognise this' : 'I recognise that'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              aria-pressed={saved}
              onClick={() =>
                commit(
                  (s) => ({ ...s, savedTrails: saved ? s.savedTrails.filter((x) => x !== trail.id) : [...s.savedTrails, trail.id] }),
                  saved ? 'Trail removed from saved trails.' : 'Trail saved.',
                )
              }
            >
              {saved ? 'Saved' : 'Save trail'}
            </button>
            <SourceList sources={trail.sources} summary="Sources for this trail" />
          </div>
        </>
      )}

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reveal a spoiler?"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>
              Keep hidden
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setRevealed(true);
                setConfirm(false);
              }}
            >
              Reveal
            </button>
          </>
        }
      >
        <p>This trail gives away a major plot point. Reveal it anyway?</p>
      </Dialog>
    </section>
  );
}

function TrailCard({ n, label, step, variant = '' }: { n: number; label: string; step: TrailStep; variant?: string }) {
  const { byId } = useStore();
  const film = step.filmId ? byId.get(step.filmId) : undefined;
  return (
    <article className={`trail-card ${variant}`}>
      <span className="step">
        {n}. {label}
      </span>
      {step.type && <span className="tag outline" style={{ alignSelf: 'flex-start' }}>{CONNECTION_LABEL[step.type]}</span>}
      <h3>{step.heading}</h3>
      <p>{step.body}</p>
      {film && (
        <div className="trail-film">
          <Cover film={film} label={false} decorative />
          <div>
            <a href={filmHref(film.id)} style={{ fontWeight: 650 }}>
              Open {film.title}
            </a>
            <p className="tiny muted">{film.me.status === 'watched' ? 'You have seen this' : film.me.status === 'unknown' ? 'Viewing status not yet known' : STATUS_LABEL[film.me.status]}</p>
          </div>
        </div>
      )}
    </article>
  );
}
