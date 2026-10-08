import { listAccounts } from "@/lib/accounts";
import { handler } from "@/lib/api";
import { num, query } from "@/lib/db";

/** Capacity of every drive, for the sidebar meters and the "move to" picker. */
export const GET = handler(async () => {
  const accounts = await listAccounts();
  const indexed = new Map(
    (await query<{ account_id: string; bytes: string }>("SELECT account_id, COALESCE(SUM(size), 0) AS bytes FROM items WHERE NOT is_folder AND NOT trashed GROUP BY 1")).map((r) => [
      r.account_id,
      num(r.bytes),
    ]),
  );
  return {
    drives: accounts.map((a) => ({
      id: a.id,
      label: a.label,
      provider: a.provider,
      total: a.quota_total == null ? null : num(a.quota_total),
      used: a.quota_used == null ? (indexed.get(a.id) ?? 0) : num(a.quota_used),
    })),
  };
});

export const dynamic = "force-dynamic";
