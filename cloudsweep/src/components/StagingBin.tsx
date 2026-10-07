"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ago, bytes, accountColour } from "@/lib/format";
import { Badge, buttonClass, Card, Empty, Stat } from "./ui";

interface Staged { id: number; name: string; bytes: number; path: string; reason: string; at: string; account: string; provider: string }
interface Hist { id: number; kind: string; name: string; bytes: number; undone: boolean; at: string; account: string | null; to: string | null }

const PURGE_DAYS = 30;

export function StagingBin({ items, history }: { items: Staged[]; history: Hist[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
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

  async function restore(ids: number[]) {
    setBusy(true);
    let restored = 0;
    const failed: string[] = [];
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

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="In the staging bin" value={items.length.toLocaleString()} hint="files, across all drives" />
        <Stat label="Space it will free" value={bytes(total)} tone="good" hint="once providers empty their trash" />
        <Card>
          <p className="text-[13px] font-medium text-ink-muted">By drive</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {byAccount.length ? (
              byAccount.map(([a, v]) => (
                <li key={a} className="flex justify-between gap-2">
                  <span className="flex items-center gap-2 truncate"><span className="h-2 w-2 rounded-full" style={{ background: accountColour(v.provider, a) }} />{a}</span>
                  <span className="text-ink-muted">{v.n} · {bytes(v.bytes)}</span>
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
                    <Badge tone={left < 7 ? "warn" : "grey"}>{i.reason === "consolidated" ? "Moved" : "Duplicate"} · ~{left}d left</Badge>
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
                  {h.kind === "copy" ? `Copied to ${h.account}${h.to ? ` · ${h.to}` : ""}` : h.undone ? "Restored" : h.kind}: <b className="font-medium">{h.name}</b>
                </span>
                <span className="shrink-0 text-ink-muted">{bytes(h.bytes)} · {ago(h.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
