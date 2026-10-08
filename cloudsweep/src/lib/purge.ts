import "server-only";
import { contextFor, refreshQuota } from "./accounts";
import { one, query } from "./db";
import { getProvider } from "./providers";

/**
 * Permanently deletes files already in the Staging bin (cloud files). A deleted file's action becomes
 * kind 'purge': it leaves the Staging bin but still counts towards space reclaimed. Files on this
 * computer are deleted by the browser and recorded with recordLocalPurged.
 */
export async function purgeStaged(actionIds: number[]) {
  const failed: Array<{ id: number; error: string }> = [];
  let deleted = 0;
  const touched = new Set<string>();
  for (const id of actionIds) {
    const a = await one<any>(
      "SELECT a.id, a.item_id, a.remote_id, a.account_id, acc.provider FROM actions a JOIN accounts acc ON acc.id = a.account_id WHERE a.id = $1 AND a.kind = 'trash' AND NOT a.undone",
      [id],
    );
    if (!a) continue;
    if (a.provider === "local") {
      failed.push({ id, error: "Files on this computer are deleted by your browser — open the Staging bin in Chrome or Edge on that computer." });
      continue;
    }
    try {
      await getProvider(a.provider).purge(await contextFor(a.account_id), a.remote_id, true);
      await markPurged(id, a.item_id);
      touched.add(a.account_id);
      deleted++;
    } catch (err) {
      failed.push({ id, error: (err as Error).message });
    }
  }
  for (const acc of touched) await refreshQuota(acc).catch(() => undefined);
  return { deleted, failed };
}

async function markPurged(actionId: number, itemId: string | null) {
  await query("UPDATE actions SET kind = 'purge', detail = detail || '{\"permanent\": true}'::jsonb WHERE id = $1", [actionId]);
  if (itemId) await query("DELETE FROM items WHERE id = $1", [itemId]);
}

/** Records what the browser permanently deleted on this computer: staged files, or files deleted straight away. */
export async function recordLocalPurged(accountId: string, p: { actionIds?: number[]; itemIds?: string[]; reason?: string }) {
  const acc = await one<{ provider: string }>("SELECT provider FROM accounts WHERE id = $1", [accountId]);
  if (acc?.provider !== "local") throw new Error("Not a folder on this computer");
  for (const id of p.actionIds ?? []) {
    const a = await one<{ item_id: string }>("SELECT item_id FROM actions WHERE id = $1 AND account_id = $2 AND kind = 'trash' AND NOT undone", [id, accountId]);
    if (a) await markPurged(id, a.item_id);
  }
  for (const id of p.itemIds ?? []) {
    const it = await one<any>("SELECT id, remote_id, name, path, size FROM items WHERE id = $1 AND account_id = $2", [id, accountId]);
    if (!it) continue;
    await query(
      "INSERT INTO actions (kind, account_id, item_id, remote_id, name, bytes, detail) VALUES ('purge', $1, $2, $3, $4, $5, $6)",
      [accountId, it.id, it.remote_id, it.name, it.size, JSON.stringify({ path: it.path, reason: p.reason ?? "deleted", permanent: true, local: true })],
    );
    await query("DELETE FROM items WHERE id = $1", [id]);
  }
  return { recorded: (p.actionIds?.length ?? 0) + (p.itemIds?.length ?? 0) };
}
