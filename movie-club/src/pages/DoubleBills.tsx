import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { RadioGroup } from '../components/ui';
import { DOUBLE_BILLS } from '../data/connections';
import { allowedInBill, curatedBills, eveningLength, suggestSecond, type BillMode } from '../lib/doubleBill';
import { formatRuntime } from '../lib/labels';
import { canvasToBlob, drawTicket, formatTicketDate, ticketFileName } from '../lib/ticket';
import { NO_EXCLUSIONS, type Exclusions } from '../lib/tonight';
import { filmHref } from '../router';
import { uid } from '../state/model';
import { useStore } from '../state/store';

const EX_LABEL: Record<keyof Exclusions, string> = {
  horror: 'No horror',
  intense: 'Nothing too intense',
  subtitles: 'No subtitles',
  animation: 'No animation',
  seen: 'Skip films I’ve seen',
};

export function DoubleBills({ query }: { query: URLSearchParams }) {
  const { films, byId, state, commit, announce } = useStore();
  const preset = DOUBLE_BILLS.find((b) => b.id === query.get('bill'));
  const [firstId, setFirstId] = useState(preset?.first ?? 'muriels-wedding-1994');
  const [secondId, setSecondId] = useState<string | null>(preset?.second ?? null);
  const [mode, setMode] = useState<BillMode>(preset?.feeling ?? 'same');
  const [ex, setEx] = useState<Exclusions>(NO_EXCLUSIONS);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interval = state.prefs.interval;

  const active = useMemo(() => films.filter((f) => !f.me.archived).sort((a, b) => a.title.localeCompare(b.title)), [films]);
  const first = byId.get(firstId);
  const [manualNote, setManualNote] = useState<string | null>(null);
  const suggestions = useMemo(() => {
    if (!first) return [];
    const list = suggestSecond(first, films, mode, ex);
    // A saved plan may pair films outside the current suggestions: keep it, labelled as yours.
    const pinned = secondId ? byId.get(secondId) : undefined;
    if (pinned && pinned.id !== first.id && !list.some((s) => s.film.id === pinned.id) && allowedInBill(pinned, ex) && manualNote) {
      return [{ film: pinned, note: manualNote, editorial: true }, ...list];
    }
    return list;
  }, [first, films, mode, ex, secondId, manualNote, byId]);
  const chosen = suggestions.find((s) => s.film.id === secondId) ?? suggestions[0];
  const second = chosen?.film;
  const firstAllowed = first ? allowedInBill(first, ex) : false;
  const length = first && second ? eveningLength(first, second, interval) : null;

  useEffect(() => {
    if (chosen && chosen.film.id !== secondId) setSecondId(chosen.film.id);
  }, [chosen?.film.id]); // eslint-disable-line

  // Redraw the ticket preview whenever the plan changes.
  useEffect(() => {
    if (!canvasRef.current || !first || !second || !chosen) return;
    drawTicket(canvasRef.current, {
      first: { title: first.title, year: first.year },
      second: { title: second.title, year: second.year },
      note: chosen.note,
      date: date || undefined,
      totalMinutes: length?.total ?? null,
    }).catch(() => setError('The ticket preview could not be drawn in this browser.'));
  }, [first?.id, second?.id, chosen?.note, date, length?.total]); // eslint-disable-line

  const swap = () => {
    if (!second) return;
    setFirstId(second.id);
    setSecondId(firstId);
    announce(`Order swapped. ${second.title} plays first.`);
  };

  const download = async () => {
    if (!canvasRef.current || !first || !second) return;
    try {
      const blob = await canvasToBlob(canvasRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = ticketFileName(first.title, second.title);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      announce('Ticket downloaded.');
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  const canShareFiles = typeof navigator !== 'undefined' && 'canShare' in navigator;
  const share = async () => {
    if (!canvasRef.current || !first || !second) return;
    try {
      const blob = await canvasToBlob(canvasRef.current);
      const file = new File([blob], ticketFileName(first.title, second.title), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Our double bill', text: `${first.title} then ${second.title}` });
      } else {
        setError('Sharing images isn’t supported in this browser. Download the ticket instead.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Sharing didn’t work. Download the ticket instead.');
    }
  };

  const save = () => {
    if (!first || !second || !chosen) return;
    commit(
      (s) => ({
        ...s,
        savedPlans: [...s.savedPlans, { id: uid('plan'), first: first.id, second: second.id, note: chosen.note, date: date || undefined, interval, savedAt: new Date().toISOString() }],
      }),
      `Double bill saved: ${first.title} then ${second.title}.`,
    );
  };

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="panel stack" aria-labelledby="build-h">
          <h2 id="build-h">Build a double bill</h2>
          <div className="field">
            <label htmlFor="bill-first">Film one</label>
            <select id="bill-first" value={firstId} onChange={(e) => { setFirstId(e.target.value); setSecondId(null); }}>
              {active.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title} ({f.year})
                </option>
              ))}
            </select>
          </div>
          <RadioGroup<BillMode>
            legend="Film two should..."
            name="bill-mode"
            value={mode}
            options={[
              { value: 'same', label: 'More of the same feeling' },
              { value: 'change', label: 'Change the mood for film two' },
            ]}
            onChange={(m) => { setMode(m); setSecondId(null); }}
          />
          <fieldset className="segmented">
            <legend>Leave out</legend>
            {(Object.keys(EX_LABEL) as (keyof Exclusions)[]).map((k) => (
              <label className="choice" key={k}>
                <input type="checkbox" checked={ex[k]} onChange={(e) => { setEx({ ...ex, [k]: e.target.checked }); setSecondId(null); }} />
                <span>{EX_LABEL[k]}</span>
              </label>
            ))}
          </fieldset>
          {!firstAllowed && first && (
            <p className="banner" role="alert">
              {first.title} is excluded by your current choices. Pick another first film or change what you leave out.
            </p>
          )}
          {firstAllowed && (
            <fieldset className="segmented" style={{ display: 'grid', gap: 8 }}>
              <legend>Film two</legend>
              {suggestions.length === 0 && <p className="small muted">No second film fits these choices. Try changing the mood option or exclusions.</p>}
              {suggestions.map((s) => (
                <label key={s.film.id} className="check" style={{ alignItems: 'flex-start', border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
                  <input type="radio" name="bill-second" checked={second?.id === s.film.id} onChange={() => setSecondId(s.film.id)} style={{ marginTop: 3 }} />
                  <span>
                    <strong>
                      {s.film.title} ({s.film.year})
                    </strong>
                    <span className="small muted" style={{ display: 'block' }}>
                      {s.editorial ? 'Our suggested pairing: ' : 'Documented link: '}
                      {s.note}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </section>

        <section className="panel stack" aria-labelledby="plan-h">
          <h2 id="plan-h">Your evening</h2>
          {first && second && chosen && firstAllowed ? (
            <>
              <ol className="plain-list" style={{ gap: 6 }}>
                <li>
                  <strong>1.</strong> <a href={filmHref(first.id)}>{first.title}</a> <span className="muted small">({first.year}) · {formatRuntime(first.runtime)}</span>
                </li>
                <li>
                  <strong>2.</strong> <a href={filmHref(second.id)}>{second.title}</a> <span className="muted small">({second.year}) · {formatRuntime(second.runtime)}</span>
                </li>
              </ol>
              <p className="small">
                <span className="tag outline">{chosen.editorial ? 'Our suggested pairing' : 'Documented connection'}</span> {chosen.note}
              </p>
              <div className="row-wrap">
                <button type="button" className="btn btn-secondary btn-sm" onClick={swap}>
                  Swap the order
                </button>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="bill-interval">Interval between films (minutes)</label>
                  <input
                    id="bill-interval"
                    type="number"
                    min={0}
                    max={120}
                    value={interval}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(120, Math.round(Number(e.target.value) || 0)));
                      commit((s) => ({ ...s, prefs: { ...s.prefs, interval: v } }), undefined, { undoable: false });
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="bill-date">
                    Date <span className="hint">(optional)</span>
                  </label>
                  <input id="bill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <p role="status" aria-live="polite">
                {length?.total != null ? (
                  <>
                    <strong>Total evening: {formatRuntime(length.total)}</strong> <span className="small muted">including a {interval}-minute interval</span>
                  </>
                ) : (
                  <span className="small">
                    The total can&rsquo;t be calculated because the runtime for {length?.missing.join(' and ')} isn&rsquo;t verified.
                  </span>
                )}
              </p>
              <canvas ref={canvasRef} className="ticket-preview" role="img" aria-label={`Ticket preview: ${first.title} then ${second.title}${date ? `, ${formatTicketDate(date)}` : ''}`} />
              {error && <p className="banner" role="alert">{error}</p>}
              <div className="row-wrap">
                <button type="button" className="btn btn-primary" onClick={save}>
                  Save plan
                </button>
                <button type="button" className="btn btn-secondary" onClick={download}>
                  <Icon name="download" size={18} /> Download ticket
                </button>
                {canShareFiles && (
                  <button type="button" className="btn btn-secondary" onClick={share}>
                    <Icon name="share" size={18} /> Share ticket
                  </button>
                )}
              </div>
              <p className="tiny muted">A keepsake for your film night, not a booking. Nothing is shared unless you press Share.</p>
            </>
          ) : (
            <p className="small muted">Choose a first film and a second feature to plan the evening.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="curated-h">
        <div className="section-head">
          <div>
            <h2 id="curated-h">Starting pairings</h2>
            <p>Each one comes with its reason. Editorial pairings are labelled.</p>
          </div>
        </div>
        <div className="music-grid">
          {curatedBills(films).map(({ bill, first: a, second: b }) => (
            <article key={bill.id} className="music-card">
              <span className={`tag ${bill.editorial ? 'cherry' : 'cobalt'}`} style={{ justifySelf: 'start' }}>
                {bill.editorial ? 'Our suggested pairing' : 'Documented connection'}
              </span>
              <h3>
                {a.title} + {b.title}
              </h3>
              <p className="small">{bill.note}</p>
              <div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setFirstId(a.id);
                    setMode(bill.feeling);
                    setSecondId(b.id);
                    setEx(NO_EXCLUSIONS);
                    document.getElementById('build-h')?.scrollIntoView({ block: 'start' });
                    announce(`Loaded ${a.title} and ${b.title}.`);
                  }}
                >
                  Use this pairing
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {state.savedPlans.length > 0 && (
        <section aria-labelledby="saved-plans-h">
          <div className="section-head">
            <h2 id="saved-plans-h">Saved plans</h2>
          </div>
          <ul className="plain-list">
            {state.savedPlans.map((p) => {
              const a = byId.get(p.first);
              const b = byId.get(p.second);
              if (!a || !b) return null;
              return (
                <li key={p.id} className="panel row-wrap" style={{ justifyContent: 'space-between', padding: 14 }}>
                  <div>
                    <strong>
                      {a.title} then {b.title}
                    </strong>
                    <p className="small muted">{p.date ? formatTicketDate(p.date) : 'No date set'}</p>
                  </div>
                  <div className="row-wrap">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setFirstId(a.id);
                        setSecondId(b.id);
                        setDate(p.date ?? '');
                        setManualNote(p.note);
                        setEx(NO_EXCLUSIONS);
                        const curated = DOUBLE_BILLS.find((x) => (x.first === a.id && x.second === b.id) || (x.first === b.id && x.second === a.id));
                        if (curated) setMode(curated.feeling);
                        document.getElementById('plan-h')?.scrollIntoView({ block: 'start' });
                      }}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => commit((s) => ({ ...s, savedPlans: s.savedPlans.filter((x) => x.id !== p.id) }), 'Plan removed.')}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
