import React, { useState } from 'react';
import type { Block } from '../../schema/course';

type HotspotB = Extract<Block, { type: 'hotspot' }>;

/**
 * Explore-an-image. Every spot is a real button ≥24px (WCAG 2.5.8),
 * keyboard reachable in DOM order, discoveries announced via aria-live —
 * and the same spots are offered as a plain text list for anyone who
 * prefers (or needs) it.
 */
export function HotspotBlockView({ block }: { block: HotspotB }) {
  const [found, setFound] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);

  const activeSpot = block.spots.find((s) => s.id === active);
  const allFound = found.size === block.spots.length;

  function open(id: string) {
    setActive(id);
    setFound((f) => new Set(f).add(id));
  }

  return (
    <section className="ip-block ip-hotspot">
      <p className="ip-hotspot-prompt">
        <strong>{block.prompt}</strong>{' '}
        <span className="ip-hotspot-count" aria-live="polite">
          ({found.size} of {block.spots.length} found{allFound ? ' — all done!' : ''})
        </span>
      </p>
      <div className="ip-hotspot-stage">
        <img src={block.image.src} alt={block.image.decorative ? '' : block.image.alt} />
        {block.spots.map((spot, i) => (
          <button
            key={spot.id}
            type="button"
            className={`ip-spot${found.has(spot.id) ? ' is-found' : ''}${active === spot.id ? ' is-active' : ''}`}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            aria-label={`${spot.label}${found.has(spot.id) ? ' (found)' : ''}`}
            aria-expanded={active === spot.id}
            onClick={() => (active === spot.id ? setActive(null) : open(spot.id))}
          >
            <span aria-hidden="true">{found.has(spot.id) ? '✓' : i + 1}</span>
          </button>
        ))}
      </div>
      <div aria-live="polite" role="status">
        {activeSpot && (
          <div className="ip-feedback ip-feedback-good">
            <strong>{activeSpot.label}.</strong> {activeSpot.feedback}
          </div>
        )}
      </div>
      <details className="ip-hotspot-list">
        <summary>Prefer a list? Explore the same spots as text</summary>
        <ul>
          {block.spots.map((spot) => (
            <li key={spot.id}>
              <button type="button" className="ip-btn ip-btn-ghost" onClick={() => open(spot.id)}>
                {found.has(spot.id) ? '✓ ' : ''}
                {spot.label}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
