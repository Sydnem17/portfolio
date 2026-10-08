import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

process.env.APP_SECRET = "test-secret-test-secret-test-secret-123";
process.env.STEP_BUDGET_MS = "20000";

const { createDemoAccounts, renameAccount, uniqueLabel } = await import("@/lib/accounts");
const { createJob, runStep } = await import("@/lib/jobs");
const { getDuplicateReport } = await import("@/lib/report");
const { buildPlan } = await import("@/lib/consolidate");
const { createLocalAccount, ingestLocalScan, localHashCandidates, saveLocalHashes, recordLocalStaged, recordLocalRestored } = await import("@/lib/local");
const { upsertItems, resolvePathsIncremental } = await import("@/lib/items");
const { query, one } = await import("@/lib/db");

const h = (alg: string, s: string) => createHash(alg).update(s).digest("hex");

async function runToEnd(id: string) {
  for (let i = 0; i < 500; i++) {
    const j = await runStep(id);
    if (j!.status !== "running") return j!;
  }
  throw new Error("job did not finish");
}

describe("local folders", () => {
  let local: { id: string; label: string };
  let target: { name: string; size: number; key: string };

  beforeAll(async () => {
    for (const id of await createDemoAccounts()) await runToEnd(await createJob("scan", id));
    // A real cloud file to duplicate locally: the demo "Tax Return" PDF in OneDrive.
    const row = await one<any>("SELECT name, size FROM items WHERE account_id = 'demo-onedrive' AND name = 'Tax Return 2023-24.pdf'");
    target = { name: row.name, size: Number(row.size), key: `doc:${row.name}` };
    local = await createLocalAccount("USB Backup");
  });

  it("gives local folders a clear, unique name", async () => {
    expect(local.label).toBe("USB Backup (this computer)");
    const again = await createLocalAccount("USB Backup");
    expect(again.label).toBe("USB Backup (this computer) (2)");
  });

  it("indexes a browser-side walk and only fingerprints files that could be duplicates", async () => {
    await ingestLocalScan(local.id, "scan_aaaaaaaa", [
      { path: "/Tax", isFolder: true, size: 0, modifiedAt: null },
      { path: "/Tax/Tax Return 2023-24.pdf", isFolder: false, size: target.size, modifiedAt: "2024-07-30T00:00:00Z" },
      { path: "/Tax/unique-notes.txt", isFolder: false, size: 1234567, modifiedAt: "2024-07-30T00:00:00Z" },
      { path: "/CloudSweep Staging/old.pdf", isFolder: false, size: 10, modifiedAt: null },
    ], true);
    const rows = await query<any>("SELECT path FROM items WHERE account_id = $1 ORDER BY path", [local.id]);
    expect(rows.map((r) => r.path)).toEqual(["/Tax", "/Tax/Tax Return 2023-24.pdf", "/Tax/unique-notes.txt"]);
    const c = await localHashCandidates(local.id);
    expect(c.files.map((f) => f.path)).toEqual(["/Tax/Tax Return 2023-24.pdf"]);
  });

  it("matches a local file to its cloud copy by fingerprint", async () => {
    const id = `${local.id}:/Tax/Tax Return 2023-24.pdf`;
    // Demo cloud files report these (simulated) hashes for this content.
    await saveLocalHashes(local.id, [{ itemId: id, md5: h("md5", target.key), sha1: h("sha1", target.key), sha256: h("sha256", target.key), quickXor: "q".repeat(27) + "=" }]);
    const g = (await getDuplicateReport({ q: "Tax Return 2023-24" })).groups.find((x) => x.members.some((m) => m.id === id))!;
    expect(g.confidence).toBe("exact");
    expect(g.members.some((m) => m.provider === "demo")).toBe(true);
    expect((await localHashCandidates(local.id)).remaining).toBe(0);
  });

  it("keeps fingerprints across rescans unless the file changed", async () => {
    const id = `${local.id}:/Tax/Tax Return 2023-24.pdf`;
    const entry = { path: "/Tax/Tax Return 2023-24.pdf", isFolder: false, size: target.size, modifiedAt: "2024-07-30T00:00:00Z" };
    await ingestLocalScan(local.id, "scan_bbbbbbbb", [entry], true);
    expect((await one<any>("SELECT sha256 FROM items WHERE id = $1", [id])).sha256).toBe(h("sha256", target.key));
    expect(await one("SELECT 1 FROM items WHERE id = $1", [`${local.id}:/Tax/unique-notes.txt`])).toBeNull(); // gone from disk
    await ingestLocalScan(local.id, "scan_cccccccc", [{ ...entry, modifiedAt: "2025-01-01T00:00:00Z" }], true);
    expect((await one<any>("SELECT sha256 FROM items WHERE id = $1", [id])).sha256).toBeNull();
  });

  it("records staging moves in the Staging bin and restores them", async () => {
    const id = `${local.id}:/Tax/Tax Return 2023-24.pdf`;
    await recordLocalStaged(local.id, [{ itemId: id, stagedPath: "/CloudSweep Staging/Tax/Tax Return 2023-24.pdf" }]);
    expect((await one<any>("SELECT trashed FROM items WHERE id = $1", [id])).trashed).toBe(true);
    const a = await one<any>("SELECT id, detail FROM actions WHERE item_id = $1 AND NOT undone", [id]);
    expect(a.detail).toMatchObject({ local: true, stagedPath: "/CloudSweep Staging/Tax/Tax Return 2023-24.pdf", path: "/Tax/Tax Return 2023-24.pdf" });
    await recordLocalRestored(local.id, [Number(a.id)]);
    expect((await one<any>("SELECT trashed FROM items WHERE id = $1", [id])).trashed).toBe(false);
  });

  it("never lets the server scan, verify or trash local files itself", async () => {
    const job = await runToEnd(await createJob("scan", local.id));
    expect(job.status).toBe("failed");
    expect(Number((await one<any>("SELECT COUNT(*) AS n FROM items WHERE account_id = $1", [local.id])).n)).toBeGreaterThan(0);
    const t = await runToEnd(await createJob("trash", null, { itemIds: [`${local.id}:/Tax/Tax Return 2023-24.pdf`] }, {}));
    expect(t.progress.errors).toBe(1);
    expect((await one<any>("SELECT trashed FROM items WHERE id = $1", [`${local.id}:/Tax/Tax Return 2023-24.pdf`])).trashed).toBe(false);
  });

  it("leaves local folders out of cloud consolidation for now", async () => {
    await expect(buildPlan({ sourceAccountIds: ["demo-onedrive"], targetAccountId: local.id, targetFolder: "/x", mode: "copy" })).rejects.toThrow(/local folder/);
    const plan = await buildPlan({ sourceAccountIds: [local.id], targetAccountId: "demo-gpersonal", targetFolder: "/x", mode: "copy" });
    expect(plan.rows).toHaveLength(0);
  });
});

describe("drive names", () => {
  it("rejects empty and duplicate names, ignoring case", async () => {
    const [a, b] = await query<any>("SELECT id, label FROM accounts ORDER BY created_at LIMIT 2");
    expect(await renameAccount(a.id, "   ")).toMatchObject({ ok: false });
    expect(await renameAccount(a.id, b.label.toUpperCase())).toMatchObject({ ok: false, error: expect.stringContaining("already called") });
    expect(await renameAccount(a.id, "  My   Main Drive ")).toEqual({ ok: true });
    expect((await one<any>("SELECT label FROM accounts WHERE id = $1", [a.id])).label).toBe("My Main Drive");
    expect(await uniqueLabel("my main drive")).toBe("my main drive (2)");
  });
});

describe("library paths while scanning", () => {
  it("fills in folder paths progressively and keeps them across rescans", async () => {
    const acct = "demo-gwork";
    await upsertItems(acct, [
      { remoteId: "R", parentRemoteId: null, name: "", isFolder: true, size: 0, mime: null, hashes: {}, modifiedAt: null, createdAt: null },
      { remoteId: "F1", parentRemoteId: "R", name: "Projects", isFolder: true, size: 0, mime: null, hashes: {}, modifiedAt: null, createdAt: null },
      { remoteId: "F2", parentRemoteId: "F1", name: "2026", isFolder: true, size: 0, mime: null, hashes: {}, modifiedAt: null, createdAt: null },
      { remoteId: "X", parentRemoteId: "F2", name: "plan.docx", isFolder: false, size: 10, mime: null, hashes: {}, modifiedAt: null, createdAt: null },
    ], "partial");
    await resolvePathsIncremental(acct);
    expect((await one<any>("SELECT path FROM items WHERE id = 'demo-gwork:X'")).path).toBe("/Projects/2026/plan.docx");
    // A rescan reports no path; the known one survives because the file didn't move.
    await upsertItems(acct, [{ remoteId: "X", parentRemoteId: "F2", name: "plan.docx", isFolder: false, size: 10, mime: null, hashes: {}, modifiedAt: null, createdAt: null }], "again");
    expect((await one<any>("SELECT path FROM items WHERE id = 'demo-gwork:X'")).path).toBe("/Projects/2026/plan.docx");
  });
});
