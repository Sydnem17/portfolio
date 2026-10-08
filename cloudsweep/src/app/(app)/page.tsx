import Link from "next/link";
import { DemoButton } from "@/components/DemoButton";
import { Badge, Card, CardTitle, Empty, LinkButton, Meter, PageHeader, Stat } from "@/components/ui";
import { ago, bytes, KIND_COLOUR, KIND_LABEL, accountColour } from "@/lib/format";
import { getOverview } from "@/lib/report";

export default async function Overview() {
  const o = await getOverview();

  if (!o.accounts.length)
    return (
      <>
        <PageHeader title="Welcome to CloudSweep" intro="One place to see, de-duplicate and consolidate everything across your cloud drives." />
        <Empty
          title="Connect your first storage account"
          body="Link OneDrive, Google Drive (personal and work) or Dropbox. CloudSweep indexes file details only — it never changes anything until you approve it."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <LinkButton href="/accounts">Connect storage</LinkButton>
              <DemoButton />
            </div>
          }
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["1 · Connect", "Sign in to each drive. Tokens are encrypted; you can disconnect at any time."],
            ["2 · Review", "See duplicates, near-duplicate photos and mirrored folders with the space each one wastes."],
            ["3 · Clean up", "Trash extras or consolidate into one home. Everything is reversible from Activity."],
          ].map(([t, b]) => (
            <Card key={t}>
              <p className="text-[14px] font-semibold">{t}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{b}</p>
            </Card>
          ))}
        </div>
      </>
    );

  const kinds = Object.entries(o.byKind).sort((a, b) => b[1].bytes - a[1].bytes);
  return (
    <>
      <PageHeader
        title="Overview"
        intro={`${o.accounts.length} storage account${o.accounts.length === 1 ? "" : "s"} · ${o.totalFiles.toLocaleString()} files indexed`}
        actions={
          <>
            <LinkButton href="/accounts" variant="ghost">
              Add storage
            </LinkButton>
            <LinkButton href="/duplicates">Review duplicates</LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Stored across all drives" value={bytes(o.totalBytes)} hint={`${o.totalFiles.toLocaleString()} files`} />
        <Stat label="Wasted on duplicates" value={bytes(o.duplicateWaste)} tone="bad" hint={`${o.duplicateGroups.toLocaleString()} duplicate sets`} />
        <Link href="/progress" className="block rounded-2xl transition hover:ring-2 hover:ring-good/30">
          <Stat label="Recovered so far" value={bytes(o.recoveredBytes)} tone="good" hint={<>{o.actions} files cleaned up · <span className="underline">See progress</span></>} />
        </Link>
        <Stat label="Photos understood" value={`${o.photos.total ? Math.round((o.photos.analysed / o.photos.total) * 100) : 0}%`} tone="brand" hint={`${o.photos.analysed.toLocaleString()} of ${o.photos.total.toLocaleString()} photos`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5 [&>*]:min-w-0">
        <Card className="lg:col-span-3">
          <CardTitle aside={<Link href="/accounts" className="text-[13px] font-medium text-brand">Manage</Link>}>Your drives</CardTitle>
          <ul className="space-y-5">
            {o.accounts.map((a) => (
              <li key={a.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 text-[14px] font-medium">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accountColour(a.provider, a.label) }} />
                    <span className="truncate">{a.label}</span>
                    {a.is_primary && <Badge tone="brand">Primary</Badge>}
                    {a.status === "reauth" && <Badge tone="bad">Reconnect</Badge>}
                  </p>
                  <p className="shrink-0 text-[13px] text-ink-muted">
                    {bytes(a.quota_used)} {a.quota_total ? `of ${bytes(a.quota_total)}` : ""}
                  </p>
                </div>
                <div className="mt-2">
                  <Meter value={a.quota_used ?? 0} max={a.quota_total} colour={accountColour(a.provider, a.label)} />
                </div>
                <p className="mt-1.5 text-[12px] text-ink-muted">
                  {a.email} · {a.files.toLocaleString()} files · scanned {ago(a.last_scan_at)}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>What’s taking up space</CardTitle>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
            {kinds.map(([k, v]) => (
              <div key={k} style={{ width: `${(v.bytes / Math.max(o.totalBytes, 1)) * 100}%`, background: KIND_COLOUR[k] }} title={KIND_LABEL[k]} />
            ))}
          </div>
          <ul className="mt-5 space-y-3">
            {kinds.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between text-[14px]">
                <span className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_COLOUR[k] }} />
                  {KIND_LABEL[k] ?? k}
                  <span className="text-ink-muted">{v.n.toLocaleString()}</span>
                </span>
                <span className="font-medium">{bytes(v.bytes)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardTitle aside={<Link href="/duplicates" className="text-[13px] font-medium text-brand">See all</Link>}>Biggest wins</CardTitle>
          {o.topGroups.length ? (
            <ul className="divide-y divide-line">
              {o.topGroups.map((g) => (
                <li key={g.key} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{g.name}</p>
                    <p className="text-[12px] text-ink-muted">
                      {g.members.length} copies across {new Set(g.members.map((m) => m.accountLabel)).size} drive(s)
                    </p>
                  </div>
                  <span className="shrink-0 text-[14px] font-semibold text-bad">{bytes(g.wasteBytes)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-muted">No duplicates found yet. Run a scan from Storage accounts.</p>
          )}
        </Card>
        <Card>
          <CardTitle>Largest files</CardTitle>
          <ul className="divide-y divide-line">
            {o.largest.slice(0, 6).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{f.name}</p>
                  <p className="truncate text-[12px] text-ink-muted">
                    {f.label} · {f.path}
                  </p>
                </div>
                <span className="shrink-0 text-[14px] font-medium">{bytes(f.size)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {o.clutter.length > 0 && (
        <Card className="mt-6">
          <CardTitle>Probably safe to remove</CardTitle>
          <p className="-mt-2 mb-3 text-[13px] text-ink-muted">Installers, disk images and leftovers in Downloads/Temp folders. Review before deleting.</p>
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {o.clutter.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13px]">
                <span className="min-w-0 truncate">
                  {f.name} <span className="text-ink-muted">· {f.label}</span>
                </span>
                <span className="shrink-0 font-medium">{bytes(f.size)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
