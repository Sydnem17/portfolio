import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.APP_SECRET = "test-secret-test-secret-test-secret-123";
process.env.STEP_BUDGET_MS = "20000";
// No network in tests: place lookups fall back to "not known yet".
vi.stubGlobal("fetch", async () => { throw new Error("offline"); });

const { createDemoAccounts } = await import("@/lib/accounts");
const { createJob, runStep } = await import("@/lib/jobs");
const { renameSources, startRename, undoRenameBatch, planMove, startMove, summariseMove, createFolder, cleanFolderPath } = await import("@/lib/organise");
const { recordLocalFolder } = await import("@/lib/local");
const { GET: library } = await import("@/app/api/library/route");
const { buildRenames, DEFAULT_OPTIONS } = await import("@/lib/rename");
const { createLocalAccount, ingestLocalScan, recordLocalRenamed } = await import("@/lib/local");
const { query, one } = await import("@/lib/db");

async function runToEnd(id: string) {
  for (let i = 0; i < 500; i++) {
    const j = await runStep(id);
    if (j!.status !== "running") return j!;
  }
  throw new Error("job did not finish");
}
const live = async (accountId: string, prefix: string) =>
  query<any>("SELECT id, name, path FROM items WHERE account_id = $1 AND NOT trashed AND NOT is_folder AND starts_with(path, $2) ORDER BY name", [accountId, prefix]);

describe("bulk rename and moving between drives", () => {
  beforeAll(async () => {
    for (const id of await createDemoAccounts()) await runToEnd(await createJob("scan", id));
  });

  it("previews and applies a rename batch, then undoes it", async () => {
    const before = (await live("demo-gpersonal", "/")).filter((r) => /^IMG_/.test(r.name));
    expect(before.length).toBeGreaterThan(3);
    const folder = before[0].path.slice(0, before[0].path.lastIndexOf("/"));
    const src = await renameSources({ ids: [], folders: [{ accountId: "demo-gpersonal", path: folder }] });
    expect(src.files.length).toBeGreaterThan(1);
    expect(src.files.every((f) => f.date)).toBe(true);

    const rows = buildRenames(src.files, { ...DEFAULT_OPTIONS, pattern: "{date} {n}" }, src.siblings);
    const renames = rows.filter((r) => r.changed).map((r) => ({ id: r.id, newName: r.to }));
    const started = await startRename(renames);
    expect(started.local).toEqual([]);
    const job = await runToEnd(started.jobId!);
    expect(job.status).toBe("done");
    expect(job.progress.errors).toBe(0);

    const after = await live("demo-gpersonal", folder + "/");
    for (const r of renames) {
      const it = after.find((a) => a.id === r.id)!;
      expect(it.name).toBe(r.newName);
      expect(it.path).toBe(`${folder}/${r.newName}`);
    }
    // The demo "cloud" really holds the new name.
    const stored = await one<any>("SELECT data FROM demo_files WHERE account_id = 'demo-gpersonal' AND data->>'name' = $1", [renames[0].newName]);
    expect(stored).toBeTruthy();
    const log = await query<any>("SELECT * FROM actions WHERE kind = 'rename' AND detail->>'batch' = $1", [started.batch]);
    expect(log).toHaveLength(renames.length);

    const undo = await undoRenameBatch(started.batch!);
    expect((await runToEnd(undo.jobId!)).status).toBe("done");
    const restored = await live("demo-gpersonal", folder + "/");
    for (const r of renames) expect(restored.find((a) => a.id === r.id)!.name).toBe(before.find((b) => b.id === r.id)!.name);
    expect(await query("SELECT 1 FROM actions WHERE kind = 'rename' AND NOT undone AND detail->>'batch' = $1", [started.batch])).toHaveLength(0);
    await expect(undoRenameBatch(started.batch!)).rejects.toThrow(/Nothing left/);
  });

  it("refuses a name that is already used in the folder", async () => {
    const [a] = await live("demo-onedrive", "/");
    const sameDir = (await live("demo-onedrive", a.path.slice(0, a.path.lastIndexOf("/") + 1))).filter((r) => r.path.lastIndexOf("/") === a.path.lastIndexOf("/"));
    expect(sameDir.length).toBeGreaterThan(1);
    await expect(startRename([{ id: sameDir[0].id, newName: sameDir[1].name }])).rejects.toThrow(/already used/);
    await expect(startRename([{ id: sameDir[0].id, newName: "bad/name.jpg" }])).rejects.toThrow(/can't contain/);
    expect((await startRename([{ id: sameDir[0].id, newName: sameDir[0].name }])).count).toBe(0);
  });

  it("moves selected files to another drive, keeping folders, and removes them from the source", async () => {
    // Pick a top-level folder with at least one file the target drive doesn't already have.
    const tops = [...new Set((await live("demo-onedrive", "/")).map((r) => r.path.split("/")[1]).filter(Boolean))];
    let folder = "";
    let full: Awaited<ReturnType<typeof planMove>> | null = null;
    const mk = (f: string) => ({ selection: { ids: [], folders: [{ accountId: "demo-onedrive", path: `/${f}` }] }, targetAccountId: "demo-gpersonal", targetFolder: "", keepStructure: true, keepOriginal: false });
    for (const t of tops) {
      const candidate = await planMove(mk(t));
      if (candidate.plan.rows.length > 1 && candidate.plan.counts.copy > 0) [folder, full] = [t, candidate];
      if (full) break;
    }
    expect(full).toBeTruthy();
    const p = mk(folder);
    const docs = await live("demo-onedrive", `/${folder}/`);
    const plan = summariseMove(full!);
    const copiedNames = full!.plan.rows.filter((r) => r.action === "copy").map((r) => r.file.name);
    expect(copiedNames.length).toBeGreaterThan(0);
    expect(plan.files).toBe(docs.length);
    expect(plan.counts.copy + plan.counts["already-there"] + plan.counts["duplicate-in-batch"] + plan.counts.unsupported).toBe(docs.length);
    expect(plan.examples.every((e) => e.to.startsWith(`/${folder}/`))).toBe(true);

    const job = await runToEnd((await startMove(p))!);
    expect(job.status).toBe("done");
    expect(job.progress.message).toBe("Move complete");
    expect(await live("demo-onedrive", `/${folder}/`)).toHaveLength(0);
    const target = await live("demo-gpersonal", `/${folder}/`);
    // Copied documents land in the same folder on the new drive; ones it already had are just removed from the source.
    for (const n of copiedNames) expect(target.map((t) => t.name)).toContain(n);
  });

  it("copies instead when asked to keep the original, and skips files already on that drive", async () => {
    const pics = (await live("demo-gwork", "/")).slice(0, 3);
    const p = { selection: { ids: pics.map((x) => x.id), folders: [] }, targetAccountId: "demo-gwork", targetFolder: "", keepStructure: true, keepOriginal: true };
    const plan = await planMove(p);
    expect(plan.skipped.sameDrive).toBe(3);
    expect(plan.plan.rows).toHaveLength(0);
    expect(await startMove(p)).toBeNull();

    const p2 = { ...p, targetAccountId: "demo-onedrive", targetFolder: "From work" };
    const job = await runToEnd((await startMove(p2))!);
    expect(job.status).toBe("done");
    expect(await live("demo-gwork", "/")).toEqual(expect.arrayContaining(pics));
  });

  it("hands local files to the browser and records what it renamed", async () => {
    const local = await createLocalAccount("Pictures");
    await ingestLocalScan(local.id, "s1", [{ path: "/Trip/IMG_0001.jpg", isFolder: false, size: 10, modifiedAt: "2023-05-01T00:00:00Z" }] as any, true);
    const [it] = await live(local.id, "/");
    const started = await startRename([{ id: it.id, newName: "2023-05-01 01.jpg" }]);
    expect(started.jobId).toBeNull();
    expect(started.local).toEqual([{ id: it.id, accountId: local.id, path: "/Trip/IMG_0001.jpg", newName: "2023-05-01 01.jpg" }]);
    await recordLocalRenamed(local.id, [{ id: it.id, from: "IMG_0001.jpg", to: "2023-05-01 01.jpg" }], { batch: started.batch! });
    expect((await live(local.id, "/"))[0].path).toBe("/Trip/2023-05-01 01.jpg");
    const undo = await undoRenameBatch(started.batch!);
    expect(undo.jobId).toBeNull();
    expect(undo.local[0]).toMatchObject({ path: "/Trip/2023-05-01 01.jpg", newName: "IMG_0001.jpg" });
    await expect(planMove({ selection: { ids: [it.id], folders: [] }, targetAccountId: local.id, targetFolder: "", keepStructure: true, keepOriginal: false })).rejects.toThrow(/local folder/);
    const fromLocal = await planMove({ selection: { ids: [it.id], folders: [] }, targetAccountId: "demo-onedrive", targetFolder: "", keepStructure: true, keepOriginal: false });
    expect(fromLocal.skipped.local).toBe(1);
  });

  it("creates folders that show in the Library straight away, even when empty", async () => {
    expect(cleanFolderPath(" Sorted / 2024 /Fiji ")).toBe("/Sorted/2024/Fiji");
    expect(() => cleanFolderPath("bad:name")).toThrow(/can't contain/);
    expect(() => cleanFolderPath("/")).toThrow(/Type a folder/);
    await createFolder("demo-onedrive", "Sorted/2024 Fiji");
    const list = async (path: string) => (await (await library(new Request(`http://x/api/library?account=demo-onedrive&path=${encodeURIComponent(path)}`))).json()).folders;
    expect((await list("/")).map((f: any) => f.name)).toContain("Sorted");
    expect(await list("/Sorted")).toEqual([{ name: "2024 Fiji", path: "/Sorted/2024 Fiji", files: 0, bytes: 0 }]);
    const stored = await one<any>("SELECT 1 FROM demo_files WHERE account_id = 'demo-onedrive' AND data->>'name' = '2024 Fiji' AND (data->>'isFolder')::boolean");
    expect(stored).toBeTruthy();
  });

  it("moves files into a folder on the same drive without copying", async () => {
    const pics = (await live("demo-onedrive", "/")).filter((r) => r.path.split("/").length > 2).slice(0, 2);
    const p = { selection: { ids: pics.map((x) => x.id), folders: [] }, targetAccountId: "demo-onedrive", targetFolder: "Sorted/2024 Fiji", keepStructure: false, keepOriginal: false };
    const plan = await planMove(p);
    expect(plan.plan.counts.relocate).toBe(2);
    expect(plan.plan.counts.copy).toBe(0);
    const job = await runToEnd((await startMove(p))!);
    expect(job.status).toBe("done");
    const moved = await live("demo-onedrive", "/Sorted/2024 Fiji/");
    expect(moved.map((m) => m.id).sort()).toEqual(pics.map((x) => x.id).sort());
    // Same ids: moved in place, nothing copied or trashed.
    expect(await query("SELECT 1 FROM actions WHERE kind = 'trash' AND item_id = ANY($1)", [pics.map((x) => x.id)])).toHaveLength(0);
    // Moving them "into the folder they're already in" does nothing.
    expect((await planMove(p)).skipped.sameDrive).toBe(2);
  });

  it("records folders created on this computer", async () => {
    const local = await createLocalAccount("Docs");
    await recordLocalFolder(local.id, "/Tax/2024");
    const rows = await query<any>("SELECT path, is_folder FROM items WHERE account_id = $1 ORDER BY path", [local.id]);
    expect(rows).toEqual([{ path: "/Tax", is_folder: true }, { path: "/Tax/2024", is_folder: true }]);
  });

  it("adds up reclaimed space by reason, drive and type, ignoring anything restored", async () => {
    const { getProgress } = await import("@/lib/progress");
    const p = await getProgress();
    const moved = p.byReason.find((r) => r.key === "moved")!;
    expect(moved.files).toBeGreaterThan(0);
    expect(p.reclaimed).toBe(p.byReason.reduce((s, r) => s + r.bytes, 0));
    expect(p.reclaimed).toBe(p.byDrive.reduce((s, r) => s + r.bytes, 0));
    expect(p.filesRemoved).toBe(p.byKind.reduce((s, r) => s + r.files, 0));
    expect(p.renamed).toBe(1); // the local rename above (the cloud batch was undone)
    expect(p.weeks).toHaveLength(12);
    expect(p.weeks.at(-1)!.bytes).toBe(p.reclaimed);

    const { undoAction } = await import("@/lib/undo");
    const [one1] = await query<any>("SELECT id, bytes FROM actions WHERE kind = 'trash' AND NOT undone AND bytes > 0 ORDER BY id LIMIT 1");
    await undoAction(Number(one1.id));
    expect((await getProgress()).reclaimed).toBe(p.reclaimed - Number(one1.bytes));
  });
});
