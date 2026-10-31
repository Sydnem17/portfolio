import { useState } from 'react';
import { ARTIST_BY_ID, MUSIC } from '../data/connections';
import { MUSIC_KIND_LABEL, type MusicLink } from '../data/types';
import { musicSearchLinks } from '../lib/links';
import { filmHref, href } from '../router';
import { useStore } from '../state/store';
import { ExternalLink, SourceList } from './ui';

export function MusicCard({ link, showFilm = true }: { link: MusicLink; showFilm?: boolean }) {
  const { byId } = useStore();
  const artist = ARTIST_BY_ID[link.artistId];
  const film = link.filmId ? byId.get(link.filmId) : undefined;
  const [following, setFollowing] = useState(false);
  return (
    <article className="music-card">
      <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
        <span className={`tag ${link.kind === 'heard' ? 'cobalt' : link.kind === 'suggested' ? 'cherry' : ''}`}>{MUSIC_KIND_LABEL[link.kind]}</span>
      </div>
      <h3>{link.song}</h3>
      <p className="small">
        <a href={href(`/music/${artist.id}`)}>{artist.name}</a>
        {showFilm && film && (
          <>
            {' · '}
            <a href={filmHref(film.id)}>
              {film.title} ({film.year})
            </a>
          </>
        )}
      </p>
      {link.version && <p className="small muted">Version: {link.version}</p>}
      {link.writers && <p className="small muted">Written by {link.writers}</p>}
      <p className="small">{link.note}</p>
      <div className="music-links">
        {link.officialUrl && <ExternalLink href={link.officialUrl}>{link.officialLabel ?? 'Official page'}</ExternalLink>}
        {musicSearchLinks(link.song.replace(/\s*\(.*?\)\s*$/, ''), artist.name).map((s) => (
          <ExternalLink key={s.service} href={s.url}>
            Search {s.service}
          </ExternalLink>
        ))}
      </div>
      <p className="tiny muted">Search links open a search, not a verified track. Nothing plays here.</p>
      <div className="row-wrap">
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={following} onClick={() => setFollowing(!following)}>
          {following ? 'Hide this sound' : 'Follow this sound'}
        </button>
      </div>
      {following && <FollowSound link={link} />}
      <SourceList sources={link.sources} />
    </article>
  );
}

/** Film → artist → a related film or suggested listening. */
export function FollowSound({ link }: { link: MusicLink }) {
  const { byId } = useStore();
  const artist = ARTIST_BY_ID[link.artistId];
  const film = link.filmId ? byId.get(link.filmId) : undefined;
  const sameArtistFilm = MUSIC.find((m) => m.artistId === link.artistId && m.filmId && m.filmId !== link.filmId && byId.has(m.filmId));
  const related = artist.related?.[0];
  const relatedLink = related ? MUSIC.find((m) => m.artistId === related.artistId && m.filmId !== link.filmId) : undefined;
  const suggested = MUSIC.find((m) => m.artistId === link.artistId && m.kind === 'suggested' && m.id !== link.id);

  let next: { label: string; body: string; to?: string; toLabel?: string } | null = null;
  if (sameArtistFilm?.filmId) {
    const f = byId.get(sameArtistFilm.filmId)!;
    next = { label: 'Performed by this artist', body: `Also by ${artist.name}: "${sameArtistFilm.song}" in ${f.title}.`, to: filmHref(f.id), toLabel: `${f.title} (${f.year})` };
  } else if (relatedLink && related) {
    const f = relatedLink.filmId ? byId.get(relatedLink.filmId) : undefined;
    next = {
      label: 'Performed by a related artist',
      body: `${related.note} Try "${relatedLink.song}" by ${ARTIST_BY_ID[related.artistId].name}${f ? ` in ${f.title}` : ''}.`,
      to: f ? filmHref(f.id) : href(`/music/${related.artistId}`),
      toLabel: f ? `${f.title} (${f.year})` : ARTIST_BY_ID[related.artistId].name,
    };
  } else if (suggested) {
    next = { label: 'Suggested listening', body: suggested.note, to: href(`/music/${artist.id}`), toLabel: `More ${artist.name}` };
  }

  return (
    <ol className="plain-list" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }} aria-label="Follow this sound">
      <li className="small">
        <strong>Film:</strong> {film ? `${film.title} (${film.year})` : 'Suggested listening, not tied to a film'}
      </li>
      <li className="small">
        <strong>Artist:</strong> <a href={href(`/music/${artist.id}`)}>{artist.name}</a>. {artist.blurb}
      </li>
      <li className="small">
        <strong>Next:</strong>{' '}
        {next ? (
          <>
            <span className="tag outline">{next.label}</span> {next.body} {next.to && <a href={next.to}>{next.toLabel}</a>}
          </>
        ) : (
          'This is the only connection we have for this artist so far.'
        )}
      </li>
    </ol>
  );
}
