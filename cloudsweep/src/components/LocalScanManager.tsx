"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { hashFile, resolveFile, walk, type LDirHandle } from "@/lib/local-client";

/**
 * Runs scans of local folders in this tab (they can't run on the server) and reports progress to the
 * JobDock. Lives in the app layout, so scans continue while you move between pages.
 *
 * Start a scan with: window.dispatchEvent(new CustomEvent("cloudsweep:local-scan", { detail: { accountId, label, dir } }))
 */
export interface LocalTask {
  id: string;
  label: string;
  phase: "listing" | "fingerprinting" | "done" | "failed" | "cancelled";
  message: string;
  done?: number;
  total?: number;
  error?: string;
}

const tasks = new Map<string, LocalTask>();
const controllers = new Map<string, AbortController>();
const publish = () => window.dispatchEvent(new CustomEvent("cloudsweep:local-progress", { detail: [...tasks.values()] }));
const update = (id: string, patch: Partial<LocalTask>) => {
  tasks.set(id, { ...tasks.get(id)!, ...patch });
  publish();
};

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Request failed (${r.status})`);
  return r.json();
}

async function scan(accountId: string, dir: LDirHandle, signal: AbortSignal) {
  const scanId = `scan_${crypto.randomUUID()}`;
  let files = 0;
  update(accountId, { phase: "listing", message: "Reading names, sizes and dates…" });
  await walk(
    dir,
    async (entries) => {
      files += entries.filter((e) => !e.isFolder).length;
      update(accountId, { message: `Reading names, sizes and dates · ${files.toLocaleString()} files` });
      await post(`/api/local/${accountId}/scan`, { scanId, done: false, entries });
    },
    { signal },
  );
  await post(`/api/local/${accountId}/scan`, { scanId, done: true, entries: [] });

  // Fingerprint only files that share a size with another file somewhere — the only possible duplicates.
  const attempted = new Set<string>();
  let hashed = 0;
  for (;;) {
    const c = await fetch(`/api/local/${accountId}/hash-candidates`).then((r) => r.json());
    const todo = (c.files as Array<{ id: string; path: string; size: number }>).filter((f) => !attempted.has(f.id));
    if (!todo.length) break;
    const total = hashed + c.remaining;
    let batch: unknown[] = [];
    for (const f of todo) {
      if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
      attempted.add(f.id);
      try {
        const { handle } = await resolveFile(dir, f.path);
        batch.push({ itemId: f.id, ...(await hashFile(await handle.getFile())) });
      } catch {
        /* file moved or unreadable since listing — skip it */
      }
      hashed++;
      update(accountId, { phase: "fingerprinting", message: `Fingerprinting possible duplicates · ${hashed.toLocaleString()} of ${total.toLocaleString()}`, done: hashed, total });
      if (batch.length >= 25) {
        await post(`/api/local/${accountId}/hashes`, { hashes: batch });
        batch = [];
      }
    }
    if (batch.length) await post(`/api/local/${accountId}/hashes`, { hashes: batch });
  }
  update(accountId, { phase: "done", message: `Indexed ${files.toLocaleString()} files${hashed ? `, fingerprinted ${hashed.toLocaleString()}` : ""}`, done: undefined, total: undefined });
}

export function LocalScanManager() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const onStart = (e: Event) => {
      const { accountId, label, dir } = (e as CustomEvent<{ accountId: string; label: string; dir: LDirHandle }>).detail;
      if (controllers.has(accountId)) return; // already scanning
      const ctrl = new AbortController();
      controllers.set(accountId, ctrl);
      tasks.set(accountId, { id: accountId, label, phase: "listing", message: "Starting…" });
      publish();
      scan(accountId, dir, ctrl.signal)
        .catch((err) =>
          update(accountId, (err as Error).name === "AbortError" ? { phase: "cancelled", message: "Cancelled" } : { phase: "failed", message: "Failed", error: (err as Error).message }),
        )
        .finally(() => {
          controllers.delete(accountId);
          routerRef.current.refresh();
          window.dispatchEvent(new Event("cloudsweep:changed"));
        });
    };
    const onCancel = (e: Event) => controllers.get((e as CustomEvent<string>).detail)?.abort();
    const onDismiss = (e: Event) => {
      tasks.delete((e as CustomEvent<string>).detail);
      publish();
    };
    // Warn before closing the tab mid-scan: local scans run in this tab.
    const onUnload = (e: BeforeUnloadEvent) => {
      if (controllers.size) e.preventDefault();
    };
    window.addEventListener("cloudsweep:local-scan", onStart);
    window.addEventListener("cloudsweep:local-cancel", onCancel);
    window.addEventListener("cloudsweep:local-dismiss", onDismiss);
    window.addEventListener("beforeunload", onUnload);
    publish();
    return () => {
      window.removeEventListener("cloudsweep:local-scan", onStart);
      window.removeEventListener("cloudsweep:local-cancel", onCancel);
      window.removeEventListener("cloudsweep:local-dismiss", onDismiss);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  return null;
}

export function startLocalScan(accountId: string, label: string, dir: LDirHandle) {
  window.dispatchEvent(new CustomEvent("cloudsweep:local-scan", { detail: { accountId, label, dir } }));
}
