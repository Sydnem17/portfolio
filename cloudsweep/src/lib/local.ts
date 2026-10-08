import "server-only";
import { uniqueLabel } from "./accounts";
import { encrypt, newId } from "./crypto";
import { num, one, query } from "./db";
import { logAction, upsertItems } from "./items";
import type { CloudItem } from "./providers/types";

/** One file or folder reported by the browser while walking a local folder. Paths use "/" and start with "/". */
export interface LocalEntry {
  path: string;
  isFolder: boolean;
  size: number;
  modifiedAt: string | null;
}

export interface LocalHashes {
  itemId: string;
  md5: string;
  sha1: string;
  sha256: string;
  quickXor: string;
}

const STAGING = "CloudSweep Staging";

export async function createLocalAccount(folderName: string): Promise<{ id: string; label: string }> {
  const id = newId("local");
  const label = await uniqueLabel(`${folderName.trim() || "Local folder"} (this computer)`);
  await query("INSERT INTO accounts (id, provider, label, tokens_enc) VALUES ($1, 'local', $2, $3)", [
    id,
    label,
    encrypt(JSON.stringify({ accessToken: "local", expiresAt: Date.now() + 3650 * 864e5 })),
  ]);
  await query("UPDATE accounts SET is_primary = TRUE WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM accounts WHERE is_primary)", [id]);
  return { id, label };
}

async function assertLocal(accountId: string) {
  const a = await one<{ provider: string }>("SELECT provider FROM accounts WHERE id = $1", [accountId]);
  if (!a || a.provider !== "local") throw new Error("Not a local folder");
}

function normalise(path: string): string {
  const clean = "/" + path.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..").join("/");
  return clean === "/" ? "" : clean;
}

/** Stores one batch of a browser-side walk. On the final batch, entries not seen in this scan are removed. */
export async function ingestLocalScan(accountId: string, scanId: string, entries: LocalEntry[], done: boolean) {
  await assertLocal(accountId);
  const items: CloudItem[] = [];
  for (const e of entries) {
    const path = normalise(e.path);
    if (!path || path === `/${STAGING}` || path.startsWith(`/${STAGING}/`)) continue;
    const parent = path.split("/").slice(0, -1).join("/");
    items.push({
      remoteId: path,
      parentRemoteId: parent || null,
      name: path.split("/").at(-1)!,
      path,
      isFolder: e.isFolder,
      size: e.isFolder ? 0 : Math.max(0, Math.round(Number(e.size) || 0)),
      mime: null,
      hashes: {},
      modifiedAt: e.modifiedAt,
      createdAt: null,
    });
  }
  await upsertItems(accountId, items, scanId);
  if (done) {
    await query("DELETE FROM items WHERE account_id = $1 AND scan_id IS DISTINCT FROM $2", [accountId, scanId]);
    const totals = await one<{ bytes: string }>("SELECT COALESCE(SUM(size), 0) AS bytes FROM items WHERE account_id = $1 AND NOT trashed", [accountId]);
    await query("UPDATE accounts SET last_scan_at = now(), quota_used = $2, status = 'connected' WHERE id = $1", [accountId, num(totals?.bytes)]);
  }
  return { stored: items.length };
}

/**
 * Local files worth fingerprinting: same size as some other file anywhere (identical files must
 * be the same size), not yet fingerprinted. Everything else can't be a duplicate, so it's skipped.
 */
export async function localHashCandidates(accountId: string, limit = 300) {
  await assertLocal(accountId);
  const rows = await query<{ id: string; path: string; size: string }>(
    `SELECT l.id, l.path, l.size FROM items l
     WHERE l.account_id = $1 AND NOT l.is_folder AND NOT l.trashed AND l.size > 0 AND l.quick_xor IS NULL
       AND EXISTS (SELECT 1 FROM items o WHERE o.size = l.size AND o.id <> l.id AND NOT o.is_folder AND NOT o.trashed)
     ORDER BY l.size DESC LIMIT $2`,
    [accountId, limit],
  );
  const remaining = await one<{ n: string; bytes: string }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(l.size), 0) AS bytes FROM items l
     WHERE l.account_id = $1 AND NOT l.is_folder AND NOT l.trashed AND l.size > 0 AND l.quick_xor IS NULL
       AND EXISTS (SELECT 1 FROM items o WHERE o.size = l.size AND o.id <> l.id AND NOT o.is_folder AND NOT o.trashed)`,
    [accountId],
  );
  return { files: rows.map((r) => ({ id: r.id, path: r.path, size: num(r.size) })), remaining: num(remaining?.n), remainingBytes: num(remaining?.bytes) };
}

export async function saveLocalHashes(accountId: string, hashes: LocalHashes[]) {
  await assertLocal(accountId);
  for (const h of hashes) {
    await query("UPDATE items SET md5 = $3, sha1 = $4, sha256 = $5, quick_xor = $6 WHERE id = $1 AND account_id = $2", [
      h.itemId, accountId, h.md5.toLowerCase(), h.sha1.toLowerCase(), h.sha256.toLowerCase(), h.quickXor,
    ]);
  }
  return { saved: hashes.length };
}

/** Records files the browser moved into the drive's "CloudSweep Staging" folder, so they show in the Staging bin. */
export async function recordLocalStaged(accountId: string, moves: Array<{ itemId: string; stagedPath: string }>, reason = "duplicate") {
  await assertLocal(accountId);
  let bytes = 0;
  for (const m of moves) {
    const it = await one<any>("SELECT id, remote_id, name, path, size FROM items WHERE id = $1 AND account_id = $2", [m.itemId, accountId]);
    if (!it) continue;
    await query("UPDATE items SET trashed = TRUE WHERE id = $1", [it.id]);
    await logAction({ kind: "trash", accountId, itemId: it.id, remoteId: it.remote_id, name: it.name, bytes: num(it.size), detail: { path: it.path, stagedPath: m.stagedPath, local: true, reason } });
    bytes += num(it.size);
  }
  return { staged: moves.length, bytes };
}

/** Records files the browser moved back out of the staging folder. */
export async function recordLocalRestored(accountId: string, actionIds: number[]) {
  await assertLocal(accountId);
  for (const id of actionIds) {
    const a = await one<{ item_id: string }>("SELECT item_id FROM actions WHERE id = $1 AND account_id = $2 AND kind = 'trash' AND NOT undone", [id, accountId]);
    if (!a) continue;
    await query("UPDATE items SET trashed = FALSE WHERE id = $1", [a.item_id]);
    await query("UPDATE actions SET undone = TRUE WHERE id = $1", [id]);
  }
  return { restored: actionIds.length };
}

/** Records files the browser renamed (or renamed back, when undoing a batch). */
export async function recordLocalRenamed(accountId: string, renames: Array<{ id: string; from: string; to: string }>, opts: { batch?: string; undoOf?: string }) {
  await assertLocal(accountId);
  for (const r of renames) {
    const it = await one<{ path: string | null }>("SELECT path FROM items WHERE id = $1 AND account_id = $2", [r.id, accountId]);
    if (!it) continue;
    const path = `${(it.path ?? "/" + r.from).slice(0, (it.path ?? "/" + r.from).lastIndexOf("/"))}/${r.to}`;
    await query("UPDATE items SET name = $2, path = $3, updated_at = now() WHERE id = $1", [r.id, r.to, path]);
    if (opts.undoOf) await query("UPDATE actions SET undone = TRUE WHERE kind = 'rename' AND item_id = $1 AND detail->>'batch' = $2", [r.id, opts.undoOf]);
    else await logAction({ kind: "rename", accountId, itemId: r.id, name: r.to, detail: { from: r.from, to: r.to, path, batch: opts.batch, local: true } });
  }
  return { renamed: renames.length };
}

/** Records a folder the browser just created, so it shows in the Library before the next scan. */
export async function recordLocalFolder(accountId: string, path: string) {
  const parts = path.split("/").filter(Boolean);
  const entries = parts.map((_, i) => ({ path: "/" + parts.slice(0, i + 1).join("/"), isFolder: true, size: 0, modifiedAt: new Date().toISOString() }));
  return ingestLocalScan(accountId, "created", entries, false);
}

export { STAGING as LOCAL_STAGING_FOLDER };
