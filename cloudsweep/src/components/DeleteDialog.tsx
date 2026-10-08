"use client";

import { useEffect, useState } from "react";
import { accountColour, bytes } from "@/lib/format";
import { purgeLocalFiles, stageLocalFiles } from "@/lib/local-actions";
import { announceJobs } from "./JobDock";
import { Dialog, type SelectionSpec } from "./RenameDialog";
import { buttonClass } from "./ui";

interface Picked {
  id: string;
  accountId: string;
  accountLabel: string;
  provider: string;
  path: string;
  size: number;
}

/**
 * Deletes the selection across every drive at once. Nothing is destroyed: cloud files go to their
 * drive's own trash, files on this computer go to the "CloudSweep Staging" folder, and all of them
 * can be put back from the Staging bin.
 */
export function DeleteDialog({ selection, onClose, onDone }: { selection: SelectionSpec; onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<Picked[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // Off by default: normal deletes are always recoverable. Permanent deletion is a deliberate choice.
  const [permanent, setPermanent] = useState(false);

  useEffect(() => {
    fetch("/api/selection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selection) })
      .then((r) => r.json())
      .then((r) => (r.error ? setError(r.error) : setFiles(r.files)));
  }, [selection]);

  const byDrive = new Map<string, { label: string; provider: string; n: number; bytes: number }>();
  for (const f of files ?? []) {
    const d = byDrive.get(f.accountId) ?? { label: f.accountLabel, provider: f.provider, n: 0, bytes: 0 };
    d.n++;
    d.bytes += f.size;
    byDrive.set(f.accountId, d);
  }
  const total = (files ?? []).reduce((s, f) => s + f.size, 0);
  const n = files?.length ?? 0;

  async function remove() {
    if (!files) return;
    setBusy(true);
    const local = files.filter((f) => f.provider === "local");
    const cloud = files.filter((f) => f.provider !== "local").map((f) => f.id);
    let problem = "";
    if (local.length) {
      const groups = new Map<string, Array<{ id: string; path: string }>>();
      for (const f of local) groups.set(f.accountId, [...(groups.get(f.accountId) ?? []), { id: f.id, path: f.path }]);
      const r = permanent
        ? await purgeLocalFiles(new Map([...groups].map(([acc, l]) => [acc, l.map((f) => ({ itemId: f.id, path: f.path }))])))
        : await stageLocalFiles(groups, "deleted");
      if (r.failed) setNotice((problem = r.problems.join(" ")));
    }
    if (cloud.length) {
      const r = await fetch("/api/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: cloud, reason: "deleted", permanent }) }).then((x) => x.json());
      if (r.error) {
        setBusy(false);
        return setError(r.error);
      }
      announceJobs();
    }
    setBusy(false);
    onDone();
    window.dispatchEvent(new Event("cloudsweep:changed"));
    if (!problem) onClose();
  }

  return (
    <Dialog title={n ? `Delete ${n.toLocaleString()} ${n === 1 ? "file" : "files"}?` : "Delete files"} onClose={onClose}>
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">{error}</p>}
      {notice && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[14px] text-amber-800">{notice}</p>}
      {!files ? (
        !error && <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      ) : !n ? (
        <p className="text-[15px] text-ink-muted">There are no files in what you selected.</p>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-xl border border-line text-[14px]">
            {[...byDrive.entries()].map(([id, d]) => (
              <li key={id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accountColour(d.provider, d.label) }} />
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">
                  {d.n.toLocaleString()} · {bytes(d.bytes)}
                </span>
              </li>
            ))}
          </ul>
          {permanent ? (
            <ul className="mt-4 space-y-1.5 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-900">
              <li>
                • <b>This can&apos;t be undone.</b> Files skip the trash and the Staging bin, and free <b>{bytes(total)}</b> straight away.
              </li>
              <li>• Google Drive, work OneDrive and files on this computer are deleted for good.</li>
              <li>• Personal OneDrive and Dropbox don&apos;t let apps delete permanently: those go to their recycle bin, which you can empty on their website.</li>
            </ul>
          ) : (
            <ul className="mt-4 space-y-1.5 text-[14px] text-ink-soft">
              <li>
                • Frees about <b>{bytes(total)}</b> once each drive empties its trash.
              </li>
              <li>• Cloud files go to that drive&apos;s own trash (kept 30+ days). Files on this computer go to a “CloudSweep Staging” folder on the same drive.</li>
              <li>• Changed your mind? Put any of them back from the Staging bin.</li>
            </ul>
          )}
          <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-line px-4 py-3 text-[14px]">
            <input type="checkbox" className="mt-1" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} />
            <span>
              <b className="font-medium">Delete permanently</b>
              <span className="block text-[13px] text-ink-muted">Skip the trash. For things you never want back.</span>
            </span>
          </label>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button className={buttonClass("ghost")} onClick={onClose}>
              Cancel
            </button>
            <button className={buttonClass("danger")} disabled={busy} onClick={remove}>
              {busy ? "Deleting…" : `Delete ${n.toLocaleString()} ${n === 1 ? "file" : "files"}${permanent ? " forever" : ""}`}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
