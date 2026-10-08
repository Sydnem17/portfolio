import "server-only";
import { listAccounts } from "./accounts";
import { num, query } from "./db";
import { findDuplicates, findFolderOverlaps, type DuplicateGroup } from "./dedupe";
import { loadFiles } from "./items";

export interface ReportFilters {
  confidence?: string;
  kind?: string;
  account?: string;
  minSize?: number;
  q?: string;
}

export async function getDuplicateReport(f: ReportFilters = {}) {
  const files = await loadFiles();
  const all = findDuplicates(files);
  const folders = findFolderOverlaps(files, all).slice(0, 30);
  const q = f.q?.toLowerCase().trim();
  const groups = all.filter(
    (g) =>
      (!f.confidence || g.confidence === f.confidence) &&
      (!f.kind || g.kind === f.kind) &&
      (!f.account || g.members.some((m) => m.accountId === f.account)) &&
      (!f.minSize || g.members[0].size >= f.minSize) &&
      (!q || g.members.some((m) => m.path.toLowerCase().includes(q))),
  );
  const sum = (gs: DuplicateGroup[]) => gs.reduce((s, g) => s + g.wasteBytes, 0);
  return {
    summary: {
      groups: all.length,
      wasteBytes: sum(all.filter((g) => g.confidence !== "similar")),
      exact: { groups: all.filter((g) => g.confidence === "exact").length, bytes: sum(all.filter((g) => g.confidence === "exact")) },
      likely: { groups: all.filter((g) => g.confidence === "likely").length, bytes: sum(all.filter((g) => g.confidence === "likely")) },
      similar: { groups: all.filter((g) => g.confidence === "similar").length, bytes: sum(all.filter((g) => g.confidence === "similar")) },
      crossAccount: all.filter((g) => g.crossAccount).length,
    },
    filteredCount: groups.length,
    filteredWaste: sum(groups),
    groups: groups.slice(0, 250),
    folders,
  };
}

export async function getOverview() {
  const accounts = await listAccounts();
  const perAccount = await query<any>(
    `SELECT account_id, kind, COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM items WHERE NOT is_folder AND NOT trashed GROUP BY account_id, kind`,
  );
  const largest = await query<any>(
    `SELECT i.id, i.name, i.path, i.size, i.kind, i.web_url, a.label FROM items i JOIN accounts a ON a.id = i.account_id
     WHERE NOT i.is_folder AND NOT i.trashed ORDER BY i.size DESC LIMIT 12`,
  );
  const clutter = await query<any>(
    `SELECT i.id, i.name, i.path, i.size, a.label FROM items i JOIN accounts a ON a.id = i.account_id
     WHERE NOT i.is_folder AND NOT i.trashed AND (
       lower(i.name) ~ '\\.(exe|msi|dmg|pkg|iso|tmp|crdownload|part)$' OR lower(i.path) ~ '/(downloads|temp|tmp)/')
     ORDER BY i.size DESC LIMIT 12`,
  );
  const dupes = findDuplicates(await loadFiles());
  const recovered = await query<any>("SELECT COALESCE(SUM(bytes),0) AS bytes, COUNT(*) AS n FROM actions WHERE kind IN ('trash', 'purge') AND NOT undone");
  const photos = await query<any>(
    "SELECT COUNT(*) AS total, COUNT(t.item_id) AS analysed FROM items i LEFT JOIN photo_tags t ON t.item_id = i.id WHERE i.kind = 'image' AND NOT i.trashed",
  );

  const byKind: Record<string, { n: number; bytes: number }> = {};
  for (const r of perAccount) {
    const k = (byKind[r.kind] ??= { n: 0, bytes: 0 });
    k.n += num(r.n);
    k.bytes += num(r.bytes);
  }
  return {
    accounts: accounts.map((a) => ({
      ...a,
      files: perAccount.filter((r) => r.account_id === a.id).reduce((s, r) => s + num(r.n), 0),
      indexedBytes: perAccount.filter((r) => r.account_id === a.id).reduce((s, r) => s + num(r.bytes), 0),
    })),
    byKind,
    totalFiles: Object.values(byKind).reduce((s, k) => s + k.n, 0),
    totalBytes: Object.values(byKind).reduce((s, k) => s + k.bytes, 0),
    duplicateWaste: dupes.filter((g) => g.confidence !== "similar").reduce((s, g) => s + g.wasteBytes, 0),
    duplicateGroups: dupes.length,
    topGroups: dupes.slice(0, 5),
    largest: largest.map((r) => ({ ...r, size: num(r.size) })),
    clutter: clutter.map((r) => ({ ...r, size: num(r.size) })),
    recoveredBytes: num(recovered[0]?.bytes),
    actions: num(recovered[0]?.n),
    photos: { total: num(photos[0]?.total), analysed: num(photos[0]?.analysed) },
  };
}
