import { useEffect, useState } from 'react';
import type { Film } from '../data/types';
import { cachedPoster, fetchPoster } from '../lib/tmdb';
import { useStore } from '../state/store';

// Title-led club covers: a deliberate typographic design, not an imitation of official posters.
const PALETTES = [
  { bg: '#0f1b3d', fg: '#ffffff', accent: '#c41230' },
  { bg: '#1d58d6', fg: '#ffffff', accent: '#0f1b3d' },
  { bg: '#c41230', fg: '#ffffff', accent: '#0f1b3d' },
  { bg: '#f1f3f8', fg: '#0f1b3d', accent: '#c41230' },
  { bg: '#0b1430', fg: '#e9eefb', accent: '#1d58d6' },
  { bg: '#ffffff', fg: '#0f1b3d', accent: '#1d58d6' },
  { bg: '#2c3756', fg: '#ffffff', accent: '#e8eefc' },
  { bg: '#e8eefc', fg: '#0f1b3d', accent: '#1d58d6' },
];
const LAYOUTS = ['plain', 'band', 'frame', 'circle', 'stripe'] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function ClubCover({ film, label = true, decorative = false }: { film: Pick<Film, 'id' | 'title' | 'year' | 'directors'>; label?: boolean; decorative?: boolean }) {
  const h = hash(film.id);
  const p = PALETTES[h % PALETTES.length];
  const layout = LAYOUTS[(h >>> 4) % LAYOUTS.length];
  const len = film.title.length;
  const sizeClass = len > 34 ? 'xlong' : len > 18 ? 'long' : '';
  const style = { '--cv-bg': p.bg, '--cv-fg': p.fg, '--cv-accent': p.accent } as React.CSSProperties;
  return (
    <div
      className={`cover cover--${layout}`}
      style={style}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `Club cover design for ${film.title} (${film.year})` })}
    >
      <div className="cover-art">
        <span className="cover-year">{film.year}</span>
        <span className={`cover-title ${sizeClass}`}>{film.title}</span>
        <span className="cover-rule" />
        {label && film.directors[0] && <span className="cover-credit">{film.directors[0]}</span>}
      </div>
    </div>
  );
}

/** Official poster from TMDB when Taryn has supplied a token; otherwise the club cover. */
export function Cover({ film, label = true, decorative = false }: { film: Film; label?: boolean; decorative?: boolean }) {
  const { state } = useStore();
  const token = state.prefs.tmdbToken;
  const [src, setSrc] = useState<string | null | undefined>(() => (token && !film.custom ? cachedPoster(film.id) : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token || film.custom) {
      setSrc(null);
      return;
    }
    let live = true;
    const c = cachedPoster(film.id);
    if (c !== undefined) setSrc(c);
    else fetchPoster(film.id, film.title, film.year, token).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [token, film.id, film.title, film.year, film.custom]);

  if (src && !failed) {
    return (
      <div className="cover">
        <img
          src={src}
          alt={decorative ? '' : `Official poster artwork for ${film.title} (${film.year}), supplied by TMDB`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return <ClubCover film={film} label={label} decorative={decorative} />;
}
