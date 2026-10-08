"use client";

import { createFolder, deleteFile, ensurePermission, moveToStaging, recallFolder, renameFile, restoreFromStaging, supportsLocalFolders } from "./local-client";

/**
 * Moves local duplicates into "CloudSweep Staging" on their drive and records them on the server.
 * Call from a click: the browser may need to ask for permission again.
 */
export async function stageLocalFiles(byAccount: Map<string, Array<{ id: string; path: string }>>, reason = "duplicate") {
  const result = { moved: 0, failed: 0, problems: [] as string[] };
  if (!supportsLocalFolders()) {
    result.failed = [...byAccount.values()].reduce((n, l) => n + l.length, 0);
    result.problems.push("Files on your computer can only be moved from Chrome or Edge on that computer.");
    return result;
  }
  for (const [accountId, files] of byAccount) {
    const dir = await recallFolder(accountId);
    if (!dir || !(await ensurePermission(dir))) {
      result.failed += files.length;
      result.problems.push("A local folder isn't available in this browser — open CloudSweep on the computer that has it, or rescan it from Storage accounts.");
      continue;
    }
    const moves: Array<{ itemId: string; stagedPath: string }> = [];
    for (const f of files) {
      try {
        moves.push({ itemId: f.id, stagedPath: await moveToStaging(dir, f.path) });
      } catch {
        result.failed++;
      }
    }
    if (moves.length) {
      await fetch(`/api/local/${accountId}/staged`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moves, reason }) });
      result.moved += moves.length;
    }
  }
  if (result.failed && !result.problems.length) result.problems.push(`${result.failed} file(s) couldn't be moved — they may have been moved or opened elsewhere. Rescan the folder and try again.`);
  return result;
}

/** Moves staged local files back to their original folders. */
export async function restoreLocalFiles(byAccount: Map<string, Array<{ actionId: number; stagedPath: string; path: string }>>) {
  const result = { restored: 0, failed: 0 };
  if (!supportsLocalFolders()) {
    result.failed = [...byAccount.values()].reduce((n, l) => n + l.length, 0);
    return result;
  }
  for (const [accountId, items] of byAccount) {
    const dir = await recallFolder(accountId);
    if (!dir || !(await ensurePermission(dir))) {
      result.failed += items.length;
      continue;
    }
    const done: number[] = [];
    for (const it of items) {
      try {
        await restoreFromStaging(dir, it.stagedPath, it.path);
        done.push(it.actionId);
      } catch {
        result.failed++;
      }
    }
    if (done.length) {
      await fetch(`/api/local/${accountId}/restored`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionIds: done }) });
      result.restored += done.length;
    }
  }
  return result;
}

/** Renames files on this computer, then records the new names. Used for a batch and for undoing one. */
export async function renameLocalFiles(items: Array<{ id: string; accountId: string; path: string; newName: string }>, opts: { batch?: string | null; undoOf?: string }) {
  const result = { renamed: 0, failed: 0, problems: [] as string[] };
  if (!items.length) return result;
  if (!supportsLocalFolders()) {
    result.failed = items.length;
    result.problems.push("Files on your computer can only be renamed from Chrome or Edge on that computer.");
    return result;
  }
  const byAccount = new Map<string, typeof items>();
  for (const it of items) byAccount.set(it.accountId, [...(byAccount.get(it.accountId) ?? []), it]);
  for (const [accountId, list] of byAccount) {
    const dir = await recallFolder(accountId);
    if (!dir || !(await ensurePermission(dir))) {
      result.failed += list.length;
      result.problems.push("A local folder isn't available in this browser — open CloudSweep on the computer that has it.");
      continue;
    }
    const done: Array<{ id: string; from: string; to: string }> = [];
    for (const it of list) {
      try {
        await renameFile(dir, it.path, it.newName);
        done.push({ id: it.id, from: it.path.split("/").pop()!, to: it.newName });
      } catch {
        result.failed++;
      }
    }
    if (done.length) {
      await fetch(`/api/local/${accountId}/renamed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renames: done, batch: opts.batch ?? undefined, undoOf: opts.undoOf }),
      });
      result.renamed += done.length;
    }
  }
  if (result.failed && !result.problems.length) result.problems.push(`${result.failed} file(s) couldn't be renamed — they may have been moved, opened or renamed elsewhere. Rescan the folder and try again.`);
  return result;
}

/** Creates a folder on this computer, then records it so the Library shows it. */
export async function createLocalFolder(accountId: string, path: string) {
  if (!supportsLocalFolders()) throw new Error("Folders on your computer can only be created from Chrome or Edge on that computer.");
  const dir = await recallFolder(accountId);
  if (!dir || !(await ensurePermission(dir))) throw new Error("That folder isn't available in this browser — open CloudSweep on the computer that has it.");
  await createFolder(dir, path);
  const r = await fetch(`/api/local/${accountId}/folder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't record the new folder");
}

/**
 * Permanently deletes files on this computer, either straight away (itemIds with their paths) or from
 * the CloudSweep Staging folder (actionIds with staged paths), then records it.
 */
export async function purgeLocalFiles(byAccount: Map<string, Array<{ itemId?: string; actionId?: number; path: string }>>, reason = "deleted") {
  const result = { deleted: 0, failed: 0, problems: [] as string[] };
  if (!supportsLocalFolders()) {
    result.failed = [...byAccount.values()].reduce((n, l) => n + l.length, 0);
    result.problems.push("Files on your computer can only be deleted from Chrome or Edge on that computer.");
    return result;
  }
  for (const [accountId, files] of byAccount) {
    const dir = await recallFolder(accountId);
    if (!dir || !(await ensurePermission(dir))) {
      result.failed += files.length;
      result.problems.push("A local folder isn't available in this browser — open CloudSweep on the computer that has it.");
      continue;
    }
    const itemIds: string[] = [];
    const actionIds: number[] = [];
    for (const f of files) {
      try {
        await deleteFile(dir, f.path);
        if (f.actionId != null) actionIds.push(f.actionId);
        else if (f.itemId) itemIds.push(f.itemId);
      } catch {
        result.failed++;
      }
    }
    if (itemIds.length || actionIds.length) {
      await fetch(`/api/local/${accountId}/purged`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds, actionIds, reason }) });
      result.deleted += itemIds.length + actionIds.length;
    }
  }
  if (result.failed && !result.problems.length) result.problems.push(`${result.failed} file(s) couldn't be deleted — they may have been moved or opened elsewhere.`);
  return result;
}
