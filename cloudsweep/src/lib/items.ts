import "server-only";
import { num, query } from "./db";
import type { FileRow } from "./dedupe";
import { kindOf, type CloudItem } from "./providers/types";

const COLS = [
  "id", "account_id", "remote_id", "parent_remote_id", "name", "path", "is_folder", "size", "mime", "kind",
  "md5", "sha1", "sha256", "quick_xor", "provider_hash", "modified_at", "created_remote", "taken_at",
  "lat", "lng", "width", "height", "web_url", "scan_id",
] as const;

const SAME = "items.size = EXCLUDED.size AND items.modified_at IS NOT DISTINCT FROM EXCLUDED.modified_at";

export async function upsertItems(accountId: string, items: CloudItem[], scanId: string | null) {
  for (let i = 0; i < items.length; i += 150) {
    const chunk = items.slice(i, i + 150);
    const params: unknown[] = [];
    const rows = chunk.map((it) => {
      const vals = [
        `${accountId}:${it.remoteId}`, accountId, it.remoteId, it.parentRemoteId, it.name, it.path ?? null, it.isFolder, it.size,
        it.mime, kindOf(it.name, it.mime, it.isFolder), it.hashes.md5 ?? null, it.hashes.sha1 ?? null, it.hashes.sha256 ?? null,
        it.hashes.quickXor ?? null, it.hashes.provider ?? null, it.modifiedAt, it.createdAt, it.takenAt ?? null,
        it.location?.lat ?? null, it.location?.lng ?? null, it.width ?? null, it.height ?? null, it.webUrl ?? null, scanId,
      ];
      const base = params.length;
      params.push(...vals);
      return `(${vals.map((_, j) => `$${base + j + 1}`).join(",")})`;
    });
    const updates = COLS.filter((c) => !["id", "md5", "sha1", "sha256", "quick_xor", "path"].includes(c))
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(", ");
    await query(
      `INSERT INTO items (${COLS.join(",")}) VALUES ${rows.join(",")}
       ON CONFLICT (id) DO UPDATE SET ${updates}, trashed = FALSE, updated_at = now(),
         content_sha256 = CASE WHEN ${SAME} THEN items.content_sha256 ELSE NULL END,
         -- Providers that only report parent IDs send no path; keep the known one unless the item moved or was renamed.
         path = COALESCE(EXCLUDED.path, CASE WHEN items.parent_remote_id IS NOT DISTINCT FROM EXCLUDED.parent_remote_id AND items.name = EXCLUDED.name THEN items.path END),
         -- Local folders report no hashes while listing; keep the fingerprints computed earlier if the file is unchanged.
         md5 = COALESCE(EXCLUDED.md5, CASE WHEN ${SAME} THEN items.md5 END),
         sha1 = COALESCE(EXCLUDED.sha1, CASE WHEN ${SAME} THEN items.sha1 END),
         sha256 = COALESCE(EXCLUDED.sha256, CASE WHEN ${SAME} THEN items.sha256 END),
         quick_xor = COALESCE(EXCLUDED.quick_xor, CASE WHEN ${SAME} THEN items.quick_xor END)`,
      params,
    );
  }
}

/**
 * Fills in paths for items whose parent folder's path is already known, a few levels at a time.
 * Runs after every scan page so the Library shows folders while a large drive is still scanning.
 */
export async function resolvePathsIncremental(accountId: string, maxLevels = 12): Promise<number> {
  // The drive root (OneDrive lists it; it has no parent and no name) anchors everything else.
  await query("UPDATE items SET path = '/' WHERE account_id = $1 AND path IS NULL AND parent_remote_id IS NULL AND name = ''", [accountId]);
  let total = 0;
  for (let level = 0; level < maxLevels; level++) {
    const [r] = await query<{ n: string }>(
      `WITH u AS (
         UPDATE items c SET path = CASE WHEN p.path IN ('', '/') THEN '/' || c.name ELSE p.path || '/' || c.name END
         FROM items p
         WHERE c.account_id = $1 AND c.path IS NULL AND c.parent_remote_id IS NOT NULL
           AND p.id = $1 || ':' || c.parent_remote_id AND p.path IS NOT NULL
         RETURNING 1)
       SELECT COUNT(*) AS n FROM u`,
      [accountId],
    );
    const n = Number(r?.n ?? 0);
    total += n;
    if (!n) break;
  }
  return total;
}

/** Rebuilds full paths from parent links (Google/OneDrive give parents, not paths). */
export async function resolvePaths(accountId: string) {
  const rows = await query<{ remote_id: string; parent_remote_id: string | null; name: string; path: string | null }>(
    "SELECT remote_id, parent_remote_id, name, path FROM items WHERE account_id = $1 AND NOT trashed",
    [accountId],
  );
  const byId = new Map(rows.map((r) => [r.remote_id, r]));
  const memo = new Map<string, string>();
  const resolve = (id: string, depth = 0): string => {
    if (memo.has(id)) return memo.get(id)!;
    const r = byId.get(id);
    if (!r || depth > 64) return "";
    if (r.path && r.path.startsWith("/")) return r.path;
    const parent = r.parent_remote_id ? resolve(r.parent_remote_id, depth + 1) : "";
    // A parent we never listed is the drive root (Google doesn't return "My Drive" itself).
    const p = `${parent}/${r.name}`.replace(/^\/+/, "/");
    const out = r.name === "" && !r.parent_remote_id ? "" : p;
    memo.set(id, out);
    return out;
  };
  const updates = rows.map((r) => [r.remote_id, resolve(r.remote_id) || "/"] as const).filter(([id, p]) => byId.get(id)!.path !== p);
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const values = chunk.map((_, j) => `($${j * 2 + 2}, $${j * 2 + 3})`).join(",");
    await query(`UPDATE items SET path = v.path FROM (VALUES ${values}) AS v(remote_id, path) WHERE items.account_id = $1 AND items.remote_id = v.remote_id`, [
      accountId,
      ...chunk.flat(),
    ]);
  }
}

export async function loadFiles(filter: { accountIds?: string[]; kinds?: string[] } = {}): Promise<FileRow[]> {
  const where = ["NOT i.is_folder", "NOT i.trashed"];
  const params: unknown[] = [];
  if (filter.accountIds?.length) {
    params.push(filter.accountIds);
    where.push(`i.account_id = ANY($${params.length})`);
  }
  if (filter.kinds?.length) {
    params.push(filter.kinds);
    where.push(`i.kind = ANY($${params.length})`);
  }
  const rows = await query<any>(
    `SELECT i.id, i.account_id, a.label, a.provider, a.is_primary, i.name, i.path, i.size, i.kind, i.md5, i.sha1, i.sha256,
            i.quick_xor, i.provider_hash, i.content_sha256, i.phash, i.width, i.height, i.created_remote, i.modified_at, i.web_url
     FROM items i JOIN accounts a ON a.id = i.account_id WHERE ${where.join(" AND ")}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    accountLabel: r.label,
    provider: r.provider,
    isPrimary: r.is_primary,
    name: r.name,
    path: r.path ?? `/${r.name}`,
    size: num(r.size),
    kind: r.kind,
    md5: r.md5,
    sha1: r.sha1,
    sha256: r.sha256,
    quickXor: r.quick_xor,
    providerHash: r.provider_hash,
    contentSha256: r.content_sha256,
    phash: r.phash,
    width: r.width,
    height: r.height,
    createdAt: r.created_remote ? new Date(r.created_remote).toISOString() : null,
    modifiedAt: r.modified_at ? new Date(r.modified_at).toISOString() : null,
    webUrl: r.web_url,
  }));
}

export async function logAction(a: { kind: string; accountId?: string; itemId?: string; remoteId?: string; name?: string; bytes?: number; detail?: object }) {
  await query("INSERT INTO actions (kind, account_id, item_id, remote_id, name, bytes, detail) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
    a.kind, a.accountId ?? null, a.itemId ?? null, a.remoteId ?? null, a.name ?? null, a.bytes ?? 0, JSON.stringify(a.detail ?? {}),
  ]);
}
