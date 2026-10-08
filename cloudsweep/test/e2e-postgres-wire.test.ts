/**
 * Runs the demo pipeline through the real Postgres wire protocol (postgres.js driver), the same
 * path used in production with Neon/Supabase. PGlite is served over a socket so no install is needed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = 55432;
const pg = new PGlite();
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1" });

process.env.APP_SECRET = "test-secret-test-secret-test-secret-123";
process.env.STEP_BUDGET_MS = "20000";
process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`;
process.env.DB_POOL_MAX = "1"; // PGlite serves one connection at a time

describe("demo pipeline over the Postgres wire protocol", () => {
  let mods: any;
  beforeAll(async () => {
    await server.start();
    mods = {
      ...(await import("@/lib/accounts")),
      ...(await import("@/lib/jobs")),
      ...(await import("@/lib/report")),
      ...(await import("@/lib/db")),
    };
  });
  afterAll(async () => {
    await server.stop();
  });

  async function runToEnd(id: string) {
    for (let i = 0; i < 500; i++) {
      const j = await mods.runStep(id);
      if (j.status !== "running") return j;
    }
    throw new Error("job did not finish");
  }

  it("stores JSON values as objects, not double-encoded strings", async () => {
    await mods.query("CREATE TABLE IF NOT EXISTS t_json (v JSONB)");
    await mods.query("INSERT INTO t_json (v) VALUES ($1)", [JSON.stringify({ a: 1 })]);
    const [row] = await mods.query("SELECT jsonb_typeof(v) AS t, v FROM t_json");
    expect(row.t).toBe("object");
    expect(row.v).toEqual({ a: 1 });
  });

  it("repairs JSON values stored double-encoded by older builds", async () => {
    const { REPAIR_JSON } = await import("@/lib/schema");
    await mods.query("INSERT INTO jobs (id, type, params, progress) VALUES ('job_old', 'scan', to_jsonb($1::text), to_jsonb($2::text))", ['{"x":1}', '{"done":3}']);
    const [before] = await mods.query("SELECT jsonb_typeof(progress) AS t FROM jobs WHERE id = 'job_old'");
    expect(before.t).toBe("string");
    for (const stmt of REPAIR_JSON.split("\n")) await mods.query(stmt);
    const [after] = await mods.query("SELECT params, progress FROM jobs WHERE id = 'job_old'");
    expect(after.params).toEqual({ x: 1 });
    expect(after.progress).toEqual({ done: 3 });
    await mods.query("DELETE FROM jobs WHERE id = 'job_old'");
  });

  it("scans the demo library and finds duplicates", async () => {
    const ids: string[] = await mods.createDemoAccounts();
    for (const id of ids) {
      const job = await runToEnd(await mods.createJob("scan", id));
      expect(job.error).toBeNull();
      expect(job.status).toBe("done");
      expect(job.progress.message).toMatch(/Indexed/);
    }
    const r = await mods.getDuplicateReport();
    expect(r.summary.exact.groups).toBeGreaterThan(20);
    const ov = await mods.getOverview();
    expect(ov.totalFiles).toBeGreaterThan(150);
  });

  it("verifies, analyses, trashes, undoes and consolidates", async () => {
    const { undoAction } = await import("@/lib/undo");
    const { startConsolidation } = await import("@/lib/consolidate");
    expect((await runToEnd(await mods.createJob("verify", null))).status).toBe("done");
    expect((await mods.getDuplicateReport()).summary.likely.groups).toBe(0);
    expect((await runToEnd(await mods.createJob("analyse", null))).status).toBe("done");

    const g = (await mods.getDuplicateReport({ confidence: "exact" })).groups[0];
    const victims = g.members.filter((m: any) => m.id !== g.keeperId).map((m: any) => m.id);
    const t = await runToEnd(await mods.createJob("trash", null, { itemIds: victims }, {}));
    expect(t.progress.bytes).toBe(g.wasteBytes);
    const [a] = await mods.query("SELECT id, detail FROM actions WHERE kind = 'trash' ORDER BY id LIMIT 1");
    expect(typeof a.detail).toBe("object");
    await undoAction(Number(a.id));

    const job = await runToEnd(
      await startConsolidation({ sourceAccountIds: ["demo-onedrive"], targetAccountId: "demo-gpersonal", targetFolder: "/Consolidated", mode: "copy", pathPrefix: "/Documents" }),
    );
    expect(job.error).toBeNull();
    expect(job.progress.errors ?? 0).toBe(0);
  });
});
