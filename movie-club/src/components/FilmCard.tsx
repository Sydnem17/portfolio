import { filmHref } from '../router';
import { updatePersonal, type ResolvedFilm, REACTION_LABEL, STATUS_LABEL } from '../state/model';
import { useStore } from '../state/store';
import { Cover } from './Cover';
import { Icon } from './Icon';

export function directorLine(f: ResolvedFilm): string {
  return f.directors.length ? f.directors.join(' & ') : '';
}

/** Want-to-watch bookmark. Only toggles between unknown and want; never marks a film watched. */
export function WatchlistToggle({ film }: { film: ResolvedFilm }) {
  const { commit } = useStore();
  const on = film.me.status === 'want';
  const disabled = film.me.status === 'watched' || film.me.status === 'not-for-me';
  const label = disabled
    ? `${film.title}: ${STATUS_LABEL[film.me.status]}`
    : on
      ? `Remove ${film.title} from your watchlist`
      : `Add ${film.title} to your watchlist`;
  return (
    <button
      type="button"
      className="icon-btn"
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() =>
        commit(
          (s) => updatePersonal(s, film.id, { status: on ? 'unknown' : 'want' }),
          on ? `${film.title} removed from your watchlist.` : `${film.title} added to your watchlist.`,
        )
      }
    >
      <Icon name="bookmark" filled={on} />
    </button>
  );
}

export function StatusTag({ film }: { film: ResolvedFilm }) {
  if (film.me.status === 'watched')
    return <span className="tag cobalt">{film.me.reaction !== 'unrecorded' ? `Watched · ${REACTION_LABEL[film.me.reaction]}` : 'Watched'}</span>;
  if (film.me.status === 'want') return <span className="tag outline">Want to watch</span>;
  if (film.me.status === 'not-for-me') return <span className="tag">Not for me</span>;
  return null;
}

export function FilmCard({ film, badge, showDirector = false }: { film: ResolvedFilm; badge?: string; showDirector?: boolean }) {
  return (
    <article className="film-card">
      <Cover film={film} decorative />
      {badge && <span className="tag cherry badge">{badge}</span>}
      <div className="film-card-body">
        <div className="film-card-text">
          <a className="film-link" href={filmHref(film.id)}>
            {film.title}
          </a>
          <p className="meta">
            {film.year}
            {showDirector && directorLine(film) ? ` · ${directorLine(film)}` : ''}
          </p>
        </div>
        <WatchlistToggle film={film} />
      </div>
    </article>
  );
}

export function FilmRow({ film, extra }: { film: ResolvedFilm; extra?: React.ReactNode }) {
  return (
    <li className="film-row">
      <Cover film={film} label={false} decorative />
      <div style={{ minWidth: 0 }}>
        <a className="film-link" href={filmHref(film.id)}>
          {film.title}
        </a>
        <div className="row-meta">
          {film.year}
          {directorLine(film) ? ` · ${directorLine(film)}` : ''}
          {film.runtime ? ` · ${film.runtime} min` : ''}
          {extra ? <> · {extra}</> : null}
        </div>
      </div>
      <div className="row-side">
        {film.userPick && <span className="tag cherry">Your pick</span>}
        <StatusTag film={film} />
        <span style={{ position: 'relative', zIndex: 2 }}>
          <WatchlistToggle film={film} />
        </span>
      </div>
    </li>
  );
}
