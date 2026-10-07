"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { announceJobs } from "./JobDock";

interface Command { label: string; hint: string; run: () => void | Promise<void> }

/** ⌘K / Ctrl+K: jump anywhere or run any tool without hunting through menus. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const job = (type: string) => async () => {
    await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
    announceJobs();
  };
  const commands: Command[] = useMemo(
    () => [
      { label: "Overview", hint: "Go to", run: () => router.push("/") },
      { label: "Duplicates", hint: "Go to", run: () => router.push("/duplicates") },
      { label: "Library — browse all drives", hint: "Go to", run: () => router.push("/library") },
      { label: "Photos — places, pets, people", hint: "Go to", run: () => router.push("/photos") },
      { label: "Consolidate drives", hint: "Go to", run: () => router.push("/consolidate") },
      { label: "Staging bin & restore", hint: "Go to", run: () => router.push("/bin") },
      { label: "Add a storage account", hint: "Go to", run: () => router.push("/accounts") },
      { label: "Verify likely duplicates", hint: "Run", run: job("verify") },
      { label: "Analyse photos", hint: "Run", run: job("analyse") },
      {
        label: "Rescan every drive",
        hint: "Run",
        run: async () => {
          const r = await fetch("/api/rescan", { method: "POST" });
          if (r.ok) announceJobs();
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );
  const matches = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const run = (c?: Command) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed right-4 top-3 z-30 hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5 text-[13px] text-ink-muted shadow-sm hover:text-ink lg:flex">
        Search or jump to… <kbd className="rounded bg-slate-100 px-1.5 text-[11px]">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/30 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
          <div className="mx-auto max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
            <input
              ref={input}
              value={q}
              onChange={(e) => { setQ(e.target.value); setI(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") (e.preventDefault(), setI((x) => Math.min(matches.length - 1, x + 1)));
                if (e.key === "ArrowUp") (e.preventDefault(), setI((x) => Math.max(0, x - 1)));
                if (e.key === "Enter") run(matches[i]);
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Type a page or action…"
              className="w-full border-b border-line px-5 py-4 text-[15px] outline-none"
            />
            <ul className="max-h-80 overflow-y-auto p-2">
              {matches.map((c, k) => (
                <li key={c.label}>
                  <button onMouseEnter={() => setI(k)} onClick={() => run(c)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[14px] ${k === i ? "bg-ink text-white" : ""}`}>
                    {c.label}
                    <span className={`text-[12px] ${k === i ? "text-white/60" : "text-ink-muted"}`}>{c.hint}</span>
                  </button>
                </li>
              ))}
              {!matches.length && <li className="px-3 py-6 text-center text-[14px] text-ink-muted">No matches</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
