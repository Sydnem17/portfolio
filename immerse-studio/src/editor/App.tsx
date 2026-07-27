import React, { useEffect, useRef, useState } from 'react';
import type { Course, Block, BlockType, Page } from '../schema/course';
import { uid, validateCourse } from '../schema/course';
import { sampleCourse, blankCourse } from '../schema/sample';
import { Player } from '../player/Player';
import { BlockForm } from './BlockForms';
import { TextField, NumberField, MiniButton, Row } from './fields';
import { exportStandaloneHtml } from '../export/standaloneHtml';
import { exportScorm12 } from '../export/scorm12';
import { downloadBlob, safeFilename } from '../export/download';

const DRAFT_KEY = 'immerse-studio-draft';

const BLOCK_MENU: { type: BlockType; name: string; blurb: string }[] = [
  { type: 'text', name: 'Text', blurb: 'Headings and paragraphs — the backbone.' },
  { type: 'image', name: 'Image', blurb: 'A picture with a proper description.' },
  { type: 'mcq', name: 'Question', blurb: 'Multiple choice with feedback on every answer.' },
  { type: 'accordion', name: 'Accordion', blurb: 'Tap-to-open sections for reference detail.' },
  { type: 'flipcards', name: 'Flip cards', blurb: 'Reveal cards for terms and concepts.' },
  { type: 'hotspot', name: 'Hotspots', blurb: 'An image learners explore — click the spots, discover what’s there.' },
  { type: 'scenario', name: 'Immersive scenario', blurb: 'Put the learner IN the situation — POV story, timers, tools, branching choices.' },
];

function newBlock(type: BlockType): Block {
  const id = uid();
  switch (type) {
    case 'text':
      return { type, id, body: '' };
    case 'image':
      return { type, id, image: { src: '', alt: '' } };
    case 'mcq':
      return {
        type,
        id,
        question: '',
        options: [
          { text: '', correct: true, feedback: '' },
          { text: '', correct: false, feedback: '' },
        ],
      };
    case 'accordion':
      return { type, id, items: [{ title: '', body: '' }] };
    case 'flipcards':
      return { type, id, cards: [{ front: '', back: '' }] };
    case 'hotspot':
      return {
        type,
        id,
        prompt: '',
        image: { src: '', alt: '' },
        spots: [{ id: uid('h'), x: 50, y: 50, label: '', feedback: '' }],
      };
    case 'scenario': {
      const start = uid('sc');
      const end = uid('sc');
      return {
        type,
        id,
        title: 'New scenario',
        intro: '',
        startSceneId: start,
        tools: [],
        scenes: [
          { id: start, title: 'Opening moment', narrative: '', choices: [{ id: uid('c'), label: '', goTo: end, quality: 'ok' }] },
          { id: end, title: 'The end', narrative: '', choices: [], isEnding: true, endingType: 'mixed' },
        ],
      };
    }
  }
}

export function App() {
  const [course, setCourse] = useState<Course | null>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const res = validateCourse(JSON.parse(raw));
        if (res.ok) return res.course;
      }
    } catch {
      /* fall through to start screen */
    }
    return null;
  });
  const [pageIdx, setPageIdx] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Autosave draft
  useEffect(() => {
    if (course) localStorage.setItem(DRAFT_KEY, JSON.stringify(course));
  }, [course]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!course) {
    return (
      <div className="ed-start">
        <h1>Immerse Studio</h1>
        <p className="ed-tagline">
          Courses your learners <em>live</em>, not just click through — built by anyone, no degree required.
        </p>
        <div className="ed-start-cards">
          <button type="button" className="ed-start-card" onClick={() => setCourse(structuredClone(sampleCourse))}>
            <strong>Open the demo course</strong>
            <span>“Fire Emergency Response: You Are There” — see an immersive POV scenario with a working walkie-talkie, plus every classic block.</span>
          </button>
          <button type="button" className="ed-start-card" onClick={() => setCourse(blankCourse())}>
            <strong>Start from scratch</strong>
            <span>A blank course with one empty page.</span>
          </button>
          <button type="button" className="ed-start-card" onClick={() => fileRef.current?.click()}>
            <strong>Open a saved course file</strong>
            <span>Load a .json course you exported earlier.</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="ip-visually-hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const res = validateCourse(JSON.parse(await f.text()));
              if (res.ok) setCourse(res.course);
              else alert(`That file isn't a valid course: ${res.error}`);
            } catch {
              alert("That file couldn't be read as a course.");
            }
          }}
        />
      </div>
    );
  }

  const page = course.pages[Math.min(pageIdx, course.pages.length - 1)];

  function updatePage(patch: Partial<Page>) {
    setCourse((c) => c && { ...c, pages: c.pages.map((p, i) => (i === pageIdx ? { ...p, ...patch } : p)) });
  }

  function updateBlock(updated: Block) {
    updatePage({ blocks: page.blocks.map((b) => (b.id === updated.id ? updated : b)) });
  }

  function addBlock(type: BlockType) {
    const b = newBlock(type);
    updatePage({ blocks: [...page.blocks, b] });
    setSelectedBlock(b.id);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = page.blocks.findIndex((b) => b.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= page.blocks.length) return;
    const blocks = [...page.blocks];
    [blocks[idx], blocks[j]] = [blocks[j], blocks[idx]];
    updatePage({ blocks });
  }

  async function doExport(kind: 'html' | 'scorm' | 'json') {
    if (!course) return;
    setBusy(kind);
    try {
      const name = safeFilename(course.title);
      if (kind === 'json') {
        downloadBlob(new Blob([JSON.stringify(course, null, 2)], { type: 'application/json' }), `${name}.json`);
        setToast('Course file saved. Keep it — it re-opens in Immerse Studio.');
      } else if (kind === 'html') {
        downloadBlob(await exportStandaloneHtml(course), `${name}.html`);
        setToast('Standalone web page saved. Open it in any browser, or host it anywhere.');
      } else {
        downloadBlob(await exportScorm12(course), `${name}-scorm12.zip`);
        setToast('SCORM 1.2 package saved. Upload the .zip to your LMS as-is — don’t unzip it first.');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  }

  const blockName = (b: Block) => BLOCK_MENU.find((m) => m.type === b.type)?.name ?? b.type;
  const blockLabel = (b: Block) => {
    switch (b.type) {
      case 'text':
        return b.heading || b.body.slice(0, 40) || 'Empty text';
      case 'image':
        return b.image.alt || b.image.src.split('/').pop() || 'Image';
      case 'mcq':
        return b.question.slice(0, 40) || 'Untitled question';
      case 'accordion':
        return `${b.items.length} section${b.items.length === 1 ? '' : 's'}`;
      case 'flipcards':
        return `${b.cards.length} card${b.cards.length === 1 ? '' : 's'}`;
      case 'hotspot':
        return b.prompt.slice(0, 40) || `${b.spots.length} spot${b.spots.length === 1 ? '' : 's'}`;
      case 'scenario':
        return b.title;
    }
  };
  const editing = selectedBlock ? page.blocks.find((b) => b.id === selectedBlock) : null;

  return (
    <div className="ed-app">
      <header className="ed-topbar">
        <div className="ed-brand">Immerse Studio</div>
        <input
          className="ed-course-title"
          aria-label="Course title"
          value={course.title}
          onChange={(e) => setCourse({ ...course, title: e.target.value })}
        />
        <div className="ed-actions">
          <button type="button" className="ed-btn" onClick={() => { setPreviewNonce((n) => n + 1); setPreviewOpen(true); }}>
            ▶ Preview
          </button>
          <button type="button" className="ed-btn" disabled={busy !== null} onClick={() => doExport('json')}>
            Save course file
          </button>
          <button type="button" className="ed-btn" disabled={busy !== null} onClick={() => doExport('html')}>
            {busy === 'html' ? 'Exporting…' : 'Export web page'}
          </button>
          <button type="button" className="ed-btn ed-btn-primary" disabled={busy !== null} onClick={() => doExport('scorm')}>
            {busy === 'scorm' ? 'Packaging…' : 'Export SCORM 1.2'}
          </button>
          <button
            type="button"
            className="ed-btn ed-btn-quiet"
            onClick={() => {
              if (confirm('Close this course? Your draft stays saved in this browser until you start another one.')) {
                setCourse(null);
                setSelectedBlock(null);
                setPageIdx(0);
              }
            }}
          >
            Close
          </button>
        </div>
      </header>

      <div className="ed-body">
        {/* ---- Pages sidebar ---- */}
        <nav className="ed-pages" aria-label="Pages">
          <h2>Pages</h2>
          <ol>
            {course.pages.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`ed-page-item${i === pageIdx ? ' is-current' : ''}`}
                  aria-current={i === pageIdx ? 'page' : undefined}
                  onClick={() => { setPageIdx(i); setSelectedBlock(null); }}
                >
                  {p.title || `Page ${i + 1}`}
                </button>
              </li>
            ))}
          </ol>
          <MiniButton
            tone="primary"
            onClick={() => {
              setCourse({ ...course, pages: [...course.pages, { id: uid('p'), title: `Page ${course.pages.length + 1}`, blocks: [] }] });
              setPageIdx(course.pages.length);
              setSelectedBlock(null);
            }}
          >
            + Add a page
          </MiniButton>
          {course.pages.length > 1 && (
            <MiniButton
              tone="danger"
              onClick={() => {
                if (!confirm(`Delete "${page.title}" and everything on it?`)) return;
                const pages = course.pages.filter((_, i) => i !== pageIdx);
                setCourse({ ...course, pages });
                setPageIdx(Math.max(0, pageIdx - 1));
                setSelectedBlock(null);
              }}
            >
              Delete this page
            </MiniButton>
          )}
          <div className="ed-course-settings">
            <h2>Course settings</h2>
            <NumberField
              label="Pass mark (%)"
              min={0}
              max={100}
              value={course.passingScore}
              onChange={(v) => setCourse({ ...course, passingScore: v === '' ? 80 : v })}
            />
          </div>
        </nav>

        {/* ---- Page canvas ---- */}
        <main className="ed-canvas" aria-label="Page content">
          <TextField label="Page title" value={page.title} onChange={(v) => updatePage({ title: v })} />
          <h2 className="ed-canvas-h">Blocks on this page</h2>
          {page.blocks.length === 0 && <p className="ed-hint">Nothing here yet — add your first block below.</p>}
          <ol className="ed-blocklist">
            {page.blocks.map((b, i) => (
              <li key={b.id} className={`ed-blockrow${selectedBlock === b.id ? ' is-selected' : ''}`}>
                <button type="button" className="ed-blockrow-main" onClick={() => setSelectedBlock(selectedBlock === b.id ? null : b.id)} aria-expanded={selectedBlock === b.id}>
                  <span className={`ed-blocktype ed-blocktype-${b.type}`}>{blockName(b)}</span>
                  <span className="ed-blocklabel">{blockLabel(b)}</span>
                </button>
                <span className="ed-blockrow-tools">
                  <MiniButton ariaLabel={`Move ${blockName(b)} up`} disabled={i === 0} onClick={() => moveBlock(b.id, -1)}>↑</MiniButton>
                  <MiniButton ariaLabel={`Move ${blockName(b)} down`} disabled={i === page.blocks.length - 1} onClick={() => moveBlock(b.id, 1)}>↓</MiniButton>
                  <MiniButton
                    tone="danger"
                    ariaLabel={`Delete ${blockName(b)}`}
                    onClick={() => {
                      if (confirm(`Delete this ${blockName(b)} block?`)) {
                        updatePage({ blocks: page.blocks.filter((x) => x.id !== b.id) });
                        if (selectedBlock === b.id) setSelectedBlock(null);
                      }
                    }}
                  >
                    ✕
                  </MiniButton>
                </span>
              </li>
            ))}
          </ol>
          <div className="ed-addmenu">
            <h3>Add a block</h3>
            <div className="ed-addgrid">
              {BLOCK_MENU.map((m) => (
                <button key={m.type} type="button" className={`ed-addcard${m.type === 'scenario' ? ' ed-addcard-hero' : ''}`} onClick={() => addBlock(m.type)}>
                  <strong>{m.name}</strong>
                  <span>{m.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* ---- Block editor panel ---- */}
        <aside className="ed-inspector" aria-label="Block settings">
          {editing ? (
            <>
              <Row>
                <h2>Editing: {blockName(editing)}</h2>
                <MiniButton onClick={() => setSelectedBlock(null)} ariaLabel="Close block settings">Done</MiniButton>
              </Row>
              <BlockForm block={editing} onChange={updateBlock} />
            </>
          ) : (
            <div className="ed-inspector-empty">
              <h2>Block settings</h2>
              <p className="ed-hint">Select a block on the page to edit it here. Everything is a simple form — if you can fill in a form, you can build this course.</p>
            </div>
          )}
        </aside>
      </div>

      {previewOpen && (
        <div className="ed-preview-overlay" role="dialog" aria-modal="true" aria-label="Course preview">
          <div className="ed-preview-bar">
            <strong>Preview — exactly what your learners get</strong>
            <button type="button" className="ed-btn" onClick={() => setPreviewOpen(false)}>
              ✕ Close preview
            </button>
          </div>
          <div className="ed-preview-frame">
            <Player key={previewNonce} course={course} standalone={false} />
          </div>
        </div>
      )}

      {toast && (
        <div className="ed-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
