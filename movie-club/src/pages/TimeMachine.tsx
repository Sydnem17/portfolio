import { useMemo, useState } from 'react';
import { FilmRow } from '../components/FilmCard';
import { RadioGroup } from '../components/ui';
import { ARTIST_BY_ID, MUSIC, TRAILS } from '../data/connections';
import { MUSIC_KIND_LABEL } from '../data/types';
import { decadeOf } from '../lib/labels';
import { filmHref, href } from '../router';
import { useStore } from '../state/store';

type Clock = 'release' | 'setting';

export function TimeMachine({ query }: { query: URLSearchParams }) {
  const { films } = useStore();
  const active = films.filter((f) => !f.me.archived);
  const [clock, setClock] = useState<Clock>(query.get('clock') === 'setting' ? 'setting' : 'release');

  const decades = useMemo(() => {
    const set = new Set<number>();
    for (const f of active) {
      if (clock === 'release') set.add(decadeOf(f.year));
      else if (f.storySetting) for (let d = decadeOf(f.storySetting.from); d <= decadeOf(f.storySetting.to); d += 10) set.add(d);
    }
    return [...set].sort((a, b) => a - b);
  }, [active, clock]);

  const [decade, setDecade] = useState<number>(1980);
  const current = decades.includes(decade) ? decade : decades[Math.min(decades.length - 1, Math.floor(decades.length / 2))];

  const inEra = active
    .filter((f) => {
      if (clock === 'release') return decadeOf(f.year) === current;
      const s = f.storySetting;
      return !!s && s.from < current + 10 && s.to >= current;
    })
    .sort((a, b) => (clock === 'release' ? a.year - b.year : (a.storySetting!.from - b.storySetting!.from) || a.year - b.year));

  const ids = new Set(inEra.map((f) => f.id));
  const music = MUSIC.filter((m) => m.filmId && ids.has(m.filmId) && m.kind !== 'suggested').slice(0, 6);
  const trails = TRAILS.filter((t) => !t.spoilerTeaser && t.connection.filmId && ids.has(t.connection.filmId)).slice(0, 4);
  const settingCount = active.filter((f) => f.storySetting).length;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="panel stack">
        <p>
          Two clocks, kept separate. <strong>Released</strong> is when a film came out. <strong>Set in</strong> is when its story takes place, shown only where it is documented ({settingCount} films so far). Some films cover a span, so they appear in more than one decade.
        </p>
        <RadioGroup<Clock>
          legend="Browse by"
          name="clock"
          value={clock}
          options={[
            { value: 'release', label: 'When it was released' },
            { value: 'setting', label: 'When the story is set' },
          ]}
          onChange={setClock}
        />
        <fieldset className="segmented">
          <legend>Decade</legend>
          {decades.map((d) => (
            <label className="choice" key={d}>
              <input type="radio" name="era-decade" checked={current === d} onChange={() => setDecade(d)} />
              <span>{d}s</span>
            </label>
          ))}
        </fieldset>
      </div>

      <section aria-labelledby="era-films">
        <div className="section-head">
          <div>
            <h2 id="era-films">
              {clock === 'release' ? `Released in the ${current}s` : `Set in the ${current}s`}
            </h2>
            <p>
              {inEra.length} {inEra.length === 1 ? 'film' : 'films'}
            </p>
          </div>
        </div>
        {inEra.length ? (
          <ul className="film-list">
            {inEra.map((f) => (
              <FilmRow
                key={f.id}
                film={f}
                extra={clock === 'setting' && f.storySetting ? <strong>Set: {f.storySetting.label}</strong> : undefined}
              />
            ))}
          </ul>
        ) : (
          <p className="muted">No films for this decade yet.</p>
        )}
      </section>

      {(music.length > 0 || trails.length > 0) && (
        <div className="grid-2">
          {music.length > 0 && (
            <section className="panel" aria-labelledby="era-music">
              <h2 id="era-music">Music from these films</h2>
              <ul className="plain-list">
                {music.map((m) => {
                  const f = films.find((x) => x.id === m.filmId)!;
                  return (
                    <li key={m.id} className="small">
                      <strong>{m.song}</strong> · <a href={href(`/music/${m.artistId}`)}>{ARTIST_BY_ID[m.artistId].name}</a>{' '}
                      <span className="muted">
                        ({MUSIC_KIND_LABEL[m.kind].toLowerCase()}, <a href={filmHref(f.id)}>{f.title}</a>)
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="tiny muted" style={{ marginTop: 10 }}>
                These are songs connected to films in this era, not a claim about what was popular at the time.
              </p>
            </section>
          )}
          {trails.length > 0 && (
            <section className="panel" aria-labelledby="era-refs">
              <h2 id="era-refs">References to follow</h2>
              <ul className="plain-list">
                {trails.map((t) => (
                  <li key={t.id}>
                    <a href={href(`/connections/trails/${t.id}`)}>{t.cue}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
