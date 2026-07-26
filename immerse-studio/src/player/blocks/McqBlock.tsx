import React, { useMemo, useState } from 'react';
import type { McqBlock_ } from '../../schema/course';

interface Props {
  block: McqBlock_;
  savedSelection?: number[];
  onAnswer: (blockId: string, selected: number[], correct: boolean) => void;
}

/**
 * Single-answer MCQ with per-option feedback. Native radios inside
 * fieldset/legend; result announced through an aria-live region.
 */
export function McqBlockView({ block, savedSelection, onAnswer }: Props) {
  const [selected, setSelected] = useState<number | null>(savedSelection?.[0] ?? null);
  const [submitted, setSubmitted] = useState<boolean>(savedSelection !== undefined && savedSelection.length > 0);

  const order = useMemo(() => {
    const idx = block.options.map((_, i) => i);
    if (!block.shuffle) return idx;
    // Stable shuffle per block id so revisits don't reshuffle under the learner
    let seed = Array.from(block.id).reduce((a, c) => a + c.charCodeAt(0), 0);
    for (let i = idx.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = seed % (i + 1);
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }, [block]);

  const chosen = selected !== null ? block.options[selected] : null;
  const isCorrect = chosen?.correct ?? false;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected === null) return;
    setSubmitted(true);
    onAnswer(block.id, [selected], block.options[selected].correct);
  }

  return (
    <section className="ip-block ip-mcq">
      <form onSubmit={submit}>
        <fieldset disabled={submitted}>
          <legend>{block.question}</legend>
          {order.map((optIdx) => {
            const opt = block.options[optIdx];
            const inputId = `${block.id}-o${optIdx}`;
            return (
              <label key={optIdx} className="ip-mcq-option" htmlFor={inputId}>
                <input
                  type="radio"
                  id={inputId}
                  name={block.id}
                  checked={selected === optIdx}
                  onChange={() => setSelected(optIdx)}
                />
                <span>{opt.text}</span>
              </label>
            );
          })}
        </fieldset>
        {!submitted && (
          <button type="submit" className="ip-btn" disabled={selected === null}>
            Check answer
          </button>
        )}
      </form>
      <div aria-live="polite" role="status">
        {submitted && chosen && (
          <div className={`ip-feedback ${isCorrect ? 'ip-feedback-good' : 'ip-feedback-bad'}`}>
            <strong>{isCorrect ? 'Correct.' : 'Not quite.'}</strong> {chosen.feedback}
            {!isCorrect && (
              <button
                type="button"
                className="ip-btn ip-btn-ghost"
                onClick={() => {
                  setSubmitted(false);
                  setSelected(null);
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
