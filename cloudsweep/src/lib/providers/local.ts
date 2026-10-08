import { ProviderError, type StorageProvider } from "./types";

const inBrowser = () => {
  throw new ProviderError("Files on this computer are read and moved by your browser, not the server. Open CloudSweep in Chrome or Edge on that computer.", 409);
};

/**
 * Folders and drives on the user's own computer (including USB drives and mapped NAS drives).
 * The server only stores the index. Listing, fingerprinting and moving files all happen in the
 * browser through the File System Access API (src/lib/local-client.ts), so file contents never
 * leave the computer.
 */
export const local: StorageProvider = {
  id: "local",
  name: "This computer",
  blurb: "A folder, USB drive or mapped network drive (NAS) on this computer. Read by your browser; files never leave the machine.",
  capabilities: { restore: true, hashes: ["md5", "sha1", "sha256", "quickXor"], photoLocation: false },
  chunkSize: 4 * 1024 * 1024,
  isConfigured: () => true,
  authorizeUrl: inBrowser,
  exchangeCode: async () => ({ accessToken: "local", expiresAt: Date.now() + 3650 * 864e5 }),
  refresh: async (t) => ({ ...t, expiresAt: Date.now() + 3650 * 864e5 }),
  profile: async () => ({ email: null, displayName: null, quotaTotal: null, quotaUsed: null }),
  list: inBrowser,
  thumbnail: async () => null,
  downloadRange: inBrowser,
  ensureFolder: inBrowser,
  startUpload: inBrowser,
  uploadChunk: inBrowser,
  move: inBrowser,
  rename: inBrowser,
  trash: inBrowser,
  purge: inBrowser,
  restore: inBrowser,
};
