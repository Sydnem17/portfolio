import type { Course } from '../schema/course';
import { loadPlayerAssets } from './playerAssets';

/** Escape "</script>" sequences so embedded JSON/JS can't break out of its tag. */
function scriptSafe(s: string): string {
  return s.replace(/<\/script/gi, '<\\/script');
}

export function buildCourseHtml(course: Course, js: string, css: string): string {
  const courseJson = scriptSafe(JSON.stringify(course));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(course.title)}</title>
<style>
${css}
</style>
</head>
<body>
<div id="immerse-root"></div>
<script>window.IMMERSE_COURSE = ${courseJson};</script>
<script>
${scriptSafe(js)}
</script>
</body>
</html>`;
}

export async function exportStandaloneHtml(course: Course): Promise<Blob> {
  const { js, css } = await loadPlayerAssets();
  return new Blob([buildCourseHtml(course, js, css)], { type: 'text/html' });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
