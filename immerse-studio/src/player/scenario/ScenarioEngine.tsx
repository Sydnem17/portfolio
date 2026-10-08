import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ScenarioBlock_, Scene_, Choice_, Tool_, ToolAction_ } from '../../schema/course';
import { RichText } from '../markdown';

export interface ScenarioResult {
  endingSceneId: string;
  endingType: 'safe' | 'unsafe' | 'mixed';
  quality: [number, number, number]; // best / ok / poor decision counts
  flags: string[];
}

interface Props {
  block: ScenarioBlock_;
  savedResult?: ScenarioResult;
  onComplete: (blockId: string, result: ScenarioResult) => void;
}

interface LogEntry {
  scene: string;
  label: string;
  quality: 'best' | 'ok' | 'poor';
}

/**
 * First-person branching scenario engine.
 *
 * The learner is *in* the situation: POV narrative, described ambient sound
 * (captions-first, so audio is an enhancement, never a requirement), timed
 * decisions with an accessible "I need more time" escape hatch (WCAG 2.2.1),
 * usable tools (radio, phone...) that change the world via flags, and a
 * debrief that replays their decision path.
 */
export function ScenarioEngine({ block, savedResult, onComplete }: Props) {
  const [phase, setPhase] = useState<'intro' | 'playing' | 'done'>(savedResult ? 'done' : 'intro');
  const [sceneId, setSceneId] = useState(block.startSceneId);
  const [flags, setFlags] = useState<string[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pendingFeedback, setPendingFeedback] = useState<{ text: string; goTo: string } | null>(null);
  const [toolOpen, setToolOpen] = useState<string | null>(null);
  const [toolResponse, setToolResponse] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioResult | undefined>(savedResult);

  const scenes = useMemo(() => new Map(block.scenes.map((s) => [s.id, s])), [block.scenes]);
  const scene = scenes.get(sceneId) ?? block.scenes[0];

  const liveRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerPaused, setTimerPaused] = useState(false);

  useEffect(() => {
    if (phase !== 'playing') return;
    setToolResponse(null);
    setToolOpen(null);
    setTimeLeft(scene.timerSeconds ?? null);
    setTimerPaused(false);
    headingRef.current?.focus();
  }, [sceneId, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'playing' || timeLeft === null || timerPaused || pendingFeedback) return;
    if (timeLeft <= 0) {
      if (scene.timerGoTo) enterScene(scene.timerGoTo);
      return;
    }
    const t = setTimeout(() => setTimeLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, timerPaused, phase, pendingFeedback]); // eslint-disable-line react-hooks/exhaustive-deps

  function addFlags(newFlags?: string[]) {
    if (!newFlags?.length) return;
    setFlags((f) => Array.from(new Set([...f, ...newFlags])));
  }

  function enterScene(id: string) {
    const next = scenes.get(id);
    if (!next) return;
    setSceneId(id);
    if (next.isEnding) {
      const q: [number, number, number] = [0, 0, 0];
      for (const entry of log) {
        if (entry.quality === 'best') q[0]++;
        else if (entry.quality === 'ok') q[1]++;
        else q[2]++;
      }
      const res: ScenarioResult = {
        endingSceneId: id,
        endingType: next.endingType ?? 'mixed',
        quality: q,
        flags,
      };
      setResult(res);
      setPhase('done');
      onComplete(block.id, res);
    }
  }

  function choose(choice: Choice_) {
    addFlags(choice.setsFlags);
    setLog((l) => [...l, { scene: scene.title, label: choice.label, quality: choice.quality }]);
    if (choice.feedback) {
      setPendingFeedback({ text: choice.feedback, goTo: choice.goTo });
    } else {
      enterScene(choice.goTo);
    }
  }

  function useToolAction(tool: Tool_, action: ToolAction_) {
    addFlags(action.setsFlags);
    if (action.quality) {
      setLog((l) => [...l, { scene: scene.title, label: `${tool.name}: ${action.label}`, quality: action.quality! }]);
    }
    setToolResponse(action.feedback);
  }

  function restart() {
    setSceneId(block.startSceneId);
    setFlags([]);
    setLog([]);
    setPendingFeedback(null);
    setResult(undefined);
    setPhase('playing');
  }

  /* ---------- intro ---------- */
  if (phase === 'intro') {
    return (
      <section className="ip-block ip-scenario ip-scenario-intro">
        <p className="ip-scenario-kicker">Immersive scenario</p>
        <h2>{block.title}</h2>
        <RichText text={block.intro} />
        {block.tools.length > 0 && (
          <p className="ip-scenario-toolnote">
            You are carrying: {block.tools.map((t) => t.name).join(', ')}. You can use them at any moment — just
            like real life.
          </p>
        )}
        <button type="button" className="ip-btn ip-btn-primary" onClick={() => setPhase('playing')}>
          Step in
        </button>
      </section>
    );
  }

  /* ---------- debrief ---------- */
  if (phase === 'done' && result) {
    const endScene = scenes.get(result.endingSceneId);
    const labels = { safe: 'Safe outcome', mixed: 'Mixed outcome', unsafe: 'Unsafe outcome' } as const;
    return (
      <section className="ip-block ip-scenario ip-scenario-debrief">
        <p className={`ip-ending-badge ip-ending-${result.endingType}`}>{labels[result.endingType]}</p>
        <h2>{endScene?.title ?? 'Debrief'}</h2>
        {endScene?.narrative && <RichText text={endScene.narrative} />}
        {endScene?.debrief && (
          <div className="ip-debrief-coach">
            <h3>Debrief</h3>
            <RichText text={endScene.debrief} />
          </div>
        )}
        {log.length > 0 && (
          <div className="ip-decision-log">
            <h3>Your decisions</h3>
            <ol>
              {log.map((entry, i) => (
                <li key={i} className={`ip-q-${entry.quality}`}>
                  <span className="ip-q-dot" aria-hidden="true" />
                  <span>
                    <strong>{entry.scene}:</strong> {entry.label}
                    <span className="ip-visually-hidden">
                      {entry.quality === 'best' ? ' (best choice)' : entry.quality === 'poor' ? ' (risky choice)' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <button type="button" className="ip-btn" onClick={restart}>
          Run the scenario again
        </button>
      </section>
    );
  }

  /* ---------- playing ---------- */
  const visibleChoices = scene.choices.filter((c) => !c.requiresFlag || flags.includes(c.requiresFlag));
  const bg = scene.image?.src;

  return (
    <section className="ip-block ip-scenario ip-scenario-stage" aria-label={`Scenario: ${block.title}`}>
      <div className="ip-scene" style={bg ? { backgroundImage: `linear-gradient(rgba(10,12,16,.55), rgba(10,12,16,.8)), url(${bg})` } : undefined}>
        {scene.timerSeconds && timeLeft !== null && !scene.isEnding && (
          <div className="ip-timer" role="timer" aria-label={`${timeLeft} seconds to decide`}>
            <div className="ip-timer-track" aria-hidden="true">
              <div
                className="ip-timer-fill"
                style={{ width: `${Math.max(0, (timeLeft / scene.timerSeconds) * 100)}%` }}
              />
            </div>
            <span className="ip-timer-count" aria-hidden="true">{timeLeft}s</span>
            <button type="button" className="ip-btn ip-btn-ghost ip-timer-pause" onClick={() => setTimerPaused((p) => !p)}>
              {timerPaused ? 'Resume timer' : 'I need more time'}
            </button>
          </div>
        )}

        <h2 tabIndex={-1} ref={headingRef} className="ip-scene-title">
          {scene.title}
        </h2>

        {scene.ambient && (
          <p className="ip-ambient">
            <span aria-hidden="true">🔊 </span>
            <span className="ip-visually-hidden">Sounds around you: </span>
            {scene.ambient}
          </p>
        )}

        <div className="ip-scene-narrative">
          <RichText text={scene.narrative} />
        </div>

        <div ref={liveRef} aria-live="polite" role="status" className="ip-scene-live">
          {toolResponse && <div className="ip-tool-response">{toolResponse}</div>}
        </div>

        {pendingFeedback ? (
          <div className="ip-choice-feedback">
            <RichText text={pendingFeedback.text} />
            <button
              type="button"
              className="ip-btn ip-btn-primary"
              onClick={() => {
                const go = pendingFeedback.goTo;
                setPendingFeedback(null);
                enterScene(go);
              }}
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="ip-choices" role="group" aria-label="What do you do?">
            <p className="ip-choices-label">What do you do?</p>
            {visibleChoices.map((c) => (
              <button key={c.id} type="button" className="ip-btn ip-choice" onClick={() => choose(c)}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {block.tools.length > 0 && (
          <div className="ip-toolbar" role="group" aria-label="Your tools">
            {block.tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className="ip-btn ip-tool-btn"
                aria-expanded={toolOpen === tool.id}
                onClick={() => {
                  setToolOpen((t) => (t === tool.id ? null : tool.id));
                  setToolResponse(null);
                }}
              >
                <span aria-hidden="true">{toolIcon(tool.icon)} </span>
                {tool.name}
              </button>
            ))}
          </div>
        )}

        {toolOpen && (
          <ToolPanel
            tool={block.tools.find((t) => t.id === toolOpen)!}
            sceneId={scene.id}
            onAction={useToolAction}
            onClose={() => setToolOpen(null)}
          />
        )}
      </div>
    </section>
  );
}

function ToolPanel({
  tool,
  sceneId,
  onAction,
  onClose,
}: {
  tool: Tool_;
  sceneId: string;
  onAction: (tool: Tool_, action: ToolAction_) => void;
  onClose: () => void;
}) {
  const available = tool.actions.filter((a) => !a.onlyInScenes?.length || a.onlyInScenes.includes(sceneId));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, [tabindex]')?.focus();
  }, []);
  return (
    <div
      className="ip-tool-panel"
      role="dialog"
      aria-label={tool.name}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <p className="ip-tool-desc">{tool.description}</p>
      {available.length === 0 && <p>Nothing useful to do with this right now.</p>}
      {available.map((a) => (
        <button key={a.id} type="button" className="ip-btn ip-choice" onClick={() => onAction(tool, a)}>
          {a.label}
        </button>
      ))}
      <button type="button" className="ip-btn ip-btn-ghost" onClick={onClose}>
        Put away
      </button>
    </div>
  );
}

function toolIcon(icon: string): string {
  switch (icon) {
    case 'radio':
      return '📻';
    case 'phone':
      return '📱';
    case 'flashlight':
      return '🔦';
    case 'map':
      return '🗺️';
    case 'firstaid':
      return '🩹';
    case 'keys':
      return '🔑';
    default:
      return '🎒';
  }
}
