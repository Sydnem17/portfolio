import React, { useState } from 'react';
import type { Block, Scene_, Choice_, Tool_ } from '../schema/course';
import { uid } from '../schema/course';
import { TextField, AreaField, SelectField, NumberField, CheckField, MiniButton, Row } from './fields';
import { ImagePicker } from './ImagePicker';

type ScenarioB = Extract<Block, { type: 'scenario' }>;

const QUALITY_OPTIONS = [
  { value: 'best', label: 'Best possible choice' },
  { value: 'ok', label: 'Okay, not ideal' },
  { value: 'poor', label: 'Risky / poor choice' },
];

/**
 * The scenario editor. Deliberately conversational: "What do they see?",
 * "What can they do?", "Where does that take them?" — an author builds a
 * branching simulation without ever seeing a node graph or a line of code.
 */
export function ScenarioForm({ block, onChange }: { block: ScenarioB; onChange: (b: Block) => void }) {
  const [openScene, setOpenScene] = useState<string | null>(block.scenes[0]?.id ?? null);
  const [openTool, setOpenTool] = useState<string | null>(null);

  const sceneOptions = block.scenes.map((s) => ({ value: s.id, label: s.title || '(untitled moment)' }));

  function updateScene(id: string, patch: Partial<Scene_>) {
    onChange({ ...block, scenes: block.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  function addScene() {
    const s: Scene_ = { id: uid('sc'), title: 'New moment', narrative: '', choices: [] };
    onChange({ ...block, scenes: [...block.scenes, s] });
    setOpenScene(s.id);
  }

  function removeScene(id: string) {
    if (block.scenes.length <= 1) return;
    onChange({ ...block, scenes: block.scenes.filter((s) => s.id !== id) });
    if (openScene === id) setOpenScene(null);
  }

  function updateChoice(sceneId: string, idx: number, patch: Partial<Choice_>) {
    onChange({
      ...block,
      scenes: block.scenes.map((s) =>
        s.id === sceneId ? { ...s, choices: s.choices.map((c, i) => (i === idx ? { ...c, ...patch } : c)) } : s
      ),
    });
  }

  function updateTool(id: string, patch: Partial<Tool_>) {
    onChange({ ...block, tools: block.tools.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }

  // Simple authoring health checks — surfaced in plain language.
  const brokenLinks: string[] = [];
  const sceneIds = new Set(block.scenes.map((s) => s.id));
  for (const s of block.scenes) {
    for (const c of s.choices) if (!sceneIds.has(c.goTo)) brokenLinks.push(`"${s.title}" → "${c.label}"`);
    if (s.timerGoTo && !sceneIds.has(s.timerGoTo)) brokenLinks.push(`"${s.title}" timer destination`);
  }
  const hasEnding = block.scenes.some((s) => s.isEnding);

  return (
    <div className="ed-scenario">
      <TextField label="Scenario title" value={block.title} onChange={(v) => onChange({ ...block, title: v })} />
      <AreaField
        label="Set the scene for the learner"
        rows={3}
        hint='Written to the learner in second person: "It’s 3:40 pm. You’re the floor warden..."'
        value={block.intro}
        onChange={(v) => onChange({ ...block, intro: v })}
      />
      <SelectField
        label="Where does the scenario start?"
        value={block.startSceneId}
        options={sceneOptions}
        onChange={(v) => onChange({ ...block, startSceneId: v })}
      />

      {!hasEnding && (
        <p className="ed-warn" role="status">
          ⚠ No moment is marked as an ending yet — learners will have no way to finish. Tick "This moment ends the
          scenario" on at least one moment.
        </p>
      )}
      {brokenLinks.length > 0 && (
        <p className="ed-warn" role="status">
          ⚠ Some choices lead nowhere: {brokenLinks.join('; ')}. Pick a destination for each.
        </p>
      )}

      {/* ---------- Tools ---------- */}
      <fieldset className="ed-group">
        <legend>Tools the learner carries (walkie-talkie, phone, torch...)</legend>
        <p className="ed-hint">
          Tools make it real: instead of answering a question about radioing for help, the learner presses the radio
          and does it.
        </p>
        {block.tools.map((tool) => (
          <div key={tool.id} className="ed-subcard">
            <Row>
              <button type="button" className="ed-disclose" aria-expanded={openTool === tool.id} onClick={() => setOpenTool(openTool === tool.id ? null : tool.id)}>
                {openTool === tool.id ? '▾' : '▸'} {tool.name || '(unnamed tool)'}
              </button>
              <MiniButton tone="danger" ariaLabel={`Remove ${tool.name}`} onClick={() => onChange({ ...block, tools: block.tools.filter((t) => t.id !== tool.id) })}>
                Remove
              </MiniButton>
            </Row>
            {openTool === tool.id && (
              <>
                <TextField label="Name" value={tool.name} onChange={(v) => updateTool(tool.id, { name: v })} />
                <SelectField
                  label="Icon"
                  value={tool.icon}
                  options={[
                    { value: 'radio', label: '📻 Radio' },
                    { value: 'phone', label: '📱 Phone' },
                    { value: 'flashlight', label: '🔦 Torch' },
                    { value: 'map', label: '🗺️ Map' },
                    { value: 'firstaid', label: '🩹 First aid' },
                    { value: 'keys', label: '🔑 Keys' },
                    { value: 'custom', label: '🎒 Other' },
                  ]}
                  onChange={(v) => updateTool(tool.id, { icon: v as Tool_['icon'] })}
                />
                <TextField label="Short description" value={tool.description} onChange={(v) => updateTool(tool.id, { description: v })} />
                <fieldset className="ed-group">
                  <legend>What can they do with it?</legend>
                  {tool.actions.map((a, i) => (
                    <div key={a.id} className="ed-subcard">
                      <Row>
                        <strong>Action {i + 1}</strong>
                        <MiniButton
                          tone="danger"
                          ariaLabel={`Remove action ${i + 1}`}
                          disabled={tool.actions.length <= 1}
                          onClick={() => updateTool(tool.id, { actions: tool.actions.filter((_, j) => j !== i) })}
                        >
                          Remove
                        </MiniButton>
                      </Row>
                      <TextField
                        label="What the learner does"
                        hint='e.g. Report: "Smoke on Level 2, east corridor"'
                        value={a.label}
                        onChange={(v) => updateTool(tool.id, { actions: tool.actions.map((x, j) => (j === i ? { ...x, label: v } : x)) })}
                      />
                      <AreaField
                        label="What happens in response"
                        rows={2}
                        hint="The reply on the radio, what they see, what changes."
                        value={a.feedback}
                        onChange={(v) => updateTool(tool.id, { actions: tool.actions.map((x, j) => (j === i ? { ...x, feedback: v } : x)) })}
                      />
                      <SelectField
                        label="How good a move is this?"
                        value={a.quality ?? 'ok'}
                        options={QUALITY_OPTIONS}
                        onChange={(v) => updateTool(tool.id, { actions: tool.actions.map((x, j) => (j === i ? { ...x, quality: v as any } : x)) })}
                      />
                    </div>
                  ))}
                  <MiniButton
                    tone="primary"
                    onClick={() => updateTool(tool.id, { actions: [...tool.actions, { id: uid('ta'), label: '', feedback: '' }] })}
                  >
                    + Add an action
                  </MiniButton>
                </fieldset>
              </>
            )}
          </div>
        ))}
        <MiniButton
          tone="primary"
          onClick={() => {
            const t: Tool_ = {
              id: uid('tl'),
              name: 'Walkie-talkie',
              icon: 'radio',
              description: '',
              actions: [{ id: uid('ta'), label: '', feedback: '' }],
            };
            onChange({ ...block, tools: [...block.tools, t] });
            setOpenTool(t.id);
          }}
        >
          + Give the learner a tool
        </MiniButton>
      </fieldset>

      {/* ---------- Scenes ---------- */}
      <fieldset className="ed-group">
        <legend>Moments (the scenes of your story)</legend>
        {block.scenes.map((scene) => (
          <div key={scene.id} className={`ed-subcard${scene.isEnding ? ' ed-subcard-ending' : ''}`}>
            <Row>
              <button type="button" className="ed-disclose" aria-expanded={openScene === scene.id} onClick={() => setOpenScene(openScene === scene.id ? null : scene.id)}>
                {openScene === scene.id ? '▾' : '▸'} {scene.title || '(untitled moment)'}
                {scene.isEnding && <span className="ed-tag"> ending</span>}
                {block.startSceneId === scene.id && <span className="ed-tag ed-tag-start"> start</span>}
              </button>
              <MiniButton tone="danger" ariaLabel={`Remove ${scene.title}`} disabled={block.scenes.length <= 1} onClick={() => removeScene(scene.id)}>
                Remove
              </MiniButton>
            </Row>
            {openScene === scene.id && (
              <>
                <TextField label="Moment title" value={scene.title} onChange={(v) => updateScene(scene.id, { title: v })} />
                <AreaField
                  label="What is happening? (written to the learner)"
                  rows={4}
                  hint='"The evacuation tone starts mid-sentence. Through the glass you see grey haze..."'
                  value={scene.narrative}
                  onChange={(v) => updateScene(scene.id, { narrative: v })}
                />
                <TextField
                  label="What do they hear? (optional)"
                  hint="Described sound builds immersion and works for every learner, hearing or not."
                  value={scene.ambient ?? ''}
                  onChange={(v) => updateScene(scene.id, { ambient: v || undefined })}
                />
                <ImagePicker
                  label="Background image (optional)"
                  value={scene.image?.src ?? ''}
                  onChange={(src) =>
                    updateScene(scene.id, { image: src ? { src, alt: scene.image?.alt ?? '', decorative: true } : undefined })
                  }
                />
                <CheckField
                  label="This moment ends the scenario"
                  checked={scene.isEnding ?? false}
                  onChange={(v) => updateScene(scene.id, { isEnding: v || undefined, endingType: v ? scene.endingType ?? 'mixed' : undefined })}
                />
                {scene.isEnding ? (
                  <>
                    <SelectField
                      label="How did it end?"
                      value={scene.endingType ?? 'mixed'}
                      options={[
                        { value: 'safe', label: 'Safe — things went well' },
                        { value: 'mixed', label: 'Mixed — okay, but close' },
                        { value: 'unsafe', label: 'Unsafe — this went badly' },
                      ]}
                      onChange={(v) => updateScene(scene.id, { endingType: v as Scene_['endingType'] })}
                    />
                    <AreaField
                      label="Debrief — coach the learner"
                      rows={3}
                      hint="What should they take away from ending up here?"
                      value={scene.debrief ?? ''}
                      onChange={(v) => updateScene(scene.id, { debrief: v || undefined })}
                    />
                  </>
                ) : (
                  <>
                    <NumberField
                      label="Time pressure (seconds, optional)"
                      hint="Leave empty for no timer. Learners can always pause it — that's an accessibility requirement, and it stays."
                      min={5}
                      max={600}
                      value={scene.timerSeconds ?? ''}
                      onChange={(v) => updateScene(scene.id, { timerSeconds: v === '' ? undefined : v })}
                    />
                    {scene.timerSeconds && (
                      <SelectField
                        label="If time runs out, what happens?"
                        value={scene.timerGoTo ?? sceneOptions[0]?.value ?? ''}
                        options={sceneOptions}
                        onChange={(v) => updateScene(scene.id, { timerGoTo: v })}
                      />
                    )}
                    <fieldset className="ed-group">
                      <legend>Choices — what can they do?</legend>
                      {scene.choices.map((c, i) => (
                        <div key={c.id} className="ed-subcard">
                          <Row>
                            <strong>Choice {i + 1}</strong>
                            <MiniButton tone="danger" ariaLabel={`Remove choice ${i + 1}`} onClick={() => updateScene(scene.id, { choices: scene.choices.filter((_, j) => j !== i) })}>
                              Remove
                            </MiniButton>
                          </Row>
                          <TextField label="The choice, as the learner reads it" value={c.label} onChange={(v) => updateChoice(scene.id, i, { label: v })} />
                          <SelectField label="Where does it take them?" value={c.goTo} options={sceneOptions} onChange={(v) => updateChoice(scene.id, i, { goTo: v })} />
                          <SelectField label="How good a move is this?" value={c.quality} options={QUALITY_OPTIONS} onChange={(v) => updateChoice(scene.id, i, { quality: v as Choice_['quality'] })} />
                          <AreaField
                            label="Instant feedback (optional)"
                            rows={2}
                            hint="Shown for a beat before the story continues. Leave empty to cut straight to the next moment."
                            value={c.feedback ?? ''}
                            onChange={(v) => updateChoice(scene.id, i, { feedback: v || undefined })}
                          />
                        </div>
                      ))}
                      <MiniButton
                        tone="primary"
                        onClick={() =>
                          updateScene(scene.id, {
                            choices: [...scene.choices, { id: uid('c'), label: '', goTo: block.scenes[0].id, quality: 'ok' }],
                          })
                        }
                      >
                        + Add a choice
                      </MiniButton>
                    </fieldset>
                  </>
                )}
              </>
            )}
          </div>
        ))}
        <MiniButton tone="primary" onClick={addScene}>
          + Add a moment
        </MiniButton>
      </fieldset>
    </div>
  );
}
