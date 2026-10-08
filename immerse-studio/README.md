# Immerse Studio

**Courses your learners *live*, not just click through — built by anyone, no degree required.**

Immerse Studio is an eLearning authoring tool with two convictions:

1. **Learning should feel like being there.** The flagship block is an *immersive scenario*: the learner is dropped into a situation in first person — a fire alarm mid-meeting, smoke in the corridor — with a walkie-talkie on their belt, decisions on a timer, and consequences that branch the story. They don't answer questions *about* radioing for help; they press the radio and do it.
2. **The "boring stuff" still has to be excellent.** Text, images, questions, accordions, flip cards — all present, all accessible by default, all editable through plain-language forms. If you can fill in a form, you can build a course.

## Try it

```bash
cd immerse-studio
npm install
npm run dev        # builds the player bundle, then starts the editor at http://localhost:5173
```

Click **"Open the demo course"** — *Fire Emergency Response: You Are There* — to see every block type, then hit **▶ Preview** and play the scenario on page 2.

## What works today (MVP)

- **Block-based, no-code editor** — vertical stack of blocks per page, configured through forms (the Rise/Notion pattern, not a free canvas). Plain-language prompts: "What is happening?", "Where does that take them?", "How good a move is this?"
- **Immersive scenario engine** — POV narrative scenes, described ambient sound (captions-first), timed decisions with an always-available *"I need more time"* pause, tools the learner can use anywhere (walkie-talkie, phone, torch…), flags/consequences, branching, quality-scored decisions, and an ending debrief that replays their choice path.
- **Classic blocks** — text, image (alt text required or explicitly decorative), single-answer MCQ with per-option feedback, accordion (`<details>/<summary>`), keyboard-operable flip cards, and hotspots (explore-an-image with click-to-place authoring, ≥24 px keyboard-focusable targets, and a text-list alternative).
- **Image uploads** — pick a file anywhere an image is used (image block, hotspot picture, scenario backgrounds); it's embedded as a data URI so exports stay fully self-contained.
- **Live preview** — the preview renders the *actual* learner player component. What you preview is byte-for-byte what exports.
- **Exports** (all generated in the browser, nothing to host):
  - **Standalone HTML** — one self-contained file; runs from a double-click, saves progress to localStorage.
  - **SCORM 1.2 zip** — `imsmanifest.xml` at the zip root, single self-contained SCO, completion + score + compact `suspend_data` (designed for the 4,096-char SCORM 1.2 cap, degrading gracefully rather than truncating).
  - **Course file (.json)** — the canonical content model; re-opens in the studio.
- **Authoring guardrails** — live warnings for missing alt text, questions with no correct answer, scenarios with no ending, and choices that lead nowhere.

## Architecture (single source → many targets)

```
JSON course model (Zod-validated, src/schema/course.ts)
        │
        ▼
One React renderer (src/player/) ──► editor live preview
        │
        ├─ built once as a self-contained IIFE bundle (vite.player.config.ts)
        │
        ├──► standalone .html  (JSON + player inlined into one file)
        └──► SCORM 1.2 .zip    (same file + generated imsmanifest.xml)
```

- The player finds `window.API` by walking the LMS frame chain (pipwerks-style discovery); with no LMS present every SCORM call is a silent no-op and localStorage takes over — so one artifact works in both worlds.
- Scoring: MCQs are worth 1 point; a scenario is worth 2, scaled by decision quality (best = 1, ok = 0.5, poor = 0). Completion = every page visited + every activity attempted; pass/fail against the course pass mark, reported as `cmi.core.lesson_status` and `cmi.core.score.raw`.

## Accessibility is the product

- **Output:** visible focus everywhere, ≥24 px targets, native HTML first (`fieldset/legend` radios, `details/summary`), `aria-live` feedback, keyboard-only playable scenarios, timers that pause (WCAG 2.2.1), ambient audio expressed as text first, `prefers-reduced-motion` respected.
- **Authoring UI:** every field labelled, hints wired via `aria-describedby`, disclosure buttons with real states — the editor is held to the same bar as the output (ATAG Part A), and its guardrails (alt-text nudges, broken-branch warnings) are ATAG Part B in action.

## Roadmap

| Phase | What |
|---|---|
| Next | Drag-and-drop block (with non-drag alternative), scenario meters (stress/time budget), sound effect hooks behind a captions-always toggle |
| Then | SCORM 2004 export (64 KB suspend_data headroom), PDF export via print pipeline, SCORM Cloud + LMS test pass, themes |
| Later | AI assist (draft-to-blocks, alt-text suggestions, distractor generation — always human-confirmed), xAPI/cmi5, collaboration, PDF/UA tagging |

## Testing an export

Upload the SCORM zip **as-is** (never unzip it) to [SCORM Cloud](https://cloud.scorm.com) (free) and confirm completion, score and resume; then test in your real LMS. The standalone HTML needs no server at all.
