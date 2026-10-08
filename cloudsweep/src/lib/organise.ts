import "server-only";
import { z } from "zod";
import { planTransfer, queueTransfer, transferTarget, type Plan } from "./consolidate";
import { newId } from "./crypto";
import { num, query } from "./db";
import type { FileRow } from "./dedupe";
import { createJob } from "./jobs";
import { loadFiles, upsertItems } from "./items";
import { contextFor, getAccount } from "./accounts";
import { getProvider } from "./providers";
import { placeNameAt } from "./photos/groups";
import { nameProblem, type RenameFile } from "./rename";

/** What the user ticked in the Library: individual files plus whole folders. */
export const Selection = z.object({
  ids: z.array(z.string()).max(5000).default([]),
  folders: z.array(z.object({ accountId: z.string(), path: z.string() })).max(200).default([]),
});
export type Selection = z.infer<typeof Selection>;

export const MAX_SELECTION = 5000;

export async function resolveSelection(sel: Selection): Promise<FileRow[]> {
  if (!sel.ids.length && !sel.folders.length) return [];
  const files = await loadFiles({ ids: sel.ids, under: sel.folders });
  if (files.length > MAX_SELECTION) throw new Error(`That's ${files.length.toLocaleString()} files. Select up to ${MAX_SELECTION.toLocaleString()} at a time.`);
  return files;
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

/** Names already used in a folder (files and sub-folders), so new names never clash. */
async function namesIn(accountId: string, dir: string): Promise<string[]> {
  const rows = await query<{ name: string }>("SELECT name FROM items WHERE account_id = $1 AND NOT trashed AND path = $2 || '/' || name", [accountId, dir]);
  return rows.map((r) => r.name);
}

/** Everything the rename preview needs: dates, places, folders and the other names in each folder. */
export async function renameSources(sel: Selection) {
  const files = await resolveSelection(sel);
  const meta = new Map(
    (
      await query<any>(
        `SELECT i.id, i.taken_at, i.created_remote, i.modified_at, i.lat, i.lng, t.place_hint
         FROM items i LEFT JOIN photo_tags t ON t.item_id = i.id WHERE i.id = ANY($1)`,
        [files.map((f) => f.id)],
      )
    ).map((r) => [r.id, r]),
  );
  // Reverse geocoding is rate-limited (1 request/second), so look up a few new places per preview.
  const budget = { lookups: 4 };
  const places = new Map<string, string | null>();
  let placesPending = 0;
  const out: Array<RenameFile & { accountId: string; provider: string; path: string; accountLabel: string; size: number }> = [];
  for (const f of files) {
    const m = meta.get(f.id);
    let place: string | null = null;
    if (m?.lat != null && m?.lng != null) {
      const key = `${Math.round(m.lat * 20)},${Math.round(m.lng * 20)}`;
      if (!places.has(key)) places.set(key, await placeNameAt(m.lat, m.lng, budget));
      place = places.get(key) ?? null;
      if (!place && !m.place_hint) placesPending++;
    }
    place ??= m?.place_hint ?? null;
    const date = m?.taken_at ?? m?.created_remote ?? m?.modified_at ?? null;
    const dir = dirOf(f.path);
    out.push({
      id: f.id,
      dirKey: `${f.accountId}|${dir}`,
      name: f.name,
      kind: f.kind,
      date: date ? new Date(date).toISOString() : null,
      place,
      folder: dir.split("/").pop() ?? "",
      accountId: f.accountId,
      accountLabel: f.accountLabel,
      provider: f.provider,
      path: f.path,
      size: f.size,
    });
  }
  const siblings: Record<string, string[]> = {};
  for (const key of new Set(out.map((f) => f.dirKey))) {
    const [accountId, dir] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
    const inSel = new Set(out.filter((f) => f.dirKey === key).map((f) => f.name.toLowerCase()));
    siblings[key] = (await namesIn(accountId, dir)).filter((n) => !inSel.has(n.toLowerCase()));
  }
  return { files: out, siblings, placesPending };
}

export const RenameBody = z.object({
  renames: z.array(z.object({ id: z.string(), newName: z.string().max(255) })).min(1).max(MAX_SELECTION),
});

export interface LocalRename {
  id: string;
  accountId: string;
  path: string;
  newName: string;
}

/**
 * Checks every new name against the folder as it is now, then queues cloud renames as a resumable
 * job. Files on this computer are returned for the browser to rename. Both share one batch id, so
 * the whole batch can be undone together.
 */
export async function startRename(renames: Array<{ id: string; newName: string }>) {
  const rows = await query<any>(
    "SELECT i.id, i.account_id, i.name, i.path, a.provider FROM items i JOIN accounts a ON a.id = i.account_id WHERE i.id = ANY($1) AND NOT i.trashed",
    [renames.map((r) => r.id)],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const wanted = renames.filter((r) => byId.has(r.id) && byId.get(r.id).name !== r.newName);
  if (!wanted.length) return { batch: null, jobId: null, local: [] as LocalRename[], count: 0 };

  const used = new Map<string, Set<string>>();
  for (const r of wanted) {
    const it = byId.get(r.id);
    const problem = nameProblem(r.newName);
    if (problem) throw new Error(`“${r.newName}”: ${problem}`);
    const key = `${it.account_id}|${dirOf(it.path ?? "/" + it.name)}`;
    if (!used.has(key)) used.set(key, new Set((await namesIn(it.account_id, dirOf(it.path ?? "/" + it.name))).map((n) => n.toLowerCase())));
    const names = used.get(key)!;
    const lower = r.newName.toLowerCase();
    if (lower !== it.name.toLowerCase() && names.has(lower)) throw new Error(`“${r.newName}” is already used in that folder. The folder has changed since the preview — preview again.`);
    names.add(lower);
  }

  const cloud = wanted.filter((r) => byId.get(r.id).provider !== "local");
  const local: LocalRename[] = wanted
    .filter((r) => byId.get(r.id).provider === "local")
    .map((r) => ({ id: r.id, accountId: byId.get(r.id).account_id, path: byId.get(r.id).path, newName: r.newName }));
  const batch = newId("ren");
  const jobId = cloud.length ? await createJob("rename", null, { renames: cloud, batch }, { done: 0, total: cloud.length, message: "Renaming" }) : null;
  return { batch, jobId, local, count: wanted.length };
}

/** Reverses every rename in a batch that hasn't been undone yet. */
export async function undoRenameBatch(batch: string) {
  const acts = await query<any>(
    `SELECT a.item_id, a.detail, acc.provider, acc.id AS account_id, i.path FROM actions a
     JOIN accounts acc ON acc.id = a.account_id JOIN items i ON i.id = a.item_id
     WHERE a.kind = 'rename' AND NOT a.undone AND a.detail->>'batch' = $1 ORDER BY a.id DESC`,
    [batch],
  );
  if (!acts.length) throw new Error("Nothing left to undo in that batch.");
  const cloud = acts.filter((a) => a.provider !== "local").map((a) => ({ id: a.item_id, newName: a.detail.from }));
  const local: LocalRename[] = acts.filter((a) => a.provider === "local").map((a) => ({ id: a.item_id, accountId: a.account_id, path: a.path, newName: a.detail.from }));
  const jobId = cloud.length ? await createJob("rename", null, { renames: cloud, undoOf: batch }, { done: 0, total: cloud.length, message: "Undoing renames" }) : null;
  return { jobId, local, count: acts.length };
}

export const MoveBody = z.object({
  selection: Selection,
  targetAccountId: z.string(),
  /** "" or "/" = keep each file's folder path on the new drive. */
  targetFolder: z.string().max(400).default(""),
  keepStructure: z.boolean().default(true),
  keepOriginal: z.boolean().default(false),
});
export type MoveParams = z.infer<typeof MoveBody>;

export interface MovePlan {
  plan: Plan;
  skipped: { sameDrive: number; local: number };
  sourceAccountIds: string[];
}

/** Plans moving the selection to another drive, reusing the verified copy → check → trash engine. */
export async function planMove(p: MoveParams): Promise<MovePlan> {
  const target = await transferTarget(p.targetAccountId);
  const all = await resolveSelection(p.selection);
  const skipped = { sameDrive: 0, local: 0 };
  const root = p.targetFolder.trim().replace(/^\/+|\/+$/g, "");
  const base = root ? `/${root}` : "";
  const dest = (f: FileRow) => (p.keepStructure ? `${base}${dirOf(f.path)}`.replace(/\/+/g, "/").replace(/\/$/, "") : base);
  const sameDrive: FileRow[] = [];
  const files = all.filter((f) => {
    if (f.accountId === target.id) {
      // Already on this drive: move it into the folder in place, unless it's already there.
      if (dest(f) === dirOf(f.path)) skipped.sameDrive++;
      else sameDrive.push(f);
      return false;
    }
    if (f.provider === "local") return void skipped.local++, false;
    return true;
  });
  const plan = await planTransfer(files, target, p.keepOriginal ? "copy" : "move", true, dest);
  for (const f of sameDrive) plan.rows.push({ file: f, action: "relocate", targetPath: dest(f) });
  plan.counts.relocate = sameDrive.length;
  return { plan, skipped, sourceAccountIds: [...new Set(files.map((f) => f.accountId))] };
}

export async function startMove(p: MoveParams): Promise<string | null> {
  const { plan, sourceAccountIds } = await planMove(p);
  if (!plan.rows.some((r) => r.action !== "unsupported")) return null;
  return queueTransfer(plan, {
    kind: "move",
    sourceAccountIds,
    targetAccountId: p.targetAccountId,
    targetFolder: p.targetFolder,
    mode: p.keepOriginal ? "copy" : "move",
  });
}

export function summariseMove({ plan, skipped }: MovePlan) {
  return {
    files: plan.rows.length,
    counts: plan.counts,
    bytesToTransfer: plan.bytesToTransfer,
    bytesFreedAtSource: plan.bytesFreedAtSource,
    targetFree: plan.targetFree,
    warnings: plan.warnings,
    skipped,
    examples: plan.rows.slice(0, 6).map((r) => ({ name: r.file.name, from: `${r.file.accountLabel}${r.file.path}`, to: `${r.targetPath || ""}/${r.file.name}`, action: r.action })),
    totalBytes: plan.rows.reduce((s, r) => s + num(r.file.size), 0),
  };
}

export const FolderBody = z.object({ accountId: z.string(), path: z.string().min(2).max(400) });

/** Cleans a typed folder path ("Photos/ 2024 /Fiji") into "/Photos/2024/Fiji", or explains what's wrong. */
export function cleanFolderPath(path: string): string {
  const parts = path.split("/").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error("Type a folder name");
  for (const p of parts) {
    const problem = nameProblem(p);
    if (problem) throw new Error(`“${p}”: ${problem}`);
  }
  return "/" + parts.join("/");
}

/**
 * Creates a folder (and any missing parents) on a cloud drive and adds it to the index so it shows
 * in the Library straight away. Folders on this computer are created by the browser and then
 * recorded with recordLocalFolder.
 */
export async function createFolder(accountId: string, rawPath: string) {
  const account = await getAccount(accountId);
  if (!account) throw new Error("Drive not found");
  const path = cleanFolderPath(rawPath);
  const name = path.split("/").pop()!;
  if (account.provider === "local") return { path, local: true };
  const id = await getProvider(account.provider).ensureFolder(await contextFor(accountId), path);
  const now = new Date().toISOString();
  await upsertItems(accountId, [{ remoteId: id, parentRemoteId: null, name, path, isFolder: true, size: 0, mime: null, hashes: {}, modifiedAt: now, createdAt: now }], null);
  return { path, local: false };
}
