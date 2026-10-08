"use client";

import { useEffect, useState } from "react";
import { accountColour, bytes } from "@/lib/format";

export interface Drive {
  id: string;
  label: string;
  provider: string;
  /** Null for folders on this computer (no fixed quota). */
  total: number | null;
  used: number;
}

/** Tells every meter on the page to refresh, e.g. after a move or clean-up finishes. */
export const refreshDrives = () => window.dispatchEvent(new Event("cloudsweep:drives"));

export function useDrives(): Drive[] | null {
  const [drives, setDrives] = useState<Drive[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/drives")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => live && d && setDrives(d.drives))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60000);
    window.addEventListener("cloudsweep:drives", load);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener("cloudsweep:drives", load);
    };
  }, []);
  return drives;
}

export const freeOf = (d: Drive) => (d.total == null ? null : Math.max(0, d.total - d.used));

export function DriveMeter({ drive, compact = false }: { drive: Drive; compact?: boolean }) {
  const pct = drive.total ? Math.min(100, (drive.used / drive.total) * 100) : null;
  const tone = pct == null ? "#94A3B8" : pct >= 90 ? "#DC2626" : pct >= 75 ? "#D97706" : "#0F172A";
  const free = freeOf(drive);
  return (
    <div className="min-w-0" title={drive.total ? `${bytes(drive.used)} of ${bytes(drive.total)} used` : `${bytes(drive.used)} in this folder`}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accountColour(drive.provider, drive.label) }} />
        <span className={`min-w-0 flex-1 truncate ${compact ? "text-[12px]" : "text-[14px] font-medium"}`}>{drive.label}</span>
        <span className={`shrink-0 tabular-nums ${compact ? "text-[11px]" : "text-[13px]"}`} style={{ color: pct != null && pct >= 90 ? tone : undefined }}>
          {free == null ? bytes(drive.used) : `${bytes(free)} free`}
        </span>
      </div>
      {pct != null && (
        <div className={`mt-1 overflow-hidden rounded-full bg-slate-100 ${compact ? "ml-4 h-1" : "ml-4 h-1.5"}`} role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${drive.label} ${Math.round(pct)}% full`}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: tone }} />
        </div>
      )}
    </div>
  );
}

/** The sidebar list: every drive's free space, on every page. */
export function DriveMeters() {
  const drives = useDrives();
  if (!drives?.length) return null;
  return (
    <section className="mt-8" aria-label="Storage space">
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Space left</p>
      <div className="space-y-2.5 px-3">
        {drives.map((d) => (
          <DriveMeter key={d.id} drive={d} compact />
        ))}
      </div>
    </section>
  );
}
