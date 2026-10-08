import { demo } from "./demo";
import { dropbox } from "./dropbox";
import { google } from "./google";
import { local } from "./local";
import { onedrive } from "./onedrive";
import type { ProviderId, StorageProvider } from "./types";

/**
 * Provider registry. Adding a storage service = one adapter file + one line here.
 * Box, iCloud Drive (via a sync bridge), pCloud, S3/Backblaze, Synology and WebDAV
 * all fit the same StorageProvider contract.
 */
export const PROVIDERS: Record<ProviderId, StorageProvider> = { onedrive, google, dropbox, local, demo };

export function getProvider(id: string): StorageProvider {
  const p = PROVIDERS[id as ProviderId];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}
