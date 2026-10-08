/**
 * Bulk rename rules, shared by the browser (live preview) and the server (validation), so what
 * you preview is exactly what gets applied. Pure functions: no I/O.
 */

export type DateFormat = "iso" | "dmy" | "long";

export const DATE_FORMATS: Array<{ id: DateFormat; label: string; example: string }> = [
  { id: "iso", label: "2024-03-16", example: "Sorts in date order" },
  { id: "dmy", label: "16-03-2024", example: "Day first" },
  { id: "long", label: "16 Mar 2024", example: "Easy to read" },
];

export interface RenameFile {
  id: string;
  /** Groups files that live in the same folder: `${accountId}|${folderPath}`. */
  dirKey: string;
  name: string;
  kind: string;
  /** Best date for the file: taken, else created, else modified (ISO). */
  date: string | null;
  place: string | null;
  /** Name of the folder the file is in ("" at the top of a drive). */
  folder: string;
}

export interface RenameOptions {
  mode: "pattern" | "replace";
  pattern: string;
  dateFormat: DateFormat;
  find: string;
  replace: string;
  matchCase: boolean;
  /** Tidy the result: underscores to spaces, drop "Copy of", "(1)", repeated spaces. */
  tidy: boolean;
  /** ".JPG" becomes ".jpg". */
  lowerExt: boolean;
}

export const DEFAULT_OPTIONS: RenameOptions = {
  mode: "pattern",
  pattern: "{date} {place} {n}",
  dateFormat: "iso",
  find: "",
  replace: "",
  matchCase: false,
  tidy: true,
  lowerExt: true,
};

export const TOKENS: Array<{ token: string; label: string; hint: string }> = [
  { token: "{date}", label: "Date", hint: "Date taken, or created" },
  { token: "{year}", label: "Year", hint: "e.g. 2024" },
  { token: "{month}", label: "Month", hint: "e.g. 03 March" },
  { token: "{place}", label: "Place", hint: "Where a photo was taken" },
  { token: "{folder}", label: "Folder", hint: "The folder it's in" },
  { token: "{name}", label: "Current name", hint: "The existing name, tidied" },
  { token: "{n}", label: "Number", hint: "01, 02, 03… in date order" },
];

export interface RenameRow {
  id: string;
  from: string;
  to: string;
  changed: boolean;
  /** Set when CloudSweep adjusted the name, e.g. to avoid a clash. */
  note?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;
const N = "\uE000"; // private-use placeholder for {n}; never appears in real names

export function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 && name.length - dot <= 6 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** Uses the calendar date as stored (no time-zone shift), so a photo keeps the day it was taken. */
export function formatDate(iso: string | null, fmt: DateFormat): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  if (fmt === "dmy") return `${d}-${mo}-${y}`;
  if (fmt === "long") return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`;
  return `${y}-${mo}-${d}`;
}

/** Cleans up names that cameras, scanners and copy-paste leave behind. */
export function tidyName(base: string): string {
  return base
    .replace(/^copy of\s+/i, "")
    .replace(/\s*-\s*copy(\s*\(\d+\))?$/i, "")
    .replace(/\s*\(\d+\)$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Names cameras and phones give photos ("IMG_1234", "PXL_2024…") — they need a date, not tidying. */
export function isCameraName(name: string): boolean {
  const [base] = splitExt(name);
  return /^(img|dsc|dscn|dcim|pxl|mvimg|vid|mov|gopr|dji|p\d{3}|sam|wp)[_-]?\d/i.test(base) || /^\d{8}[_-]\d{6}/.test(base);
}

/** True when tidying actually improves the name (underscores, "Copy of", "(1)", double spaces). */
export function isTidyable(name: string): boolean {
  const [base] = splitExt(name);
  return !isCameraName(name) && tidyName(base) !== base && tidyName(base) !== "";
}

/** Folder names that describe nothing ("2022", "Camera Roll", "Downloads"). */
const GENERIC_FOLDER = /^(\d{4}([-_ ]\d{2})?|camera roll|camera|camera uploads|dcim|\d{3}apple|pictures|photos|images|downloads|desktop|documents|my documents|screenshots|whatsapp images|new folder( \(\d+\))?|untitled folder)$/i;

/** Camera, phone and scanner names that say nothing about the file. */
export function isMessyName(name: string): boolean {
  const [base] = splitExt(name);
  return (
    /^(img|dsc|dscn|dcim|pxl|mvimg|vid|mov|gopr|dji|p\d{3}|sam|wp)[_-]?\d/i.test(base) ||
    /^(scan|document|doc|untitled|image|photo|screenshot|screen shot|new document)[\s_-]*\d*/i.test(base) ||
    /^\d{8}[_-]\d{6}/.test(base) ||
    /^copy of /i.test(base) ||
    /\(\d+\)$/.test(base) ||
    /_/.test(base)
  );
}

/** Returns a reason the name can't be used, or null when it's fine on every supported service. */
export function nameProblem(name: string): string | null {
  if (!name.trim()) return "Name is empty";
  if (name.length > 200) return "Name is too long (200 characters max)";
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) return 'Names can\'t contain \\ / : * ? " < > |';
  if (/[. ]$/.test(name)) return "Names can't end with a space or full stop";
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) return "That name is reserved by Windows";
  return null;
}

const safe = (s: string) => s.replace(ILLEGAL, " ").replace(/\s{2,}/g, " ").trim();
const shortPlace = (p: string | null) => (p ? safe(p.split(",")[0]) : "");

function applyPattern(f: RenameFile, o: RenameOptions): string {
  const [rawBase] = splitExt(f.name);
  const m = f.date?.match(/^(\d{4})-(\d{2})/);
  const values: Record<string, string> = {
    "{date}": formatDate(f.date, o.dateFormat),
    "{year}": m ? m[1] : "",
    "{month}": m ? `${m[2]} ${MONTHS_LONG[Number(m[2]) - 1]}` : "",
    "{place}": shortPlace(f.place),
    "{folder}": safe(f.folder),
    "{name}": tidyName(rawBase),
  };
  let out = o.pattern.replace(/\{n\}/gi, N);
  for (const [k, v] of Object.entries(values)) out = out.split(k).join(v);
  out = safe(out);
  // Missing values (e.g. no place) leave gaps: collapse them and any dangling separators.
  out = out
    .replace(/\s{2,}/g, " ")
    .replace(/(\s[-–]\s*)(?:[-–]\s*)+/g, "$1")
    .replace(/^[\s\-–_.,]+|[\s\-–_,]+$/g, "")
    .trim();
  return out;
}

function applyReplace(f: RenameFile, o: RenameOptions): string {
  const [base] = splitExt(f.name);
  if (!o.find) return base;
  const re = new RegExp(o.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), o.matchCase ? "g" : "gi");
  return safe(base.replace(re, o.replace));
}

/**
 * Works out every new name. Never produces a clash: a name already used in the same folder (by a
 * file outside the selection, by another renamed file, or by any selected file's current name)
 * gets " (2)", " (3)"… so no rename can overwrite or block another.
 */
export function buildRenames(files: RenameFile[], o: RenameOptions, siblings: Record<string, string[]> = {}): RenameRow[] {
  const sorted = [...files].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.name.localeCompare(b.name));
  const drafts = sorted.map((f) => {
    let base = o.mode === "pattern" ? applyPattern(f, o) : applyReplace(f, o);
    if (o.tidy) base = tidyName(base);
    const [origBase, ext] = splitExt(f.name);
    if (!base.replace(N, "").trim()) base = o.mode === "pattern" && base.includes(N) ? `${tidyName(origBase)} ${N}` : origBase;
    return { f, base, ext: o.lowerExt ? ext.toLowerCase() : ext };
  });

  // Number files that share a name pattern within a folder, in date order.
  const groups = new Map<string, typeof drafts>();
  for (const d of drafts) {
    if (!d.base.includes(N)) continue;
    const k = `${d.f.dirKey}|${d.base.toLowerCase()}`;
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  for (const g of groups.values()) {
    const width = Math.max(2, String(g.length).length);
    g.forEach((d, i) => (d.base = d.base.split(N).join(String(i + 1).padStart(width, "0"))));
  }

  const taken = new Map<string, Set<string>>();
  const takenIn = (k: string) => taken.get(k) ?? taken.set(k, new Set((siblings[k] ?? []).map((s) => s.toLowerCase()))).get(k)!;
  for (const f of files) takenIn(f.dirKey).add(f.name.toLowerCase());

  const rows = new Map<string, RenameRow>();
  for (const d of drafts) {
    const own = d.f.name.toLowerCase();
    const used = takenIn(d.f.dirKey);
    let to = `${d.base}${d.ext}`;
    let note: string | undefined;
    if (to.toLowerCase() !== own && used.has(to.toLowerCase())) {
      for (let n = 2; ; n++) {
        const alt = `${d.base} (${n})${d.ext}`;
        if (alt.toLowerCase() === own || !used.has(alt.toLowerCase())) {
          to = alt;
          break;
        }
      }
      note = "Number added so it doesn't clash with another file";
    }
    const problem = nameProblem(to);
    if (problem) {
      to = d.f.name;
      note = problem;
    }
    used.add(to.toLowerCase());
    rows.set(d.f.id, { id: d.f.id, from: d.f.name, to, changed: to !== d.f.name, note });
  }
  return files.map((f) => rows.get(f.id)!);
}

export interface Suggestion {
  id: string;
  title: string;
  why: string;
  options: Partial<RenameOptions>;
}

/** Suggests naming patterns that suit what's selected. Free: uses dates, places and folders already known. */
export function suggest(files: RenameFile[]): Suggestion[] {
  const n = files.length || 1;
  const media = files.filter((f) => f.kind === "image" || f.kind === "video").length;
  const withPlace = files.filter((f) => f.place).length;
  const messy = files.filter((f) => isMessyName(f.name)).length;
  const tidyable = files.filter((f) => isTidyable(f.name)).length;
  const folders = new Set(files.map((f) => f.folder).filter((x) => x && !GENERIC_FOLDER.test(x.trim())));
  const out: Suggestion[] = [];

  if (media / n >= 0.5) {
    if (withPlace / n >= 0.3)
      out.push({ id: "date-place", title: "Date + place", why: `${withPlace} of ${n} know where they were taken`, options: { mode: "pattern", pattern: "{date} {place} {n}" } });
    out.push({ id: "date", title: "Date + number", why: "Sorts every photo in the order it was taken", options: { mode: "pattern", pattern: "{date} {n}" } });
    if (folders.size)
      out.push({ id: "folder-date", title: "Folder + date", why: "Keeps the album name, e.g. “Fiji Holiday”", options: { mode: "pattern", pattern: "{folder} {date} {n}" } });
  } else {
    if (tidyable)
      out.push({ id: "tidy", title: "Tidy up names", why: `${tidyable} name${tidyable === 1 ? " has" : "s have"} underscores, “Copy of” or (1) in them`, options: { mode: "pattern", pattern: "{name}", tidy: true } });
    else if (messy)
      out.push({ id: "date-name", title: "Date first", why: `${messy} name${messy === 1 ? " says" : "s say"} little (e.g. Scan0001) — a date makes them findable`, options: { mode: "pattern", pattern: "{date} {name}" } });
    if (!out.some((x) => x.id === "date-name"))
      out.push({ id: "date-name", title: "Date first", why: "Puts files in date order, keeping their names", options: { mode: "pattern", pattern: "{date} {name}" } });
    if (folders.size)
      out.push({ id: "folder-name", title: "Folder + name", why: "Useful before moving files out of their folder", options: { mode: "pattern", pattern: "{folder} – {name}" } });
  }
  if (media / n >= 0.5 && tidyable)
    out.push({ id: "tidy", title: "Tidy up names", why: `${tidyable} name${tidyable === 1 ? " has" : "s have"} underscores, “Copy of” or (1) in them`, options: { mode: "pattern", pattern: "{name}", tidy: true } });
  return out;
}
