/**
 * Duplicate detection engine. Pure functions — no I/O — so it is fast to test and reason about.
 *
 * Tiers of confidence:
 *   exact   – same size AND a matching cryptographic hash (md5/sha1/sha256/quickXor/provider hash,
 *             or a sha256 CloudSweep computed by downloading the file).
 *   likely  – same size and same normalised name, but the providers share no comparable hash
 *             (e.g. OneDrive for Business quickXor vs Google md5). Run "Verify" to confirm.
 *   similar – visually near-identical photos (perceptual hash), e.g. resized or re-saved copies.
 */

export interface FileRow {
  id: string;
  accountId: string;
  accountLabel: string;
  provider: string;
  isPrimary: boolean;
  name: string;
  path: string;
  size: number;
  kind: string;
  md5?: string | null;
  sha1?: string | null;
  sha256?: string | null;
  quickXor?: string | null;
  providerHash?: string | null;
  contentSha256?: string | null;
  phash?: string | null;
  width?: number | null;
  height?: number | null;
  createdAt?: string | null;
  modifiedAt?: string | null;
  webUrl?: string | null;
}

export type Confidence = "exact" | "likely" | "similar";

export interface DuplicateGroup {
  key: string;
  confidence: Confidence;
  kind: string;
  name: string;
  members: FileRow[];
  /** Bytes reclaimed by keeping one copy. */
  wasteBytes: number;
  keeperId: string;
  keeperReasons: string[];
  crossAccount: boolean;
}

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    this.parent.set(x, r);
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function hashKeys(f: FileRow): string[] {
  const k: string[] = [];
  if (f.md5) k.push(`md5:${f.md5.toLowerCase()}`);
  if (f.sha1) k.push(`sha1:${f.sha1.toLowerCase()}`);
  if (f.sha256) k.push(`sha256:${f.sha256.toLowerCase()}`);
  if (f.contentSha256) k.push(`sha256:${f.contentSha256.toLowerCase()}`);
  if (f.quickXor) k.push(`qx:${f.quickXor}`);
  if (f.providerHash) k.push(`ph:${f.providerHash}`);
  return k;
}

function hashTypes(f: FileRow): Set<string> {
  return new Set(hashKeys(f).map((k) => k.split(":")[0]));
}

/** Two files are "comparable" when they share a hash type, so a mismatch proves they differ. */
function comparable(a: FileRow, b: FileRow): boolean {
  const ta = hashTypes(a);
  for (const t of hashTypes(b)) if (ta.has(t)) return true;
  return false;
}

const COPY_PATTERNS = [/^copy of /i, / - copy(\s*\(\d+\))?$/i, /\s*\(\d+\)$/, /\s*copy\s*\d*$/i, /_\d{1,2}$/, /-\d{1,2}$/];

export function normaliseName(name: string): string {
  const dot = name.lastIndexOf(".");
  let base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace("jpeg", "jpg") : "";
  for (let i = 0; i < 3; i++) for (const p of COPY_PATTERNS) base = base.replace(p, "");
  return `${base.trim().toLowerCase()}.${ext}`;
}

export function looksLikeCopy(name: string): boolean {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return COPY_PATTERNS.slice(0, 4).some((p) => p.test(base));
}

const CLUTTER = /(^|\/)(downloads?|temp|tmp|backups?|old|copy|whatsapp( images)?|messenger|move me|untitled|misc|archive)(\/|\)|\s|$)/i;

/** Pick which copy to keep, with human-readable reasons. */
export function chooseKeeper(members: FileRow[], confidence: Confidence): { keeperId: string; reasons: string[] } {
  const oldest = Math.min(...members.map((m) => Date.parse(m.createdAt ?? m.modifiedAt ?? "") || Infinity));
  const maxPixels = Math.max(...members.map((m) => (m.width ?? 0) * (m.height ?? 0)));
  const maxSize = Math.max(...members.map((m) => m.size));
  const scored = members.map((m) => {
    let score = 0;
    const why: string[] = [];
    if (confidence === "similar") {
      const px = (m.width ?? 0) * (m.height ?? 0);
      if (maxPixels > 0 && px === maxPixels) (score += 60), why.push("highest resolution");
      if (m.size === maxSize) (score += 20), why.push("largest file (least compressed)");
    }
    if (m.isPrimary) (score += 30), why.push("in your primary account");
    if (!looksLikeCopy(m.name)) (score += 15), why.push("original file name");
    else score -= 20;
    if (CLUTTER.test(m.path)) score -= 15;
    else why.push("organised folder");
    const created = Date.parse(m.createdAt ?? m.modifiedAt ?? "");
    if (created === oldest) (score += 10), why.push("earliest copy");
    score -= m.path.split("/").length; // shallower paths are easier to find
    return { m, score, why };
  });
  scored.sort((a, b) => b.score - a.score || a.m.path.localeCompare(b.m.path));
  return { keeperId: scored[0].m.id, reasons: scored[0].why };
}

function makeGroup(members: FileRow[], confidence: Confidence, key: string): DuplicateGroup {
  const { keeperId, reasons } = chooseKeeper(members, confidence);
  const keeper = members.find((m) => m.id === keeperId)!;
  const wasteBytes = members.filter((m) => m.id !== keeperId).reduce((s, m) => s + m.size, 0);
  return {
    key,
    confidence,
    kind: keeper.kind,
    name: keeper.name,
    members: [...members].sort((a, b) => (a.id === keeperId ? -1 : b.id === keeperId ? 1 : a.path.localeCompare(b.path))),
    wasteBytes,
    keeperId,
    keeperReasons: reasons,
    crossAccount: new Set(members.map((m) => m.accountId)).size > 1,
  };
}

export function findDuplicates(files: FileRow[], opts: { minSize?: number; similarThreshold?: number } = {}): DuplicateGroup[] {
  const minSize = opts.minSize ?? 1;
  const bySize = new Map<number, FileRow[]>();
  for (const f of files) {
    if (f.size < minSize) continue;
    const list = bySize.get(f.size);
    list ? list.push(f) : bySize.set(f.size, [f]);
  }

  const groups: DuplicateGroup[] = [];

  for (const bucket of bySize.values()) {
    if (bucket.length < 2) continue;
    // 1. Strong edges: shared hash.
    const strong = new UnionFind();
    const seen = new Map<string, string>();
    for (const f of bucket) {
      strong.find(f.id);
      for (const k of hashKeys(f)) {
        const other = seen.get(k);
        other ? strong.union(f.id, other) : seen.set(k, f.id);
      }
    }
    // 2. Weak edges: same normalised name, no comparable hash between the two.
    const all = new UnionFind();
    for (const f of bucket) all.union(f.id, strong.find(f.id));
    const byName = new Map<string, FileRow[]>();
    for (const f of bucket) {
      const n = normaliseName(f.name);
      byName.get(n)?.push(f) ?? byName.set(n, [f]);
    }
    for (const same of byName.values())
      for (let i = 0; i < same.length; i++)
        for (let j = i + 1; j < same.length; j++)
          if (strong.find(same[i].id) !== strong.find(same[j].id) && !comparable(same[i], same[j])) {
            all.union(same[i].id, same[j].id);
          }

    const comps = new Map<string, FileRow[]>();
    for (const f of bucket) {
      const r = all.find(f.id);
      comps.get(r)?.push(f) ?? comps.set(r, [f]);
    }
    for (const members of comps.values()) {
      if (members.length < 2) continue;
      const strongRoots = new Set(members.map((m) => strong.find(m.id)));
      const confidence: Confidence = strongRoots.size === 1 ? "exact" : "likely";
      const key = `${confidence}:${members[0].size}:${hashKeys(members[0])[0] ?? normaliseName(members[0].name)}`;
      groups.push(makeGroup(members, confidence, key));
    }
  }

  groups.push(...findSimilarPhotos(files, opts.similarThreshold ?? 6));
  return groups.sort((a, b) => b.wasteBytes - a.wasteBytes);
}

/** Hamming distance between two 64-bit hex perceptual hashes. */
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 8) {
    let x = parseInt(a.slice(i, i + 8), 16) ^ parseInt(b.slice(i, i + 8), 16);
    while (x) {
      x &= x - 1;
      d++;
    }
  }
  return d;
}

function findSimilarPhotos(files: FileRow[], threshold: number): DuplicateGroup[] {
  const imgs = files.filter((f) => f.kind === "image" && f.phash && f.phash.length === 16);
  const uf = new UnionFind();
  // LSH: 8 bands of 8 bits. Any two hashes within distance ≤7 share at least one band exactly.
  const bands = new Map<string, FileRow[]>();
  for (const f of imgs) {
    for (let b = 0; b < 8; b++) {
      const key = `${b}:${f.phash!.slice(b * 2, b * 2 + 2)}`;
      bands.get(key)?.push(f) ?? bands.set(key, [f]);
    }
  }
  for (const list of bands.values()) {
    if (list.length < 2 || list.length > 400) continue; // skip degenerate (e.g. all-black) bands
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (list[i].size !== list[j].size && hamming(list[i].phash!, list[j].phash!) <= threshold) uf.union(list[i].id, list[j].id);
  }
  const comps = new Map<string, FileRow[]>();
  for (const f of imgs) {
    const r = uf.find(f.id);
    comps.get(r)?.push(f) ?? comps.set(r, [f]);
  }
  const out: DuplicateGroup[] = [];
  for (const members of comps.values()) {
    if (members.length < 2) continue;
    // Different sizes only: same-size copies are already reported as exact/likely groups.
    if (new Set(members.map((m) => m.size)).size < 2) continue;
    out.push(makeGroup(members, "similar", `similar:${members.map((m) => m.id).sort()[0]}`));
  }
  return out;
}

export interface FolderOverlap {
  folder: { accountLabel: string; path: string; files: number; bytes: number };
  container: { accountLabel: string; path: string };
  /** Share of the folder's bytes that already exist in the container folder. */
  overlap: number;
  redundantBytes: number;
}

/** Finds folders whose contents are (almost) entirely duplicated in another folder. */
export function findFolderOverlaps(files: FileRow[], groups: DuplicateGroup[], minFiles = 3, minOverlap = 0.9): FolderOverlap[] {
  const identity = new Map<string, string>();
  for (const g of groups) if (g.confidence !== "similar") for (const m of g.members) identity.set(m.id, g.key);
  type Folder = { accountId: string; accountLabel: string; path: string; files: FileRow[]; bytes: number };
  const folders = new Map<string, Folder>();
  for (const f of files) {
    const dir = f.path.split("/").slice(0, -1).join("/") || "/";
    const k = `${f.accountId}|${dir}`;
    const fo = folders.get(k) ?? { accountId: f.accountId, accountLabel: f.accountLabel, path: dir, files: [], bytes: 0 };
    fo.files.push(f);
    fo.bytes += f.size;
    folders.set(k, fo);
  }
  const index = new Map<string, Set<string>>();
  for (const [k, fo] of folders) for (const f of fo.files) {
    const id = identity.get(f.id);
    if (id) (index.get(id) ?? index.set(id, new Set()).get(id)!).add(k);
  }
  const out: FolderOverlap[] = [];
  for (const [k, fo] of folders) {
    if (fo.files.length < minFiles) continue;
    const shared = new Map<string, number>();
    for (const f of fo.files) {
      const id = identity.get(f.id);
      if (!id) continue;
      for (const other of index.get(id) ?? []) if (other !== k) shared.set(other, (shared.get(other) ?? 0) + f.size);
    }
    let best: [string, number] | null = null;
    for (const e of shared) if (!best || e[1] > best[1]) best = e;
    if (!best) continue;
    const overlap = best[1] / Math.max(fo.bytes, 1);
    if (overlap < minOverlap) continue;
    const c = folders.get(best[0])!;
    // Report each mirrored pair once: the smaller folder "is contained in" the larger.
    if (c.bytes < fo.bytes || (c.bytes === fo.bytes && best[0] < k)) continue;
    out.push({
      folder: { accountLabel: fo.accountLabel, path: fo.path, files: fo.files.length, bytes: fo.bytes },
      container: { accountLabel: c.accountLabel, path: c.path },
      overlap,
      redundantBytes: best[1],
    });
  }
  return out.sort((a, b) => b.redundantBytes - a.redundantBytes);
}
