/**
 * The provider contract. Every storage service (OneDrive, Google Drive, Dropbox, ...)
 * implements this interface once, and every CloudSweep utility — scanning, duplicate
 * detection, consolidation, photo intelligence, undo — works with it automatically.
 *
 * To add a new service: implement StorageProvider in a new file and register it in ./index.ts.
 */

export type ProviderId = "google" | "onedrive" | "dropbox" | "demo";

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  scope?: string;
  /** Provider-specific extras (e.g. demo flavour). */
  extra?: Record<string, string>;
}

export interface ProviderProfile {
  email: string | null;
  displayName: string | null;
  quotaTotal: number | null;
  quotaUsed: number | null;
}

export interface CloudItem {
  remoteId: string;
  parentRemoteId: string | null;
  name: string;
  /** Full path when the provider gives it cheaply; otherwise resolved after scanning. */
  path?: string | null;
  isFolder: boolean;
  size: number;
  mime: string | null;
  hashes: { md5?: string; sha1?: string; sha256?: string; quickXor?: string; provider?: string };
  modifiedAt: string | null;
  createdAt: string | null;
  takenAt?: string | null;
  location?: { lat: number; lng: number } | null;
  width?: number | null;
  height?: number | null;
  webUrl?: string | null;
  /** Item was deleted since the last delta (incremental providers only). */
  deleted?: boolean;
}

export interface ListPage {
  items: CloudItem[];
  /** Opaque cursor for the next page; null when the enumeration is complete. */
  next: string | null;
  /** True when the provider reports deltas (only changes) rather than a full listing. */
  incremental?: boolean;
}

export interface UploadSession {
  url: string;
  /** Anything the provider needs to finish the upload later (serialisable). */
  state?: Record<string, unknown>;
}

export interface ProviderContext {
  accountId: string;
  token(): Promise<string>;
  extra?: Record<string, string>;
}

export interface ProviderCapabilities {
  /** Server-side restore from trash/recycle bin is supported. */
  restore: boolean;
  /** Hash types the provider returns without downloading content. */
  hashes: Array<"md5" | "sha1" | "sha256" | "quickXor" | "provider">;
  /** Provider exposes photo GPS metadata. */
  photoLocation: boolean;
}

export interface StorageProvider {
  id: ProviderId;
  name: string;
  /** Short description shown on the "connect" card. */
  blurb: string;
  capabilities: ProviderCapabilities;
  /** Upload chunk size in bytes (must satisfy the provider's alignment rule). */
  chunkSize: number;

  isConfigured(): boolean;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  refresh(tokens: OAuthTokens): Promise<OAuthTokens>;

  profile(ctx: ProviderContext): Promise<ProviderProfile>;
  /** Enumerate the whole drive one page at a time. */
  list(ctx: ProviderContext, cursor: string | null): Promise<ListPage>;
  thumbnail(ctx: ProviderContext, item: { remoteId: string }): Promise<Buffer | null>;
  /** Download a byte range [start, end] inclusive. */
  downloadRange(ctx: ProviderContext, remoteId: string, start: number, end: number): Promise<Buffer>;

  ensureFolder(ctx: ProviderContext, path: string): Promise<string>;
  startUpload(ctx: ProviderContext, args: { parentId: string; name: string; size: number; mime: string | null }): Promise<UploadSession>;
  /** Upload one chunk. Returns the finished item when the final chunk lands. */
  uploadChunk(
    ctx: ProviderContext,
    session: UploadSession,
    chunk: Buffer,
    offset: number,
    total: number,
  ): Promise<CloudItem | null>;

  move(ctx: ProviderContext, remoteId: string, newParentId: string): Promise<void>;
  trash(ctx: ProviderContext, remoteId: string): Promise<void>;
  restore(ctx: ProviderContext, remoteId: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retryable = false,
  ) {
    super(message);
  }
}

export function kindOf(name: string, mime: string | null, isFolder: boolean): string {
  if (isFolder) return "folder";
  const m = (mime ?? "").toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "heic", "heif", "gif", "webp", "tif", "tiff", "raw", "cr2", "nef", "arw", "dng", "bmp"].includes(ext)) return "image";
  if (m.startsWith("video/") || ["mp4", "mov", "m4v", "avi", "mkv", "wmv", "3gp", "webm"].includes(ext)) return "video";
  if (m.startsWith("audio/") || ["mp3", "wav", "m4a", "flac", "aac", "ogg"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "iso", "dmg"].includes(ext)) return "archive";
  if (
    m.includes("document") || m.includes("pdf") || m.includes("sheet") || m.includes("presentation") || m.startsWith("text/") ||
    ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "rtf", "odt", "pages", "key", "numbers"].includes(ext)
  )
    return "document";
  return "other";
}
