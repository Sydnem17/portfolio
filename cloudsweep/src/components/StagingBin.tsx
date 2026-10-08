"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ago, bytes, accountColour } from "@/lib/format";
import { purgeLocalFiles, restoreLocalFiles } from "@/lib/local-actions";
import { Badge, buttonClass, Card, Empty, Stat } from "./ui";

interface Staged { id: number; name: string; bytes: number; path: string; stagedPath: string | null; reason: string; at: string; account: string; accountId: string; provider: string }
interface Hist { id: number; kind: string; name: string; bytes: number; undone: boolean; at: string; account: string | null; to: string | null }

const PURGE_DAYS = 30;

export function StagingBin({ items, history }: { items: Staged[]; history: Hist[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const total = useMemo(() => items.reduce((s, i) => s + i.bytes, 0), [items]);
  const byAccount = useMemo(() => {
    const m = new Map<string, { n: number; bytes: number; provider: string }>();
    items.forEach((i) => {
      const a = m.get(i.account) ?? { n: 0, bytes: 0, provider: i.provider };
      a.n++;
      a.bytes += i.bytes;
      m.set(i.account, a);
    });
    return [...m.entries()];
  }, [items]);

  async function restore(all: number[]) {
    setBusy(true);
    let restored = 0;
    const failed: string[] = [];
    // Files on this computer are moved back by this browser; cloud files are restored by the server.
    const local = new Map<string, Array<{ actionId: number; stagedPath: string; path: string }>>();
    const ids: number[] = [];
    for (const id of all) {
      const it = items.find((x) => x.id === id);
      if (it?.provider === "local" && it.stagedPath) local.get(it.accountId)?.push({ actionId: id, stagedPath: it.stagedPath, path: it.path }) ?? local.set(it.accountId, [{ actionId: id, stagedPath: it.stagedPath, path: it.path }]);
      else ids.push(id);
    }
    if (local.size) {
      const r = await restoreLocalFiles(local);
      restored += r.restored;
      if (r.failed) failed.push(`${r.failed} file(s) on a local drive couldn't be moved back from this browser — open CloudSweep in Chrome or Edge on that computer`);
    }
    for (let i = 0; i < ids.length; i += 100) {
      const r = await fetch("/api/actions/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(i, i + 100) }) }).then((x) => x.json());
      restored += r.restored ?? 0;
      failed.push(...(r.failed ?? []).map((f: any) => f.error));
    }
    setMsg(failed.length ? `Restored ${restored}. ${failed.length} couldn't be restored automatically: ${failed[0]}` : `Restored ${restored} file${restored === 1 ? "" : "s"} to their original folders.`);
    setSel(new Set());
    setBusy(false);
    router.refresh();
  }

  /** Deletes the selected files for good: no trash, no undo. */
  async function purge(all: number[]) {
    setBusy(true);
    setConfirmPurge(false);
    let deleted = 0;
    const failed: string[] = [];
    const local = new Map<string, Array<{ actionId: number; path: string }>>();
    const ids: number[] = [];
    for (const id of all) {
      const it = items.find((x) => x.id === id);
      if (it?.provider === "local" && it.stagedPath) local.set(it.accountId, [...(local.get(it.accountId) ?? []), { actionId: id, path: it.stagedPath }]);
      else ids.push(id);
    }
    if (local.size) {
      const r = await purgeLocalFiles(local);
      deleted += r.deleted;
      failed.push(...r.problems);
    }
    for (let i = 0; i < ids.length; i += 100) {
      const r = await fetch("/api/actions/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(i, i + 100) }) }).then((x) => x.json());
      deleted += r.deleted ?? 0;
      failed.push(...(r.failed ?? []).map((f: any) => f.error));
    }
    const left = all.length - deleted;
    setMsg(
      `Deleted ${deleted} file${deleted === 1 ? "" : "s"} permanently.` +
        (left > 0 ? ` ${left} stayed in their drive's recycle bin: ${[...new Set(failed)].slice(0, 2).join(" ")}` : ""),
    );
    setSel(new Set());
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <Stat label="In the staging bin" value={items.length.toLocaleString()} hint="files, across all drives" />
        <Stat label="Space it will free" value={bytes(total)} tone="good" hint="once providers empty their trash" />
        <Card className="col-span-2 min-w-0 xl:col-span-1">
          <p className="text-[13px] font-medium text-ink-muted">By drive</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {byAccount.length ? (
              byAccount.map(([a, v]) => (
                <li key={a} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accountColour(v.provider, a) }} /><span className="truncate" title={a}>{a}</span></span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-ink-muted">{v.n} {v.n === 1 ? "file" : "files"} · {bytes(v.bytes)}</span>
                </li>
              ))
            ) : (
              <li className="text-ink-muted">Empty</li>
            )}
          </ul>
        </Card>
      </div>

      {msg && <div className="mt-6 rounded-xl border border-line bg-white px-4 py-3 text-[14px]">{msg}</div>}

      <div className="mt-6">
        {items.length === 0 ? (
          <Empty title="The staging bin is empty" body="When you remove duplicates or move files during consolidation, they appear here first so you can change your mind." />
        ) : (
          <Card pad={false}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={sel.size === items.length} onChange={(e) => setSel(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} />
                Select all
              </label>
              <div className="flex gap-2">
                <button className={buttonClass("ghost", "sm")} disabled={busy || !sel.size} onClick={() => restore([...sel])}>
                  Restore selected ({sel.size})
                </button>
                <button className={buttonClass("ghost", "sm") + " text-bad"} disabled={busy || !sel.size} onClick={() => setConfirmPurge(true)}>
                  Delete forever ({sel.size})
                </button>
                <button className={buttonClass("primary", "sm")} disabled={busy} onClick={() => confirm(`Restore all ${items.length} files?`) && restore(items.map((i) => i.id))}>
                  {busy ? "Restoring…" : "Restore everything"}
                </button>
              </div>
            </div>
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {items.map((i) => {
                const left = Math.max(0, PURGE_DAYS - Math.floor((Date.now() - Date.parse(i.at)) / 864e5));
                return (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                    <input type="checkbox" checked={sel.has(i.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n; })} />
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accountColour(i.provider, i.account) }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.name}</p>
                      <p className="truncate text-ink-muted">{i.account} · {i.path}</p>
                    </div>
                    {i.provider === "local" ? (
                      <Badge tone="grey">In CloudSweep Staging folder</Badge>
                    ) : (
                      <Badge tone={left < 7 ? "warn" : "grey"}>{i.reason === "consolidated" || i.reason === "moved" ? "Moved" : i.reason === "deleted" ? "Deleted" : "Duplicate"} · ~{left}d left</Badge>
                    )}
                    <span className="w-20 shrink-0 text-right">{bytes(i.bytes)}</span>
                    <button className="shrink-0 font-medium text-brand hover:underline disabled:opacity-40" disabled={busy} onClick={() => restore([i.id])}>
                      Restore
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {history.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 text-[15px] font-semibold">History</h2>
          <ul className="divide-y divide-line text-[13px]">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate">
                  {h.kind === "copy" ? `Copied to ${h.account}${h.to ? ` · ${h.to}` : ""}` : h.kind === "purge" ? "Deleted forever" : h.undone ? "Restored" : h.kind}: <b className="font-medium">{h.name}</b>
                </span>
                <span className="shrink-0 text-ink-muted">{bytes(h.bytes)} · {ago(h.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {confirmPurge && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Delete forever">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="text-[18px] font-semibold">
              Delete {sel.size} {sel.size === 1 ? "file" : "files"} forever?
            </h2>
            <ul className="mt-3 space-y-1.5 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-900">
              <li>
                • <b>This can&apos;t be undone</b> — they won&apos;t be restorable from here or from the drive&apos;s trash.
              </li>
              <li>• Frees {bytes(items.filter((i) => sel.has(i.id)).reduce((t, i) => t + i.bytes, 0))} now instead of in ~30 days.</li>
              <li>• Personal OneDrive and Dropbox only let you empty their recycle bin on their own website; those files will stay listed here.</li>
            </ul>
            <div className="mt-6 flex justify-end gap-2">
              <button className={buttonClass("ghost")} onClick={() => setConfirmPurge(false)}>
                Cancel
              </button>
              <button className={buttonClass("danger")} onClick={() => purge([...sel])}>
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
