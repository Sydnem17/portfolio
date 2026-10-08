import "server-only";
import { num, query } from "./db";

export const REASON_LABEL: Record<string, string> = {
  duplicate: "Duplicates removed",
  deleted: "Files you deleted",
  moved: "Moved to another drive",
  consolidated: "Consolidated into one drive",
  other: "Other clean-ups",
};

/**
 * What CloudSweep has done for you, from the action log. Space counts only files still removed:
 * anything restored from the Staging bin drops out of the totals.
 */
export async function getProgress() {
  const trash = await query<any>(
    `SELECT a.bytes, a.created_at, COALESCE(a.detail->>'reason', 'other') AS reason, a.account_id, acc.label, acc.provider, COALESCE(i.kind, 'other') AS kind
     FROM actions a LEFT JOIN accounts acc ON acc.id = a.account_id LEFT JOIN items i ON i.id = a.item_id
     WHERE a.kind IN ('trash', 'purge') AND NOT a.undone`,
  );
  const counts = await query<{ kind: string; n: string; bytes: string }>(
    "SELECT kind, COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM actions WHERE NOT undone GROUP BY kind",
  );
  const c = (k: string) => num(counts.find((x) => x.kind === k)?.n);

  const group = <T extends string>(key: (r: any) => T, extra: (r: any) => object = () => ({})) => {
    const m = new Map<T, { key: T; files: number; bytes: number } & Record<string, unknown>>();
    for (const r of trash) {
      const k = key(r);
      const g = m.get(k) ?? { key: k, files: 0, bytes: 0, ...extra(r) };
      g.files++;
      g.bytes += num(r.bytes);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.bytes - a.bytes);
  };

  // Last 12 weeks, oldest first, Monday-start weeks.
  const weekStart = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  };
  const weeks: Array<{ week: string; bytes: number; files: number }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) weeks.push({ week: weekStart(new Date(now.getTime() - i * 7 * 864e5)), bytes: 0, files: 0 });
  for (const r of trash) {
    const w = weeks.find((x) => x.week === weekStart(new Date(r.created_at)));
    if (w) {
      w.bytes += num(r.bytes);
      w.files++;
    }
  }

  const recent = await query<any>(
    `SELECT a.id, a.kind, a.name, a.bytes, a.created_at, a.detail, acc.label FROM actions a LEFT JOIN accounts acc ON acc.id = a.account_id
     WHERE NOT a.undone ORDER BY a.created_at DESC, a.id DESC LIMIT 12`,
  );

  return {
    reclaimed: trash.reduce((s, r) => s + num(r.bytes), 0),
    filesRemoved: trash.length,
    renamed: c("rename"),
    moved: c("move") + c("copy"),
    byReason: group((r) => (REASON_LABEL[r.reason] ? r.reason : "other")),
    byDrive: group((r) => r.account_id ?? "unknown", (r) => ({ label: r.label ?? "Disconnected drive", provider: r.provider ?? "" })),
    byKind: group((r) => r.kind),
    weeks,
    recent: recent.map((r) => ({ id: num(r.id), kind: r.kind, name: r.name, bytes: num(r.bytes), at: r.created_at, reason: r.detail?.reason ?? null, to: r.detail?.to ?? null, from: r.detail?.from ?? null, drive: r.label })),
  };
}
