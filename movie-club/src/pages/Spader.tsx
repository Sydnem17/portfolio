import { useState } from 'react';
import { Cover } from '../components/Cover';
import { FilmCard, StatusTag } from '../components/FilmCard';
import { RadioGroup } from '../components/ui';
import { MOOD_LABEL } from '../lib/labels';
import { filmHref } from '../router';
import { useStore } from '../state/store';

const FIRST = ['sex-lies-and-videotape-1989', 'white-palace-1990', 'bad-influence-1990', 'less-than-zero-1987', 'pretty-in-pink-1986'];

export function Spader() {
  const { films, state, commit } = useStore();
  const [view, setView] = useState<'timeline' | 'shelf'>('timeline');
  const spader = films
    .filter((f) => !f.me.archived && f.cast.some((c) => c.name === 'James Spader') && f.year >= 1980 && f.year <= 1999)
    .sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  const startHere = FIRST.map((id) => spader.find((f) => f.id === id)).filter(Boolean) as typeof spader;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="panel stack">
        <p>
          You&rsquo;re interested in James Spader&rsquo;s films from the 1980s and 1990s. These are the {spader.length} in the collection, from sharp supporting parts to the adult dramas that made his name.
        </p>
        <div className="grid-2">
          <RadioGroup<0 | 1 | 2>
            legend="Spader in your suggestions"
            name="spader-weight"
            value={state.prefs.spaderWeight}
            options={[
              { value: 0, label: 'Less' },
              { value: 1, label: 'Normal' },
              { value: 2, label: 'More' },
            ]}
            onChange={(v) =>
              commit(
                (s) => ({ ...s, prefs: { ...s.prefs, spaderWeight: v } }),
                v === 0 ? 'Spader films will come up less often.' : v === 2 ? 'Spader films will come up more often.' : 'Spader films back to normal weighting.',
              )
            }
          />
          <RadioGroup<'timeline' | 'shelf'>
            legend="View"
            name="spader-view"
            value={view}
            options={[
              { value: 'timeline', label: 'Chronological' },
              { value: 'shelf', label: 'Shelf' },
            ]}
            onChange={setView}
          />
        </div>
        <p className="small muted">
          Start with: {startHere.map((f, i) => (
            <span key={f.id}>
              {i > 0 && ', '}
              <a href={filmHref(f.id)}>{f.title}</a>
            </span>
          ))}
          .
        </p>
      </div>

      {view === 'shelf' ? (
        <div className="shelf-grid">
          {spader.map((f) => (
            <FilmCard key={f.id} film={f} />
          ))}
        </div>
      ) : (
        <ol className="timeline">
          {spader.map((f) => {
            const credit = f.cast.find((c) => c.name === 'James Spader')!;
            const mood = f.moods.slice(0, 2).map((m) => MOOD_LABEL[m].toLowerCase()).join(', ');
            return (
              <li key={f.id}>
                <span className="year">{f.year}</span>
                <Cover film={f} label={false} decorative />
                <div style={{ minWidth: 0 }}>
                  <h3>
                    <a href={filmHref(f.id)}>{f.title}</a>
                  </h3>
                  <p className="small">
                    {credit.role ? <>As <strong>{credit.role}</strong></> : 'Credited cast member'}
                    {' · '}
                    {credit.supporting ? 'Supporting performance' : 'Lead role'}
                    {' · '}
                    {f.directors.join(' & ')}
                  </p>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    Viewing mood: {mood}.{f.contentNote ? ` ${f.contentNote}` : ''}
                  </p>
                  {(f.yearNote || f.versionNote) && <p className="tiny muted" style={{ marginTop: 4 }}>{f.yearNote ?? f.versionNote}</p>}
                  <div style={{ marginTop: 6 }}>
                    <StatusTag film={f} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
