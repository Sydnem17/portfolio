import React, { useRef, useState } from 'react';
import type { Block } from '../schema/course';
import { uid } from '../schema/course';
import { TextField, AreaField, MiniButton, Row } from './fields';
import { ImagePicker } from './ImagePicker';

type HotspotB = Extract<Block, { type: 'hotspot' }>;

/**
 * Hotspot authoring with click-to-place: pick a spot, click the picture,
 * done. No coordinates to type (they're still editable data underneath).
 */
export function HotspotForm({ block, onChange }: { block: HotspotB; onChange: (b: Block) => void }) {
  const [placing, setPlacing] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  function placeAt(e: React.MouseEvent) {
    if (!placing || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onChange({
      ...block,
      spots: block.spots.map((s) => (s.id === placing ? { ...s, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } : s)),
    });
    setPlacing(null);
  }

  return (
    <>
      <TextField
        label="What should the learner do?"
        hint='e.g. "Explore the floor plan — find all the fire safety equipment."'
        value={block.prompt}
        onChange={(v) => onChange({ ...block, prompt: v })}
      />
      <ImagePicker label="The picture to explore" value={block.image.src} onChange={(src) => onChange({ ...block, image: { ...block.image, src } })} />
      <AreaField
        label="Describe this picture for people who can't see it"
        rows={2}
        value={block.image.alt}
        onChange={(v) => onChange({ ...block, image: { ...block.image, alt: v } })}
      />

      {block.image.src && (
        <div className="ed-field">
          <label>Place the spots</label>
          <p className="ed-hint">
            {placing
              ? 'Now click the picture where this spot belongs.'
              : 'Press "Place" next to a spot, then click the picture. Numbers show where each spot sits.'}
          </p>
          <div
            ref={stageRef}
            className={`ed-spot-stage${placing ? ' is-placing' : ''}`}
            onClick={placeAt}
            role="presentation"
          >
            <img src={block.image.src} alt="" />
            {block.spots.map((s, i) => (
              <span key={s.id} className={`ed-spot-pin${placing === s.id ? ' is-selected' : ''}`} style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      )}

      <fieldset className="ed-group">
        <legend>Spots</legend>
        {block.spots.map((s, i) => (
          <div key={s.id} className="ed-subcard">
            <Row>
              <strong>Spot {i + 1}</strong>
              <span>
                <MiniButton tone="primary" ariaLabel={`Place spot ${i + 1} on the picture`} onClick={() => setPlacing(placing === s.id ? null : s.id)}>
                  {placing === s.id ? 'Click the picture…' : 'Place'}
                </MiniButton>{' '}
                <MiniButton
                  tone="danger"
                  ariaLabel={`Remove spot ${i + 1}`}
                  disabled={block.spots.length <= 1}
                  onClick={() => onChange({ ...block, spots: block.spots.filter((x) => x.id !== s.id) })}
                >
                  Remove
                </MiniButton>
              </span>
            </Row>
            <TextField
              label="Name (what is here?)"
              hint='Read aloud by screen readers — e.g. "Fire extinguisher by the lift".'
              value={s.label}
              onChange={(v) => onChange({ ...block, spots: block.spots.map((x) => (x.id === s.id ? { ...x, label: v } : x)) })}
            />
            <AreaField
              label="What the learner discovers"
              rows={2}
              value={s.feedback}
              onChange={(v) => onChange({ ...block, spots: block.spots.map((x) => (x.id === s.id ? { ...x, feedback: v } : x)) })}
            />
          </div>
        ))}
        <MiniButton
          tone="primary"
          onClick={() => onChange({ ...block, spots: [...block.spots, { id: uid('h'), x: 50, y: 50, label: '', feedback: '' }] })}
        >
          + Add a spot
        </MiniButton>
      </fieldset>
    </>
  );
}
