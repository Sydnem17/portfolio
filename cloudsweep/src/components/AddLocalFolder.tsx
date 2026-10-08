"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ensurePermission, pickFolder, rememberFolder, supportsLocalFolders } from "@/lib/local-client";
import { startLocalScan } from "./LocalScanManager";
import { buttonClass } from "./ui";

/** "Add local folder": pick a folder, USB drive or mapped network drive; the browser scans it. */
export function AddLocalFolder() {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSupported(supportsLocalFolders()), []);

  async function add() {
    setError(null);
    let dir;
    try {
      dir = await pickFolder();
    } catch {
      return; // picker closed
    }
    setBusy(true);
    try {
      if (!(await ensurePermission(dir))) throw new Error("CloudSweep needs permission to view and edit files in that folder (so it can move duplicates into a staging folder).");
      const r = await fetch("/api/local/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderName: dir.name }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't add the folder");
      const { id, label } = await r.json();
      await rememberFolder(id, dir);
      startLocalScan(id, label, dir);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (supported === false)
    return (
      <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-ink-muted">
        Open CloudSweep in <b>Chrome</b> or <b>Edge</b> on a computer to add local folders. Other browsers and phones can&apos;t open folders for websites.
      </p>
    );
  return (
    <div className="mt-4">
      <button className={`${buttonClass()} w-full`} onClick={add} disabled={busy || supported === null}>
        {busy ? "Adding…" : "Add local folder or drive"}
      </button>
      {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
      <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
        For a NAS, map it as a network drive in Windows first (File Explorer → This PC → Map network drive), then pick that drive.
      </p>
    </div>
  );
}

/** Rescans a local folder: reuses the folder this browser remembers, or asks for it again. Call from a click. */
export async function rescanLocal(accountId: string, label: string): Promise<string | null> {
  if (!supportsLocalFolders()) return "Open CloudSweep in Chrome or Edge on the computer that has this folder.";
  const { recallFolder } = await import("@/lib/local-client");
  let dir = await recallFolder(accountId);
  if (!dir) {
    try {
      dir = await pickFolder();
    } catch {
      return null;
    }
    await rememberFolder(accountId, dir);
  }
  if (!(await ensurePermission(dir))) return "Permission to read that folder wasn't granted.";
  startLocalScan(accountId, label, dir);
  return null;
}
