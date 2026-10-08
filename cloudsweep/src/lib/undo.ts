import "server-only";
import { contextFor, refreshQuota } from "./accounts";
import { one, query } from "./db";
import { getProvider } from "./providers";

/** Reverses a logged action: restores trashed files, or trashes copies CloudSweep created. */
export async function undoAction(id: number): Promise<void> {
  const a = await one<any>("SELECT a.*, acc.provider FROM actions a JOIN accounts acc ON acc.id = a.account_id WHERE a.id = $1 AND NOT a.undone", [id]);
  if (!a) throw new Error("Action not found or already undone");
  if (a.provider === "local") throw new Error("Files on this computer are restored by your browser. Open the Staging bin in Chrome or Edge on that computer.");
  const provider = getProvider(a.provider);
  const ctx = await contextFor(a.account_id);
  if (a.kind === "trash") {
    await provider.restore(ctx, a.remote_id);
    await query("UPDATE items SET trashed = FALSE WHERE id = $1", [a.item_id]);
  } else if (a.kind === "copy") {
    await provider.trash(ctx, a.remote_id);
    await query("UPDATE items SET trashed = TRUE WHERE id = $1", [a.item_id]);
  } else if (a.kind === "rename") {
    await provider.rename(ctx, a.remote_id, a.detail.from);
    const it = await one<{ path: string | null }>("SELECT path FROM items WHERE id = $1", [a.item_id]);
    const path = it?.path ? `${it.path.slice(0, it.path.lastIndexOf("/"))}/${a.detail.from}` : null;
    await query("UPDATE items SET name = $2, path = COALESCE($3, path) WHERE id = $1", [a.item_id, a.detail.from, path]);
  } else {
    throw new Error(`Cannot undo ${a.kind}`);
  }
  await query("UPDATE actions SET undone = TRUE WHERE id = $1", [id]);
  await refreshQuota(a.account_id).catch(() => undefined);
}
