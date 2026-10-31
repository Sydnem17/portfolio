import { href } from '../router';
import { DoubleBills } from './DoubleBills';
import { Mystery } from './Mystery';
import { Spader } from './Spader';
import { TimeMachine } from './TimeMachine';
import { Trails } from './Trails';

const TABS = [
  { key: 'trails', label: 'Follow the reference', intro: 'Start with something you recognise, follow it to a film, find out why it stuck, then take one good next step.' },
  { key: 'double-bills', label: 'Double bills', intro: 'Two films that belong together, with the reason in one sentence. Plan the evening and keep a ticket.' },
  { key: 'time-machine', label: 'Time machine', intro: 'Browse by when films came out, or by when their stories take place.' },
  { key: 'spader', label: 'James Spader', intro: 'His 1980s and 1990s films, in order, with the role he plays and the mood to expect.' },
  { key: 'mystery', label: 'Mystery shelf', intro: 'Surprise me without showing the cover.' },
];

export function Connections({ tab, sub, query }: { tab?: string; sub?: string; query: URLSearchParams }) {
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  return (
    <div>
      <div className="page-head">
        <h1>Connections</h1>
        <p>{active.intro}</p>
      </div>
      <nav className="tabs" aria-label="Connections sections">
        {TABS.map((t) => (
          <a key={t.key} href={href(`/connections/${t.key}`)} aria-current={t.key === active.key ? 'page' : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
      {active.key === 'trails' && <Trails trailId={sub} query={query} />}
      {active.key === 'double-bills' && <DoubleBills query={query} />}
      {active.key === 'time-machine' && <TimeMachine query={query} />}
      {active.key === 'spader' && <Spader />}
      {active.key === 'mystery' && <Mystery />}
    </div>
  );
}
