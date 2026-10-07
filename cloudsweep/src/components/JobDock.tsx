"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { bytes } from "@/lib/format";

interface Job {
  id: string;
  type: string;
  status: string;
  account_id: string | null;
  progress: { done?: number; total?: number; message?: string; bytes?: number; errors?: number };
  error: string | null;
}

const TITLE: Record<string, string> = { scan: "Scanning", verify: "Verifying matches", analyse: "Analysing photos", transfer: "Consolidating", trash: "Cleaning up" };

/**
 * Drives running jobs one step at a time while the site is open, and shows live progress.
 * Pages announce new jobs with: window.dispatchEvent(new Event("cloudsweep:jobs")).
 */
export function JobDock() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [finished, setFinished] = useState<Job[]>([]);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/jobs").then((x) => (x.ok ? x.json() : { jobs: [] }));
    setJobs((r.jobs as Job[]).filter((j) => j.status === "running"));
  }, []);

  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("cloudsweep:jobs", on);
    return () => window.removeEventListener("cloudsweep:jobs", on);
  }, [load]);

  useEffect(() => {
    if (busy.current || !jobs.length) return;
    busy.current = true;
    (async () => {
      const job = jobs[0];
      const r = await fetch(`/api/jobs/${job.id}/step`, { method: "POST" }).then((x) => x.json()).catch(() => null);
      busy.current = false;
      const next: Job | null = r?.job ?? null;
      if (!next || next.status !== "running") {
        if (next) setFinished((f) => [next, ...f].slice(0, 3));
        router.refresh();
        window.dispatchEvent(new Event("cloudsweep:changed"));
        await load();
      } else {
        setJobs((js) => js.map((j) => (j.id === next.id ? next : j)));
        // Small pause keeps provider rate limits happy and the UI responsive.
        setTimeout(() => setJobs((js) => [...js]), 250);
      }
    })();
  }, [jobs, load, router]);

  if (!jobs.length && !finished.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(380px,calc(100vw-2rem))] space-y-2">
      {jobs.map((j) => (
        <div key={j.id} className="rounded-2xl border border-line bg-white p-4 shadow-lg shadow-black/5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-semibold">{TITLE[j.type] ?? j.type}</p>
            <button
              className="text-[12px] text-ink-muted hover:text-bad"
              onClick={async () => {
                await fetch(`/api/jobs/${j.id}`, { method: "DELETE" });
                load();
              }}
            >
              Cancel
            </button>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-ink-muted">
            {j.progress.message ?? "Working…"}
            {j.progress.bytes ? ` · ${bytes(j.progress.bytes)}` : ""}
          </p>
          {j.type === "scan" && <p className="mt-1 text-[12px] text-good">🔒 Metadata only — no files are downloaded</p>}
          {j.type === "verify" && <p className="mt-1 text-[12px] text-ink-muted">Reads only files that need a content check, then discards them</p>}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            {j.progress.total ? (
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, ((j.progress.done ?? 0) / j.progress.total) * 100)}%` }} />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
            )}
          </div>
        </div>
      ))}
      {finished.map((j) => (
        <div key={j.id} className={`flex items-start justify-between gap-3 rounded-2xl border p-3 text-[13px] ${j.status === "failed" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          <span>
            <b>{TITLE[j.type] ?? j.type}</b> {j.status === "failed" ? `failed: ${j.error}` : j.status === "cancelled" ? "cancelled" : `— ${j.progress.message ?? "done"}`}
          </span>
          <button onClick={() => setFinished((f) => f.filter((x) => x.id !== j.id))} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function announceJobs() {
  window.dispatchEvent(new Event("cloudsweep:jobs"));
}
