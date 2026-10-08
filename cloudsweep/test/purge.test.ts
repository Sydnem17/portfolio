import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.APP_SECRET = "test-secret-test-secret-test-secret-123";
process.env.STEP_BUDGET_MS = "20000";

// A drive that, like personal OneDrive, refuses permanent deletion and recycles instead.
vi.mock("@/lib/providers", async (orig) => {
  const real: any = await orig();
  const recycling = { ...real.getProvider("demo"), purge: async (ctx: any, remoteId: string) => (await real.getProvider("demo").trash(ctx, remoteId), "trashed") };
  return { ...real, getProvider: (id: string) => (id === "onedrive" ? recycling : real.getProvider(id)) };
});

const { createDemoAccounts } = await import("@/lib/accounts");
const { createJob, runStep } = await import("@/lib/jobs");
const { purgeStaged, recordLocalPurged } = await import("@/lib/purge");
const { createLocalAccount, ingestLocalScan, recordLocalStaged } = await import("@/lib/local");
const { getProgress } = await import("@/lib/progress");
const { query, one } = await import("@/lib/db");

async function runToEnd(id: string) {
  for (let i = 0; i < 200; i++) {
    const j = await runStep(id);
    if (j!.status !== "running") return j!;
  }
  throw new Error("job did not finish");
}
const files = (acc: string) => query<any>("SELECT id, name, size, remote_id FROM items WHERE account_id = $1 AND NOT is_folder AND NOT trashed ORDER BY id LIMIT 3", [acc]);

describe("deleting permanently", () => {
  beforeAll(async () => {
    for (const id of await createDemoAccounts()) await runToEnd(await createJob("scan", id));
  });

  it("deletes straight away when asked, skipping the trash, and still counts the space", async () => {
    const [f] = await files("demo-gpersonal");
    const job = await runToEnd(await createJob("trash", null, { itemIds: [f.id], reason: "deleted", permanent: true }));
    expect(job.progress.message).toBe("Deleted 1 file permanently");
    expect(await one("SELECT 1 FROM items WHERE id = $1", [f.id])).toBeNull();
    expect(await one("SELECT 1 FROM demo_files WHERE account_id = 'demo-gpersonal' AND remote_id = $1", [f.remote_id])).toBeNull();
    const [a] = await query<any>("SELECT kind, bytes FROM actions WHERE item_id = $1", [f.id]);
    expect(a.kind).toBe("purge");
    expect((await getProgress()).byReason.find((r) => r.key === "deleted")!.bytes).toBe(Number(f.size));
  });

  it("falls back to the recycle bin where a drive doesn't allow permanent deletion, and says so", async () => {
    await query("UPDATE accounts SET provider = 'onedrive' WHERE id = 'demo-gwork'");
    const [f] = await files("demo-gwork");
    const job = await runToEnd(await createJob("trash", null, { itemIds: [f.id], reason: "deleted", permanent: true }));
    expect(job.progress.message).toMatch(/Deleted 0 files permanently · 1 went to their drive's recycle bin/);
    expect((await one<any>("SELECT trashed FROM items WHERE id = $1", [f.id])).trashed).toBe(true);
    expect((await one<any>("SELECT kind FROM actions WHERE item_id = $1", [f.id])).kind).toBe("trash"); // still restorable from the Staging bin
    await query("UPDATE accounts SET provider = 'demo' WHERE id = 'demo-gwork'");
  });

  it("empties chosen files from the Staging bin for good", async () => {
    const [f, g] = await files("demo-onedrive");
    await runToEnd(await createJob("trash", null, { itemIds: [f.id, g.id], reason: "duplicate" }));
    const staged = await query<any>("SELECT id FROM actions WHERE kind = 'trash' AND NOT undone AND item_id = ANY($1) ORDER BY id", [[f.id, g.id]]);
    expect(staged).toHaveLength(2);
    const r = await purgeStaged([Number(staged[0].id)]);
    expect(r).toEqual({ deleted: 1, failed: [] });
    const bin = await query<any>("SELECT item_id FROM actions WHERE kind = 'trash' AND NOT undone AND item_id = ANY($1)", [[f.id, g.id]]);
    expect(bin).toHaveLength(1); // the other one is still restorable
    expect(await one("SELECT 1 FROM items WHERE id = $1", [f.id])).toBeNull();
  });

  it("records files on this computer that the browser deleted, staged or straight away", async () => {
    const local = await createLocalAccount("Stuff");
    await ingestLocalScan(local.id, "s1", [{ path: "/a.jpg", isFolder: false, size: 10, modifiedAt: null }, { path: "/b.jpg", isFolder: false, size: 20, modifiedAt: null }] as any, true);
    const [a, b] = await query<any>("SELECT id FROM items WHERE account_id = $1 ORDER BY path", [local.id]);
    await recordLocalStaged(local.id, [{ itemId: a.id, stagedPath: "/CloudSweep Staging/a.jpg" }], "duplicate");
    const [act] = await query<any>("SELECT id FROM actions WHERE item_id = $1 AND kind = 'trash'", [a.id]);
    await recordLocalPurged(local.id, { actionIds: [Number(act.id)], itemIds: [b.id] });
    expect(await query("SELECT 1 FROM items WHERE account_id = $1", [local.id])).toHaveLength(0);
    expect((await query<any>("SELECT kind FROM actions WHERE account_id = $1 ORDER BY id", [local.id])).map((x) => x.kind)).toEqual(["purge", "purge"]);
    expect((await purgeStaged([999999])).deleted).toBe(0);
  });
});
