import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashFile, moveToStaging, restoreFromStaging, walk, type LDirHandle, type LFileHandle } from "@/lib/local-client";
import { QuickXorHash } from "@/lib/quickxor";

/** In-memory stand-in for the browser's File System Access handles. */
class FakeFile implements LFileHandle {
  kind = "file" as const;
  constructor(public name: string, public data: Uint8Array, public mtime = 1_700_000_000_000, private native = false) {
    if (native) this.move = async (dest: LDirHandle, name?: string) => (dest as FakeDir).adopt(this, name ?? this.name);
  }
  parent?: FakeDir;
  move?: (dest: LDirHandle, name?: string) => Promise<void>;
  async getFile() {
    return new File([this.data as BlobPart], this.name, { lastModified: this.mtime });
  }
  async createWritable() {
    const chunks: Uint8Array[] = [];
    return new WritableStream<Uint8Array>({
      write: (c) => void chunks.push(c),
      close: () => {
        this.data = new Uint8Array(Buffer.concat(chunks));
      },
    });
  }
}

class FakeDir implements LDirHandle {
  kind = "directory" as const;
  children = new Map<string, FakeDir | FakeFile>();
  constructor(public name: string) {}
  add(path: string, data: string | Uint8Array, native = false): FakeFile {
    const parts = path.split("/").filter(Boolean);
    const fname = parts.pop()!;
    let d: FakeDir = this;
    for (const p of parts) d = (d.children.get(p) as FakeDir) ?? d.set(p, new FakeDir(p));
    const f = new FakeFile(fname, typeof data === "string" ? new TextEncoder().encode(data) : data, undefined, native);
    return d.set(fname, f) as FakeFile;
  }
  set(name: string, h: FakeDir | FakeFile) {
    this.children.set(name, h);
    if (h instanceof FakeFile) h.parent = this;
    return h;
  }
  adopt(f: FakeFile, name: string) {
    f.parent?.children.delete(f.name);
    f.name = name;
    this.set(name, f);
  }
  async *entries(): AsyncIterable<[string, FakeDir | FakeFile]> {
    for (const e of [...this.children.entries()]) yield e;
  }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    const h = this.children.get(name);
    if (h instanceof FakeDir) return h;
    if (!h && opts?.create) return this.set(name, new FakeDir(name)) as FakeDir;
    throw new DOMException("not found", "NotFoundError");
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    const h = this.children.get(name);
    if (h instanceof FakeFile) return h;
    if (!h && opts?.create) return this.set(name, new FakeFile(name, new Uint8Array())) as FakeFile;
    throw new DOMException("not found", "NotFoundError");
  }
  async removeEntry(name: string) {
    if (!this.children.delete(name)) throw new DOMException("not found", "NotFoundError");
  }
  text(path: string) {
    let d: FakeDir | FakeFile = this;
    for (const p of path.split("/").filter(Boolean)) d = (d as FakeDir).children.get(p)!;
    return d ? new TextDecoder().decode((d as FakeFile).data) : undefined;
  }
}

describe("walk", () => {
  it("lists files and folders, skipping system and staging folders", async () => {
    const root = new FakeDir("E:");
    root.add("Photos/2019/a.jpg", "aaaa");
    root.add("Photos/b.jpg", "bb");
    root.add("$RECYCLE.BIN/x", "junk");
    root.add("CloudSweep Staging/old.jpg", "old");
    root.add("Photos/Thumbs.db", "t");
    const seen: string[] = [];
    const stats = await walk(root, async (b) => void seen.push(...b.map((e) => `${e.isFolder ? "D" : "F"} ${e.path} ${e.size}`)), { batchSize: 2 });
    expect(seen).toEqual(["D /Photos 0", "D /Photos/2019 0", "F /Photos/2019/a.jpg 4", "F /Photos/b.jpg 2"]);
    expect(stats).toMatchObject({ files: 2, folders: 2, bytes: 6 });
  });
});

describe("hashFile", () => {
  it("produces the same fingerprints as Google Drive and OneDrive", async () => {
    const data = new Uint8Array(300_000).map((_, i) => (i * 31) % 251);
    const h = await hashFile(new File([data], "x"));
    const b = Buffer.from(data);
    expect(h.md5).toBe(createHash("md5").update(b).digest("hex"));
    expect(h.sha1).toBe(createHash("sha1").update(b).digest("hex"));
    expect(h.sha256).toBe(createHash("sha256").update(b).digest("hex"));
    expect(h.quickXor).toBe(new QuickXorHash().update(data).digest());
  });
});

describe("staging moves", () => {
  it("copies, verifies and removes when the browser can't move natively, then restores", async () => {
    const root = new FakeDir("E:");
    root.add("Docs/report.pdf", "REPORT");
    root.add(`CloudSweep Staging/Docs/report.pdf`, "OLDER");
    const staged = await moveToStaging(root, "/Docs/report.pdf");
    expect(staged).toBe("/CloudSweep Staging/Docs/report (2).pdf");
    expect(root.text("/CloudSweep Staging/Docs/report (2).pdf")).toBe("REPORT");
    expect(root.text("/CloudSweep Staging/Docs/report.pdf")).toBe("OLDER");
    expect((root.children.get("Docs") as FakeDir).children.has("report.pdf")).toBe(false);

    const back = await restoreFromStaging(root, staged, "/Docs/report.pdf");
    expect(back).toBe("/Docs/report.pdf");
    expect(root.text("/Docs/report.pdf")).toBe("REPORT");
  });

  it("uses the browser's native move when available", async () => {
    const root = new FakeDir("E:");
    const f = root.add("a/b.txt", "B", true);
    await moveToStaging(root, "/a/b.txt");
    expect(f.parent?.name).toBe("a"); // parent dir named "a" inside staging
    expect(root.text("/CloudSweep Staging/a/b.txt")).toBe("B");
  });
});
