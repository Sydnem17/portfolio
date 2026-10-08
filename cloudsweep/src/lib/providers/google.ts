import { bearer, http, json, tokenRequest } from "./http";
import type { CloudItem, OAuthTokens, ProviderContext, StorageProvider, UploadSession } from "./types";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const FIELDS =
  "nextPageToken,files(id,name,mimeType,size,quotaBytesUsed,md5Checksum,sha1Checksum,sha256Checksum,parents,modifiedTime,createdTime,webViewLink,imageMediaMetadata(time,location,width,height),videoMediaMetadata(width,height))";

function toItem(f: any): CloudItem {
  const img = f.imageMediaMetadata ?? {};
  const isFolder = f.mimeType === FOLDER;
  return {
    remoteId: f.id,
    parentRemoteId: f.parents?.[0] ?? null,
    name: f.name,
    isFolder,
    // Native Google Docs have no `size` but still count against quota via quotaBytesUsed.
    size: Number(f.size ?? f.quotaBytesUsed ?? 0),
    mime: f.mimeType ?? null,
    hashes: { md5: f.md5Checksum, sha1: f.sha1Checksum, sha256: f.sha256Checksum },
    modifiedAt: f.modifiedTime ?? null,
    createdAt: f.createdTime ?? null,
    takenAt: img.time ? exifTimeToIso(img.time) : null,
    location: img.location?.latitude != null ? { lat: img.location.latitude, lng: img.location.longitude } : null,
    width: img.width ?? f.videoMediaMetadata?.width ?? null,
    height: img.height ?? f.videoMediaMetadata?.height ?? null,
    webUrl: f.webViewLink ?? null,
  };
}

function exifTimeToIso(t: string): string | null {
  // "2023:07:14 10:22:01"
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const google: StorageProvider = {
  id: "google",
  name: "Google Drive",
  blurb: "Personal Gmail or Google Workspace (work/school) accounts. Connect as many as you like.",
  capabilities: { restore: true, hashes: ["md5", "sha1", "sha256"], photoLocation: true },
  chunkSize: 8 * 1024 * 1024, // multiple of 256 KiB

  isConfigured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  authorizeUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile https://www.googleapis.com/auth/drive",
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },

  exchangeCode: (code, redirectUri) =>
    tokenRequest("https://oauth2.googleapis.com/token", {
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

  async refresh(t: OAuthTokens) {
    const next = await tokenRequest("https://oauth2.googleapis.com/token", {
      refresh_token: t.refreshToken!,
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    });
    return { ...next, refreshToken: next.refreshToken ?? t.refreshToken };
  },

  async profile(ctx) {
    const a = await json(`${API}/about?fields=user(emailAddress,displayName),storageQuota(limit,usage)`, {
      headers: bearer(await ctx.token()),
    });
    return {
      email: a.user?.emailAddress ?? null,
      displayName: a.user?.displayName ?? null,
      quotaTotal: a.storageQuota?.limit ? Number(a.storageQuota.limit) : null, // null = unlimited/pooled
      quotaUsed: a.storageQuota?.usage ? Number(a.storageQuota.usage) : null,
    };
  },

  async list(ctx, cursor) {
    const p = new URLSearchParams({
      q: "'me' in owners and trashed = false",
      pageSize: "1000",
      fields: FIELDS,
      spaces: "drive",
    });
    if (cursor) p.set("pageToken", cursor);
    const r = await json(`${API}/files?${p}`, { headers: bearer(await ctx.token()) });
    return { items: (r.files ?? []).map(toItem), next: r.nextPageToken ?? null };
  },

  async thumbnail(ctx, item) {
    const f = await json(`${API}/files/${item.remoteId}?fields=thumbnailLink`, { headers: bearer(await ctx.token()) });
    if (!f.thumbnailLink) return null;
    const url = String(f.thumbnailLink).replace(/=s\d+$/, "=s512");
    const res = await http(url, { headers: bearer(await ctx.token()), retries: 1 }).catch(() => null);
    return res ? Buffer.from(await res.arrayBuffer()) : null;
  },

  async downloadRange(ctx, remoteId, start, end) {
    const res = await http(`${API}/files/${remoteId}?alt=media`, {
      headers: bearer(await ctx.token(), { Range: `bytes=${start}-${end}` }),
    });
    return Buffer.from(await res.arrayBuffer());
  },

  async ensureFolder(ctx, path) {
    let parent = "root";
    for (const part of path.split("/").filter(Boolean)) {
      const token = await ctx.token();
      const found = await json(
        `${API}/files?${new URLSearchParams({
          q: `name = '${q(part)}' and '${parent}' in parents and mimeType = '${FOLDER}' and trashed = false`,
          fields: "files(id)",
        })}`,
        { headers: bearer(token) },
      );
      if (found.files?.[0]) {
        parent = found.files[0].id;
        continue;
      }
      const created = await json(`${API}/files?fields=id`, {
        method: "POST",
        headers: bearer(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ name: part, mimeType: FOLDER, parents: [parent] }),
      });
      parent = created.id;
    }
    return parent;
  },

  async startUpload(ctx, { parentId, name, size, mime }) {
    const res = await http(`${UPLOAD}/files?uploadType=resumable&fields=${encodeURIComponent("id,name,mimeType,size,md5Checksum,sha256Checksum,parents,modifiedTime,createdTime")}`, {
      method: "POST",
      headers: bearer(await ctx.token(), {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(size),
        ...(mime ? { "X-Upload-Content-Type": mime } : {}),
      }),
      body: JSON.stringify({ name, parents: [parentId] }),
    });
    return { url: res.headers.get("location")! };
  },

  async uploadChunk(ctx, session: UploadSession, chunk, offset, total) {
    const end = offset + chunk.length - 1;
    const res = await http(session.url, {
      method: "PUT",
      headers: bearer(await ctx.token(), {
        "Content-Length": String(chunk.length),
        "Content-Range": total === 0 ? "bytes */0" : `bytes ${offset}-${end}/${total}`,
      }),
      body: new Uint8Array(chunk),
    });
    if (res.status === 308) return null; // more chunks expected
    return toItem(await res.json());
  },

  async move(ctx, remoteId, newParentId) {
    const token = await ctx.token();
    const f = await json(`${API}/files/${remoteId}?fields=parents`, { headers: bearer(token) });
    const p = new URLSearchParams({ addParents: newParentId, removeParents: (f.parents ?? []).join(",") });
    await http(`${API}/files/${remoteId}?${p}`, { method: "PATCH", headers: bearer(token, { "Content-Type": "application/json" }), body: "{}" });
  },

  async rename(ctx, remoteId, newName) {
    await http(`${API}/files/${remoteId}`, {
      method: "PATCH",
      headers: bearer(await ctx.token(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ name: newName }),
    });
  },

  async trash(ctx, remoteId) {
    await http(`${API}/files/${remoteId}`, {
      method: "PATCH",
      headers: bearer(await ctx.token(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ trashed: true }),
    });
  },

  async purge(ctx, remoteId) {
    // Drive deletes permanently (bypassing the bin) for files in the bin and out of it.
    await http(`${API}/files/${remoteId}`, { method: "DELETE", headers: bearer(await ctx.token()) });
    return "deleted";
  },

  async restore(ctx, remoteId) {
    await http(`${API}/files/${remoteId}`, {
      method: "PATCH",
      headers: bearer(await ctx.token(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ trashed: false }),
    });
  },
};
