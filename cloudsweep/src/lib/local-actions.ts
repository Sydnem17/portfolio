"use client";

import { ensurePermission, moveToStaging, recallFolder, restoreFromStaging, supportsLocalFolders } from "./local-client";

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
