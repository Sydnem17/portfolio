import { createHash } from "node:crypto";
import { query, one } from "../db";
import { sceneByKey, type DemoFile } from "./demo-data";
import { ProviderError, type CloudItem, type StorageProvider } from "./types";

const h = (alg: string, s: string) => createHash(alg).update(s).digest("hex");
const PAGE = 250;

function toItem(f: DemoFile): CloudItem {
  const k = f.contentKey ?? f.remoteId;
  const full = f.hashMode === "full";
  return {
    remoteId: f.remoteId,
    parentRemoteId: f.parentRemoteId,
    name: f.name,
    isFolder: f.isFolder,
    size: f.size,
    mime: f.mime,
    // Simulated provider hashes: identical content → identical hashes, like the real APIs.
    hashes: f.isFolder ? {} : full ? { md5: h("md5", k), sha1: h("sha1", k), sha256: h("sha256", k) } : { quickXor: h("sha1", k).slice(0, 27) },
    modifiedAt: f.modifiedAt,
    createdAt: f.createdAt,
    takenAt: f.takenAt ?? null,
    location: f.location ?? null,
    width: f.width ?? null,
    height: f.height ?? null,
    webUrl: null,
  };
}

/** Deterministic bytes for a demo file. The header lets an "upload" recover the content key. */
export function demoBytes(contentKey: string, size: number, start: number, end: number): Buffer {
  const header = Buffer.from(`CLOUDSWEEP-DEMO\n${contentKey}\n${size}\n`);
  const out = Buffer.alloc(end - start + 1);
  const block = createHash("sha256").update(contentKey).digest();
  for (let i = start; i <= end; i++) out[i - start] = i < header.length ? header[i] : block[i % 32] ^ (i & 0xff);
  return out;
}

async function getFile(accountId: string, remoteId: string): Promise<DemoFile> {
  const row = await one<{ data: DemoFile }>("SELECT data FROM demo_files WHERE account_id = $1 AND remote_id = $2", [accountId, remoteId]);
  if (!row) throw new ProviderError("Demo file not found", 404);
  return row.data;
}

async function save(accountId: string, f: DemoFile) {
  await query(
    "INSERT INTO demo_files (account_id, remote_id, data) VALUES ($1, $2, $3) ON CONFLICT (account_id, remote_id) DO UPDATE SET data = EXCLUDED.data",
    [accountId, f.remoteId, JSON.stringify(f)],
  );
}

async function demoThumbnail(f: DemoFile): Promise<Buffer | null> {
  const scene = sceneByKey(f.scene);
  if (!scene) return null;
  const [a, b, c] = scene.palette;
  const s = f.shot ?? 0;
  // Shapes shift slightly per shot so shots differ, while resized copies stay visually identical.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
    <rect width="320" height="240" fill="${a}"/>
    <rect y="${130 + s * 6}" width="320" height="${110 - s * 6}" fill="${b}"/>
    <circle cx="${60 + s * 32}" cy="${70 + (s % 3) * 12}" r="${26 + (s % 4) * 6}" fill="${c}"/>
    <polygon points="${180 + s * 8},${200 - s * 4} ${240 + s * 4},${80 + s * 7} ${300 - s * 3},200" fill="${c}" opacity="0.75"/>
  </svg>`;
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

export const demo: StorageProvider = {
  id: "demo",
  name: "Demo library",
  blurb: "Three simulated accounts (OneDrive, Google personal, Google work) full of realistic clutter. No sign-in needed.",
  capabilities: { restore: true, hashes: ["md5", "sha1", "sha256", "quickXor"], photoLocation: true },
  chunkSize: 4 * 1024 * 1024,

  isConfigured: () => true,
  authorizeUrl: () => {
    throw new ProviderError("Demo accounts are created from the Accounts page.");
  },
  exchangeCode: async () => ({ accessToken: "demo", expiresAt: Date.now() + 365 * 864e5 }),
  refresh: async (t) => ({ ...t, expiresAt: Date.now() + 365 * 864e5 }),

  async profile(ctx) {
    const used = await one<{ used: string }>(
      "SELECT COALESCE(SUM((data->>'size')::bigint), 0) AS used FROM demo_files WHERE account_id = $1 AND COALESCE((data->>'trashed')::boolean, false) = false",
      [ctx.accountId],
    );
    return {
      email: ctx.extra?.email ?? null,
      displayName: ctx.extra?.displayName ?? null,
      quotaTotal: Number(ctx.extra?.quotaTotal ?? 0) || null,
      quotaUsed: Number(used?.used ?? 0),
    };
  },

  async list(ctx, cursor) {
    const offset = Number(cursor ?? 0);
    const rows = await query<{ data: DemoFile }>(
      "SELECT data FROM demo_files WHERE account_id = $1 AND COALESCE((data->>'trashed')::boolean, false) = false ORDER BY remote_id LIMIT $2 OFFSET $3",
      [ctx.accountId, PAGE, offset],
    );
    return { items: rows.map((r) => toItem(r.data)), next: rows.length === PAGE ? String(offset + PAGE) : null };
  },

  async thumbnail(ctx, item) {
    return demoThumbnail(await getFile(ctx.accountId, item.remoteId));
  },

  async downloadRange(ctx, remoteId, start, end) {
    const f = await getFile(ctx.accountId, remoteId);
    return demoBytes(f.contentKey ?? f.remoteId, f.size, start, Math.min(end, f.size - 1));
  },

  async ensureFolder(ctx, path) {
    let parent = (await one<{ remote_id: string }>("SELECT remote_id FROM demo_files WHERE account_id = $1 AND data->>'parentRemoteId' IS NULL", [ctx.accountId]))!.remote_id;
    for (const part of path.split("/").filter(Boolean)) {
      const found = await one<{ remote_id: string }>(
        "SELECT remote_id FROM demo_files WHERE account_id = $1 AND data->>'parentRemoteId' = $2 AND data->>'name' = $3 AND (data->>'isFolder')::boolean",
        [ctx.accountId, parent, part],
      );
      if (found) {
        parent = found.remote_id;
        continue;
      }
      const rid = `${ctx.accountId}-f-${h("sha1", parent + part).slice(0, 10)}`;
      await save(ctx.accountId, { remoteId: rid, parentRemoteId: parent, name: part, isFolder: true, size: 0, mime: null, contentKey: null, hashMode: "full", modifiedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
      parent = rid;
    }
    return parent;
  },

  async startUpload(_ctx, { parentId, name, size, mime }) {
    return { url: `demo-upload:${Date.now()}`, state: { parentId, name, size, mime } };
  },

  async uploadChunk(ctx, session, chunk, offset, total) {
    const st = session.state as Record<string, any>;
    if (offset === 0) {
      const [, key] = chunk.subarray(0, 512).toString("utf8").split("\n");
      st.contentKey = key;
    }
    if (offset + chunk.length < total) return null;
    // Look up a source file with the same content key to carry over photo metadata.
    const src = await one<{ data: DemoFile }>("SELECT data FROM demo_files WHERE data->>'contentKey' = $1 LIMIT 1", [st.contentKey]);
    const now = new Date().toISOString();
    const f: DemoFile = {
      ...(src?.data ?? ({} as DemoFile)),
      remoteId: `${ctx.accountId}-u-${h("sha1", st.parentId + st.name + now).slice(0, 10)}`,
      parentRemoteId: st.parentId,
      name: st.name,
      isFolder: false,
      size: total,
      mime: st.mime ?? null,
      contentKey: st.contentKey,
      hashMode: "full",
      modifiedAt: now,
      createdAt: now,
      trashed: false,
    };
    await save(ctx.accountId, f);
    return toItem(f);
  },

  async move(ctx, remoteId, newParentId) {
    const f = await getFile(ctx.accountId, remoteId);
    await save(ctx.accountId, { ...f, parentRemoteId: newParentId });
  },

  async rename(ctx, remoteId, newName) {
    const f = await getFile(ctx.accountId, remoteId);
    await save(ctx.accountId, { ...f, name: newName });
  },

  async trash(ctx, remoteId) {
    const f = await getFile(ctx.accountId, remoteId);
    await save(ctx.accountId, { ...f, trashed: true });
  },

  async restore(ctx, remoteId) {
    const f = await getFile(ctx.accountId, remoteId);
    await save(ctx.accountId, { ...f, trashed: false });
  },
};

/** Preset AI tags for demo photos so photo intelligence works without an API key. */
export async function demoTagsFor(accountId: string, remoteId: string) {
  const f = await getFile(accountId, remoteId);
  const scene = sceneByKey(f.scene);
  return scene ? { ...scene.tags, place: f.location ? (scene.place?.label ?? null) : null } : null;
}
