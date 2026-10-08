#!/usr/bin/env python3
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
COURSE_DIR = ROOT / 'public' / 'courses' / 'bagger-operator-scorm'
OUTPUT = COURSE_DIR / 'bagger-operator-scorm.zip'
INCLUDE = [
    'imsmanifest.xml',
    'index.html',
    'css/style.css',
    'js/scorm-api.js',
    'js/course.js',
]

missing = [p for p in INCLUDE if not (COURSE_DIR / p).exists()]
if missing:
    raise SystemExit('Missing files: ' + ', '.join(missing))

with ZipFile(OUTPUT, 'w', compression=ZIP_DEFLATED) as zf:
    for rel in INCLUDE:
        zf.write(COURSE_DIR / rel, arcname=rel)

print(f'Created: {OUTPUT}')
