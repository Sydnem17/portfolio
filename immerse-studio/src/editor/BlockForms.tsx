import React from 'react';
import type { Block } from '../schema/course';
import { TextField, AreaField, CheckField, MiniButton, Row } from './fields';
import { ScenarioForm } from './ScenarioForm';

type Updater = (block: Block) => void;

/** Form-driven editing for every block type — no free canvas, no code. */
export function BlockForm({ block, onChange }: { block: Block; onChange: Updater }) {
  switch (block.type) {
    case 'text':
      return (
        <>
          <TextField label="Heading (optional)" value={block.heading ?? ''} onChange={(v) => onChange({ ...block, heading: v || undefined })} />
          <AreaField
            label="Text"
            rows={7}
            hint="Leave a blank line between paragraphs. Use **bold** and *italic*."
            value={block.body}
            onChange={(v) => onChange({ ...block, body: v })}
          />
        </>
      );

    case 'image':
      return (
        <>
          <TextField
            label="Image address (URL)"
            required
            hint="Paste a link to the image. Uploading files is on the roadmap."
            value={block.image.src}
            onChange={(v) => onChange({ ...block, image: { ...block.image, src: v } })}
          />
          <AreaField
            label="Describe this image for people who can't see it"
            rows={2}
            hint="Say what matters about the picture, as if telling a colleague over the phone."
            value={block.image.alt}
            onChange={(v) => onChange({ ...block, image: { ...block.image, alt: v } })}
          />
          <CheckField
            label="This image is only decoration"
            hint="Tick this only if the image adds nothing a learner needs to know — screen readers will skip it."
            checked={block.image.decorative ?? false}
            onChange={(v) => onChange({ ...block, image: { ...block.image, decorative: v } })}
          />
          {!block.image.decorative && block.image.alt.trim() === '' && (
            <p className="ed-warn" role="status">
              ⚠ This image still needs a description (or mark it as decoration).
            </p>
          )}
          <TextField label="Caption (optional)" value={block.caption ?? ''} onChange={(v) => onChange({ ...block, caption: v || undefined })} />
        </>
      );

    case 'mcq':
      return (
        <>
          <AreaField label="Question" rows={2} value={block.question} onChange={(v) => onChange({ ...block, question: v })} />
          <fieldset className="ed-group">
            <legend>Answer options</legend>
            {block.options.map((opt, i) => (
              <div key={i} className="ed-subcard">
                <Row>
                  <strong>Option {i + 1}</strong>
                  <MiniButton
                    tone="danger"
                    ariaLabel={`Remove option ${i + 1}`}
                    disabled={block.options.length <= 2}
                    onClick={() => onChange({ ...block, options: block.options.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </MiniButton>
                </Row>
                <TextField
                  label="Answer text"
                  value={opt.text}
                  onChange={(v) =>
                    onChange({ ...block, options: block.options.map((o, j) => (j === i ? { ...o, text: v } : o)) })
                  }
                />
                <CheckField
                  label="This is the correct answer"
                  checked={opt.correct}
                  onChange={(v) =>
                    onChange({
                      ...block,
                      // single-answer question: checking one unchecks the rest
                      options: block.options.map((o, j) => ({ ...o, correct: j === i ? v : false })),
                    })
                  }
                />
                <AreaField
                  label="Feedback when a learner picks this"
                  rows={2}
                  hint="Explain *why* — this is where the learning happens."
                  value={opt.feedback}
                  onChange={(v) =>
                    onChange({ ...block, options: block.options.map((o, j) => (j === i ? { ...o, feedback: v } : o)) })
                  }
                />
              </div>
            ))}
            <MiniButton
              tone="primary"
              onClick={() =>
                onChange({ ...block, options: [...block.options, { text: '', correct: false, feedback: '' }] })
              }
            >
              + Add an option
            </MiniButton>
          </fieldset>
          {!block.options.some((o) => o.correct) && (
            <p className="ed-warn" role="status">⚠ Mark one option as correct.</p>
          )}
          <CheckField
            label="Shuffle the options for each learner"
            checked={block.shuffle ?? false}
            onChange={(v) => onChange({ ...block, shuffle: v || undefined })}
          />
        </>
      );

    case 'accordion':
      return (
        <fieldset className="ed-group">
          <legend>Sections (learners tap a title to open it)</legend>
          {block.items.map((item, i) => (
            <div key={i} className="ed-subcard">
              <Row>
                <strong>Section {i + 1}</strong>
                <MiniButton
                  tone="danger"
                  ariaLabel={`Remove section ${i + 1}`}
                  disabled={block.items.length <= 1}
                  onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
                >
                  Remove
                </MiniButton>
              </Row>
              <TextField
                label="Title"
                value={item.title}
                onChange={(v) => onChange({ ...block, items: block.items.map((it, j) => (j === i ? { ...it, title: v } : it)) })}
              />
              <AreaField
                label="Content"
                rows={3}
                value={item.body}
                onChange={(v) => onChange({ ...block, items: block.items.map((it, j) => (j === i ? { ...it, body: v } : it)) })}
              />
            </div>
          ))}
          <MiniButton tone="primary" onClick={() => onChange({ ...block, items: [...block.items, { title: '', body: '' }] })}>
            + Add a section
          </MiniButton>
        </fieldset>
      );

    case 'flipcards':
      return (
        <fieldset className="ed-group">
          <legend>Cards (learners press a card to flip it)</legend>
          {block.cards.map((card, i) => (
            <div key={i} className="ed-subcard">
              <Row>
                <strong>Card {i + 1}</strong>
                <MiniButton
                  tone="danger"
                  ariaLabel={`Remove card ${i + 1}`}
                  disabled={block.cards.length <= 1}
                  onClick={() => onChange({ ...block, cards: block.cards.filter((_, j) => j !== i) })}
                >
                  Remove
                </MiniButton>
              </Row>
              <TextField
                label="Front (short — a word or phrase)"
                value={card.front}
                onChange={(v) => onChange({ ...block, cards: block.cards.map((c, j) => (j === i ? { ...c, front: v } : c)) })}
              />
              <AreaField
                label="Back (the reveal)"
                rows={2}
                value={card.back}
                onChange={(v) => onChange({ ...block, cards: block.cards.map((c, j) => (j === i ? { ...c, back: v } : c)) })}
              />
            </div>
          ))}
          <MiniButton tone="primary" onClick={() => onChange({ ...block, cards: [...block.cards, { front: '', back: '' }] })}>
            + Add a card
          </MiniButton>
        </fieldset>
      );

    case 'scenario':
      return <ScenarioForm block={block} onChange={onChange} />;
  }
}
