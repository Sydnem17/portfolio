import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Course, Block } from '../schema/course';
import { ScormBridge, emptyState, type SavedState } from './scorm';
import { TextBlockView, ImageBlockView, AccordionBlockView, FlipCardsBlockView } from './blocks/SimpleBlocks';
import { McqBlockView } from './blocks/McqBlock';
import { HotspotBlockView } from './blocks/HotspotBlock';
import { ScenarioEngine, type ScenarioResult } from './scenario/ScenarioEngine';

/**
 * The learner-facing course player. This exact component renders the
 * editor's live preview AND the exported HTML/SCORM package — one renderer,
 * every target.
 */
export function Player({ course, standalone = true }: { course: Course; standalone?: boolean }) {
  const bridge = useMemo(() => new ScormBridge(course.id), [course.id]);
  const [state, setState] = useState<SavedState>(() => emptyState());
  const [ready, setReady] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!standalone) {
      // Editor preview: never touch SCORM or persisted progress.
      setState(emptyState());
      setReady(true);
      return;
    }
    bridge.init();
    setState(bridge.restore());
    setReady(true);
    return () => bridge.finish();
  }, [bridge, standalone]);

  const pageIdx = Math.min(state.p, course.pages.length - 1);
  const page = course.pages[pageIdx];

  // Mark page visited whenever we land on it
  useEffect(() => {
    if (!ready) return;
    setState((s) => {
      const vv = s.vv | (1 << pageIdx);
      if (vv === s.vv && s.p === pageIdx) return s;
      const next = { ...s, vv, p: pageIdx };
      if (standalone) bridge.save(next);
      return next;
    });
  }, [pageIdx, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const scorables = useMemo(() => collectScorables(course), [course]);

  function persist(next: SavedState) {
    setState(next);
    if (standalone) {
      bridge.save(next);
      const { percent, complete } = computeScore(course, next, scorables);
      bridge.reportScore(percent, percent >= course.passingScore, complete);
    }
  }

  function onMcqAnswer(blockId: string, selected: number[]) {
    persist({ ...state, mc: { ...state.mc, [blockId]: selected } });
  }

  function onScenarioComplete(blockId: string, result: ScenarioResult) {
    persist({
      ...state,
      sn: { ...state.sn, [blockId]: { e: result.endingSceneId, q: result.quality, f: result.flags } },
    });
  }

  function goTo(idx: number) {
    persist({ ...state, p: idx, vv: state.vv | (1 << idx) });
    mainRef.current?.focus();
  }

  if (!ready) return null;

  const { percent, complete, answered, total } = computeScore(course, state, scorables);

  return (
    <div className="ip-root">
      <a className="ip-skip" href="#ip-main">
        Skip to content
      </a>
      <header className="ip-header">
        <div>
          <p className="ip-course-title">{course.title}</p>
          <p className="ip-page-count">
            Page {pageIdx + 1} of {course.pages.length} — {page.title}
          </p>
        </div>
        <div
          className="ip-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={course.pages.length}
          aria-valuenow={countBits(state.vv)}
          aria-label="Pages visited"
        >
          <div className="ip-progress-fill" style={{ width: `${(countBits(state.vv) / course.pages.length) * 100}%` }} />
        </div>
      </header>

      <nav className="ip-pagenav" aria-label="Course pages">
        <ol>
          {course.pages.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className={`ip-pagenav-item${i === pageIdx ? ' is-current' : ''}${state.vv & (1 << i) ? ' is-visited' : ''}`}
                aria-current={i === pageIdx ? 'page' : undefined}
                onClick={() => goTo(i)}
              >
                {p.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main id="ip-main" tabIndex={-1} ref={mainRef} className="ip-main">
        <h1 className="ip-page-title">{page.title}</h1>
        {page.blocks.map((block) => (
          <BlockView
            key={block.id}
            block={block}
            state={state}
            onMcqAnswer={onMcqAnswer}
            onScenarioComplete={onScenarioComplete}
          />
        ))}
        <div className="ip-pager">
          <button type="button" className="ip-btn" disabled={pageIdx === 0} onClick={() => goTo(pageIdx - 1)}>
            ← Previous
          </button>
          {pageIdx < course.pages.length - 1 ? (
            <button type="button" className="ip-btn ip-btn-primary" onClick={() => goTo(pageIdx + 1)}>
              Next →
            </button>
          ) : (
            <div className="ip-summary" aria-live="polite">
              {complete ? (
                <p>
                  <strong>{percent >= course.passingScore ? 'Course complete — passed.' : 'Course complete.'}</strong>{' '}
                  Score: {Math.round(percent)}% (pass mark {course.passingScore}%).
                </p>
              ) : (
                <p>
                  {answered} of {total} activities done — finish them all (and visit every page) to complete the
                  course.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function BlockView({
  block,
  state,
  onMcqAnswer,
  onScenarioComplete,
}: {
  block: Block;
  state: SavedState;
  onMcqAnswer: (id: string, sel: number[], correct: boolean) => void;
  onScenarioComplete: (id: string, r: ScenarioResult) => void;
}) {
  switch (block.type) {
    case 'text':
      return <TextBlockView block={block} />;
    case 'image':
      return <ImageBlockView block={block} />;
    case 'accordion':
      return <AccordionBlockView block={block} />;
    case 'flipcards':
      return <FlipCardsBlockView block={block} />;
    case 'hotspot':
      return <HotspotBlockView block={block} />;
    case 'mcq':
      return <McqBlockView block={block} savedSelection={state.mc[block.id]} onAnswer={onMcqAnswer} />;
    case 'scenario': {
      const saved = state.sn[block.id];
      const savedResult =
        saved?.e && saved.q
          ? {
              endingSceneId: saved.e,
              endingType: endingTypeOf(block, saved.e),
              quality: saved.q,
              flags: saved.f ?? [],
            }
          : undefined;
      return <ScenarioEngine block={block} savedResult={savedResult} onComplete={onScenarioComplete} />;
    }
  }
}

function endingTypeOf(block: Extract<Block, { type: 'scenario' }>, sceneId: string): 'safe' | 'unsafe' | 'mixed' {
  return block.scenes.find((s) => s.id === sceneId)?.endingType ?? 'mixed';
}

interface Scorable {
  id: string;
  kind: 'mcq' | 'scenario';
}

function collectScorables(course: Course): Scorable[] {
  const out: Scorable[] = [];
  for (const page of course.pages)
    for (const b of page.blocks) {
      if (b.type === 'mcq') out.push({ id: b.id, kind: 'mcq' });
      if (b.type === 'scenario') out.push({ id: b.id, kind: 'scenario' });
    }
  return out;
}

/**
 * Scoring: each MCQ is worth 1 point (correct answer recorded). A scenario
 * is worth 2 points, scaled by decision quality (best=1, ok=0.5, poor=0).
 * Completion = every page visited + every scorable attempted.
 */
function computeScore(course: Course, state: SavedState, scorables: Scorable[]) {
  let earned = 0;
  let possible = 0;
  let answered = 0;
  const blockById = new Map<string, Block>();
  for (const page of course.pages) for (const b of page.blocks) blockById.set(b.id, b);

  for (const s of scorables) {
    if (s.kind === 'mcq') {
      possible += 1;
      const sel = state.mc[s.id];
      if (sel !== undefined) {
        answered++;
        const block = blockById.get(s.id);
        if (block?.type === 'mcq' && sel.length && block.options[sel[0]]?.correct) earned += 1;
      }
    } else {
      possible += 2;
      const sn = state.sn[s.id];
      if (sn?.q) {
        answered++;
        const [best, ok, poor] = sn.q;
        const decisions = best + ok + poor;
        if (decisions > 0) earned += 2 * ((best + ok * 0.5) / decisions);
      }
    }
  }

  const allVisited = countBits(state.vv) >= course.pages.length;
  const complete = allVisited && answered === scorables.length;
  const percent = possible === 0 ? (allVisited ? 100 : 0) : (earned / possible) * 100;
  return { percent, complete, answered, total: scorables.length };
}

function countBits(n: number): number {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>>= 1;
  }
  return c;
}
