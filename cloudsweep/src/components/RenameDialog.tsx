"use client";

import { useEffect, useMemo, useState } from "react";
import { renameLocalFiles } from "@/lib/local-actions";
import { buildRenames, DATE_FORMATS, DEFAULT_OPTIONS, suggest, TOKENS, type DateFormat, type RenameFile, type RenameOptions } from "@/lib/rename";
import { announceJobs, UndoRenames } from "./JobDock";
import { buttonClass } from "./ui";

export interface SelectionSpec {
  ids: string[];
  folders: Array<{ accountId: string; path: string }>;
}

type Source = RenameFile & { accountId: string; accountLabel: string; provider: string; path: string };

export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`my-8 w-full rounded-2xl bg-white p-5 sm:p-6 ${wide ? "max-w-3xl" : "max-w-xl"}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-[14px] text-ink-muted hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Bulk rename: pick a suggestion (or build your own pattern), check the live preview, apply.
 * Everything is undoable as one batch.
 */
export function RenameDialog({ selection, onClose, onDone }: { selection: SelectionSpec; onClose: () => void; onDone: () => void }) {
  const [data, setData] = useState<{ files: Source[]; siblings: Record<string, string[]>; placesPending: number } | null>(null);
  const [error, setError] = useState("");
  const [opts, setOpts] = useState<RenameOptions>(DEFAULT_OPTIONS);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ count: number; jobId: string | null; batch: string | null; localFailed: number; problem?: string } | null>(null);

  const load = async () => {
    setError("");
    const r = await fetch("/api/selection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selection) }).then((x) => x.json());
    if (r.error) return setError(r.error);
    setData(r);
    return r as { files: Source[] };
  };

  useEffect(() => {
    load().then((r) => {
      const first = r && suggest(r.files)[0];
      if (first) {
        setPicked(first.id);
        setOpts((o) => ({ ...o, ...first.options }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestions = useMemo(() => (data ? suggest(data.files) : []), [data]);
  const rows = useMemo(() => (data ? buildRenames(data.files, opts, data.siblings) : []), [data, opts]);
  const changed = rows.filter((r) => r.changed);
  const notes = rows.filter((r) => r.note);
  const set = (patch: Partial<RenameOptions>) => {
    setPicked(null);
    setOpts((o) => ({ ...o, ...patch }));
  };

  async function apply() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ renames: changed.map((x) => ({ id: x.id, newName: x.to })) }),
    }).then((x) => x.json());
    if (r.error) {
      setBusy(false);
      return setError(r.error);
    }
    const local = await renameLocalFiles(r.local ?? [], { batch: r.batch });
    if (r.jobId) announceJobs();
    setBusy(false);
    setResult({ count: r.count, jobId: r.jobId, batch: r.batch, localFailed: local.failed, problem: local.problems[0] });
    onDone();
  }

  if (result)
    return (
      <Dialog title="Renaming started" onClose={onClose}>
        <p className="text-[15px] text-ink-soft">
          {result.jobId ? (
            <>
              Renaming <b>{result.count.toLocaleString()}</b> {result.count === 1 ? "file" : "files"}. Progress shows in the task panel — you can keep working. When it finishes, the panel has an{" "}
              <b>Undo</b> button that puts every original name back.
            </>
          ) : (
            <>
              Renamed <b>{(result.count - result.localFailed).toLocaleString()}</b> {result.count === 1 ? "file" : "files"} on this computer.
            </>
          )}
        </p>
        {result.problem && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-[14px] text-amber-800">{result.problem}</p>}
        <div className="mt-6 flex items-center justify-between gap-3">
          <span className="text-[14px]">{!result.jobId && result.batch && <UndoRenames batch={result.batch} onDone={onClose} />}</span>
          <button className={buttonClass("primary")} onClick={onClose}>
            Done
          </button>
        </div>
      </Dialog>
    );

  return (
    <Dialog title="Rename files" onClose={onClose} wide>
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">{error}</p>}
      {!data ? (
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
      ) : !data.files.length ? (
        <p className="text-[15px] text-ink-muted">There are no files in what you selected.</p>
      ) : (
        <>
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Suggested for these {data.files.length.toLocaleString()} files</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => {
              const example = buildRenames(data.files.slice(0, 1), { ...opts, ...s.options }, data.siblings)[0];
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setPicked(s.id);
                    setOpts((o) => ({ ...o, ...s.options }));
                  }}
                  className={`rounded-xl border p-3 text-left transition ${picked === s.id ? "border-ink bg-slate-50 ring-1 ring-ink" : "border-line hover:border-ink/30"}`}
                >
                  <p className="text-[14px] font-semibold">{s.title}</p>
                  <p className="text-[12px] text-ink-muted">{s.why}</p>
                  <p className="mt-1.5 truncate font-mono text-[12px] text-ink-soft">{example?.to}</p>
                </button>
              );
            })}
          </div>

          <details className="mt-4 rounded-xl border border-line p-3" open={picked === null}>
            <summary className="cursor-pointer text-[14px] font-medium">Customise</summary>
            <div className="mt-3 flex rounded-xl border border-line p-1 text-[13px]">
              {(["pattern", "replace"] as const).map((m) => (
                <button key={m} onClick={() => set({ mode: m })} className={`flex-1 rounded-lg px-3 py-1.5 ${opts.mode === m ? "bg-ink text-white" : "text-ink-soft"}`}>
                  {m === "pattern" ? "Build a name" : "Find & replace"}
                </button>
              ))}
            </div>
            {opts.mode === "pattern" ? (
              <div className="mt-3">
                <input
                  value={opts.pattern}
                  onChange={(e) => set({ pattern: e.target.value })}
                  className="w-full rounded-xl border border-line px-3 py-2 font-mono text-[14px] outline-none focus:border-ink"
                  aria-label="Name pattern"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TOKENS.map((t) => (
                    <button key={t.token} title={t.hint} onClick={() => set({ pattern: `${opts.pattern.trim()} ${t.token}`.trim() })} className="rounded-full border border-line px-2.5 py-1 text-[12px] hover:border-ink/40">
                      + {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input value={opts.find} onChange={(e) => set({ find: e.target.value })} placeholder="Find" className="rounded-xl border border-line px-3 py-2 text-[14px] outline-none focus:border-ink" />
                <input value={opts.replace} onChange={(e) => set({ replace: e.target.value })} placeholder="Replace with (leave empty to remove)" className="rounded-xl border border-line px-3 py-2 text-[14px] outline-none focus:border-ink" />
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={opts.matchCase} onChange={(e) => set({ matchCase: e.target.checked })} /> Match upper/lower case
                </label>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
              <label className="flex items-center gap-2">
                Dates
                <select value={opts.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as DateFormat })} className="rounded-lg border border-line px-2 py-1">
                  {DATE_FORMATS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label} — {d.example}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={opts.tidy} onChange={(e) => set({ tidy: e.target.checked })} /> Tidy up (underscores, “Copy of”, (1))
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={opts.lowerExt} onChange={(e) => set({ lowerExt: e.target.checked })} /> .JPG → .jpg
              </label>
            </div>
          </details>

          {data.placesPending > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-soft px-4 py-2.5 text-[13px] text-ink-soft">
              Still looking up place names for {data.placesPending} photo{data.placesPending === 1 ? "" : "s"}.
              <button className="font-semibold text-brand underline" onClick={() => load()}>
                Refresh
              </button>
            </p>
          )}

          <div className="mt-4 flex items-baseline justify-between gap-3">
            <p className="text-[14px]">
              <b>{changed.length.toLocaleString()}</b> will be renamed
              {rows.length - changed.length > 0 && <span className="text-ink-muted"> · {(rows.length - changed.length).toLocaleString()} already match</span>}
              {notes.length > 0 && <span className="text-warn"> · {notes.length} adjusted</span>}
            </p>
            <p className="text-[12px] text-ink-muted">Extensions are always kept</p>
          </div>
          <div className="mt-2 max-h-[38vh] overflow-y-auto rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-line">
                {rows.slice(0, 300).map((r) => (
                  <tr key={r.id} className={r.changed ? "" : "text-ink-muted"}>
                    <td className="w-1/2 max-w-0 truncate px-3 py-2" title={r.from}>
                      {r.from}
                    </td>
                    <td className="px-1 text-ink-muted" aria-hidden>
                      →
                    </td>
                    <td className="w-1/2 max-w-0 px-3 py-2" title={r.to}>
                      <span className={`block truncate ${r.changed ? "font-medium" : ""}`}>{r.changed ? r.to : "No change"}</span>
                      {r.note && <span className="block truncate text-[11px] text-warn">{r.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 300 && <p className="px-3 py-2 text-[12px] text-ink-muted">…and {(rows.length - 300).toLocaleString()} more, following the same pattern.</p>}
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-ink-muted">Nothing is overwritten. You can undo the whole batch afterwards.</p>
            <div className="flex gap-2">
              <button className={buttonClass("ghost")} onClick={onClose}>
                Cancel
              </button>
              <button className={buttonClass("primary")} disabled={busy || !changed.length} onClick={apply}>
                {busy ? "Starting…" : `Rename ${changed.length.toLocaleString()} ${changed.length === 1 ? "file" : "files"}`}
              </button>
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}
