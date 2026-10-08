"use client";

import { useEffect, useState } from "react";
import { bytes } from "@/lib/format";
import { DriveMeter, freeOf, useDrives } from "./DriveMeter";
import { announceJobs } from "./JobDock";
import { Dialog, type SelectionSpec } from "./RenameDialog";
import { buttonClass } from "./ui";

interface MoveSummary {
  files: number;
  counts: { copy: number; "already-there": number; "duplicate-in-batch": number; unsupported: number; relocate: number };
  bytesToTransfer: number;
  bytesFreedAtSource: number;
  targetFree: number | null;
  warnings: string[];
  skipped: { sameDrive: number; local: number };
  examples: Array<{ name: string; from: string; to: string; action: string }>;
  totalBytes: number;
}

/**
 * Moves the selection to any drive (or to a folder on the same drive). Across drives each file is
 * copied, checked, and only then sent to the original drive's trash.
 */
export function MoveDialog({ selection, sourceAccountIds, onClose, onDone }: { selection: SelectionSpec; sourceAccountIds: string[]; onClose: () => void; onDone: () => void }) {
  const drives = useDrives();
  const [target, setTarget] = useState<string | null>(null);
  const [folder, setFolder] = useState("");
  const [keepStructure, setKeepStructure] = useState(true);
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [plan, setPlan] = useState<MoveSummary | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Default to the cloud drive with the most free space that isn't where the files are now.
  useEffect(() => {
    if (!drives || target) return;
    const best = drives
      .filter((d) => d.provider !== "local" && !sourceAccountIds.includes(d.id))
      .sort((a, b) => (freeOf(b) ?? -1) - (freeOf(a) ?? -1))[0];
    if (best) setTarget(best.id);
  }, [drives, target, sourceAccountIds]);

  // Existing top-level folders on the destination, offered as you type.
  useEffect(() => {
    if (!target) return;
    fetch(`/api/library?${new URLSearchParams({ account: target, path: "/" })}`)
      .then((r) => r.json())
      .then((r) => setFolders((r.folders ?? []).map((f: { name: string }) => f.name)))
      .catch(() => setFolders([]));
  }, [target]);

  const body = { selection, targetAccountId: target, targetFolder: folder, keepStructure, keepOriginal };
  useEffect(() => {
    if (!target) return;
    setPlan(null);
    setError("");
    const t = setTimeout(async () => {
      const r = await fetch("/api/move/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
      if (r.error) setError(r.error);
      else setPlan(r);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, folder, keepStructure, keepOriginal]);

  const dest = drives?.find((d) => d.id === target);
  const crossDrive = plan ? plan.counts.copy + plan.counts["already-there"] + plan.counts["duplicate-in-batch"] : 0;
  const work = plan ? crossDrive + plan.counts.relocate : 0;
  const tooBig = plan?.targetFree != null && plan.bytesToTransfer > plan.targetFree;

  async function start() {
    setBusy(true);
    const r = await fetch("/api/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
    setBusy(false);
    if (r.error) return setError(r.error);
    announceJobs();
    onDone();
    onClose();
  }

  return (
    <Dialog title="Move to another drive or folder" onClose={onClose} wide>
      <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-muted">1 · Where to</p>
      {!drives ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {drives.map((d) => {
            const disabled = d.provider === "local";
            return (
              <button
                key={d.id}
                disabled={disabled}
                onClick={() => setTarget(d.id)}
                title={disabled ? "Moving files onto this computer is coming in a later update" : undefined}
                className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${target === d.id ? "border-ink bg-slate-50 ring-1 ring-ink" : "border-line hover:border-ink/30"}`}
              >
                <DriveMeter drive={d} />
                {sourceAccountIds.includes(d.id) && <p className="mt-1 pl-4 text-[11px] text-ink-muted">Files from here move into a folder instantly</p>}
              </button>
            );
          })}
        </div>
      )}

      <p className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-muted">2 · Into which folder</p>
      <input
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
        list="move-folders"
        placeholder="Leave empty to keep the same folders, or type e.g. Photos/2024 Fiji"
        className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-ink"
        aria-label="Destination folder"
      />
      <datalist id="move-folders">
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <p className="mt-1.5 text-[12px] text-ink-muted">New folders are created for you.</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={keepStructure} onChange={(e) => setKeepStructure(e.target.checked)} /> Keep their current sub-folders
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} /> Keep a copy on the original drive
        </label>
      </div>

      <p className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-muted">3 · Check</p>
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">{error}</p>
      ) : !plan ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="rounded-xl border border-line p-4 text-[14px]">
          <ul className="space-y-1.5">
            {plan.counts.copy > 0 && (
              <li>
                • <b>{plan.counts.copy.toLocaleString()}</b> {keepOriginal ? "copied" : "moved"} to {dest?.label} — {bytes(plan.bytesToTransfer)} to transfer
              </li>
            )}
            {plan.counts.relocate > 0 && (
              <li>
                • <b>{plan.counts.relocate.toLocaleString()}</b> moved into the folder on the same drive (instant, nothing copied)
              </li>
            )}
            {plan.counts["already-there"] > 0 && (
              <li>
                • <b>{plan.counts["already-there"].toLocaleString()}</b> already on {dest?.label} — {keepOriginal ? "skipped" : "only removed from the original drive"}
              </li>
            )}
            {plan.counts["duplicate-in-batch"] > 0 && (
              <li>
                • <b>{plan.counts["duplicate-in-batch"].toLocaleString()}</b> duplicates within your selection — one copy is kept{keepOriginal ? "" : ", the extras go to trash"}
              </li>
            )}
            {!keepOriginal && plan.bytesFreedAtSource > 0 && (
              <li className="text-good">
                • Frees <b>{bytes(plan.bytesFreedAtSource)}</b> on the original drive
              </li>
            )}
            {plan.counts.unsupported > 0 && <li className="text-warn">• {plan.counts.unsupported} Google Docs/Sheets/Slides stay where they are (they can&apos;t be copied as files)</li>}
            {plan.skipped.sameDrive > 0 && <li className="text-ink-muted">• {plan.skipped.sameDrive} already in that folder — nothing to do</li>}
            {plan.skipped.local > 0 && <li className="text-ink-muted">• {plan.skipped.local} on this computer — moving those to the cloud is coming in a later update</li>}
            {work === 0 && <li className="text-ink-muted">Nothing to move with these settings.</li>}
          </ul>
          {tooBig && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800">{plan.warnings.find((w) => w.startsWith("Not enough space"))}</p>}
          {plan.examples.length > 0 && (
            <div className="mt-3 border-t border-line pt-3 text-[12px] text-ink-muted">
              {plan.examples.slice(0, 3).map((e) => (
                <p key={e.from} className="truncate">
                  {e.from} → <span className="text-ink">{dest?.label}{e.to}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-ink-muted">
          {keepOriginal ? "Originals stay where they are." : "Each original goes to its drive's trash only after the copy is checked — recoverable for 30+ days."}
        </p>
        <div className="flex gap-2">
          <button className={buttonClass("ghost")} onClick={onClose}>
            Cancel
          </button>
          <button className={buttonClass("primary")} disabled={busy || !plan || !work || tooBig} onClick={start}>
            {busy ? "Starting…" : `${keepOriginal ? "Copy" : "Move"} ${work.toLocaleString()} ${work === 1 ? "file" : "files"}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
