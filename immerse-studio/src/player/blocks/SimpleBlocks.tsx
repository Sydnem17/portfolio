import React, { useState } from 'react';
import type { Block } from '../../schema/course';
import { RichText } from '../markdown';

type TextB = Extract<Block, { type: 'text' }>;
type ImageB = Extract<Block, { type: 'image' }>;
type AccordionB = Extract<Block, { type: 'accordion' }>;
type FlipB = Extract<Block, { type: 'flipcards' }>;

export function TextBlockView({ block }: { block: TextB }) {
  return (
    <section className="ip-block ip-text">
      {block.heading && <h2>{block.heading}</h2>}
      <RichText text={block.body} />
    </section>
  );
}

export function ImageBlockView({ block }: { block: ImageB }) {
  const alt = block.image.decorative ? '' : block.image.alt;
  return (
    <figure className="ip-block ip-image">
      <img src={block.image.src} alt={alt} />
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}

/** Native disclosure widgets: keyboard and screen-reader behaviour for free. */
export function AccordionBlockView({ block }: { block: AccordionB }) {
  return (
    <section className="ip-block ip-accordion">
      {block.items.map((item, i) => (
        <details key={i}>
          <summary>{item.title}</summary>
          <div className="ip-accordion-body">
            <RichText text={item.body} />
          </div>
        </details>
      ))}
    </section>
  );
}

/**
 * Flip cards as toggle buttons — no hover-only trigger, content stays in DOM
 * order for screen readers, state announced via aria-pressed.
 */
export function FlipCardsBlockView({ block }: { block: FlipB }) {
  const [flipped, setFlipped] = useState<boolean[]>(() => block.cards.map(() => false));
  return (
    <section className="ip-block ip-flipcards">
      <ul className="ip-flip-grid">
        {block.cards.map((card, i) => (
          <li key={i}>
            <button
              type="button"
              className={`ip-flipcard${flipped[i] ? ' is-flipped' : ''}`}
              aria-pressed={flipped[i]}
              onClick={() => setFlipped((f) => f.map((v, j) => (j === i ? !v : v)))}
            >
              <span className="ip-flip-face ip-flip-front" aria-hidden={flipped[i]}>
                {card.front}
              </span>
              <span className="ip-flip-face ip-flip-back" aria-hidden={!flipped[i]}>
                {card.back}
              </span>
              <span className="ip-visually-hidden">
                {flipped[i] ? 'Showing back. Press to flip to front.' : 'Showing front. Press to flip.'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
