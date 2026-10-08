# Bagger Operator SCORM Package

This folder is SCORM 1.2-ready.

## No software install required

You do **not** need to install ZIP tools or extra apps.

From the repo root, run:

```bash
npm run scorm:package:bagger
```

That command uses Python's built-in `zipfile` library via `scripts/package-scorm.py`.

## Output file

The command creates one LMS upload file:

- `public/courses/bagger-operator-scorm/bagger-operator-scorm.zip`

## Upload to LMS

Upload that ZIP directly to your LMS as a SCORM 1.2 package.

## If your git tool says "binary files are not supported"

That is expected for ZIP files and does not mean the package is broken.

## Scoring behavior

- Pass threshold: 80%
- Score sent to LMS: `cmi.core.score.raw`
- Status sent: `cmi.core.lesson_status` (`passed`/`failed`)
