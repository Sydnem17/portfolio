import { bearer, http, json, tokenRequest } from "./http";
import { ProviderError, type CloudItem, type OAuthTokens, type StorageProvider } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPE = "offline_access openid email profile User.Read Files.ReadWrite.All";
const SELECT =
  "id,name,size,file,folder,root,parentReference,lastModifiedDateTime,createdDateTime,photo,location,image,video,webUrl,deleted";

function toItem(d: any): CloudItem {
  const isFolder = Boolean(d.folder || d.root);
  const h = d.file?.hashes ?? {};
  return {
    remoteId: d.id,
    parentRemoteId: d.root ? null : (d.parentReference?.id ?? null),
    name: d.root ? "" : d.name,
    isFolder,
    size: isFolder ? 0 : Number(d.size ?? 0),
    mime: d.file?.mimeType ?? null,
    hashes: {
      sha1: h.sha1Hash?.toLowerCase(),
      sha256: h.sha256Hash?.toLowerCase(),
      quickXor: h.quickXorHash,
    },
    modifiedAt: d.lastModifiedDateTime ?? null,
    createdAt: d.createdDateTime ?? null,
    takenAt: d.photo?.takenDateTime ?? null,
    location: d.location?.latitude != null ? { lat: d.location.latitude, lng: d.location.longitude } : null,
    width: d.image?.width ?? d.video?.width ?? null,
    height: d.image?.height ?? d.video?.height ?? null,
    webUrl: d.webUrl ?? null,
    deleted: Boolean(d.deleted),
  };
}

const enc = (path: string) =>
  path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

export const onedrive: StorageProvider = {
  id: "onedrive",
  name: "OneDrive",
  blurb: "Microsoft personal accounts and Microsoft 365 work/school (OneDrive for Business).",
  capabilities: { restore: true, hashes: ["sha1", "sha256", "quickXor"], photoLocation: true },
  chunkSize: 32 * 320 * 1024, // 10 MiB, multiple of 320 KiB as Graph requires

  isConfigured: () => Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),

  authorizeUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: SCOPE,
      prompt: "select_account",
      state,
    });
    return `${AUTH}/authorize?${p}`;
  },

  exchangeCode: (code, redirectUri) =>
    tokenRequest(`${AUTH}/token`, {
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: SCOPE,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    }),

  async refresh(t: OAuthTokens) {
    const next = await tokenRequest(`${AUTH}/token`, {
      refresh_token: t.refreshToken!,
      grant_type: "refresh_token",
      scope: SCOPE,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    });
    return { ...next, refreshToken: next.refreshToken ?? t.refreshToken };
  },

  async profile(ctx) {
    const token = await ctx.token();
    const [me, drive] = await Promise.all([
      json(`${GRAPH}/me?$select=displayName,mail,userPrincipalName`, { headers: bearer(token) }),
      json(`${GRAPH}/me/drive?$select=quota,driveType`, { headers: bearer(token) }),
    ]);
    return {
      email: me.mail ?? me.userPrincipalName ?? null,
      displayName: me.displayName ?? null,
      quotaTotal: drive.quota?.total ?? null,
      quotaUsed: drive.quota?.used ?? null,
    };
  },

  async list(ctx, cursor) {
    // The delta API enumerates the entire drive with stable paging.
    const url = cursor ?? `${GRAPH}/me/drive/root/delta?$select=${SELECT}&top=1000`;
    const r = await json(url, { headers: bearer(await ctx.token()) });
    return {
      items: (r.value ?? []).filter((d: any) => !d.deleted).map(toItem),
      next: r["@odata.nextLink"] ?? null,
    };
  },

  async thumbnail(ctx, item) {
    const res = await http(`${GRAPH}/me/drive/items/${item.remoteId}/thumbnails/0/medium/content`, {
      headers: bearer(await ctx.token()),
      retries: 1,
    }).catch(() => null);
    return res ? Buffer.from(await res.arrayBuffer()) : null;
  },

  async downloadRange(ctx, remoteId, start, end) {
    const res = await http(`${GRAPH}/me/drive/items/${remoteId}/content`, {
      headers: bearer(await ctx.token(), { Range: `bytes=${start}-${end}` }),
    });
    return Buffer.from(await res.arrayBuffer());
  },

  async ensureFolder(ctx, path) {
    const token = await ctx.token();
    const clean = enc(path);
    if (!clean) return (await json(`${GRAPH}/me/drive/root?$select=id`, { headers: bearer(token) })).id;
    const existing = await http(`${GRAPH}/me/drive/root:/${clean}?$select=id,folder`, { headers: bearer(token), retries: 1 }).catch(() => null);
    if (existing) return (await existing.json()).id;
    const parts = path.split("/").filter(Boolean);
    const parentId = await onedrive.ensureFolder(ctx, parts.slice(0, -1).join("/"));
    const created = await json(`${GRAPH}/me/drive/items/${parentId}/children`, {
      method: "POST",
      headers: bearer(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ name: parts.at(-1), folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
    });
    return created.id;
  },

  async startUpload(ctx, { parentId, name }) {
    const r = await json(`${GRAPH}/me/drive/items/${parentId}:/${encodeURIComponent(name)}:/createUploadSession`, {
      method: "POST",
      headers: bearer(await ctx.token(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
    });
    return { url: r.uploadUrl };
  },

  async uploadChunk(_ctx, session, chunk, offset, total) {
    // Upload URLs are pre-authenticated; sending an Authorization header is an error.
    const res = await http(session.url, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${offset}-${offset + chunk.length - 1}/${total}`,
      },
      body: new Uint8Array(chunk),
    });
    if (res.status === 202) return null;
    return toItem(await res.json());
  },

  async move(ctx, remoteId, newParentId) {
    await http(`${GRAPH}/me/drive/items/${remoteId}`, {
      method: "PATCH",
      headers: bearer(await ctx.token(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ parentReference: { id: newParentId } }),
    });
  },

  async rename(ctx, remoteId, newName) {
    // Graph refuses a name already used in the folder (409 nameAlreadyExists) rather than overwriting.
    await http(`${GRAPH}/me/drive/items/${remoteId}`, {
      method: "PATCH",
      headers: bearer(await ctx.token(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ name: newName }),
    });
  },

  async trash(ctx, remoteId) {
    // DELETE sends the item to the OneDrive recycle bin (kept 30 days personal / 93 days business).
    await http(`${GRAPH}/me/drive/items/${remoteId}`, { method: "DELETE", headers: bearer(await ctx.token()) });
  },

  async purge(ctx, remoteId, alreadyTrashed) {
    if (alreadyTrashed)
      throw new ProviderError("OneDrive keeps it in its recycle bin. Empty the recycle bin on the OneDrive website to free the space now.", 409);
    try {
      // permanentDelete exists for work/school OneDrive; personal OneDrive refuses it.
      await http(`${GRAPH}/me/drive/items/${remoteId}/permanentDelete`, {
        method: "POST",
        headers: bearer(await ctx.token(), { "Content-Type": "application/json" }),
        body: "{}",
        retries: 0,
      });
      return "deleted";
    } catch {
      await onedrive.trash(ctx, remoteId);
      return "trashed";
    }
  },

  async restore(ctx, remoteId) {
    // Graph restore is available for OneDrive personal. Work/school files are restored from the
    // recycle bin in the OneDrive web UI; the error surfaces that to the user.
    await http(`${GRAPH}/me/drive/items/${remoteId}/restore`, {
      method: "POST",
      headers: bearer(await ctx.token(), { "Content-Type": "application/json" }),
      body: "{}",
      retries: 1,
    });
  },
};
