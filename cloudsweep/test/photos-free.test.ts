import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.APP_SECRET = "test-secret-test-secret-test-secret-123";
process.env.STEP_BUDGET_MS = "20000";
delete process.env.ANTHROPIC_API_KEY;
vi.stubGlobal("fetch", async () => { throw new Error("offline"); });

const gpsJpeg = readFileSync("test/fixtures/sydney-gps.jpg");
const plainJpeg = readFileSync("test/fixtures/no-gps.jpg");
const downloads: string[] = [];

// A pretend Google Drive that lists photos without location, like the real API often does.
vi.mock("@/lib/providers", async (orig) => {
  const real: any = await orig();
  const fake = {
    ...real.getProvider("google"),
    downloadRange: async (_ctx: unknown, remoteId: string, start: number, end: number) => {
      downloads.push(`${remoteId}:${start}-${end}`);
      if (remoteId === "flaky") throw new Error("429 Too Many Requests");
      return (remoteId === "with-gps" ? gpsJpeg : plainJpeg).subarray(start, end + 1);
    },
    thumbnail: async () => null,
  };
  return { ...real, getProvider: (id: string) => (id === "google" ? fake : real.getProvider(id)) };
});
vi.mock("@/lib/accounts", async (orig) => ({ ...(await orig<any>()), contextFor: async (accountId: string) => ({ accountId, token: async () => "t" }) }));

const { query, one } = await import("@/lib/db");
const { upsertItems } = await import("@/lib/items");
const { createJob, runStep } = await import("@/lib/jobs");
const { photoCollections } = await import("@/lib/photos/groups");
const { untaggedPhotos, saveBrowserTags } = await import("@/lib/photos/browser-tags");
const { readExifHead } = await import("@/lib/photos/exif");

async function runToEnd(id: string) {
  for (let i = 0; i < 100; i++) {
    const j = await runStep(id);
    if (j!.status !== "running") return j!;
  }
  throw new Error("job did not finish");
}
const photo = (remoteId: string, extra = {}) => ({
  remoteId, parentRemoteId: null, name: `${remoteId}.jpg`, path: `/Camera/${remoteId}.jpg`, isFolder: false, size: 900, mime: "image/jpeg",
  hashes: { md5: remoteId }, modifiedAt: "2024-03-16T00:00:00Z", createdAt: null, takenAt: null, location: null, ...extra,
});

describe("free photo features: places from the photo itself, and browser AI tags", () => {
  beforeAll(async () => {
    await query("INSERT INTO accounts (id, provider, label) VALUES ('g1', 'google', 'GD_test')");
    await upsertItems("g1", [photo("with-gps"), photo("no-gps"), photo("provider-gps", { location: { lat: -27.47, lng: 153.02 } })], "s1");
  });

  it("reads GPS and the date from a JPEG's first bytes", async () => {
    expect(await readExifHead(gpsJpeg)).toEqual({ lat: expect.closeTo(-33.8584, 3), lng: expect.closeTo(151.2085, 3), takenAt: "2024-03-16T09:30:00.000Z" });
    expect(await readExifHead(plainJpeg)).toEqual({ lat: null, lng: null, takenAt: null });
    expect(await readExifHead(Buffer.from("not an image"))).toEqual({ lat: null, lng: null, takenAt: null });
  });

  it("places photos the provider listed without a location, downloading only the start of each", async () => {
    const before = await photoCollections();
    expect(before.located).toBe(1);
    expect(before.gpsToCheck).toBe(2);
    expect((await runToEnd(await createJob("analyse", null))).status).toBe("done");
    const row = await one<any>("SELECT lat, lng, taken_at, exif_checked FROM items WHERE id = 'g1:with-gps'");
    expect(row.lat).toBeCloseTo(-33.8584, 3);
    expect(row.exif_checked).toBe(true);
    expect(downloads.sort()).toEqual(["no-gps:0-899", "with-gps:0-899"]); // provider-gps never downloaded
    const after = await photoCollections();
    expect(after.located).toBe(2);
    expect(after.gpsToCheck).toBe(0);
    expect(after.places.length).toBe(2);
  });

  it("keeps a location found in the photo when the drive is rescanned", async () => {
    await upsertItems("g1", [photo("with-gps")], "s2");
    expect((await one<any>("SELECT lat FROM items WHERE id = 'g1:with-gps'")).lat).toBeCloseTo(-33.8584, 3);
    await upsertItems("g1", [photo("with-gps", { size: 901, modifiedAt: "2025-01-01T00:00:00Z" })], "s3"); // edited: check again
    expect(await one<any>("SELECT lat, exif_checked FROM items WHERE id = 'g1:with-gps'")).toEqual({ lat: null, exif_checked: false });
  });

  it("hands untagged photos to the browser AI and stores its tags as pets, scenes and things", async () => {
    const todo = await untaggedPhotos(10);
    expect(todo.ids.sort()).toEqual(["g1:no-gps", "g1:provider-gps", "g1:with-gps"]);
    await saveBrowserTags([
      { id: "g1:with-gps", people_count: 2, pets: [{ species: "dog", description: "golden retriever" }], things: ["ball"], scene: "beach & coast", event: null, caption: "2 people with a golden retriever at the beach" },
      { id: "g1:no-gps", failed: true },
    ]);
    expect((await untaggedPhotos(10)).ids).toEqual(["g1:provider-gps"]);
    const c = await photoCollections();
    expect(c.pets.map((p) => p.title)).toEqual(["Golden retriever"]);
    expect(c.scenes.map((p) => p.title)).toEqual(["Beach & coast"]);
    expect(c.people.length).toBe(1);
    expect(c.toTag).toBe(1);
  });

  it("never overwrites tags from Claude, and the server job never wipes browser tags", async () => {
    await query("UPDATE photo_tags SET tagged_by = 'claude', scene = 'beach' WHERE item_id = 'g1:with-gps'");
    await saveBrowserTags([{ id: "g1:with-gps", people_count: 0, pets: [], things: [], scene: null, event: null, caption: "A photo" }]);
    expect((await one<any>("SELECT scene FROM photo_tags WHERE item_id = 'g1:with-gps'")).scene).toBe("beach");

    await saveBrowserTags([{ id: "g1:provider-gps", people_count: 0, pets: [{ species: "cat", description: "tabby cat" }], things: [], scene: null, event: null, caption: "A tabby cat" }]);
    await query("UPDATE items SET phash = NULL WHERE id = 'g1:provider-gps'");
    await runToEnd(await createJob("analyse", null));
    expect((await one<any>("SELECT pets FROM photo_tags WHERE item_id = 'g1:provider-gps'")).pets).toEqual([{ species: "cat", description: "tabby cat" }]);
  });

  it("re-checks photos tagged by an older version of the browser rules", async () => {
    await query("UPDATE photo_tags SET tagged_by = 'browser' WHERE item_id = 'g1:no-gps'");
    expect((await untaggedPhotos(10)).ids).toContain("g1:no-gps");
    await saveBrowserTags([{ id: "g1:no-gps", failed: true }]);
    expect((await untaggedPhotos(10)).ids).not.toContain("g1:no-gps");
    expect((await one<any>("SELECT tagged_by FROM photo_tags WHERE item_id = 'g1:no-gps'")).tagged_by).toBe("browser-v4");
  });

  it("retries photos it couldn't read on the next run instead of marking them checked", async () => {
    await upsertItems("g1", [photo("flaky")], "s9");
    expect((await runToEnd(await createJob("analyse", null))).status).toBe("done");
    expect((await one<any>("SELECT exif_checked FROM items WHERE id = 'g1:flaky'")).exif_checked).toBe(false);
    expect((await photoCollections()).gpsToCheck).toBeGreaterThanOrEqual(1);
  });

  it("can re-check every photo without a location", async () => {
    const { recheckLocations } = await import("@/lib/photos/exif-queue");
    const before = await photoCollections();
    const r = await recheckLocations();
    expect(r.queued).toBeGreaterThan(0);
    expect((await photoCollections()).gpsToCheck).toBe(before.gpsToCheck + r.queued);
  });

  it("turns away tags from a tab still running older rules", async () => {
    const { POST } = await import("@/app/api/photos/tags/route");
    const send = (body: object) => POST(new Request("http://x/api/photos/tags", { method: "POST", body: JSON.stringify(body) }));
    const old = await send({ tags: [{ id: "g1:no-gps", failed: true }] });
    expect(old.status).toBe(409);
    expect((await old.json()).error).toMatch(/refresh the page/);
    expect((await send({ tagger: "browser-v4", tags: [{ id: "g1:no-gps", failed: true }] })).status).toBe(200);
  });
});
