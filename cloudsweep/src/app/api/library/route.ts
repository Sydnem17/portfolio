import { handler } from "@/lib/api";
import { num, query } from "@/lib/db";

const FILE_COLS = "i.id, i.name, i.path, i.size, i.kind, i.modified_at, i.web_url, i.account_id, a.label, a.provider";

/** Folder listing for one account, or a cross-drive search when ?q= is given. */
export const GET = handler(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const q = u.get("q")?.trim();
  const mapFile = (r: any) => ({ id: r.id, name: r.name, path: r.path, size: num(r.size), kind: r.kind, modifiedAt: r.modified_at, webUrl: r.web_url, accountId: r.account_id, accountLabel: r.label, provider: r.provider });

  if (q) {
    const rows = await query<any>(
      `SELECT ${FILE_COLS} FROM items i JOIN accounts a ON a.id = i.account_id
       WHERE NOT i.is_folder AND NOT i.trashed AND position(lower($1) in lower(i.name)) > 0 ORDER BY i.size DESC LIMIT 300`,
      [q],
    );
    return { folders: [], files: rows.map(mapFile) };
  }

  const account = u.get("account");
  if (!account) return { folders: [], files: [] };
  const path = (u.get("path") ?? "/").replace(/\/+$/, "");
  const prefix = `${path}/`;
  const folders = await query<any>(
    `SELECT split_part(substr(path, $3), '/', 1) AS name, COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes
     FROM items WHERE account_id = $1 AND NOT is_folder AND NOT trashed AND starts_with(path, $2) AND strpos(substr(path, $3), '/') > 0
     GROUP BY 1 ORDER BY 1`,
    [account, prefix, prefix.length + 1],
  );
  const files = await query<any>(
    `SELECT ${FILE_COLS} FROM items i JOIN accounts a ON a.id = i.account_id
     WHERE i.account_id = $1 AND NOT i.is_folder AND NOT i.trashed AND starts_with(i.path, $2) AND strpos(substr(i.path, $3), '/') = 0
     ORDER BY i.name LIMIT 1000`,
    [account, prefix, prefix.length + 1],
  );
  return {
    folders: folders.map((f) => ({ name: f.name, path: `${path}/${f.name}`, files: num(f.files), bytes: num(f.bytes) })),
    files: files.map(mapFile),
  };
});

export const dynamic = "force-dynamic";
