"""Convert Taryn's watchlist workbook into src/data/workbook.json.

Usage: python3 -I scripts/import-workbook.py path/to/Taryn_Iconic_Movie_Watchlist.xlsx
Requires openpyxl. The output keeps the workbook's own wording; the app applies
the brief's newer confirmed preferences on top (see src/data/catalogue.ts).
"""
import json
import sys
from pathlib import Path

import openpyxl

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / "src" / "data" / "workbook.json"
ws = openpyxl.load_workbook(src).active
header = None
rows = []
for r in ws.iter_rows(values_only=True):
    if header is None:
        if r and r[0] == "Film":
            header = r
        continue
    if not r[0]:
        continue
    rows.append({
        "title": r[0],
        "year": r[1],
        "category": r[2],
        "status": r[3],
        "startingPoint": r[4],
        "why": r[5],
        "reference": r[6],
        "notes": r[7],
        "source": r[9],
    })
out.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n")
print(f"Wrote {len(rows)} rows to {out}")
