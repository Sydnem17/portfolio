"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReviewMode } from "./ReviewMode";
import type { DuplicateGroup, FolderOverlap } from "@/lib/dedupe";
import { bytes, date, KIND_LABEL, accountColour } from "@/lib/format";
import { announceJobs } from "./JobDock";
import { Badge, buttonClass, Card, Empty, PageHeader, Stat, Thumb } from "./ui";

interface Report {
  summary: { groups: number; wasteBytes: number; exact: { groups: number; bytes: number }; likely: { groups: number; bytes: number }; similar: { groups: number; bytes: number }; crossAccount: number };
  filteredCount: number;
  filteredWaste: number;
  groups: DuplicateGroup[];
  folders: FolderOverlap[];
}

const CONF: Record<string, { label: string; tone: "bad" | "warn" | "violet"; note: string }> = {
  exact: { label: "Identical", tone: "bad", note: "Byte-for-byte identical — confirmed by matching checksums." },
  likely: { label: "Needs check", tone: "warn", note: "Same name and size, but these drives don't share a checksum type. Run “Verify likely matches” to confirm before removing anything." },
  similar: { label: "Look-alike", tone: "violet", note: "Visually the same photo at different sizes (resized, re-saved or sent through a messaging app). The highest-resolution copy is suggested." },
};

export function DuplicatesView({ accounts }: { accounts: Array<{ id: string; label: string; provider: string }> }) {
  const [report, setReport] = useState<Report | null>(null);
  const [filters, setFilters] = useState({ confidence: "", kind: "", account: "", minSize: "", q: "" });
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(40);
  const [confirming, setConfirming] = useState(false);
  const [reviewing, setReviewing] = useState<number | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
    setReport(await fetch(`/api/duplicates?${p}`).then((r) => r.json()));
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const on = () => {
      setSelected(new Set());
      load();
    };
    window.addEventListener("cloudsweep:changed", on);
    return () => window.removeEventListener("cloudsweep:changed", on);
  }, [load]);

  const sizeOf = useMemo(() => {
    const m = new Map<string, number>();
    report?.groups.forEach((g) => g.members.forEach((x) => m.set(x.id, x.size)));
    return m;
  }, [report]);
  const selectedBytes = [...selected].reduce((s, id) => s + (sizeOf.get(id) ?? 0), 0);

  const keeperOf = (g: DuplicateGroup) => keep[g.key] ?? g.keeperId;
  const toggle = (id: string, on?: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      (on ?? !n.has(id)) ? n.add(id) : n.delete(id);
      return n;
    });
  const selectExtras = (g: DuplicateGroup) => g.members.forEach((m) => toggle(m.id, m.id !== keeperOf(g)));
  /** Smart select: only byte-identical copies, never the copy being kept. Look-alikes stay a manual choice. */
  const smartSelect = () => {
    const n = new Set(selected);
    report?.groups.filter((g) => g.confidence === "exact").forEach((g) => g.members.forEach((m) => m.id !== keeperOf(g) && n.add(m.id)));
    setSelected(n);
  };

  async function trash() {
    await fetch("/api/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: [...selected], reason: "duplicate" }) });
    setConfirming(false);
    announceJobs();
  }

  async function verify() {
    await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "verify" }) });
    announceJobs();
  }

  if (!report) return <PageHeader title="Duplicates" intro="Comparing every file across your drives…" />;
  if (!accounts.length) return (<><PageHeader title="Duplicates" /><Empty title="No drives connected" body="Connect a storage account or load the demo library to find duplicates." /></>);

  const s = report.summary;
  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Duplicates"
        intro="Every copy of the same file, across every drive — with the space it wastes and a suggested copy to keep. Removed files go to each provider's own trash, so they stay recoverable."
        actions={
          <>
            {s.likely.groups > 0 && (
              <button className={buttonClass("ghost")} onClick={verify}>
                Verify {s.likely.groups} likely match{s.likely.groups === 1 ? "" : "es"}
              </button>
            )}
            <button className={buttonClass("ghost")} onClick={() => setReviewing(0)} disabled={!report.groups.length}>
              Review one by one
            </button>
            <button className={buttonClass("primary")} onClick={smartSelect} disabled={!s.exact.groups} title="Ticks every identical extra copy. Originals and look-alikes are never ticked.">
              ✦ Smart select
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Reclaimable space" value={bytes(s.wasteBytes)} tone="bad" hint={`${s.crossAccount} sets span more than one drive`} />
        <Stat label="Identical copies" value={s.exact.groups.toLocaleString()} hint={bytes(s.exact.bytes)} />
        <Stat label="Need a quick check" value={s.likely.groups.toLocaleString()} hint={bytes(s.likely.bytes)} />
        <Stat label="Look-alike photos" value={s.similar.groups.toLocaleString()} hint={bytes(s.similar.bytes)} />
      </div>

      {report.folders.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-[15px] font-semibold">Mirrored folders</h2>
          <p className="mt-1 text-[13px] text-ink-muted">These folders are already (almost) entirely copied somewhere else — usually an old backup or a manual copy.</p>
          <ul className="mt-4 divide-y divide-line">
            {report.folders.slice(0, 8).map((f, i) => (
              <li key={i} className="flex flex-col gap-1 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <b className="font-medium">{f.folder.accountLabel}</b> <span className="text-ink-muted">{f.folder.path}</span>
                  <span className="mx-2 text-ink-muted">→ {Math.round(f.overlap * 100)}% inside</span>
                  <b className="font-medium">{f.container.accountLabel}</b> <span className="text-ink-muted">{f.container.path}</span>
                </span>
                <span className="shrink-0 font-semibold text-bad">{bytes(f.redundantBytes)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="sticky top-[57px] z-10 -mx-4 mt-6 border-b border-line bg-[#F7F8FA]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border lg:top-0">
        <div className="flex flex-wrap gap-2">
          <select value={filters.confidence} onChange={set("confidence")} className="rounded-xl border border-line bg-white px-3 py-2 text-[13px]">
            <option value="">All matches</option>
            <option value="exact">Identical</option>
            <option value="likely">Needs check</option>
            <option value="similar">Look-alike photos</option>
          </select>
          <select value={filters.kind} onChange={set("kind")} className="rounded-xl border border-line bg-white px-3 py-2 text-[13px]">
            <option value="">All types</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={filters.account} onChange={set("account")} className="rounded-xl border border-line bg-white px-3 py-2 text-[13px]">
            <option value="">All drives</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <select value={filters.minSize} onChange={set("minSize")} className="rounded-xl border border-line bg-white px-3 py-2 text-[13px]">
            <option value="">Any size</option>
            <option value={String(1024 ** 2)}>Over 1 MB</option>
            <option value={String(100 * 1024 ** 2)}>Over 100 MB</option>
            <option value={String(1024 ** 3)}>Over 1 GB</option>
          </select>
          <input value={filters.q} onChange={set("q")} placeholder="Search name or folder" className="min-w-[180px] flex-1 rounded-xl border border-line bg-white px-3 py-2 text-[13px]" />
        </div>
        <p className="mt-2 text-[12px] text-ink-muted">
          {report.filteredCount.toLocaleString()} sets · {bytes(report.filteredWaste)} reclaimable in this view
        </p>
      </div>

      {report.groups.length === 0 ? (
        <div className="mt-6">
          <Empty title="Nothing to clean up here" body="No duplicates match these filters. Try widening them, or rescan your drives after adding files." />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {report.groups.slice(0, shown).map((g) => {
            const c = CONF[g.confidence];
            const keeper = keeperOf(g);
            return (
              <Card key={g.key} pad={false}>
                <div className="flex items-start gap-4 p-5">
                  {g.kind === "image" ? <Thumb id={g.members[0].id} alt="" className="h-16 w-16 shrink-0 rounded-xl" /> : <FileIcon kind={g.kind} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[15px] font-semibold">{g.name}</h3>
                      <Badge tone={c.tone}>{c.label}</Badge>
                      {g.crossAccount && <Badge>Across drives</Badge>}
                    </div>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      {g.members.length} copies · {KIND_LABEL[g.kind] ?? g.kind} · {g.confidence === "similar" ? "sizes vary" : `${bytes(g.members[0].size)} each`}
                    </p>
                    <p className="mt-1 text-[12px] text-ink-muted">{c.note}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[18px] font-semibold text-bad">{bytes(g.wasteBytes)}</p>
                    <p className="text-[12px] text-ink-muted">reclaimable</p>
                  </div>
                </div>
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full min-w-[640px] text-[13px]">
                    <thead className="bg-slate-50 text-left text-[12px] text-ink-muted">
                      <tr>
                        <th className="w-16 px-5 py-2 font-medium">Keep</th>
                        <th className="w-16 px-2 py-2 font-medium">Remove</th>
                        <th className="px-2 py-2 font-medium">Drive</th>
                        <th className="px-2 py-2 font-medium">Location</th>
                        <th className="px-2 py-2 text-right font-medium">Size</th>
                        <th className="px-5 py-2 text-right font-medium">Modified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {g.members.map((m) => (
                        <tr key={m.id} className={m.id === keeper ? "bg-emerald-50/50" : ""}>
                          <td className="px-5 py-2.5">
                            <input
                              type="radio"
                              name={g.key}
                              checked={m.id === keeper}
                              onChange={() => {
                                setKeep((k) => ({ ...k, [g.key]: m.id }));
                                toggle(m.id, false);
                              }}
                              aria-label="Keep this copy"
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <input
                              type="checkbox"
                              disabled={m.id === keeper || g.confidence === "likely"}
                              checked={selected.has(m.id)}
                              onChange={() => toggle(m.id)}
                              aria-label="Move this copy to trash"
                            />
                          </td>
                          <td className="whitespace-nowrap px-2 py-2.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ background: accountColour(m.provider, m.accountLabel) }} />
                              {m.accountLabel}
                            </span>
                          </td>
                          <td className="max-w-[360px] truncate px-2 py-2.5 text-ink-soft" title={m.path}>
                            {m.webUrl ? (
                              <a href={m.webUrl} target="_blank" rel="noreferrer" className="hover:underline">{m.path}</a>
                            ) : (
                              m.path
                            )}
                            {m.width && g.confidence === "similar" ? <span className="ml-2 text-ink-muted">{m.width}×{m.height}</span> : null}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right">{bytes(m.size)}</td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-muted">{date(m.modifiedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
                  <p className="text-[12px] text-ink-muted">{keeper === g.keeperId ? `Suggested keep: ${g.keeperReasons.join(", ")}` : "Your choice of copy to keep"}</p>
                  {g.confidence !== "likely" && (
                    <button className={buttonClass("ghost", "sm")} onClick={() => selectExtras(g)}>
                      Keep one, select the rest
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
          {report.groups.length > shown && (
            <button className={`${buttonClass("ghost")} w-full`} onClick={() => setShown((n) => n + 40)}>
              Show more ({report.groups.length - shown} remaining)
            </button>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl bg-ink px-5 py-3.5 text-white shadow-2xl lg:left-[calc(50%+8rem)]">
          <p className="text-[14px]">
            <b>{selected.size.toLocaleString()}</b> files selected · frees <b>{bytes(selectedBytes)}</b>
          </p>
          <div className="flex gap-2">
            <button className="rounded-xl px-3 py-2 text-[13px] text-white/70 hover:text-white" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button className="rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-ink" onClick={() => setConfirming(true)}>
              Move to trash
            </button>
          </div>
        </div>
      )}

      {reviewing !== null && report.groups[reviewing] && (
        <ReviewMode
          groups={report.groups}
          index={reviewing}
          keeperOf={keeperOf}
          selected={selected}
          onIndex={setReviewing}
          onKeep={(g, id) => {
            setKeep((k) => ({ ...k, [g.key]: id }));
            toggle(id, false);
          }}
          onToggle={toggle}
          onClose={() => setReviewing(null)}
        />
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="text-[18px] font-semibold">Move {selected.size.toLocaleString()} files to trash?</h2>
            <ul className="mt-3 space-y-1.5 text-[14px] text-ink-soft">
              <li>• Frees about <b>{bytes(selectedBytes)}</b> once each provider empties its trash.</li>
              <li>• One copy of every file stays where you chose to keep it.</li>
              <li>• Files go to the cross-cloud Staging bin first — restore any of them in one click, or from the provider’s own trash for at least 30 days.</li>
            </ul>
            <div className="mt-6 flex justify-end gap-2">
              <button className={buttonClass("ghost")} onClick={() => setConfirming(false)}>Cancel</button>
              <button className={buttonClass("danger")} onClick={trash}>Move to trash</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FileIcon({ kind }: { kind: string }) {
  const label = { video: "VID", document: "DOC", archive: "ZIP", audio: "AUD" }[kind] ?? "FILE";
  return <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-slate-100 text-[12px] font-semibold text-ink-muted">{label}</div>;
}
