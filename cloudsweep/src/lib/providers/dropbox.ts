import { bearer, http, json, tokenRequest } from "./http";
import { ProviderError, type CloudItem, type OAuthTokens, type StorageProvider } from "./types";

const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

/** Dropbox-API-Arg must be HTTP-header safe: escape non-ASCII characters. */
const arg = (v: unknown) => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

function toItem(e: any): CloudItem {
  const isFolder = e[".tag"] === "folder";
  const media = e.media_info?.metadata ?? {};
  return {
    remoteId: e.id,
    parentRemoteId: null,
    name: e.name,
    path: e.path_display ?? null,
    isFolder,
    size: isFolder ? 0 : Number(e.size ?? 0),
    mime: null,
    hashes: { provider: e.content_hash ? `dbx:${e.content_hash}` : undefined },
    modifiedAt: e.server_modified ?? null,
    createdAt: e.client_modified ?? null,
    takenAt: media.time_taken ?? null,
    location: media.location ? { lat: media.location.latitude, lng: media.location.longitude } : null,
    width: media.dimensions?.width ?? null,
    height: media.dimensions?.height ?? null,
    webUrl: e.path_display ? `https://www.dropbox.com/home${encodeURI(e.path_display.split("/").slice(0, -1).join("/"))}` : null,
  };
}

const post = async (url: string, token: string, body: unknown) =>
  json(url, { method: "POST", headers: bearer(token, { "Content-Type": "application/json" }), body: JSON.stringify(body) });

export const dropbox: StorageProvider = {
  id: "dropbox",
  name: "Dropbox",
  blurb: "Dropbox Basic, Plus and Business accounts.",
  capabilities: { restore: false, hashes: ["provider"], photoLocation: false },
  chunkSize: 8 * 1024 * 1024, // multiple of 4 MiB

  isConfigured: () => Boolean(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET),

  authorizeUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: process.env.DROPBOX_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      token_access_type: "offline",
      state,
    });
    return `https://www.dropbox.com/oauth2/authorize?${p}`;
  },

  exchangeCode: (code, redirectUri) =>
    tokenRequest("https://api.dropboxapi.com/oauth2/token", {
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      client_id: process.env.DROPBOX_CLIENT_ID!,
      client_secret: process.env.DROPBOX_CLIENT_SECRET!,
    }),

  async refresh(t: OAuthTokens) {
    const next = await tokenRequest("https://api.dropboxapi.com/oauth2/token", {
      refresh_token: t.refreshToken!,
      grant_type: "refresh_token",
      client_id: process.env.DROPBOX_CLIENT_ID!,
      client_secret: process.env.DROPBOX_CLIENT_SECRET!,
    });
    return { ...next, refreshToken: t.refreshToken };
  },

  async profile(ctx) {
    const token = await ctx.token();
    const [acc, space] = await Promise.all([
      json(`${API}/users/get_current_account`, { method: "POST", headers: bearer(token) }),
      json(`${API}/users/get_space_usage`, { method: "POST", headers: bearer(token) }),
    ]);
    return {
      email: acc.email ?? null,
      displayName: acc.name?.display_name ?? null,
      quotaTotal: space.allocation?.allocated ?? null,
      quotaUsed: space.used ?? null,
    };
  },

  async list(ctx, cursor) {
    const token = await ctx.token();
    const r = cursor
      ? await post(`${API}/files/list_folder/continue`, token, { cursor })
      : await post(`${API}/files/list_folder`, token, { path: "", recursive: true, limit: 2000, include_media_info: true });
    return { items: (r.entries ?? []).filter((e: any) => e[".tag"] !== "deleted").map(toItem), next: r.has_more ? r.cursor : null };
  },

  async thumbnail(ctx, item) {
    const res = await http(`${CONTENT}/files/get_thumbnail_v2`, {
      method: "POST",
      headers: bearer(await ctx.token(), {
        "Dropbox-API-Arg": arg({ resource: { ".tag": "path", path: item.remoteId }, format: "jpeg", size: "w480h320" }),
      }),
      retries: 1,
    }).catch(() => null);
    return res ? Buffer.from(await res.arrayBuffer()) : null;
  },

  async downloadRange(ctx, remoteId, start, end) {
    const res = await http(`${CONTENT}/files/download`, {
      method: "POST",
      headers: bearer(await ctx.token(), { "Dropbox-API-Arg": arg({ path: remoteId }), Range: `bytes=${start}-${end}` }),
    });
    return Buffer.from(await res.arrayBuffer());
  },

  async ensureFolder(ctx, path) {
    const clean = "/" + path.split("/").filter(Boolean).join("/");
    if (clean === "/") return "";
    await http(`${API}/files/create_folder_v2`, {
      method: "POST",
      headers: bearer(await ctx.token(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ path: clean, autorename: false }),
      retries: 1,
    }).catch((e) => {
      if (!(e instanceof ProviderError && e.status === 409)) throw e; // 409 = already exists
    });
    return clean; // Dropbox addresses folders by path
  },

  async startUpload(ctx, { parentId, name }) {
    const r = await json(`${CONTENT}/files/upload_session/start`, {
      method: "POST",
      headers: bearer(await ctx.token(), { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": arg({ close: false }) }),
      body: new Uint8Array(0),
    });
    return { url: r.session_id, state: { path: `${parentId}/${name}` } };
  },

  async uploadChunk(ctx, session, chunk, offset, total) {
    const token = await ctx.token();
    const cursor = { session_id: session.url, offset };
    const last = offset + chunk.length >= total;
    if (!last) {
      await http(`${CONTENT}/files/upload_session/append_v2`, {
        method: "POST",
        headers: bearer(token, { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": arg({ cursor, close: false }) }),
        body: new Uint8Array(chunk),
      });
      return null;
    }
    const meta = await json(`${CONTENT}/files/upload_session/finish`, {
      method: "POST",
      headers: bearer(token, {
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": arg({ cursor, commit: { path: session.state!.path, mode: "add", autorename: true } }),
      }),
      body: new Uint8Array(chunk),
    });
    return toItem({ ...meta, ".tag": "file" });
  },

  async move(ctx, remoteId, newParentId) {
    const token = await ctx.token();
    const meta = await post(`${API}/files/get_metadata`, token, { path: remoteId });
    await post(`${API}/files/move_v2`, token, { from_path: remoteId, to_path: `${newParentId}/${meta.name}`, autorename: true });
  },

  async trash(ctx, remoteId) {
    // Deleted files stay recoverable from Dropbox's "Deleted files" view (30–180 days by plan).
    await post(`${API}/files/delete_v2`, await ctx.token(), { path: remoteId });
  },

  async restore() {
    throw new ProviderError("Dropbox files are restored from Dropbox → Deleted files on the web.", 501);
  },
};
