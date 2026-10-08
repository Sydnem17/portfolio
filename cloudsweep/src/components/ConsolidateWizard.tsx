"use client";

import { useState } from "react";
import { bytes, KIND_LABEL, accountColour } from "@/lib/format";
import { announceJobs } from "./JobDock";
import { Badge, buttonClass, Card, PageHeader } from "./ui";

interface Account { id: string; label: string; provider: string; free: number | null; isPrimary: boolean }
interface Plan {
  counts: Record<"copy" | "already-there" | "duplicate-in-batch" | "unsupported", number>;
  bytesToTransfer: number;
  bytesFreedAtSource: number;
  targetFree: number | null;
  warnings: string[];
  totalRows: number;
  rows: Array<{ file: { id: string; name: string; path: string; size: number; accountLabel: string }; action: string; targetPath: string }>;
}

const ACTION_LABEL: Record<string, [string, "brand" | "good" | "grey" | "warn"]> = {
  copy: ["Transfer", "brand"],
  "already-there": ["Already in target", "good"],
  "duplicate-in-batch": ["Duplicate — skip", "grey"],
  unsupported: ["Skipped", "warn"],
};

export function ConsolidateWizard({ accounts }: { accounts: Account[] }) {
  const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
  const [step, setStep] = useState(1);
  const [sources, setSources] = useState<string[]>(accounts.filter((a) => a.id !== primary.id).map((a) => a.id));
  const [target, setTarget] = useState(primary.id);
  const [folder, setFolder] = useState("/CloudSweep");
  const [mode, setMode] = useState<"copy" | "move">("move");
  const [kinds, setKinds] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("");
  const [keepStructure, setKeepStructure] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  const body = () => JSON.stringify({ sourceAccountIds: sources.filter((s) => s !== target), targetAccountId: target, targetFolder: folder, mode, kinds, pathPrefix: prefix || undefined, keepStructure, skipDuplicates: true });

  async function preview() {
    setBusy(true);
    const r = await fetch("/api/consolidate/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: body() });
    setPlan(r.ok ? await r.json() : null);
    setBusy(false);
    setStep(3);
  }

  async function start() {
    setBusy(true);
    await fetch("/api/consolidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: body() });
    announceJobs();
    setStarted(true);
    setBusy(false);
  }

  const steps = ["Choose sources", "Choose destination", "Review & run"];
  const tgt = accounts.find((a) => a.id === target)!;

  return (
    <>
      <PageHeader title="Consolidate" intro="Bring files from several clouds into one home. Duplicates are skipped automatically, every copy is checksum-verified, and originals only move to the Staging bin after a verified copy exists." />

      <ol className="mb-6 grid grid-cols-3 gap-2">
        {steps.map((s, i) => (
          <li key={s}>
            <button onClick={() => i + 1 < step && setStep(i + 1)} className="w-full text-left">
              <div className={`h-1 rounded-full ${i + 1 <= step ? "bg-ink" : "bg-line"}`} />
              <p className={`mt-2 text-[13px] ${i + 1 === step ? "font-semibold text-ink" : "text-ink-muted"}`}>
                {i + 1}. {s}
              </p>
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <h2 className="text-[17px] font-semibold">Where should files come from?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {accounts.map((a) => (
              <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${sources.includes(a.id) ? "border-ink bg-slate-50" : "border-line"}`}>
                <input type="checkbox" checked={sources.includes(a.id)} onChange={(e) => setSources((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: accountColour(a.provider, a.label) }} />
                <span className="text-[14px] font-medium">{a.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[13px] font-medium">Only these file types (optional)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <button key={k} onClick={() => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))} className={`rounded-full border px-3 py-1.5 text-[13px] ${kinds.includes(k) ? "border-ink bg-ink text-white" : "border-line"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-[13px] font-medium">Only this folder (optional)</span>
              <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. /Pictures/Camera Roll" className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-[14px]" />
            </label>
          </div>
          <div className="mt-6 flex justify-end">
            <button className={buttonClass()} disabled={!sources.length} onClick={() => setStep(2)}>Next: destination →</button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <h2 className="text-[17px] font-semibold">Where should everything live?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {accounts.map((a) => (
              <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${target === a.id ? "border-ink bg-slate-50" : "border-line"}`}>
                <input type="radio" name="target" checked={target === a.id} onChange={() => setTarget(a.id)} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: accountColour(a.provider, a.label) }} />
                <span className="flex-1 text-[14px] font-medium">{a.label}</span>
                <span className="text-[12px] text-ink-muted">{a.free != null ? `${bytes(a.free)} free` : "pooled"}</span>
              </label>
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-medium">Destination folder</span>
              <input value={folder} onChange={(e) => setFolder(e.target.value)} className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-[14px]" />
              <label className="mt-2 flex items-center gap-2 text-[13px] text-ink-soft">
                <input type="checkbox" checked={keepStructure} onChange={(e) => setKeepStructure(e.target.checked)} />
                Keep original folders (…/{folder.replace(/^\//, "")}/&lt;drive name&gt;/&lt;original path&gt;)
              </label>
            </label>
            <div>
              <span className="text-[13px] font-medium">Then…</span>
              <div className="mt-2 space-y-2">
                {([
                  ["move", "Move", "Copy, verify, then send originals to the Staging bin. Frees space at the source."],
                  ["copy", "Copy only", "Leave originals where they are. Useful for a backup."],
                ] as const).map(([v, t, d]) => (
                  <label key={v} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${mode === v ? "border-ink bg-slate-50" : "border-line"}`}>
                    <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} className="mt-1" />
                    <span>
                      <span className="block text-[14px] font-medium">{t}</span>
                      <span className="block text-[12px] text-ink-muted">{d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-between">
            <button className={buttonClass("ghost")} onClick={() => setStep(1)}>← Back</button>
            <button className={buttonClass()} disabled={busy || !sources.filter((s) => s !== target).length} onClick={preview}>{busy ? "Planning…" : "Preview the plan →"}</button>
          </div>
        </Card>
      )}

      {step === 3 && plan && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Card><p className="text-[13px] text-ink-muted">To transfer</p><p className="mt-1 text-[24px] font-semibold">{plan.counts.copy.toLocaleString()}</p><p className="text-[12px] text-ink-muted">{bytes(plan.bytesToTransfer)}</p></Card>
            <Card><p className="text-[13px] text-ink-muted">Already in {tgt.label}</p><p className="mt-1 text-[24px] font-semibold text-good">{plan.counts["already-there"].toLocaleString()}</p><p className="text-[12px] text-ink-muted">no upload needed</p></Card>
            <Card><p className="text-[13px] text-ink-muted">Duplicates skipped</p><p className="mt-1 text-[24px] font-semibold">{plan.counts["duplicate-in-batch"].toLocaleString()}</p><p className="text-[12px] text-ink-muted">copied once only</p></Card>
            <Card><p className="text-[13px] text-ink-muted">Space freed at source</p><p className="mt-1 text-[24px] font-semibold text-good">{bytes(plan.bytesFreedAtSource)}</p><p className="text-[12px] text-ink-muted">{mode === "move" ? "after verification" : "copy mode"}</p></Card>
          </div>
          {plan.warnings.map((w) => (
            <p key={w} className={`mt-4 rounded-xl border px-4 py-3 text-[13px] ${w.startsWith("Not enough") ? "border-red-200 bg-red-50 text-red-800" : "border-line bg-white text-ink-soft"}`}>{w}</p>
          ))}
          <Card pad={false} className="mt-4">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="sticky top-0 bg-slate-50 text-left text-[12px] text-ink-muted">
                  <tr><th className="px-4 py-2 font-medium">File</th><th className="px-2 py-2 font-medium">From</th><th className="px-2 py-2 font-medium">To</th><th className="px-2 py-2 font-medium">Plan</th><th className="px-4 py-2 text-right font-medium">Size</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {plan.rows.map((r) => (
                    <tr key={r.file.id}>
                      <td className="max-w-[220px] truncate px-4 py-2" title={r.file.path}>{r.file.name}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{r.file.accountLabel}</td>
                      <td className="max-w-[240px] truncate px-2 py-2 text-ink-muted" title={r.targetPath}>{r.targetPath}</td>
                      <td className="px-2 py-2"><Badge tone={ACTION_LABEL[r.action][1]}>{ACTION_LABEL[r.action][0]}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">{bytes(r.file.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.totalRows > plan.rows.length && <p className="border-t border-line px-4 py-2 text-[12px] text-ink-muted">Showing {plan.rows.length} of {plan.totalRows.toLocaleString()} files.</p>}
          </Card>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button className={buttonClass("ghost")} onClick={() => { setStep(2); setStarted(false); }}>← Adjust</button>
            {started ? (
              <p className="text-[14px] text-good">Running — progress is in the bottom corner. You can leave this page; it continues whenever the site is open or the scheduler runs.</p>
            ) : (
              <button className={buttonClass("brand")} disabled={busy || !plan.totalRows || plan.warnings.some((w) => w.startsWith("Not enough"))} onClick={start}>
                {mode === "move" ? "Start moving" : "Start copying"} {plan.counts.copy.toLocaleString()} files
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
