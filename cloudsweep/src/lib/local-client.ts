/**
 * Browser-side access to folders on this computer (File System Access API: Chrome and Edge).
 * Everything here runs on the user's machine; only file details and fingerprints are sent to the server.
 */
import { createMD5, createSHA1, createSHA256 } from "hash-wasm";
import { QuickXorHash } from "./quickxor";

/* Minimal structural types so this module also works with in-memory fakes in tests. */
export interface LFile {
  size: number;
  lastModified: number;
  stream(): ReadableStream<Uint8Array>;
}
export interface LFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<LFile>;
  createWritable?(): Promise<WritableStream<Uint8Array>>;
  move?(dest: LDirHandle, name?: string): Promise<void>;
}
export interface LDirHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterable<[string, LFileHandle | LDirHandle]>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<LDirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<LFileHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  queryPermission?(d: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(d: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

export const STAGING = "CloudSweep Staging";
const SKIP_DIRS = new Set(["$RECYCLE.BIN", "System Volume Information", STAGING, "$Recycle.Bin", ".Trashes", ".Spotlight-V100", ".fseventsd", "node_modules", ".git"]);
const SKIP_FILES = new Set(["desktop.ini", "Thumbs.db", ".DS_Store"]);

export function supportsLocalFolders(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickFolder(): Promise<LDirHandle> {
  return (window as any).showDirectoryPicker({ id: "cloudsweep", mode: "readwrite" });
}

/** Asks for read/write access if the browser doesn't already have it. Must run from a click. */
export async function ensurePermission(dir: LDirHandle, mode: "read" | "readwrite" = "readwrite"): Promise<boolean> {
  if (!dir.queryPermission) return true;
  if ((await dir.queryPermission({ mode })) === "granted") return true;
  return (await dir.requestPermission?.({ mode })) === "granted";
}

/* ── Remembering which folder belongs to which account (IndexedDB, this browser only) ── */

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("cloudsweep", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("handles");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function rememberFolder(accountId: string, dir: LDirHandle) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(dir, accountId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function recallFolder(accountId: string): Promise<LDirHandle | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction("handles").objectStore("handles").get(accountId);
      r.onsuccess = () => resolve((r.result as LDirHandle) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/* ── Walking a folder ── */

export interface LocalEntry {
  path: string;
  isFolder: boolean;
  size: number;
  modifiedAt: string | null;
}

/** Walks a folder tree, handing entries over in batches. Unreadable folders are skipped and counted. */
export async function walk(root: LDirHandle, onBatch: (entries: LocalEntry[]) => Promise<void>, opts: { batchSize?: number; signal?: AbortSignal } = {}) {
  const batchSize = opts.batchSize ?? 1000;
  let batch: LocalEntry[] = [];
  const stats = { files: 0, folders: 0, bytes: 0, skipped: 0 };
  const flush = async () => {
    if (batch.length) await onBatch(batch);
    batch = [];
  };
  const visit = async (dir: LDirHandle, path: string): Promise<void> => {
    let children: Array<[string, LFileHandle | LDirHandle]> = [];
    try {
      for await (const entry of dir.entries()) children.push(entry);
    } catch {
      stats.skipped++;
      return;
    }
    children = children.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, handle] of children) {
      if (opts.signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");
      const p = `${path}/${name}`;
      if (handle.kind === "directory") {
        if (SKIP_DIRS.has(name) || name.startsWith(".Trash-")) continue;
        stats.folders++;
        batch.push({ path: p, isFolder: true, size: 0, modifiedAt: null });
        if (batch.length >= batchSize) await flush();
        await visit(handle, p);
      } else {
        if (SKIP_FILES.has(name)) continue;
        try {
          const f = await handle.getFile();
          stats.files++;
          stats.bytes += f.size;
          batch.push({ path: p, isFolder: false, size: f.size, modifiedAt: new Date(f.lastModified).toISOString() });
        } catch {
          stats.skipped++;
        }
        if (batch.length >= batchSize) await flush();
      }
    }
  };
  await visit(root, "");
  await flush();
  return stats;
}

/* ── Fingerprints: the same four hash types Google Drive and OneDrive report ── */

export interface FileHashes {
  md5: string;
  sha1: string;
  sha256: string;
  quickXor: string;
}

export async function hashFile(file: LFile, onBytes?: (n: number) => void): Promise<FileHashes> {
  const [md5, sha1, sha256] = await Promise.all([createMD5(), createSHA1(), createSHA256()]);
  const qx = new QuickXorHash();
  md5.init();
  sha1.init();
  sha256.init();
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    md5.update(value);
    sha1.update(value);
    sha256.update(value);
    qx.update(value);
    onBytes?.(value.length);
  }
  return { md5: md5.digest("hex"), sha1: sha1.digest("hex"), sha256: sha256.digest("hex"), quickXor: qx.digest() };
}

/* ── Resolving paths and moving files safely ── */

const segments = (path: string) => path.split("/").filter(Boolean);

async function dirAt(root: LDirHandle, parts: string[], create = false): Promise<LDirHandle> {
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
  return dir;
}

export async function resolveFile(root: LDirHandle, path: string) {
  const parts = segments(path);
  const name = parts.pop()!;
  const dir = await dirAt(root, parts);
  return { dir, name, handle: await dir.getFileHandle(name) };
}

async function exists(dir: LDirHandle, name: string) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function freeName(dir: LDirHandle, name: string) {
  if (!(await exists(dir, name))) return name;
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 2; ; n++) if (!(await exists(dir, `${base} (${n})${ext}`))) return `${base} (${n})${ext}`;
}

/** Moves a file, using the browser's native move when available, else copy → verify size → delete original. */
async function moveFile(src: { dir: LDirHandle; name: string; handle: LFileHandle }, destDir: LDirHandle, destName: string) {
  if (typeof src.handle.move === "function") {
    try {
      await src.handle.move(destDir, destName);
      return;
    } catch {
      /* fall back to copying (e.g. moving across drives isn't supported natively) */
    }
  }
  const original = await src.handle.getFile();
  const dest = await destDir.getFileHandle(destName, { create: true });
  if (!dest.createWritable) throw new Error("This browser can't write files here.");
  try {
    await original.stream().pipeTo(await dest.createWritable());
    if ((await dest.getFile()).size !== original.size) throw new Error("Copy was incomplete");
  } catch (err) {
    await destDir.removeEntry(destName).catch(() => undefined);
    throw err;
  }
  await src.dir.removeEntry(src.name);
}

/** Moves a file into "CloudSweep Staging/<original folder>/" on the same drive. Returns the staged path. */
export async function moveToStaging(root: LDirHandle, path: string): Promise<string> {
  const src = await resolveFile(root, path);
  const folder = [STAGING, ...segments(path).slice(0, -1)];
  const destDir = await dirAt(root, folder, true);
  const destName = await freeName(destDir, src.name);
  await moveFile(src, destDir, destName);
  return `/${[...folder, destName].join("/")}`;
}

/** Moves a staged file back to where it came from (renaming if something now occupies that spot). */
export async function restoreFromStaging(root: LDirHandle, stagedPath: string, originalPath: string): Promise<string> {
  const src = await resolveFile(root, stagedPath);
  const parts = segments(originalPath);
  const name = parts.pop()!;
  const destDir = await dirAt(root, parts, true);
  const destName = await freeName(destDir, name);
  await moveFile(src, destDir, destName);
  return `/${[...parts, destName].join("/")}`;
}

/** Renames a file in place. Refuses rather than overwriting when the new name is already taken. */
export async function renameFile(root: LDirHandle, path: string, newName: string): Promise<void> {
  const src = await resolveFile(root, path);
  if (src.name === newName) return;
  if (src.name.toLowerCase() !== newName.toLowerCase() && (await exists(src.dir, newName))) throw new Error(`“${newName}” already exists`);
  await moveFile(src, src.dir, newName);
}

/** Creates a folder (and any missing parents) inside the picked folder. */
export async function createFolder(root: LDirHandle, path: string): Promise<void> {
  await dirAt(root, segments(path), true);
}
