"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ago, bytes } from "@/lib/format";
import { rescanLocal } from "./AddLocalFolder";
import { announceJobs } from "./JobDock";
import { Badge, buttonClass, Meter } from "./ui";

interface Props {
  id: string;
  provider: string;
  providerName: string;
  label: string;
  email: string | null;
  quota_total: number | null;
  quota_used: number | null;
  is_primary: boolean;
  status: string;
  last_scan_at: string | null;
  files: number;
  bytes: number;
  colour: string;
}

export function AccountRow({ account: a }: { account: Props }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(a.label);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const local = a.provider === "local";

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const call = async (url: string, init: RequestInit) => {
    await fetch(url, init);
    router.refresh();
  };

  async function save() {
    if (label.trim() === a.label) return setEditing(false);
    setSaving(true);
    const r = await fetch(`/api/accounts/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
    setSaving(false);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? "Couldn't rename");
    setError(null);
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setLabel(a.label);
    setError(null);
    setEditing(false);
  }

  return (
    <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.colour }} />
            <input
              ref={input}
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && cancel()}
              aria-label="Drive name"
              className="min-w-[200px] flex-1 rounded-lg border border-ink px-2.5 py-1.5 text-[15px] font-semibold outline-none"
            />
            <button type="submit" disabled={saving} className={buttonClass("primary", "sm")}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={cancel} className={buttonClass("ghost", "sm")}>
              Cancel
            </button>
            {error && <p className="w-full text-[12px] text-bad">{error}</p>}
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.colour }} />
            <span className="text-[15px] font-semibold">{a.label}</span>
            <button onClick={() => setEditing(true)} className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-brand hover:bg-brand-soft" aria-label={`Rename ${a.label}`}>
              ✎ Rename
            </button>
            <span className="text-[12px] text-ink-muted">{a.providerName}</span>
            {a.is_primary && <Badge tone="brand">Primary</Badge>}
            {a.status === "reauth" && <Badge tone="bad">Sign-in expired</Badge>}
          </div>
        )}
        <p className="mt-1 text-[13px] text-ink-muted">
          {local ? "Scanned by this browser" : (a.email ?? "—")} · {a.files.toLocaleString()} items · last scan {ago(a.last_scan_at)}
        </p>
        <div className="mt-3 max-w-md">
          {local ? (
            <p className="text-[12px] text-ink-muted">{bytes(a.bytes)} in this folder · files never leave your computer</p>
          ) : (
            <>
              <Meter value={a.quota_used ?? 0} max={a.quota_total} colour={a.colour} />
              <p className="mt-1 text-[12px] text-ink-muted">
                {bytes(a.quota_used)} used {a.quota_total ? `of ${bytes(a.quota_total)} · ${bytes(a.quota_total - (a.quota_used ?? 0))} free` : "(pooled or unlimited)"}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {a.status === "reauth" && !local && a.provider !== "demo" && (
          <a href={`/api/connect/${a.provider}`} className={buttonClass("brand", "sm")}>
            Reconnect
          </a>
        )}
        <button
          className={buttonClass("ghost", "sm")}
          onClick={async () => {
            if (local) {
              const problem = await rescanLocal(a.id, a.label);
              if (problem) alert(problem);
              return;
            }
            await fetch(`/api/accounts/${a.id}/scan`, { method: "POST" });
            announceJobs();
          }}
        >
          Rescan
        </button>
        {!a.is_primary && (
          <button
            className={buttonClass("ghost", "sm")}
            title="Duplicates prefer to keep the copy in your primary drive"
            onClick={() => call(`/api/accounts/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ primary: true }) })}
          >
            Make primary
          </button>
        )}
        <button
          className={`${buttonClass("ghost", "sm")} hover:!text-bad`}
          onClick={() => {
            if (confirm(`Disconnect ${a.label}? CloudSweep forgets its index. Nothing ${local ? "on your computer" : "in the cloud"} is deleted.`)) call(`/api/accounts/${a.id}`, { method: "DELETE" });
          }}
        >
          Disconnect
        </button>
      </div>
    </li>
  );
}
