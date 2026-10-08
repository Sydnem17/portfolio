/**
 * Lightweight SCORM 1.2 content-side bridge.
 *
 * The LMS provides `window.API`; content only needs to *find* it (walking
 * parent/opener frames, pipwerks-style) and speak the 1.2 data model. When
 * no LMS is present (standalone HTML export, local preview) every call is a
 * silent no-op and progress falls back to localStorage.
 *
 * suspend_data is capped at 4,096 chars in SCORM 1.2 and overflow is
 * silently truncated by many LMSs — so the saved state uses single-letter
 * keys and degrades gracefully (decision-log detail is dropped first).
 */

export interface SavedState {
  v: 1;
  p: number; // current page index
  vv: number; // visited pages bitmask (page 0 = bit 0)
  mc: Record<string, number[]>; // mcq blockId -> selected option indexes
  sn: Record<string, { e?: string; q?: [number, number, number]; f?: string[] }>;
  // scenario blockId -> ending scene id, [best, ok, poor] counts, flags
}

export function emptyState(): SavedState {
  return { v: 1, p: 0, vv: 0, mc: {}, sn: {} };
}

interface Scorm12API {
  LMSInitialize(arg: string): string;
  LMSFinish(arg: string): string;
  LMSGetValue(key: string): string;
  LMSSetValue(key: string, value: string): string;
  LMSCommit(arg: string): string;
  LMSGetLastError(): string;
}

const MAX_SUSPEND = 4096;
const LOCAL_KEY = 'immerse-progress';

function findAPI(win: Window): Scorm12API | null {
  let w: Window = win;
  for (let i = 0; i < 10; i++) {
    try {
      if ((w as any).API) return (w as any).API as Scorm12API;
      if (w.parent && w.parent !== w) {
        w = w.parent;
        continue;
      }
    } catch {
      break; // cross-origin wall
    }
    break;
  }
  try {
    if (win.opener && (win.opener as any).API) return (win.opener as any).API as Scorm12API;
  } catch {
    /* cross-origin */
  }
  return null;
}

export class ScormBridge {
  private api: Scorm12API | null = null;
  private initialized = false;
  private courseId: string;

  constructor(courseId: string) {
    this.courseId = courseId;
  }

  get connected(): boolean {
    return this.initialized;
  }

  init(): void {
    this.api = typeof window !== 'undefined' ? findAPI(window) : null;
    if (this.api) {
      this.initialized = this.api.LMSInitialize('') === 'true';
      if (this.initialized) {
        const status = this.api.LMSGetValue('cmi.core.lesson_status');
        if (status === 'not attempted' || status === '') {
          this.api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
          this.api.LMSCommit('');
        }
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.finish());
    }
  }

  restore(): SavedState {
    let raw = '';
    if (this.initialized && this.api) {
      raw = this.api.LMSGetValue('cmi.suspend_data') || '';
    } else if (typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(`${LOCAL_KEY}-${this.courseId}`) || '';
    }
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === 1) return parsed as SavedState;
    } catch {
      /* corrupt or truncated — start fresh rather than crash */
    }
    return emptyState();
  }

  save(state: SavedState): void {
    let raw = JSON.stringify(state);
    if (raw.length > MAX_SUSPEND) {
      // Degrade: drop flags first, then per-scenario detail beyond endings.
      const slim: SavedState = {
        ...state,
        sn: Object.fromEntries(Object.entries(state.sn).map(([k, s]) => [k, { e: s.e, q: s.q }])),
      };
      raw = JSON.stringify(slim);
      if (raw.length > MAX_SUSPEND) {
        raw = JSON.stringify({ v: 1, p: state.p, vv: state.vv, mc: {}, sn: {} });
      }
    }
    if (this.initialized && this.api) {
      this.api.LMSSetValue('cmi.suspend_data', raw);
      this.api.LMSSetValue('cmi.core.lesson_location', String(state.p));
      this.api.LMSCommit('');
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${LOCAL_KEY}-${this.courseId}`, raw);
    }
  }

  reportScore(percent: number, passed: boolean, complete: boolean): void {
    if (!this.initialized || !this.api) return;
    this.api.LMSSetValue('cmi.core.score.min', '0');
    this.api.LMSSetValue('cmi.core.score.max', '100');
    this.api.LMSSetValue('cmi.core.score.raw', String(Math.round(percent)));
    if (complete) {
      this.api.LMSSetValue('cmi.core.lesson_status', passed ? 'passed' : 'failed');
    }
    this.api.LMSCommit('');
  }

  finish(): void {
    if (this.initialized && this.api) {
      this.api.LMSCommit('');
      this.api.LMSFinish('');
      this.initialized = false;
    }
  }
}
