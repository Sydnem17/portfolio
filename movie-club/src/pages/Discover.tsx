import { useOpenTonight } from '../App';
import { Cover } from '../components/Cover';
import { FilmCard, StatusTag } from '../components/FilmCard';
import { Icon } from '../components/Icon';
import { DOUBLE_BILLS, TRAILS } from '../data/connections';
import { CONFIRMED_FAVOURITES } from '../data/catalogue';
import { formatRuntime } from '../lib/labels';
import { filmHref, href } from '../router';
import { todayKey } from '../state/model';
import { useStore } from '../state/store';

function dayIndex(n: number): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000) % n;
}

export function Discover() {
  const { films, byId, state } = useStore();
  const openTonight = useOpenTonight();
  const darko = byId.get('donnie-darko-2001');
  const sms = byId.get('stop-making-sense-1984');
  const muriel = byId.get('muriels-wedding-1994');
  const picks = films.filter((f) => f.userPick && !f.me.archived);

  // "Always a favourite": Muriel's Wedding is permanent; then the other confirmed favourite;
  // then anything Taryn has since marked as loved.
  const otherFavs = [
    ...CONFIRMED_FAVOURITES.filter((id) => id !== 'muriels-wedding-1994').map((id) => byId.get(id)!),
    ...films.filter((f) => f.me.reaction === 'loved' && !CONFIRMED_FAVOURITES.includes(f.id as (typeof CONFIRMED_FAVOURITES)[number])),
  ].filter((f) => f && !f.me.archived);

  const cues = [...TRAILS.filter((t) => !t.spoilerTeaser)];
  const start = dayIndex(cues.length);
  const todaysCues = [0, 1, 2].map((i) => cues[(start + i) % cues.length]);
  const bill = DOUBLE_BILLS[dayIndex(DOUBLE_BILLS.length)];
  const billA = byId.get(bill.first);
  const billB = byId.get(bill.second);
  const chosen = state.tonight.chosen?.date === todayKey() ? byId.get(state.tonight.chosen.filmId) : undefined;

  return (
    <div>
      <h1 className="visually-hidden">Discover</h1>

      <section className="tonight-cta" aria-labelledby="tonight-h">
        <div>
          <p className="eyebrow cherry">Film night</p>
          <h2 id="tonight-h">{chosen ? `Tonight: ${chosen.title}` : 'Pick tonight’s film'}</h2>
          <p>
            {chosen
              ? 'You chose this earlier today. Want three fresh options instead?'
              : 'Tell us the mood and the time you have. We’ll offer a familiar favourite, a new discovery and a wildcard.'}
          </p>
        </div>
        <div className="row-wrap">
          {chosen && (
            <a className="btn btn-secondary" href={filmHref(chosen.id)}>
              Open {chosen.title}
            </a>
          )}
          <button type="button" className="btn btn-primary" onClick={openTonight}>
            <Icon name="sparkle" size={18} /> {chosen ? 'Pick again' : 'Pick tonight’s film'}
          </button>
        </div>
      </section>

      <div className="features">
        {darko && (
          <section className="feature feature-darko" aria-labelledby="feat-darko">
            <span className="moon" aria-hidden="true" />
            <svg className="ears" viewBox="0 0 60 120" aria-hidden="true">
              <path d="M14 120 C6 70 8 20 18 6 C26 20 26 70 24 120 Z M38 120 C38 70 40 18 50 4 C58 22 54 72 46 120 Z" fill="currentColor" />
            </svg>
            <div className="feature-body">
              <p className="eyebrow on-dark">Start here</p>
              <h2 id="feat-darko">{darko.title}</h2>
              <p className="dot-list">
                <span>{darko.year}</span>
                <span>Cult mystery</span>
                <span>{formatRuntime(darko.runtime)}</span>
              </p>
              <p className="lede">The rabbit. The soundtrack. The mystery. The film that started this club, because you had never heard of it.</p>
              <div className="feature-actions">
                <a className="btn btn-primary" href={filmHref(darko.id)}>
                  Explore film
                </a>
                <a className="btn btn-outline-light" href={href('/connections/trails/mad-world-cover')}>
                  Follow its music
                </a>
              </div>
            </div>
          </section>
        )}
        {sms && (
          <section className="feature feature-sms" aria-labelledby="feat-sms">
            <span className="spot" aria-hidden="true" />
            <span className="suit" aria-hidden="true" />
            <div className="feature-body">
              <p className="eyebrow on-dark">Your Talking Heads fix</p>
              <h2 id="feat-sms">{sms.title}</h2>
              <p className="dot-list">
                <span>{sms.year}</span>
                <span>Concert film</span>
                <span>{formatRuntime(sms.runtime)}</span>
              </p>
              <p className="lede">You love Talking Heads. This is them at full stretch, filmed by Jonathan Demme.</p>
              <div className="feature-actions">
                <a className="btn btn-on-dark" href={filmHref(sms.id)}>
                  See the film
                </a>
                <a className="btn btn-outline-light" href={href('/music/talking-heads')}>
                  The songs
                </a>
              </div>
            </div>
          </section>
        )}
      </div>

      <section className="section" aria-labelledby="picks-h">
        <div className="section-head">
          <div>
            <h2 id="picks-h">Your picks</h2>
            <p>The films you asked for by name.</p>
          </div>
          <a className="btn btn-ghost" href={href('/films?pick=1')}>
            View all
          </a>
        </div>
        <div className="shelf-scroll">
          {picks.map((f) => (
            <FilmCard key={f.id} film={f} />
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="fav-h">
        <div className="section-head">
          <div>
            <h2 id="fav-h">Always a favourite</h2>
            <p>Seen and loved. These shape every suggestion.</p>
          </div>
        </div>
        <div className="favourite-band">
          {muriel && (
            <article className="spotlight">
              <Cover film={muriel} decorative />
              <div style={{ minWidth: 0 }}>
                <p className="eyebrow cherry">One of your all-time favourites</p>
                <h3>
                  <a href={filmHref(muriel.id)}>{muriel.title}</a>
                </h3>
                <p className="dot-list small">
                  <span>{muriel.year}</span>
                  <span>{muriel.directors.join(' & ')}</span>
                  <span>Toni Collette, Rachel Griffiths</span>
                </p>
                <p>{muriel.why}</p>
                <div className="row-wrap" style={{ marginTop: 12 }}>
                  <StatusTag film={muriel} />
                  <a className="btn btn-ghost btn-sm" href={href('/connections/trails/muriel-abba')}>
                    The ABBA connection <Icon name="arrow" size={16} />
                  </a>
                </div>
              </div>
            </article>
          )}
          <div className="fav-list">
            {otherFavs.map((f) => (
              <div className="fav-item" key={f.id}>
                <Cover film={f} label={false} decorative />
                <div>
                  <a href={filmHref(f.id)}>{f.title}</a>
                  <p className="small muted">
                    {f.year} · {f.directors.join(' & ')}
                  </p>
                </div>
              </div>
            ))}
            <p className="small muted">Mark a film as loved and it joins this shelf.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="cue-h">
        <div className="section-head">
          <div>
            <h2 id="cue-h">Something you might recognise</h2>
            <p>Start with a song, a line or an image, and follow it to a film.</p>
          </div>
          <a className="btn btn-ghost" href={href('/connections')}>
            All trails
          </a>
        </div>
        <div className="cue-grid">
          {todaysCues.map((t) => (
            <a key={t.id} className="cue-card" href={href(`/connections/trails/${t.id}`)}>
              <span className="eyebrow">{t.cueKind === 'quotation' ? 'A line' : t.cueKind === 'song' ? 'A song' : t.cueKind === 'prop' ? 'A prop' : t.cueKind === 'event' ? 'A day' : 'An image'}</span>
              <strong>{t.cue}</strong>
              <span className="small" style={{ color: 'var(--cobalt-ink)', marginTop: 'auto', fontWeight: 600 }}>
                Follow the reference →
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="section duo" aria-label="More ways in">
        {billA && billB && (
          <div className="teaser">
            <div>
              <p className="eyebrow">Double bill</p>
              <h3>
                {billA.title} + {billB.title}
              </h3>
              <p>{bill.note}</p>
            </div>
            <a className="btn btn-secondary" href={href(`/connections/double-bills?bill=${bill.id}`)}>
              Plan it
            </a>
          </div>
        )}
        <div className="teaser">
          <div>
            <p className="eyebrow">Mystery shelf</p>
            <h3>Surprise me without showing the cover</h3>
            <p>Three clues, no title. Reveal it only if you want to.</p>
          </div>
          <a className="btn btn-secondary" href={href('/connections/mystery')}>
            Try a mystery
          </a>
        </div>
      </section>
    </div>
  );
}
