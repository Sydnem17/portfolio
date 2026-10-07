import { beforeAll, describe, expect, it } from "vitest";

process.env.APP_SECRET = "test-secret-test-secret-test-secret-123";
process.env.STEP_BUDGET_MS = "20000";

const { createDemoAccounts, listAccounts } = await import("@/lib/accounts");
const { createJob, runStep } = await import("@/lib/jobs");
const { getDuplicateReport, getOverview } = await import("@/lib/report");
const { buildPlan, startConsolidation } = await import("@/lib/consolidate");
const { photoCollections } = await import("@/lib/photos/groups");
const { undoAction } = await import("@/lib/undo");
const { query } = await import("@/lib/db");

async function runToEnd(id: string) {
  for (let i = 0; i < 500; i++) {
    const j = await runStep(id);
    if (j!.status !== "running") return j!;
  }
  throw new Error("job did not finish");
}

describe("demo library end to end", () => {
  let ids: string[];
  beforeAll(async () => {
    ids = await createDemoAccounts();
    for (const id of ids) expect((await runToEnd(await createJob("scan", id))).status).toBe("done");
  });

  it("indexes all three accounts with resolved paths", async () => {
    const accts = await listAccounts();
    expect(accts).toHaveLength(3);
    const ov = await getOverview();
    expect(ov.totalFiles).toBeGreaterThan(150);
    const [p] = await query("SELECT path FROM items WHERE name = 'Wedding highlights.mp4' AND account_id = 'demo-onedrive'");
    expect(p.path).toBe("/Videos/Wedding highlights.mp4");
  });

  it("finds exact, likely and folder-level duplicates", async () => {
    const r = await getDuplicateReport();
    expect(r.summary.exact.groups).toBeGreaterThan(20);
    expect(r.summary.likely.groups).toBe(4); // work files: quickXor vs md5, unverifiable until downloaded
    expect(r.summary.crossAccount).toBeGreaterThan(10);
    const wedding = r.groups.find((g) => g.name === "Wedding highlights.mp4")!;
    expect(wedding.members).toHaveLength(3);
    expect(wedding.wasteBytes).toBe(2 * 1840 * 1024 * 1024);
    expect(r.folders.length).toBeGreaterThan(0);
  });

  it("verifies likely duplicates by hashing content", async () => {
    expect((await runToEnd(await createJob("verify", null))).status).toBe("done");
    const r = await getDuplicateReport();
    expect(r.summary.likely.groups).toBe(0);
  });

  it("analyses photos into places, pets and similar groups", async () => {
    expect((await runToEnd(await createJob("analyse", null))).status).toBe("done");
    const c = await photoCollections();
    expect(c.analysed).toBe(c.total);
    expect(c.pets.map((p) => p.title)).toContain("Golden retriever");
    expect(c.events.map((e) => e.key)).toContain("wedding");
    expect(c.places.length).toBeGreaterThan(5);
    const r = await getDuplicateReport({ confidence: "similar" });
    expect(r.groups.length).toBeGreaterThan(5); // resized "(1).jpg" copies from Downloads
  });

  it("trashes duplicates recoverably and can undo", async () => {
    const g = (await getDuplicateReport({ confidence: "exact" })).groups[0];
    const victims = g.members.filter((m) => m.id !== g.keeperId).map((m) => m.id);
    const job = await createJob("trash", null, { itemIds: victims }, {});
    const done = await runToEnd(job);
    expect(done.progress.bytes).toBe(g.wasteBytes);
    const [a] = await query("SELECT id FROM actions WHERE kind = 'trash' ORDER BY id LIMIT 1");
    await undoAction(Number(a.id));
    const [row] = await query("SELECT trashed FROM items WHERE id = $1", [victims[0]]);
    expect(row.trashed).toBe(false);
  });

  it("consolidates OneDrive photos into Google, skipping what is already there", async () => {
    const params = { sourceAccountIds: ["demo-onedrive"], targetAccountId: "demo-gpersonal", targetFolder: "/Consolidated", mode: "move" as const, pathPrefix: "/Pictures/Camera Roll/2019", kinds: ["image"] };
    const plan = await buildPlan(params);
    expect(plan.rows.length).toBeGreaterThan(0);
    expect(plan.counts["already-there"]).toBeGreaterThan(0);
    const job = await runToEnd(await startConsolidation(params));
    expect(job.status).toBe("done");
    expect(job.progress.errors ?? 0).toBe(0);
    const [{ n }] = await query("SELECT COUNT(*) AS n FROM items WHERE account_id = 'demo-onedrive' AND path LIKE '/Pictures/Camera Roll/2019/%' AND NOT trashed");
    expect(Number(n)).toBe(0);
    const copied = await query("SELECT path FROM items WHERE account_id = 'demo-gpersonal' AND path LIKE '/Consolidated/%'");
    expect(copied.length).toBe(plan.counts.copy);
  });
});
