import "server-only";
import { contextFor, getAccount, refreshQuota } from "./accounts";
import { num, one, query } from "./db";
import { hashKeys, type FileRow } from "./dedupe";
import { loadFiles, logAction, upsertItems } from "./items";
import type { Job } from "./jobs";
import { createJob } from "./jobs";
import { getProvider } from "./providers";
import type { CloudItem } from "./providers/types";

export interface ConsolidateParams {
  sourceAccountIds: string[];
  targetAccountId: string;
  targetFolder: string;
  mode: "copy" | "move";
  kinds?: string[];
  pathPrefix?: string;
  keepStructure?: boolean;
  skipDuplicates?: boolean;
}

export type PlannedAction = "copy" | "already-there" | "duplicate-in-batch" | "unsupported";

export interface PlanRow {
  file: FileRow;
  action: PlannedAction;
  targetPath: string;
}

export interface Plan {
  rows: PlanRow[];
  counts: Record<PlannedAction, number>;
  bytesToTransfer: number;
  bytesFreedAtSource: number;
  targetFree: number | null;
  warnings: string[];
}

const UNSUPPORTED_MIME = /^application\/vnd\.google-apps\./; // native Docs/Sheets/Slides need export, not download

export async function buildPlan(p: ConsolidateParams): Promise<Plan> {
  const target = await getAccount(p.targetAccountId);
  if (!target) throw new Error("Target account not found");
  if (target.provider === "local") throw new Error("Copying into a local folder isn't supported yet. Choose a cloud drive as the destination.");
  // Uploading from local folders runs in the browser and is planned for a later update.
  const localIds = new Set((await query<{ id: string }>("SELECT id FROM accounts WHERE provider = 'local'")).map((r) => r.id));
  const sources = p.sourceAccountIds.filter((id) => id !== p.targetAccountId && !localIds.has(id));
  const prefix = p.pathPrefix?.trim() ? "/" + p.pathPrefix.trim().replace(/^\/+|\/+$/g, "") : null;
  // No eligible sources means nothing to move (an empty filter would otherwise mean "every drive").
  const files = (sources.length ? await loadFiles({ accountIds: sources, kinds: p.kinds?.length ? p.kinds : undefined }) : []).filter(
    (f) => !prefix || f.path === prefix || f.path.startsWith(prefix + "/"),
  );
  const mimes = new Map(
    (await query<{ id: string; mime: string | null }>("SELECT id, mime FROM items WHERE id = ANY($1)", [files.map((f) => f.id)])).map((r) => [r.id, r.mime]),
  );

  const targetKeys = new Set<string>();
  if (p.skipDuplicates !== false) for (const f of await loadFiles({ accountIds: [p.targetAccountId] })) for (const k of hashKeys(f)) targetKeys.add(`${f.size}|${k}`);
  const plannedKeys = new Set<string>();

  const root = "/" + p.targetFolder.trim().replace(/^\/+|\/+$/g, "");
  const rows: PlanRow[] = [];
  for (const f of files.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.path.localeCompare(b.path))) {
    const dir = f.path.split("/").slice(0, -1).join("/");
    const rel = prefix ? dir.slice(prefix.length) : dir;
    const targetPath = p.keepStructure === false ? root : `${root}/${f.accountLabel.replace(/[\\/:*?"<>|]/g, "-")}${rel}`.replace(/\/+/g, "/");
    const keys = hashKeys(f).map((k) => `${f.size}|${k}`);
    let action: PlannedAction = "copy";
    if (UNSUPPORTED_MIME.test(mimes.get(f.id) ?? "")) action = "unsupported";
    else if (p.skipDuplicates !== false && keys.some((k) => targetKeys.has(k))) action = "already-there";
    else if (p.skipDuplicates !== false && keys.some((k) => plannedKeys.has(k))) action = "duplicate-in-batch";
    if (action === "copy") keys.forEach((k) => plannedKeys.add(k));
    rows.push({ file: f, action, targetPath });
  }

  const counts = { copy: 0, "already-there": 0, "duplicate-in-batch": 0, unsupported: 0 } as Record<PlannedAction, number>;
  rows.forEach((r) => counts[r.action]++);
  const bytesToTransfer = rows.filter((r) => r.action === "copy").reduce((s, r) => s + r.file.size, 0);
  const bytesFreedAtSource = p.mode === "move" ? rows.filter((r) => r.action !== "unsupported").reduce((s, r) => s + r.file.size, 0) : 0;
  const targetFree = target.quota_total != null && target.quota_used != null ? target.quota_total - target.quota_used : null;

  const warnings: string[] = [];
  if (targetFree != null && bytesToTransfer > targetFree) warnings.push(`Not enough space: ${target.label} has ${fmt(targetFree)} free but this needs ${fmt(bytesToTransfer)}.`);
  if (counts.unsupported) warnings.push(`${counts.unsupported} Google Docs/Sheets/Slides files are skipped — export them from Google first, or keep them in Google Drive.`);
  if (p.mode === "move") warnings.push("Move mode sends each source file to its provider's trash only after the copy is verified. Trash is recoverable for 30+ days.");
  return { rows, counts, bytesToTransfer, bytesFreedAtSource, targetFree, warnings };
}

export async function startConsolidation(p: ConsolidateParams): Promise<string> {
  const plan = await buildPlan(p);
  const work = plan.rows.filter((r) => r.action !== "unsupported" && (r.action === "copy" || p.mode === "move"));
  const jobId = await createJob("transfer", p.targetAccountId, p, { done: 0, total: work.length, bytes: 0, message: "Starting" });
  for (let i = 0; i < work.length; i += 300) {
    const chunk = work.slice(i, i + 300);
    const values = chunk.map((_, j) => `($1, $${j * 3 + 2}, $${j * 3 + 3}, $${j * 3 + 4})`).join(",");
    await query(`INSERT INTO transfer_items (job_id, item_id, target_path, action) VALUES ${values}`, [jobId, ...chunk.flatMap((r) => [r.file.id, r.targetPath, r.action])]);
  }
  return jobId;
}

export async function runTransferStep(job: Job, deadline: number, save: (patch: Partial<Job>) => Promise<void>) {
  const p = job.params as ConsolidateParams;
  const targetRow = (await one<{ provider: string }>("SELECT provider FROM accounts WHERE id = $1", [p.targetAccountId]))!;
  const target = getProvider(targetRow.provider);
  const tctx = await contextFor(p.targetAccountId);
  const folderCache = new Map<string, string>();
  const folder = async (path: string) => folderCache.get(path) ?? folderCache.set(path, await target.ensureFolder(tctx, path)).get(path)!;

  while (Date.now() < deadline) {
    const t = await one<any>(
      `SELECT t.*, i.account_id, i.remote_id, i.name, i.size, i.mime, i.path, i.md5, i.sha1, i.sha256, i.content_sha256, a.provider
       FROM transfer_items t JOIN items i ON i.id = t.item_id JOIN accounts a ON a.id = i.account_id
       WHERE t.job_id = $1 AND t.status IN ('pending', 'uploading') ORDER BY t.status DESC, t.item_id LIMIT 1`,
      [job.id],
    );
    if (!t) break;
    const source = getProvider(t.provider);
    const sctx = await contextFor(t.account_id);
    const size = num(t.size);
    try {
      if (t.action === "copy") {
        let session = t.session;
        let offset = num(t.bytes_done);
        if (!session) {
          const parentId = await folder(t.target_path);
          session = await target.startUpload(tctx, { parentId, name: t.name, size, mime: t.mime });
          await query("UPDATE transfer_items SET status = 'uploading', session = $3 WHERE job_id = $1 AND item_id = $2", [job.id, t.item_id, JSON.stringify(session)]);
        }
        let created: CloudItem | null = null;
        while (Date.now() < deadline) {
          const end = Math.min(offset + target.chunkSize, size) - 1;
          const chunk = size === 0 ? Buffer.alloc(0) : await source.downloadRange(sctx, t.remote_id, offset, end);
          created = await target.uploadChunk(tctx, session, chunk, offset, size);
          offset += chunk.length;
          await query("UPDATE transfer_items SET bytes_done = $3 WHERE job_id = $1 AND item_id = $2", [job.id, t.item_id, offset]);
          job.progress = { ...job.progress, bytes: num(job.progress.bytes) + chunk.length, message: `Copying ${t.name}` };
          if (created || offset >= size) break;
        }
        if (!created && offset >= size) throw new Error("Upload finished without the provider confirming the file.");
        if (!created) continue; // resume this file on the next step
        verifyCopy(t, created);
        await upsertItems(p.targetAccountId, [{ ...created, path: null }], null);
        await query("UPDATE items SET path = $2 WHERE id = $1", [`${p.targetAccountId}:${created.remoteId}`, `${t.target_path}/${created.name}`]);
        await logAction({ kind: "copy", accountId: p.targetAccountId, itemId: `${p.targetAccountId}:${created.remoteId}`, remoteId: created.remoteId, name: created.name, bytes: size, detail: { from: t.item_id, to: t.target_path } });
      }
      if (p.mode === "move") {
        await source.trash(sctx, t.remote_id);
        await query("UPDATE items SET trashed = TRUE WHERE id = $1", [t.item_id]);
        await logAction({ kind: "trash", accountId: t.account_id, itemId: t.item_id, remoteId: t.remote_id, name: t.name, bytes: size, detail: { path: t.path, reason: "consolidated" } });
      }
      await query("UPDATE transfer_items SET status = 'done' WHERE job_id = $1 AND item_id = $2", [job.id, t.item_id]);
    } catch (err) {
      await query("UPDATE transfer_items SET status = 'failed', error = $3 WHERE job_id = $1 AND item_id = $2", [job.id, t.item_id, (err as Error).message.slice(0, 500)]);
      job.progress = { ...job.progress, errors: num(job.progress.errors) + 1 };
    }
  }

  const counts = await one<any>(
    `SELECT COUNT(*) FILTER (WHERE status IN ('done','failed')) AS finished, COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'failed') AS failed FROM transfer_items WHERE job_id = $1`,
    [job.id],
  );
  job.progress = { ...job.progress, done: num(counts.finished), total: num(counts.total), errors: num(counts.failed) };
  if (num(counts.finished) >= num(counts.total)) {
    job.progress.message = num(counts.failed) ? `Finished with ${counts.failed} failed file(s)` : "Consolidation complete";
    await save({ status: "done", progress: job.progress });
    for (const id of [p.targetAccountId, ...p.sourceAccountIds]) await refreshQuota(id).catch(() => undefined);
  }
}

/** Never remove a source unless the copy provably matches it. */
function verifyCopy(src: any, created: CloudItem) {
  if (created.size !== num(src.size)) throw new Error(`Size mismatch after copy (${created.size} vs ${src.size}); source kept.`);
  const pairs: Array<[string | null, string | undefined]> = [
    [src.md5, created.hashes.md5],
    [src.sha1, created.hashes.sha1],
    // Demo hashes are simulated, so only compare a computed content hash on real providers.
    [src.provider === "demo" ? src.sha256 : (src.sha256 ?? src.content_sha256), created.hashes.sha256],
  ];
  for (const [a, b] of pairs) if (a && b && a.toLowerCase() !== b.toLowerCase()) throw new Error("Checksum mismatch after copy; source kept.");
}

export function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) (v /= 1024), i++;
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}
