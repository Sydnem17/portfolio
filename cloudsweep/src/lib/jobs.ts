import "server-only";
import { createHash } from "node:crypto";
import { contextFor, refreshQuota } from "./accounts";
import { newId } from "./crypto";
import { num, one, query } from "./db";
import { findDuplicates } from "./dedupe";
import { loadFiles, logAction, resolvePaths, resolvePathsIncremental, upsertItems } from "./items";
import { EXIF_HEAD_BYTES, readExifHead } from "./photos/exif";
import { dHash, toJpeg } from "./photos/phash";
import { tagPhotos, visionEnabled } from "./photos/vision";
import { getProvider } from "./providers";
import { demoTagsFor } from "./providers/demo";

/**
 * Resumable jobs. Each call to runStep() does a bounded slice of work (STEP_BUDGET_MS) and saves
 * a cursor, so long operations survive serverless time limits, browser tabs closing and redeploys.
 * The browser drives steps while a page is open; /api/cron drives them in the background.
 */
export type JobType = "scan" | "verify" | "analyse" | "transfer" | "trash" | "rename";

export interface Job {
  id: string;
  type: JobType;
  account_id: string | null;
  status: "running" | "done" | "failed" | "cancelled";
  params: any;
  cursor: any;
  progress: { done?: number; total?: number; message?: string; bytes?: number; errors?: number };
  error: string | null;
  /** Name of the drive the job belongs to, when it belongs to one (listJobs only). */
  account_label?: string | null;
  created_at: string;
  updated_at: string;
}

const BUDGET = Number(process.env.STEP_BUDGET_MS ?? 8000);
export const VERIFY_MAX_BYTES = 150 * 1024 * 1024;

export async function createJob(type: JobType, accountId: string | null, params: object = {}, progress: object = {}): Promise<string> {
  // One active job per type+account: return the existing one instead of racing it.
  const existing = await one<{ id: string }>("SELECT id FROM jobs WHERE type = $1 AND account_id IS NOT DISTINCT FROM $2 AND status = 'running'", [type, accountId]);
  if (existing && type !== "transfer" && type !== "trash" && type !== "rename") return existing.id;
  const id = newId("job");
  await query("INSERT INTO jobs (id, type, account_id, params, progress) VALUES ($1,$2,$3,$4,$5)", [id, type, accountId, JSON.stringify(params), JSON.stringify(progress)]);
  return id;
}

export async function getJob(id: string): Promise<Job | null> {
  return one<Job>("SELECT * FROM jobs WHERE id = $1", [id]);
}

export async function listJobs(limit = 30): Promise<Job[]> {
  return query<Job>("SELECT j.*, a.label AS account_label FROM jobs j LEFT JOIN accounts a ON a.id = j.account_id ORDER BY j.created_at DESC LIMIT $1", [limit]);
}

export async function cancelJob(id: string) {
  await query("UPDATE jobs SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status = 'running'", [id]);
}

async function save(job: Job, patch: Partial<Pick<Job, "status" | "cursor" | "progress" | "error">>) {
  Object.assign(job, patch);
  await query("UPDATE jobs SET status = $2, cursor = $3, progress = $4, error = $5, locked_until = NULL, updated_at = now() WHERE id = $1", [
    job.id, job.status, JSON.stringify(job.cursor ?? null), JSON.stringify(job.progress ?? {}), job.error,
  ]);
}

/** Runs one bounded step. Returns the updated job (or the current state if another worker holds it). */
export async function runStep(id: string): Promise<Job | null> {
  const job = await one<Job>(
    `UPDATE jobs SET locked_until = now() + interval '90 seconds'
     WHERE id = $1 AND status = 'running' AND (locked_until IS NULL OR locked_until < now()) RETURNING *`,
    [id],
  );
  if (!job) return getJob(id);
  const deadline = Date.now() + BUDGET;
  try {
    await HANDLERS[job.type](job, deadline);
    if (job.status === "running") await save(job, {});
  } catch (err) {
    await save(job, { status: "failed", error: (err as Error).message.slice(0, 1000) });
  }
  return getJob(id);
}

export async function runPendingSteps(maxMs = 50000): Promise<number> {
  const end = Date.now() + maxMs;
  let steps = 0;
  while (Date.now() < end) {
    const next = await one<{ id: string }>("SELECT id FROM jobs WHERE status = 'running' AND (locked_until IS NULL OR locked_until < now()) ORDER BY updated_at LIMIT 1");
    if (!next) break;
    await runStep(next.id);
    steps++;
  }
  return steps;
}

// ── Handlers ────────────────────────────────────────────────────────────────

const HANDLERS: Record<JobType, (job: Job, deadline: number) => Promise<void>> = {
  async scan(job, deadline) {
    const accountId = job.account_id!;
    const providerId = (await one<{ provider: string }>("SELECT provider FROM accounts WHERE id = $1", [accountId]))!.provider;
    // Local folders are scanned by the browser; a server-side scan would see nothing and wipe the index.
    if (providerId === "local") throw new Error("Local folders are rescanned from the Storage accounts page in Chrome or Edge on that computer.");
    const provider = getProvider(providerId);
    const ctx = await contextFor(accountId);
    const c = job.cursor ?? { next: null, started: false };
    let done = num(job.progress.done);
    do {
      const page = await provider.list(ctx, c.next);
      await upsertItems(accountId, page.items, job.id);
      await resolvePathsIncremental(accountId);
      done += page.items.length;
      c.next = page.next;
      c.started = true;
      job.cursor = c;
      job.progress = { done, message: `Reading names, sizes & checksums · ${done.toLocaleString()} items` };
      if (!page.next) break;
    } while (Date.now() < deadline);

    if (c.next === null && c.started) {
      job.progress.message = "Finishing up…";
      // Anything not seen in this scan was deleted or moved out of the account.
      await query("DELETE FROM items WHERE account_id = $1 AND scan_id IS DISTINCT FROM $2", [accountId, job.id]);
      await resolvePaths(accountId);
      await refreshQuota(accountId).catch(() => undefined);
      await query("UPDATE accounts SET last_scan_at = now() WHERE id = $1", [accountId]);
      await save(job, { status: "done", progress: { done, total: done, message: `Indexed ${done.toLocaleString()} items` } });
    }
  },

  async verify(job, deadline) {
    if (!job.cursor) {
      // Queue every member of a "likely" group small enough to hash in one step.
      const groups = findDuplicates(await loadFiles()).filter((g) => g.confidence === "likely");
      // Local files are fingerprinted by the browser when scanned, so only cloud files need downloading here.
      const ids = [...new Set(groups.flatMap((g) => g.members.filter((m) => m.provider !== "local" && !m.contentSha256 && m.size <= VERIFY_MAX_BYTES).map((m) => m.id)))];
      job.cursor = { ids, i: 0 };
      job.progress = { done: 0, total: ids.length, message: ids.length ? "Verifying file contents" : "Nothing needs verifying" };
    }
    const c = job.cursor as { ids: string[]; i: number };
    while (c.i < c.ids.length && Date.now() < deadline) {
      const row = await one<any>("SELECT i.account_id, i.remote_id, i.size, a.provider FROM items i JOIN accounts a ON a.id = i.account_id WHERE i.id = $1", [c.ids[c.i]]);
      if (row) {
        const provider = getProvider(row.provider);
        const ctx = await contextFor(row.account_id);
        const hash = createHash("sha256");
        const size = num(row.size);
        const step = 16 * 1024 * 1024;
        for (let off = 0; off < size; off += step) hash.update(await provider.downloadRange(ctx, row.remote_id, off, Math.min(off + step, size) - 1));
        await query("UPDATE items SET content_sha256 = $2 WHERE id = $1", [c.ids[c.i], hash.digest("hex")]);
      }
      c.i++;
      job.progress = { done: c.i, total: c.ids.length, message: `Verified ${c.i} of ${c.ids.length} files` };
    }
    if (c.i >= c.ids.length) await save(job, { status: "done" });
  },

  async analyse(job, deadline) {
    const useVision = visionEnabled();
    const total = num((await one("SELECT COUNT(*) AS n FROM items WHERE kind = 'image' AND NOT trashed"))?.n);
    while (Date.now() < deadline) {
      // Places first: many providers leave GPS out of their listings, so read it from the photo itself
      // (only the first ~192 KB is downloaded, never the whole file).
      const noGps = await query<any>(
        `SELECT i.id, i.account_id, i.remote_id, i.size, a.provider FROM items i JOIN accounts a ON a.id = i.account_id
         WHERE i.kind = 'image' AND NOT i.trashed AND i.lat IS NULL AND NOT i.exif_checked AND a.provider NOT IN ('local', 'demo')
         ORDER BY i.id LIMIT 6`,
      );
      if (noGps.length) {
        await Promise.all(
          noGps.map(async (b) => {
            const size = num(b.size);
            const head = size
              ? await getProvider(b.provider).downloadRange(await contextFor(b.account_id), b.remote_id, 0, Math.min(size, EXIF_HEAD_BYTES) - 1).catch(() => null)
              : null;
            const f = head ? await readExifHead(head) : { lat: null, lng: null, takenAt: null };
            await query("UPDATE items SET lat = COALESCE(lat, $2), lng = COALESCE(lng, $3), taken_at = COALESCE(taken_at, $4), exif_checked = TRUE WHERE id = $1", [b.id, f.lat, f.lng, f.takenAt]);
          }),
        );
        const left = num((await one("SELECT COUNT(*) AS n FROM items i JOIN accounts a ON a.id = i.account_id WHERE i.kind = 'image' AND NOT i.trashed AND i.lat IS NULL AND NOT i.exif_checked AND a.provider NOT IN ('local', 'demo')"))?.n);
        job.progress = { done: 0, total, message: `Finding where photos were taken · ${left.toLocaleString()} to check` };
        continue;
      }
      const batch = await query<any>(
        `SELECT i.id, i.account_id, i.remote_id, a.provider FROM items i JOIN accounts a ON a.id = i.account_id
         LEFT JOIN photo_tags t ON t.item_id = i.id
         WHERE i.kind = 'image' AND NOT i.trashed AND (i.phash IS NULL OR t.item_id IS NULL)
         ORDER BY i.id LIMIT 6`,
      );
      if (!batch.length) {
        await save(job, { status: "done", progress: { done: total, total, message: "All photos analysed" } });
        return;
      }
      const thumbs = await Promise.all(
        batch.map(async (b) => {
          const ctx = await contextFor(b.account_id);
          const raw = await getProvider(b.provider).thumbnail(ctx, { remoteId: b.remote_id }).catch(() => null);
          return raw ? toJpeg(raw) : null;
        }),
      );
      for (const [i, b] of batch.entries()) {
        await query("UPDATE items SET phash = $2 WHERE id = $1", [b.id, thumbs[i] ? ((await dHash(thumbs[i]!)) ?? "none") : "none"]);
      }
      // Tags: preset for demo files, Claude vision when configured, otherwise phash-only.
      const live = batch.map((b, i) => ({ b, img: thumbs[i] })).filter((x) => x.b.provider !== "demo" && x.img);
      const tags = useVision && live.length ? await tagPhotos(live.map((x) => x.img!)).catch(() => []) : [];
      for (const b of batch) {
        let t: any = null;
        if (b.provider === "demo") {
          const d = await demoTagsFor(b.account_id, b.remote_id).catch(() => null);
          if (d) t = { people_count: d.people, pets: d.pets, things: d.things, scene: d.scene, event: d.event ?? null, place_hint: d.place ?? null, caption: d.caption };
        } else {
          const li = live.findIndex((x) => x.b.id === b.id);
          t = tags.find((x) => x.index === li) ?? null;
        }
        // No AI result: just mark the photo as seen, and never wipe tags the browser AI already added.
        await query(
          `INSERT INTO photo_tags (item_id, people_count, pets, things, scene, event, place_hint, caption, tagged_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (item_id) DO ${t ? `UPDATE SET people_count = EXCLUDED.people_count, pets = EXCLUDED.pets, things = EXCLUDED.things,
             scene = EXCLUDED.scene, event = EXCLUDED.event, place_hint = EXCLUDED.place_hint, caption = EXCLUDED.caption, tagged_by = EXCLUDED.tagged_by, analysed_at = now()` : "NOTHING"}`,
          [b.id, t?.people_count ?? 0, JSON.stringify(t?.pets ?? []), JSON.stringify(t?.things ?? []), t?.scene ?? null, t?.event ?? null, t?.place_hint ?? null, t?.caption ?? null, t ? (b.provider === "demo" ? "demo" : "claude") : null],
        );
      }
      const remaining = num((await one(`SELECT COUNT(*) AS n FROM items i LEFT JOIN photo_tags t ON t.item_id = i.id WHERE i.kind = 'image' AND NOT i.trashed AND (i.phash IS NULL OR t.item_id IS NULL)`))?.n);
      job.progress = { done: total - remaining, total, message: useVision ? "Analysing photos with AI" : "Finding look-alike photos" };
    }
  },

  async trash(job, deadline) {
    const c = (job.cursor ??= { i: 0, bytes: 0, errors: 0 });
    const ids: string[] = job.params.itemIds ?? [];
    while (c.i < ids.length && Date.now() < deadline) {
      const it = await one<any>("SELECT i.id, i.account_id, i.remote_id, i.name, i.size, i.path, a.provider FROM items i JOIN accounts a ON a.id = i.account_id WHERE i.id = $1 AND NOT i.trashed", [ids[c.i]]);
      if (it?.provider === "local") c.errors++; // moved by the browser instead (see DuplicatesView)
      else if (it) {
        try {
          await getProvider(it.provider).trash(await contextFor(it.account_id), it.remote_id);
          await query("UPDATE items SET trashed = TRUE WHERE id = $1", [it.id]);
          await logAction({ kind: "trash", accountId: it.account_id, itemId: it.id, remoteId: it.remote_id, name: it.name, bytes: num(it.size), detail: { path: it.path, reason: job.params.reason } });
          c.bytes += num(it.size);
        } catch {
          c.errors++;
        }
      }
      c.i++;
      job.progress = { done: c.i, total: ids.length, bytes: c.bytes, errors: c.errors, message: `Moved ${c.i} of ${ids.length} to trash` };
    }
    if (c.i >= ids.length) {
      await save(job, { status: "done" });
      for (const a of new Set((await query<{ account_id: string }>("SELECT DISTINCT account_id FROM items WHERE id = ANY($1)", [ids])).map((r) => r.account_id)))
        await refreshQuota(a).catch(() => undefined);
    }
  },

  async rename(job, deadline) {
    const c = (job.cursor ??= { i: 0, errors: 0, firstError: null as string | null });
    const list: Array<{ id: string; newName: string }> = job.params.renames ?? [];
    const contexts = new Map<string, Awaited<ReturnType<typeof contextFor>>>();
    while (c.i < list.length && Date.now() < deadline) {
      const r = list[c.i];
      const it = await one<any>("SELECT i.id, i.account_id, i.remote_id, i.name, i.path, a.provider FROM items i JOIN accounts a ON a.id = i.account_id WHERE i.id = $1 AND NOT i.trashed", [r.id]);
      if (!it || it.provider === "local") c.errors++; // local files are renamed by the browser
      else if (it.name !== r.newName) {
        try {
          if (!contexts.has(it.account_id)) contexts.set(it.account_id, await contextFor(it.account_id));
          await getProvider(it.provider).rename(contexts.get(it.account_id)!, it.remote_id, r.newName);
          const path = `${String(it.path ?? "/" + it.name).slice(0, String(it.path ?? "/" + it.name).lastIndexOf("/"))}/${r.newName}`;
          await query("UPDATE items SET name = $2, path = $3, updated_at = now() WHERE id = $1", [it.id, r.newName, path]);
          if (job.params.undoOf) {
            await query("UPDATE actions SET undone = TRUE WHERE kind = 'rename' AND item_id = $1 AND detail->>'batch' = $2", [it.id, job.params.undoOf]);
          } else {
            await logAction({ kind: "rename", accountId: it.account_id, itemId: it.id, remoteId: it.remote_id, name: r.newName, detail: { from: it.name, to: r.newName, path, batch: job.params.batch } });
          }
        } catch (err) {
          c.errors++;
          c.firstError ??= `${it.name}: ${(err as Error).message}`.slice(0, 300);
        }
      }
      c.i++;
      job.progress = { done: c.i, total: list.length, errors: c.errors, message: `${job.params.undoOf ? "Undoing" : "Renamed"} ${c.i} of ${list.length}` };
    }
    if (c.i >= list.length) {
      const ok = list.length - c.errors;
      job.progress.message = job.params.undoOf
        ? `Put back ${ok} original name${ok === 1 ? "" : "s"}`
        : `Renamed ${ok} file${ok === 1 ? "" : "s"}${c.errors ? ` · ${c.errors} couldn't be renamed${c.firstError ? ` (${c.firstError})` : ""}` : ""}`;
      await save(job, { status: "done" });
    }
  },

  async transfer(job, deadline) {
    const { runTransferStep } = await import("./consolidate");
    await runTransferStep(job, deadline, (patch) => save(job, patch));
  },
};
