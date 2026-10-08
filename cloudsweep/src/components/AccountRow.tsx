"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ago, bytes } from "@/lib/format";
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
  colour: string;
}

export function AccountRow({ account: a }: { account: Props }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(a.label);

  const call = async (url: string, init: RequestInit) => {
    await fetch(url, init);
    router.refresh();
  };

  return (
    <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.colour }} />
          {editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await call(`/api/accounts/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
                setEditing(false);
              }}
            >
              <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus className="rounded-lg border border-line px-2 py-1 text-[14px]" onBlur={() => setEditing(false)} />
            </form>
          ) : (
            <button className="text-left text-[15px] font-semibold hover:underline" onClick={() => setEditing(true)} title="Rename">
              {a.label}
            </button>
          )}
          <span className="text-[12px] text-ink-muted">{a.providerName}</span>
          {a.is_primary && <Badge tone="brand">Primary</Badge>}
          {a.status === "reauth" && <Badge tone="bad">Sign-in expired</Badge>}
        </div>
        <p className="mt-1 text-[13px] text-ink-muted">
          {a.email ?? "—"} · {a.files.toLocaleString()} items · last scan {ago(a.last_scan_at)}
        </p>
        <div className="mt-3 max-w-md">
          <Meter value={a.quota_used ?? 0} max={a.quota_total} colour={a.colour} />
          <p className="mt-1 text-[12px] text-ink-muted">
            {bytes(a.quota_used)} used {a.quota_total ? `of ${bytes(a.quota_total)} · ${bytes(a.quota_total - (a.quota_used ?? 0))} free` : "(pooled or unlimited)"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {a.status === "reauth" && a.provider !== "demo" && (
          <a href={`/api/connect/${a.provider}`} className={buttonClass("brand", "sm")}>
            Reconnect
          </a>
        )}
        <button
          className={buttonClass("ghost", "sm")}
          onClick={async () => {
            await fetch(`/api/accounts/${a.id}/scan`, { method: "POST" });
            announceJobs();
          }}
        >
          Rescan
        </button>
        {!a.is_primary && (
          <button
            className={buttonClass("ghost", "sm")}
            title="Duplicates prefer to keep the copy in your primary account"
            onClick={() => call(`/api/accounts/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ primary: true }) })}
          >
            Make primary
          </button>
        )}
        <button
          className={`${buttonClass("ghost", "sm")} hover:!text-bad`}
          onClick={() => {
            if (confirm(`Disconnect ${a.label}? CloudSweep forgets its index. Nothing in the cloud is deleted.`)) call(`/api/accounts/${a.id}`, { method: "DELETE" });
          }}
        >
          Disconnect
        </button>
      </div>
    </li>
  );
}
