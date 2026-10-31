import { Cover } from '../components/Cover';
import { StatusTag } from '../components/FilmCard';
import { EmptyState } from '../components/ui';
import { ARTIST_BY_ID, MUSIC } from '../data/connections';
import { searchFilms, searchTrails, normalise } from '../lib/search';
import { filmHref, href } from '../router';
import { useStore } from '../state/store';

export function SearchPage({ q }: { q: string }) {
  const { films } = useStore();
  const query = q.trim();
  if (!query) {
    return (
      <EmptyState title="Search the club">
        Search across titles, people, years, moods, songs and references. Punctuation doesn&rsquo;t matter: &ldquo;sex lies and videotape&rdquo; works.
      </EmptyState>
    );
  }
  const hits = searchFilms(films, query);
  const trails = searchTrails(query);
  const nq = normalise(query);
  const songs = MUSIC.filter((m) => normalise(`${m.song} ${ARTIST_BY_ID[m.artistId].name}`).includes(nq)).slice(0, 6);
  const total = hits.length + trails.length + songs.length;

  return (
    <div>
      <div className="page-head">
        <h1>Results for &ldquo;{query}&rdquo;</h1>
        <p role="status">
          {total ? `${hits.length} ${hits.length === 1 ? 'film' : 'films'}, ${trails.length} ${trails.length === 1 ? 'reference' : 'references'}, ${songs.length} ${songs.length === 1 ? 'song' : 'songs'}.` : 'Nothing matched.'}
        </p>
      </div>
      {total === 0 && (
        <EmptyState title="No matches in the collection" action={<a className="btn btn-secondary" href={href('/films')}>Browse all films</a>}>
          Try a shorter search, a person&rsquo;s surname, a year such as 1989, or a mood such as &ldquo;strange&rdquo;.
        </EmptyState>
      )}
      {hits.length > 0 && (
        <section aria-labelledby="sr-films">
          <h2 id="sr-films" className="visually-hidden">
            Films
          </h2>
          <ul className="film-list">
            {hits.map((h) => (
              <li key={h.film.id} className="film-row">
                <Cover film={h.film} label={false} decorative />
                <div style={{ minWidth: 0 }}>
                  <a className="film-link" href={filmHref(h.film.id)}>
                    {h.film.title}
                  </a>
                  <div className="row-meta">
                    {h.film.year}
                    {h.film.directors.length ? ` · ${h.film.directors.join(' & ')}` : ''}
                    {h.film.me.archived ? ' · Archived' : ''}
                  </div>
                  <div className="row-meta" style={{ marginTop: 2 }}>
                    <span className="muted">Matched {h.matched}</span>
                  </div>
                </div>
                <div className="row-side">
                  <StatusTag film={h.film} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {trails.length > 0 && (
        <section className="section" aria-labelledby="sr-refs">
          <div className="section-head">
            <h2 id="sr-refs">References</h2>
          </div>
          <div className="cue-grid">
            {trails.map((t) => (
              <a key={t.id} className="cue-card" href={href(`/connections/trails/${t.id}`)}>
                <span className="eyebrow">Reference trail{t.spoilerTeaser ? ' · contains a spoiler' : ''}</span>
                <strong>{t.cue}</strong>
              </a>
            ))}
          </div>
        </section>
      )}
      {songs.length > 0 && (
        <section className="section" aria-labelledby="sr-songs">
          <div className="section-head">
            <h2 id="sr-songs">Songs</h2>
          </div>
          <ul className="plain-list">
            {songs.map((m) => {
              const f = m.filmId ? films.find((x) => x.id === m.filmId) : undefined;
              return (
                <li key={m.id}>
                  <strong>{m.song}</strong> · <a href={href(`/music/${m.artistId}`)}>{ARTIST_BY_ID[m.artistId].name}</a>
                  {f && (
                    <>
                      {' '}
                      in <a href={filmHref(f.id)}>{f.title}</a>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
