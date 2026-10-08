"use client";

import { useCallback, useEffect, useState } from "react";
import { bytes, date, KIND_COLOUR, KIND_LABEL, accountColour } from "@/lib/format";
import { createLocalFolder } from "@/lib/local-actions";
import { Lightbox, type PreviewItem } from "./Lightbox";
import { DeleteDialog } from "./DeleteDialog";
import { MoveDialog } from "./MoveDialog";
import { RenameDialog } from "./RenameDialog";
import { buttonClass, Empty, PageHeader } from "./ui";

interface Folder { name: string; path: string; files: number; bytes: number }
interface File { id: string; name: string; path: string; size: number; kind: string; modifiedAt: string | null; webUrl: string | null; accountId: string; accountLabel: string; provider: string }
interface Account { id: string; label: string; provider: string }

export function LibraryView({ accounts }: { accounts: Account[] }) {
  const [loc, setLoc] = useState<{ account: string; path: string } | null>(accounts[0] ? { account: accounts[0].id, path: "/" } : null);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ folders: Folder[]; files: File[]; scanning?: { items: number } | null } | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [preview, setPreview] = useState<number | null>(null);
  // Selection survives moving between folders, so you can gather files from several places.
  const [selFiles, setSelFiles] = useState<Map<string, { id: string; accountId: string }>>(new Map());
  const [selFolders, setSelFolders] = useState<Map<string, { accountId: string; path: string }>>(new Map());
  const [dialog, setDialog] = useState<"rename" | "move" | "delete" | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      const p = new URLSearchParams(q.trim() ? { q } : loc ? { account: loc.account, path: loc.path } : {});
      setData(await fetch(`/api/library?${p}`).then((r) => r.json()));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loc, q, reload]);

  useEffect(() => {
    const on = () => setReload((n) => n + 1);
    window.addEventListener("cloudsweep:changed", on);
    return () => window.removeEventListener("cloudsweep:changed", on);
  }, []);

  const folderKey = (accountId: string, path: string) => `${accountId}|${path}`;
  const toggleFile = (f: File) =>
    setSelFiles((m) => {
      const n = new Map(m);
      n.has(f.id) ? n.delete(f.id) : n.set(f.id, { id: f.id, accountId: f.accountId });
      return n;
    });
  const toggleFolder = (f: Folder) =>
    setSelFolders((m) => {
      const n = new Map(m);
      const k = folderKey(loc!.account, f.path);
      n.has(k) ? n.delete(k) : n.set(k, { accountId: loc!.account, path: f.path });
      return n;
    });
  const clearSelection = () => {
    setSelFiles(new Map());
    setSelFolders(new Map());
  };
  const here = { folders: q ? [] : (data?.folders ?? []), files: data?.files ?? [] };
  const allHere = here.folders.length + here.files.length > 0 && here.files.every((f) => selFiles.has(f.id)) && here.folders.every((f) => selFolders.has(folderKey(loc!.account, f.path)));
  const toggleAll = () => {
    if (allHere) {
      setSelFiles((m) => new Map([...m].filter(([id]) => !here.files.some((f) => f.id === id))));
      setSelFolders((m) => new Map([...m].filter(([k]) => !here.folders.some((f) => folderKey(loc!.account, f.path) === k))));
    } else {
      setSelFiles((m) => new Map([...m, ...here.files.map((f) => [f.id, { id: f.id, accountId: f.accountId }] as const)]));
      setSelFolders((m) => new Map([...m, ...here.folders.map((f) => [folderKey(loc!.account, f.path), { accountId: loc!.account, path: f.path }] as const)]));
    }
  };
  const selCount = selFiles.size + selFolders.size;
  const selection = { ids: [...selFiles.keys()], folders: [...selFolders.values()] };
  const selAccounts = [...new Set([...[...selFiles.values()].map((f) => f.accountId), ...[...selFolders.values()].map((f) => f.accountId)])];

  if (!accounts.length) return (<><PageHeader title="Library" /><Empty title="No drives connected" body="Connect storage to browse all your clouds in one place." /></>);

  const acct = accounts.find((a) => a.id === loc?.account);
  const crumbs = (loc?.path ?? "/").split("/").filter(Boolean);
  const items: PreviewItem[] = (data?.files ?? []).map((f) => ({ id: f.id, name: f.name, kind: f.kind, size: f.size, accountLabel: f.accountLabel, path: f.path, webUrl: f.webUrl }));

  return (
    <>
      <PageHeader title="Library" intro="Every drive in one place. Browse, search across all clouds at once, and preview photos, videos, PDFs and text without leaving the page." />
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="space-y-1 rounded-2xl border border-line bg-white p-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto" aria-label="Drives and folders">
          {accounts.map((a) => (
            <Tree key={a.id} account={a} active={!q && loc?.account === a.id ? loc.path : null} onOpen={(path) => { setQ(""); setLoc({ account: a.id, path }); }} />
          ))}
        </nav>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every drive by file name" className="min-w-[220px] flex-1 rounded-xl border border-line bg-white px-4 py-2.5 text-[14px] outline-none focus:border-ink" />
            <div className="flex rounded-xl border border-line bg-white p-1 text-[13px]">
              {(["list", "grid"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 capitalize ${view === v ? "bg-ink text-white" : "text-ink-soft"}`}>{v}</button>
              ))}
            </div>
          </div>

          {!q && acct && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="flex flex-wrap items-center gap-1 text-[14px]">
              <button className="font-medium hover:underline" onClick={() => setLoc({ account: acct.id, path: "/" })}>{acct.label}</button>
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-ink-muted">/</span>
                  <button className="hover:underline" onClick={() => setLoc({ account: acct.id, path: "/" + crumbs.slice(0, i + 1).join("/") })}>{c}</button>
                </span>
              ))}
            </p>
            <NewFolder account={acct} parent={loc!.path} onCreated={(path) => { setReload((n) => n + 1); window.dispatchEvent(new Event("cloudsweep:changed")); setLoc({ account: acct.id, path }); }} />
            </div>
          )}
          {q && <p className="mb-4 text-[14px] text-ink-muted">{data?.files.length ?? 0} matches across all drives</p>}
          {!q && data?.scanning && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-[13px] text-ink-soft">
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
              <span>
                <b>Still scanning this drive</b> — {data.scanning.items.toLocaleString()} items read so far. Folders appear here as they&apos;re indexed;
                anything missing will show once the scan finishes.
              </span>
            </div>
          )}

          {!data ? (
            <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {data.folders.map((f) => (
                <button key={f.path} onClick={() => setLoc({ account: loc!.account, path: f.path })} className={`relative rounded-2xl border bg-white p-4 text-left hover:border-ink/30 ${selFolders.has(folderKey(loc!.account, f.path)) ? "border-ink ring-1 ring-ink" : "border-line"}`}>
                  <Tick checked={selFolders.has(folderKey(loc!.account, f.path))} onChange={() => toggleFolder(f)} label={`Select folder ${f.name}`} corner />
                  <FolderGlyph />
                  <p className="mt-3 truncate text-[14px] font-medium">{f.name}</p>
                  <p className="text-[12px] text-ink-muted">{f.files} files · {bytes(f.bytes)}</p>
                </button>
              ))}
              {data.files.map((f, i) => (
                <button key={f.id} onClick={() => setPreview(i)} className={`relative overflow-hidden rounded-2xl border bg-white text-left hover:border-ink/30 ${selFiles.has(f.id) ? "border-ink ring-1 ring-ink" : "border-line"}`}>
                  <Tick checked={selFiles.has(f.id)} onChange={() => toggleFile(f)} label={`Select ${f.name}`} corner />
                  {f.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/thumb/${encodeURIComponent(f.id)}`} alt="" loading="lazy" className="aspect-square w-full bg-slate-100 object-cover" />
                  ) : (
                    <div className="grid aspect-square place-items-center text-[13px] font-semibold uppercase tracking-wider" style={{ background: `${KIND_COLOUR[f.kind]}14`, color: KIND_COLOUR[f.kind] }}>
                      {f.name.split(".").pop()}
                    </div>
                  )}
                  <p className="truncate px-3 pb-0.5 pt-2 text-[13px] font-medium">{f.name}</p>
                  <p className="px-3 pb-3 text-[12px] text-ink-muted">{bytes(f.size)}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              <table className="w-full text-[13px]">
                {here.folders.length + here.files.length > 0 && (
                  <thead className="border-b border-line bg-slate-50/60 text-left text-[12px] text-ink-muted">
                    <tr>
                      <th className="w-10 py-2 pl-4"><Tick checked={allHere} onChange={toggleAll} label="Select everything in this view" /></th>
                      <th className="py-2 pl-1 font-medium" colSpan={3}>{allHere ? "Everything here is selected" : "Select all here"}</th>
                    </tr>
                  </thead>
                )}
                <tbody className="divide-y divide-line">
                  {data.folders.map((f) => (
                    <tr key={f.path} className={`cursor-pointer hover:bg-slate-50 ${selFolders.has(folderKey(loc!.account, f.path)) ? "bg-slate-50" : ""}`} onClick={() => setLoc({ account: loc!.account, path: f.path })}>
                      <td className="w-10 py-2.5 pl-4"><Tick checked={selFolders.has(folderKey(loc!.account, f.path))} onChange={() => toggleFolder(f)} label={`Select folder ${f.name}`} /></td>
                      <td className="flex items-center gap-3 py-2.5 pl-1 pr-4 font-medium"><FolderGlyph small />{f.name}</td>
                      <td className="hidden px-4 py-2.5 text-ink-muted sm:table-cell">{f.files} files</td>
                      <td className="px-4 py-2.5 text-right">{bytes(f.bytes)}</td>
                    </tr>
                  ))}
                  {data.files.map((f, i) => (
                    <tr key={f.id} className={`cursor-pointer hover:bg-slate-50 ${selFiles.has(f.id) ? "bg-slate-50" : ""}`} onClick={() => setPreview(i)}>
                      <td className="w-10 py-2.5 pl-4"><Tick checked={selFiles.has(f.id)} onChange={() => toggleFile(f)} label={`Select ${f.name}`} /></td>
                      <td className="w-full max-w-0 py-2.5 pl-1 pr-4">
                        <span className="flex items-center gap-3">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: KIND_COLOUR[f.kind] }} title={KIND_LABEL[f.kind]} />
                          <span className="truncate">{f.name}</span>
                        </span>
                        {q && <span className="ml-5 block truncate text-[12px] text-ink-muted"><span style={{ color: accountColour(f.provider, f.accountLabel) }}>●</span> {f.accountLabel} · {f.path}</span>}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-2.5 text-ink-muted sm:table-cell">{date(f.modifiedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">{bytes(f.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.folders.length && !data.files.length && (
                <p className="p-8 text-center text-[14px] text-ink-muted">{data.scanning ? "Nothing indexed in this folder yet — the scan is still running." : "This folder is empty."}</p>
              )}
            </div>
          )}
        </section>
      </div>
      {selCount > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto mt-6 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-2 pl-4 shadow-lg shadow-black/10">
          <span className="mr-1 text-[14px]">
            <b>{selFiles.size ? `${selFiles.size} ${selFiles.size === 1 ? "file" : "files"}` : ""}{selFiles.size && selFolders.size ? " + " : ""}{selFolders.size ? `${selFolders.size} ${selFolders.size === 1 ? "folder" : "folders"}` : ""}</b> selected
          </span>
          <button className={buttonClass("primary", "sm")} onClick={() => setDialog("rename")}>✎ Rename…</button>
          <button className={buttonClass("primary", "sm")} onClick={() => setDialog("move")}>⇄ Move…</button>
          <button className={buttonClass("danger", "sm")} onClick={() => setDialog("delete")}>Delete…</button>
          <button className={buttonClass("ghost", "sm")} onClick={clearSelection}>Clear</button>
        </div>
      )}
      {dialog === "rename" && <RenameDialog selection={selection} onClose={() => setDialog(null)} onDone={() => { clearSelection(); setReload((n) => n + 1); }} />}
      {dialog === "delete" && <DeleteDialog selection={selection} onClose={() => setDialog(null)} onDone={() => { clearSelection(); setReload((n) => n + 1); }} />}
      {dialog === "move" && <MoveDialog selection={selection} sourceAccountIds={selAccounts} onClose={() => setDialog(null)} onDone={clearSelection} />}
      {preview !== null && items[preview] && <Lightbox items={items} index={preview} onIndex={setPreview} onClose={() => setPreview(null)} />}
    </>
  );
}

function Tree({ account, active, onOpen }: { account: Account; active: string | null; onOpen: (path: string) => void }) {
  const [open, setOpen] = useState(active !== null);
  return (
    <div>
      <button onClick={() => { setOpen(!open); onOpen("/"); }} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[14px] font-medium ${active === "/" ? "bg-ink text-white" : "hover:bg-slate-100"}`}>
        <span className="w-3 text-[10px] opacity-60">{open ? "▾" : "▸"}</span>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accountColour(account.provider, account.label) }} />
        <span className="truncate">{account.label}</span>
      </button>
      {open && <Branch account={account.id} path="" depth={1} active={active} onOpen={onOpen} />}
    </div>
  );
}

function Branch({ account, path, depth, active, onOpen }: { account: string; path: string; depth: number; active: string | null; onOpen: (p: string) => void }) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    const r = await fetch(`/api/library?${new URLSearchParams({ account, path: path || "/" })}`).then((x) => x.json());
    setFolders(r.folders);
  }, [account, path]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener("cloudsweep:changed", load);
    return () => window.removeEventListener("cloudsweep:changed", load);
  }, [load]);
  if (!folders) return <p className="py-1 text-[12px] text-ink-muted" style={{ paddingLeft: depth * 14 + 8 }}>Loading…</p>;
  return (
    <ul>
      {folders.map((f) => (
        <li key={f.path}>
          <button
            onClick={() => { setExpanded((e) => { const n = new Set(e); n.has(f.path) ? n.delete(f.path) : n.add(f.path); return n; }); onOpen(f.path); }}
            className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-[13px] ${active === f.path ? "bg-ink text-white" : "text-ink-soft hover:bg-slate-100"}`}
            style={{ paddingLeft: depth * 14 + 8 }}
            title={`${f.files} files · ${bytes(f.bytes)}`}
          >
            <span className="w-3 text-[10px] opacity-60">{expanded.has(f.path) ? "▾" : "▸"}</span>
            <span className="truncate">{f.name}</span>
          </button>
          {expanded.has(f.path) && <Branch account={account} path={f.path} depth={depth + 1} active={active} onOpen={onOpen} />}
        </li>
      ))}
    </ul>
  );
}

function FolderGlyph({ small = false }: { small?: boolean }) {
  const s = small ? 16 : 28;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#2F5BFF" fillOpacity="0.14" stroke="#2F5BFF" strokeWidth="1.6" aria-hidden>
      <path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" />
    </svg>
  );
}

/** A checkbox that doesn't open the file or folder it sits on. */
function Tick({ checked, onChange, label, corner = false }: { checked: boolean; onChange: () => void; label: string; corner?: boolean }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onChange(); } }}
      className={`${corner ? "absolute left-2 top-2 z-10 shadow-sm" : ""} grid h-[18px] w-[18px] cursor-pointer place-items-center rounded-[5px] border text-[11px] font-bold leading-none ${checked ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-transparent hover:border-ink"}`}
    >
      ✓
    </span>
  );
}

/** Creates a folder inside the one you're looking at. */
function NewFolder({ account, parent, onCreated }: { account: Account; parent: string; onCreated: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    const path = `${parent.replace(/\/$/, "")}/${name.trim()}`;
    setBusy(true);
    setError("");
    try {
      if (account.provider === "local") await createLocalFolder(account.id, path);
      else {
        const r = await fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: account.id, path }) }).then((x) => x.json());
        if (r.error) throw new Error(r.error);
      }
      setOpen(false);
      setName("");
      onCreated(path.replace(/\/+/g, "/"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button className={buttonClass("ghost", "sm")} onClick={() => setOpen(true)}>
        + New folder
      </button>
    );
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create(); }}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} placeholder="Folder name" className="w-48 rounded-xl border border-line px-3 py-1.5 text-[13px] outline-none focus:border-ink" aria-label="New folder name" />
      <button className={buttonClass("primary", "sm")} disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create"}</button>
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
      {error && <span className="w-full text-[12px] text-bad">{error}</span>}
    </form>
  );
}
