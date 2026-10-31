import { useEffect, useMemo, useState } from 'react';
import type { MoodId } from '../data/types';
import { MOOD_LABEL, PICKER_MOODS, formatRuntime } from '../lib/labels';
import { NO_EXCLUSIONS, SLOT_TITLE, pickTonight, type Exclusions, type Familiarity, type PickerInput, type Slot, type TimeLimit } from '../lib/tonight';
import { filmHref, navigate } from '../router';
import { todayKey, updatePersonal } from '../state/model';
import { useStore } from '../state/store';
import { Cover } from './Cover';
import { Dialog, RadioGroup } from './ui';

const TIME_OPTIONS: { value: string; label: string }[] = [
  { value: 'any', label: 'No limit' },
  { value: '100', label: 'Under 1 hr 40' },
  { value: '120', label: 'Under 2 hours' },
  { value: '150', label: 'Under 2 hr 30' },
];

const EXCLUSION_LABEL: Record<keyof Exclusions, string> = {
  horror: 'No horror',
  intense: 'Nothing too intense',
  subtitles: 'No subtitles',
  animation: 'No animation',
  seen: 'Skip films I’ve seen',
};

export function TonightDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { films, state, commit, announce } = useStore();
  const [input, setInput] = useState<PickerInput>({ mood: 'warm-funny', time: null, familiarity: 'mix', exclude: NO_EXCLUSIONS });
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const [shownThisSession, setShown] = useState<string[]>([]);
  const today = todayKey();

  const run = (opts: { different?: boolean } = {}) => {
    const nextSeed = opts.different ? seed + 7919 : seed;
    const current = slots?.flatMap((s) => (s.film ? [s.film.id] : [])) ?? [];
    const result = pickTonight(films, input, {
      spaderWeight: state.prefs.spaderWeight,
      skipped: state.tonight.skipped,
      today,
      recent: state.tonight.recent,
      avoid: opts.different ? [...shownThisSession, ...current] : [],
      seed: nextSeed,
    });
    setSeed(nextSeed);
    setSlots(result);
    const ids = result.flatMap((s) => (s.film ? [s.film.id] : []));
    setShown((prev) => Array.from(new Set([...prev, ...ids])));
    commit((s) => ({ ...s, tonight: { ...s.tonight, recent: Array.from(new Set([...ids, ...s.tonight.recent])).slice(0, 18) } }), undefined, { undoable: false });
    const found = ids.length;
    announce(found ? `${found} ${found === 1 ? 'choice' : 'choices'} for tonight.` : 'No films match tonight’s choices.');
  };

  // Keep results in sync when a personal action changes a film (e.g. "Already seen it").
  const liveSlots = useMemo(() => {
    if (!slots) return null;
    return slots.map((s) => (s.film ? { ...s, film: films.find((f) => f.id === s.film!.id) ?? s.film } : s));
  }, [slots, films]);

  // After "Already seen it" or "Skip for tonight", refill just that slot once state has updated.
  const [pending, setPending] = useState<{ kind: Slot['kind']; filmId: string } | null>(null);
  useEffect(() => {
    if (!pending || !slots) return;
    const others = slots.filter((s) => s.kind !== pending.kind && s.film).map((s) => s.film!.id);
    const result = pickTonight(films, input, {
      spaderWeight: state.prefs.spaderWeight,
      skipped: state.tonight.skipped,
      today,
      recent: state.tonight.recent,
      avoid: [...shownThisSession, pending.filmId, ...others],
      seed: seed + 104729,
    });
    let replacement = result.find((s) => s.kind === pending.kind);
    if (replacement?.film && others.includes(replacement.film.id)) {
      replacement = { kind: pending.kind, film: null, explanation: '', empty: 'No other film fits this spot tonight.' };
    }
    setSlots(slots.map((s) => (s.kind === pending.kind && replacement ? replacement : s)));
    if (replacement?.film) setShown((prev) => [...prev, replacement!.film!.id]);
    announce(replacement?.film ? `New ${SLOT_TITLE[pending.kind].toLowerCase()}: ${replacement.film.title}.` : 'No other film fits this spot tonight.');
    setPending(null);
  }, [pending]);

  const replaceAfter = (kind: Slot['kind'], filmId: string, update: () => void) => {
    update();
    setShown((prev) => Array.from(new Set([...prev, filmId])));
    setPending({ kind, filmId });
  };

  const close = () => {
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={liveSlots ? 'Tonight’s three' : 'Pick tonight’s film'}
      footer={
        liveSlots ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setSlots(null)}>
              Change choices
            </button>
            <button type="button" className="btn btn-primary" onClick={() => run({ different: true })}>
              Different three
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => run()} data-testid="show-three">
              Show my three
            </button>
          </>
        )
      }
    >
      {!liveSlots ? (
        <>
          <RadioGroup<string>
            legend="What are you in the mood for?"
            name="tonight-mood"
            value={input.mood}
            options={[...PICKER_MOODS.map((m) => ({ value: m, label: MOOD_LABEL[m] })), { value: 'surprise', label: 'Open to a surprise' }]}
            onChange={(v) => setInput({ ...input, mood: v as MoodId | 'surprise' })}
          />
          <RadioGroup<string>
            legend="How much time do you have?"
            name="tonight-time"
            value={input.time == null ? 'any' : String(input.time)}
            options={TIME_OPTIONS}
            onChange={(v) => setInput({ ...input, time: v === 'any' ? null : (Number(v) as TimeLimit) })}
          />
          <RadioGroup<Familiarity>
            legend="Familiar or new?"
            name="tonight-familiar"
            value={input.familiarity}
            options={[
              { value: 'mix', label: 'Mix it up' },
              { value: 'familiar', label: 'Something I know' },
              { value: 'new', label: 'Something new' },
            ]}
            onChange={(v) => setInput({ ...input, familiarity: v })}
          />
          <fieldset className="segmented">
            <legend>Leave out</legend>
            {(Object.keys(EXCLUSION_LABEL) as (keyof Exclusions)[]).map((k) => (
              <label className="choice" key={k}>
                <input
                  type="checkbox"
                  checked={input.exclude[k]}
                  onChange={(e) => setInput({ ...input, exclude: { ...input.exclude, [k]: e.target.checked } })}
                />
                <span>{EXCLUSION_LABEL[k]}</span>
              </label>
            ))}
          </fieldset>
          {input.time != null && (
            <p className="small muted">Only films with a verified runtime can be offered for a time limit.</p>
          )}
          <p className="tiny muted">Choices come from simple rules using your moods, picks and favourites. No AI service is involved.</p>
        </>
      ) : (
        <div className="picks" aria-live="off">
          {liveSlots.map((slot) =>
            slot.film ? (
              <article className="pick" key={slot.kind}>
                <Cover film={slot.film} decorative />
                <div style={{ minWidth: 0 }}>
                  <p className={`eyebrow ${slot.kind === 'wildcard' ? 'cherry' : ''}`}>{SLOT_TITLE[slot.kind]}</p>
                  <h3>
                    <a href={filmHref(slot.film.id)} onClick={close}>
                      {slot.film.title}
                    </a>
                  </h3>
                  <p className="small muted">
                    {slot.film.year} · {slot.film.directors.join(' & ')} · {formatRuntime(slot.film.runtime)}
                  </p>
                  <p className="why">{slot.explanation}</p>
                  {slot.film.contentNote && <p className="tiny muted">Content note: {slot.film.contentNote}</p>}
                  <PickActions slot={slot} onChoose={close} onReplace={replaceAfter} today={today} commit={commit} />
                </div>
              </article>
            ) : (
              <div className="pick empty" key={slot.kind}>
                <div>
                  <p className="eyebrow">{SLOT_TITLE[slot.kind]}</p>
                  <p className="small" style={{ marginTop: 6 }}>
                    {slot.empty}
                  </p>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </Dialog>
  );
}

function PickActions({
  slot,
  onChoose,
  onReplace,
  today,
  commit,
}: {
  slot: Slot;
  onChoose: () => void;
  onReplace: (kind: Slot['kind'], id: string, fn: () => void) => void;
  today: string;
  commit: ReturnType<typeof useStore>['commit'];
}) {
  const f = slot.film!;
  const saved = f.me.status === 'want';
  return (
    <div className="pick-actions">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          commit((s) => ({ ...s, tonight: { ...s.tonight, chosen: { filmId: f.id, date: today } } }), `Tonight’s pick: ${f.title}.`, { undoable: false });
          onChoose();
          navigate(`/film/${f.id}`);
        }}
      >
        Choose this
      </button>
      {f.me.status !== 'watched' && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-pressed={saved}
          disabled={saved}
          onClick={() => commit((s) => updatePersonal(s, f.id, { status: 'want' }), `${f.title} saved for later.`)}
        >
          {saved ? 'Saved for later' : 'Save for later'}
        </button>
      )}
      {f.me.status !== 'watched' && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onReplace(slot.kind, f.id, () => commit((s) => updatePersonal(s, f.id, { status: 'watched' }), `${f.title} marked as watched.`))}
        >
          Already seen it
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() =>
          onReplace(slot.kind, f.id, () =>
            commit((s) => ({ ...s, tonight: { ...s.tonight, skipped: { ...s.tonight.skipped, [f.id]: today } } }), `${f.title} skipped for tonight.`),
          )
        }
      >
        Skip for tonight
      </button>
    </div>
  );
}
