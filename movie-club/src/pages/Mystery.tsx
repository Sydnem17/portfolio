import { useState } from 'react';
import { Cover } from '../components/Cover';
import { SourceList } from '../components/ui';
import { formatRuntime } from '../lib/labels';
import { mysteryClues, mysteryPool, pickMystery } from '../lib/mystery';
import { filmHref } from '../router';
import { updatePersonal } from '../state/model';
import { useStore } from '../state/store';

export function Mystery() {
  const { films, byId, commit, announce } = useStore();
  const [currentId, setCurrentId] = useState<string | null>(() => pickMystery(films, [])?.id ?? null);
  const [seen, setSeen] = useState<string[]>(currentId ? [currentId] : []);
  const [revealed, setRevealed] = useState(false);
  const film = currentId ? byId.get(currentId) : undefined;

  const another = () => {
    const next = pickMystery(films, seen);
    setCurrentId(next?.id ?? null);
    if (next) setSeen((s) => [...s, next.id]);
    setRevealed(false);
    announce('New mystery. Three new clues.');
  };

  if (!mysteryPool(films).length || !film) {
    return (
      <div className="empty-state">
        <h2>The mystery shelf is empty</h2>
        <p>Mysteries come from films you haven&rsquo;t seen yet. Every film is marked watched or not for me.</p>
      </div>
    );
  }

  const clues = mysteryClues(film, films);

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 820 }}>
      <p className="muted">
        A video-shop game: three clues, no cover, no title. Reveal it only if you want to. No timer, no score.
      </p>
      {!revealed ? (
        <section className="mystery" aria-labelledby="mystery-h">
          <div className="vhs" aria-hidden="true">
            ?
          </div>
          <h2 id="mystery-h">A mystery film from the shelf</h2>
          <ol aria-label="Clues">
            {clues.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <div className="row-wrap">
            <button type="button" className="btn btn-on-dark" onClick={() => { setRevealed(true); announce('Film revealed.'); }}>
              Reveal the film
            </button>
            <button type="button" className="btn btn-secondary" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.45)' }} onClick={another}>
              Another mystery
            </button>
          </div>
        </section>
      ) : (
        <section className="panel" aria-labelledby="revealed-h">
          <div className="related-item" style={{ gridTemplateColumns: '120px minmax(0,1fr)', gap: 18 }}>
            <Cover film={film} />
            <div className="stack" style={{ gap: 8 }}>
              <p className="eyebrow cherry">It was</p>
              <h2 id="revealed-h" style={{ fontSize: 28 }}>
                {film.title}
              </h2>
              <p className="small muted">
                {film.year} · {film.directors.join(' & ')} · {formatRuntime(film.runtime)}
              </p>
              <p>{film.intro}</p>
              <div className="row-wrap">
                <a className="btn btn-primary" href={filmHref(film.id)}>
                  Open film
                </a>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={film.me.status === 'want'}
                  onClick={() => commit((s) => updatePersonal(s, film.id, { status: 'want' }), `${film.title} saved for later.`)}
                >
                  {film.me.status === 'want' ? 'Saved for later' : 'Save for later'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={another}>
                  Another mystery
                </button>
              </div>
              <SourceList sources={film.sources} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
