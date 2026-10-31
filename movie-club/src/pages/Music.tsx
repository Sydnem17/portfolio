import { useState } from 'react';
import { Icon } from '../components/Icon';
import { MusicCard } from '../components/MusicCard';
import { EmptyState, ExternalLink, RadioGroup } from '../components/ui';
import { ARTISTS, ARTIST_BY_ID, MUSIC } from '../data/connections';
import { MUSIC_KIND_LABEL, type MusicKind } from '../data/types';
import { filmHref, href } from '../router';
import { useStore } from '../state/store';

export function MusicPage({ artistId }: { artistId?: string }) {
  if (artistId) return <ArtistPage id={artistId} />;
  return <MusicHome />;
}

function MusicHome() {
  const [kind, setKind] = useState<'all' | MusicKind>('all');
  const th = MUSIC.filter((m) => m.artistId === 'talking-heads' || m.artistId === 'tom-tom-club');
  const rest = MUSIC.filter((m) => !th.includes(m) && (kind === 'all' || m.kind === kind));
  const artistsWithLinks = ARTISTS.filter((a) => MUSIC.some((m) => m.artistId === a.id));

  return (
    <div>
      <div className="page-head">
        <h1>Music</h1>
        <p>Songs as a way into films. Each one says whether it is heard in the film, on the soundtrack album, or our suggested listening, and which recording it is.</p>
      </div>

      <section className="th-feature" aria-labelledby="th-h">
        <div>
          <p className="eyebrow on-dark">You love Talking Heads</p>
          <h2 id="th-h">Start with Talking Heads</h2>
          <p style={{ marginTop: 8, maxWidth: '60ch' }}>
            Stop Making Sense is the band on stage at their best. These are some of the performances in it, plus a studio album to try next.
          </p>
        </div>
        <div className="music-grid">
          {th.map((m) => (
            <MusicCard key={m.id} link={m} />
          ))}
        </div>
        <div className="row-wrap">
          <a className="btn btn-on-dark" href={filmHref('stop-making-sense-1984')}>
            Open Stop Making Sense
          </a>
          <a className="btn btn-secondary" href={href('/music/talking-heads')}>
            Talking Heads in the club
          </a>
        </div>
      </section>

      <section className="section" aria-labelledby="all-music-h">
        <div className="section-head">
          <div>
            <h2 id="all-music-h">More music connections</h2>
            <p>
              {rest.length} {rest.length === 1 ? 'song' : 'songs'} shown
            </p>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <RadioGroup<'all' | MusicKind>
            legend="Show"
            name="music-kind"
            value={kind}
            options={[{ value: 'all', label: 'Everything' }, ...(['heard', 'soundtrack', 'suggested'] as MusicKind[]).map((k) => ({ value: k, label: MUSIC_KIND_LABEL[k] }))]}
            onChange={setKind}
          />
        </div>
        {rest.length ? (
          <div className="music-grid">
            {rest.map((m) => (
              <MusicCard key={m.id} link={m} />
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing in this group yet" />
        )}
      </section>

      <section className="section" aria-labelledby="artists-h">
        <div className="section-head">
          <h2 id="artists-h">Artists</h2>
        </div>
        <ul className="row-wrap" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {artistsWithLinks.map((a) => (
            <li key={a.id}>
              <a className="tag outline" style={{ textDecoration: 'none', minHeight: 36, padding: '6px 12px' }} href={href(`/music/${a.id}`)}>
                {a.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ArtistPage({ id }: { id: string }) {
  const { byId } = useStore();
  const artist = ARTIST_BY_ID[id];
  if (!artist) {
    return (
      <EmptyState title="Artist not found" action={<a className="btn btn-primary" href={href('/music')}>Back to Music</a>}>
        That artist isn&rsquo;t in the collection.
      </EmptyState>
    );
  }
  const links = MUSIC.filter((m) => m.artistId === id);
  const filmIds = Array.from(new Set(links.flatMap((m) => (m.filmId ? [m.filmId] : []))));
  return (
    <div>
      <a className="back-link" href={href('/music')}>
        <Icon name="back" size={18} /> Music
      </a>
      <div className="page-head">
        <h1>{artist.name}</h1>
        <p>{artist.blurb}</p>
        {artist.officialUrl && (
          <p className="small" style={{ marginTop: 8 }}>
            <ExternalLink href={artist.officialUrl}>Official website</ExternalLink>
          </p>
        )}
      </div>
      {filmIds.length > 0 && (
        <p className="small" style={{ marginBottom: 16 }}>
          In the collection:{' '}
          {filmIds.map((fid, i) => {
            const f = byId.get(fid);
            return f ? (
              <span key={fid}>
                {i > 0 && ', '}
                <a href={filmHref(fid)}>{f.title}</a>
              </span>
            ) : null;
          })}
        </p>
      )}
      <div className="music-grid">
        {links.map((m) => (
          <MusicCard key={m.id} link={m} />
        ))}
      </div>
      {artist.related && artist.related.length > 0 && (
        <section className="section" aria-labelledby="rel-art">
          <h2 id="rel-art" style={{ fontSize: 22, marginBottom: 10 }}>
            Related artists
          </h2>
          <ul className="plain-list">
            {artist.related.map((r) => (
              <li key={r.artistId}>
                <a href={href(`/music/${r.artistId}`)}>{ARTIST_BY_ID[r.artistId].name}</a> <span className="small muted">{r.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
