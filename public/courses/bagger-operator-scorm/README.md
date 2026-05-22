# Bagger Operator SCORM Package

This folder is SCORM 1.2-ready.

## Why "binary files are not supported" appears

Many git web UIs and review tools cannot render `.zip` diffs and show a message like **"binary files are not supported"**.

That is expected behavior. A SCORM upload file is a ZIP archive (binary), so the fix is:

1. Keep source files in git (`imsmanifest.xml`, `index.html`, `css/`, `js/`).
2. Build the `.zip` locally/CI when needed.
3. Upload the generated ZIP to your LMS.

This repo now ignores ZIP artifacts in this course folder via `.gitignore`.

## Package for LMS upload

From repo root:

```bash
npm run scorm:package:bagger
```

That command generates:

- `public/courses/bagger-operator-scorm/bagger-operator-scorm.zip`

The archive is built with these items at ZIP root:
- `imsmanifest.xml`
- `index.html`
- `css/`
- `js/`

Upload `bagger-operator-scorm.zip` to your LMS as a SCORM 1.2 course.

## Scoring behavior

- Pass threshold: 80%
- Score sent to LMS: `cmi.core.score.raw`
- Status sent: `cmi.core.lesson_status` (`passed`/`failed`)
