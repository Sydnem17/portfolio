import { z } from 'zod';

/**
 * The single source of truth: one JSON content model feeds the editor,
 * the live preview, the standalone HTML export and the SCORM package.
 *
 * Design constraints baked in from day one:
 * - Every image requires alt text (or an explicit "decorative" flag).
 * - Block ids are short (they end up in SCORM suspend_data, which is
 *   capped at 4,096 chars in SCORM 1.2).
 */

export const ImageRef = z.object({
  src: z.string(),
  alt: z.string(),
  decorative: z.boolean().optional(),
});
export type ImageRef = z.infer<typeof ImageRef>;

export const TextBlock = z.object({
  type: z.literal('text'),
  id: z.string(),
  heading: z.string().optional(),
  body: z.string(), // paragraphs separated by blank lines; **bold** and *italic* supported
});

export const ImageBlock = z.object({
  type: z.literal('image'),
  id: z.string(),
  image: ImageRef,
  caption: z.string().optional(),
});

export const McqOption = z.object({
  text: z.string(),
  correct: z.boolean(),
  feedback: z.string(), // per-option feedback — the workhorse of good MCQs
});

export const McqBlock = z.object({
  type: z.literal('mcq'),
  id: z.string(),
  question: z.string(),
  options: z.array(McqOption).min(2),
  shuffle: z.boolean().optional(),
});

export const AccordionBlock = z.object({
  type: z.literal('accordion'),
  id: z.string(),
  items: z.array(z.object({ title: z.string(), body: z.string() })).min(1),
});

export const FlipCardsBlock = z.object({
  type: z.literal('flipcards'),
  id: z.string(),
  cards: z.array(z.object({ front: z.string(), back: z.string() })).min(1),
});

/* ---------------- Immersive scenario ---------------- */

export const ToolAction = z.object({
  id: z.string(),
  label: z.string(), // e.g. "Radio: report your location"
  feedback: z.string(), // what happens when the learner does it
  setsFlags: z.array(z.string()).optional(),
  onlyInScenes: z.array(z.string()).optional(), // scene ids; empty/omitted = everywhere
  quality: z.enum(['best', 'ok', 'poor']).optional(),
});

export const Tool = z.object({
  id: z.string(),
  name: z.string(), // e.g. "Walkie-talkie"
  icon: z.enum(['radio', 'phone', 'flashlight', 'map', 'firstaid', 'keys', 'custom']).default('custom'),
  description: z.string(),
  actions: z.array(ToolAction).min(1),
});

export const Choice = z.object({
  id: z.string(),
  label: z.string(),
  goTo: z.string(), // scene id
  feedback: z.string().optional(), // shown briefly before moving on
  quality: z.enum(['best', 'ok', 'poor']).default('ok'),
  requiresFlag: z.string().optional(), // only shown once a flag is set
  setsFlags: z.array(z.string()).optional(),
});

export const Scene = z.object({
  id: z.string(),
  title: z.string(),
  narrative: z.string(), // second-person POV text: "You hear the alarm..."
  image: ImageRef.optional(),
  ambient: z.string().optional(), // described sounds, announced to all learners (captions-first)
  timerSeconds: z.number().int().positive().optional(),
  timerGoTo: z.string().optional(), // scene to jump to if time runs out
  choices: z.array(Choice),
  isEnding: z.boolean().optional(),
  endingType: z.enum(['safe', 'unsafe', 'mixed']).optional(),
  debrief: z.string().optional(), // coaching shown at an ending
});

export const ScenarioBlock = z.object({
  type: z.literal('scenario'),
  id: z.string(),
  title: z.string(),
  intro: z.string(),
  startSceneId: z.string(),
  tools: z.array(Tool),
  scenes: z.array(Scene).min(1),
});

export const Block = z.discriminatedUnion('type', [
  TextBlock,
  ImageBlock,
  McqBlock,
  AccordionBlock,
  FlipCardsBlock,
  ScenarioBlock,
]);
export type Block = z.infer<typeof Block>;
export type BlockType = Block['type'];

export const Page = z.object({
  id: z.string(),
  title: z.string(),
  blocks: z.array(Block),
});
export type Page = z.infer<typeof Page>;

export const Course = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  passingScore: z.number().min(0).max(100).default(80),
  pages: z.array(Page).min(1),
});
export type Course = z.infer<typeof Course>;

export type Scene_ = z.infer<typeof Scene>;
export type Choice_ = z.infer<typeof Choice>;
export type Tool_ = z.infer<typeof Tool>;
export type ToolAction_ = z.infer<typeof ToolAction>;
export type ScenarioBlock_ = Extract<Block, { type: 'scenario' }>;
export type McqBlock_ = Extract<Block, { type: 'mcq' }>;

let counter = 0;
/** Short unique ids — they live inside SCORM suspend_data, keep them tiny. */
export function uid(prefix = 'b'): string {
  counter = (counter + 1) % 1296;
  return `${prefix}${Date.now().toString(36).slice(-4)}${counter.toString(36)}`;
}

export function validateCourse(data: unknown): { ok: true; course: Course } | { ok: false; error: string } {
  const parsed = Course.safeParse(data);
  if (parsed.success) return { ok: true, course: parsed.data };
  const first = parsed.error.issues[0];
  return { ok: false, error: `${first.path.join('.')}: ${first.message}` };
}
