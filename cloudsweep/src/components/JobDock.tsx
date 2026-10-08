"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { bytes } from "@/lib/format";
import { renameLocalFiles } from "@/lib/local-actions";
import { refreshDrives } from "./DriveMeter";
import type { LocalTask } from "./LocalScanManager";

interface Job {
  id: string;
  type: string;
  status: string;
  account_id: string | null;
  account_label?: string | null;
  progress: { done?: number; total?: number; message?: string; bytes?: number; errors?: number };
  error: string | null;
  params?: { kind?: string; batch?: string; undoOf?: string; reason?: string };
}

const TITLE: Record<string, string> = { scan: "Scanning", verify: "Verifying matches", analyse: "Analysing photos", transfer: "Consolidating", trash: "Cleaning up", rename: "Renaming files" };
const MINIMISED_KEY = "cloudsweep:jobdock-minimised";

const title = (j: Job) => {
  if (j.type === "transfer" && j.params?.kind === "move") return `Moving files to ${j.account_label ?? "another drive"}`;
  if (j.type === "rename") return j.params?.undoOf ? "Undoing renames" : "Renaming files";
  if (j.type === "trash" && j.params?.reason === "deleted") return "Deleting files";
  return `${TITLE[j.type] ?? j.type}${j.account_label ? ` ${j.account_label}` : ""}`;
};
const pct = (j: Job) => (j.progress.total ? Math.min(100, Math.round(((j.progress.done ?? 0) / j.progress.total) * 100)) : null);

/**
 * Drives running jobs one step at a time while the site is open, and shows live progress.
 * Minimising only hides the panel; jobs keep running. Pages announce new jobs with
 * window.dispatchEvent(new Event("cloudsweep:jobs")).
 */
export function JobDock() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [finished, setFinished] = useState<Job[]>([]);
  // Starts as a small pill; it only opens when you click it, and remembers your choice.
  const [minimised, setMinimised] = useState(true);
  const [local, setLocal] = useState<LocalTask[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    try {
      setMinimised(localStorage.getItem(MINIMISED_KEY) !== "0");
    } catch {
      /* storage unavailable: stay minimised */
    }
  }, []);
  const toggle = (value: boolean) => {
    setMinimised(value);
    try {
      localStorage.setItem(MINIMISED_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const load = useCallback(async () => {
    const r = await fetch("/api/jobs").then((x) => (x.ok ? x.json() : { jobs: [] }));
    setJobs((r.jobs as Job[]).filter((j) => j.status === "running"));
  }, []);

  useEffect(() => {
    const onLocal = (e: Event) => setLocal((e as CustomEvent<LocalTask[]>).detail);
    window.addEventListener("cloudsweep:local-progress", onLocal);
    return () => window.removeEventListener("cloudsweep:local-progress", onLocal);
  }, []);

  useEffect(() => {
    load();
    // New tasks never re-open a minimised panel; the pill's count shows them instead.
    window.addEventListener("cloudsweep:jobs", load);
    return () => window.removeEventListener("cloudsweep:jobs", load);
  }, [load]);

  useEffect(() => {
    if (busy.current || !jobs.length) return;
    busy.current = true;
    (async () => {
      const job = jobs[0];
      const r = await fetch(`/api/jobs/${job.id}/step`, { method: "POST" }).then((x) => x.json()).catch(() => null);
      busy.current = false;
      const next: Job | null = r?.job ? { ...r.job, account_label: job.account_label } : null;
      if (!next || next.status !== "running") {
        if (next) setFinished((f) => [next, ...f].slice(0, 3));
        router.refresh();
        window.dispatchEvent(new Event("cloudsweep:changed"));
        refreshDrives();
        await load();
      } else {
        setJobs((js) => js.map((j) => (j.id === next.id ? next : j)));
        // Small pause keeps provider rate limits happy and the UI responsive.
        setTimeout(() => setJobs((js) => [...js]), 250);
      }
    })();
  }, [jobs, load, router]);

  const localRunning = local.filter((t) => t.phase === "listing" || t.phase === "fingerprinting");
  const localDone = local.filter((t) => !localRunning.includes(t));
  const running = jobs.length + localRunning.length;
  if (!running && !finished.length && !localDone.length) return null;

  if (minimised)
    return (
      <button
        onClick={() => toggle(false)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-full border border-line bg-white py-2 pl-3 pr-4 text-[13px] font-medium shadow-lg shadow-black/5 hover:bg-slate-50"
        aria-label="Show background tasks"
      >
        {running ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
            {running} task{running === 1 ? "" : "s"} running
          </>
        ) : (
          <>
            <span className={`h-2.5 w-2.5 rounded-full ${finished.some((f) => f.status === "failed") || localDone.some((t) => t.phase === "failed") ? "bg-bad" : "bg-good"}`} aria-hidden />
            {finished.length + localDone.length} finished
          </>
        )}
        <span className="text-ink-muted" aria-hidden>▴</span>
      </button>
    );

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-white shadow-lg shadow-black/10">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="text-[13px] font-semibold">
          {running ? `${running} task${running === 1 ? "" : "s"} running` : "Background tasks"}
          {(jobs.some((j) => j.type === "scan") || localRunning.length > 0) && <span className="ml-2 font-normal text-good">🔒 metadata only</span>}
        </p>
        <button onClick={() => toggle(true)} className="rounded-lg px-2 py-0.5 text-[13px] text-ink-muted hover:bg-slate-100 hover:text-ink" aria-label="Minimise background tasks" title="Minimise (tasks keep running)">
          ▾ Minimise
        </button>
      </div>
      <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto">
        {jobs.map((j) => (
          <li key={j.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-medium">{title(j)}</p>
              <button
                className="shrink-0 text-[12px] text-ink-muted hover:text-bad"
                onClick={async () => {
                  await fetch(`/api/jobs/${j.id}`, { method: "DELETE" });
                  load();
                }}
              >
                Cancel
              </button>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-ink-muted">
              {j.progress.message ?? "Working…"}
              {j.progress.bytes ? ` · ${bytes(j.progress.bytes)}` : ""}
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
              {pct(j) !== null ? <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct(j)}%` }} /> : <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />}
            </div>
          </li>
        ))}
        {localRunning.map((t) => (
          <li key={t.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-medium">Scanning {t.label}</p>
              <button className="shrink-0 text-[12px] text-ink-muted hover:text-bad" onClick={() => window.dispatchEvent(new CustomEvent("cloudsweep:local-cancel", { detail: t.id }))}>
                Cancel
              </button>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-ink-muted">{t.message}</p>
            <p className="mt-0.5 text-[11px] text-warn">Runs in this tab — keep it open until finished</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
              {t.total ? <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, ((t.done ?? 0) / t.total) * 100)}%` }} /> : <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />}
            </div>
          </li>
        ))}
        {localDone.map((t) => (
          <li key={t.id} className={`flex items-start justify-between gap-3 px-4 py-2.5 text-[12px] ${t.phase === "failed" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
            <span>
              <b>Scanning {t.label}</b> {t.phase === "failed" ? `failed: ${t.error}` : `— ${t.message}`}
            </span>
            <button onClick={() => window.dispatchEvent(new CustomEvent("cloudsweep:local-dismiss", { detail: t.id }))} aria-label="Dismiss">
              ✕
            </button>
          </li>
        ))}
        {finished.map((j) => (
          <li key={j.id} className={`flex items-start justify-between gap-3 px-4 py-2.5 text-[12px] ${j.status === "failed" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
            <span>
              <b>{title(j)}</b> {j.status === "failed" ? `failed: ${j.error}` : j.status === "cancelled" ? "cancelled" : `— ${j.progress.message ?? "done"}`}
              {j.type === "rename" && j.status === "done" && j.params?.batch && <UndoRenames batch={j.params.batch} onDone={() => setFinished((f) => f.filter((x) => x.id !== j.id))} />}
            </span>
            <button onClick={() => setFinished((f) => f.filter((x) => x.id !== j.id))} aria-label="Dismiss">
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Puts a whole rename batch back, cloud and local files alike. */
export function UndoRenames({ batch, onDone }: { batch: string; onDone?: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [msg, setMsg] = useState("");
  return (
    <span className="ml-1 inline-flex items-center gap-2">
      <button
        disabled={state === "busy"}
        className="font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-50"
        onClick={async () => {
          setState("busy");
          const r = await fetch("/api/rename/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch }) }).then((x) => x.json());
          if (r.error) {
            setState("error");
            setMsg(r.error);
            return;
          }
          const local = await renameLocalFiles(r.local ?? [], { undoOf: batch });
          if (local.failed) {
            setState("error");
            setMsg(local.problems[0] ?? "Some files couldn't be renamed back.");
          } else onDone?.();
          window.dispatchEvent(new Event("cloudsweep:jobs"));
          window.dispatchEvent(new Event("cloudsweep:changed"));
        }}
      >
        {state === "busy" ? "Undoing…" : "Undo"}
      </button>
      {state === "error" && <span className="text-red-700">{msg}</span>}
    </span>
  );
}

export function announceJobs() {
  window.dispatchEvent(new Event("cloudsweep:jobs"));
}
