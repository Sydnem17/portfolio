import { Card, CardTitle, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";
import { accountColour, ago, bytes, KIND_COLOUR, KIND_LABEL } from "@/lib/format";
import { getProgress, REASON_LABEL } from "@/lib/progress";

export const dynamic = "force-dynamic";

const REASON_COLOUR: Record<string, string> = { duplicate: "#2F5BFF", deleted: "#DC2626", moved: "#059669", consolidated: "#7C3AED", other: "#64748B" };

function Bars({ rows }: { rows: Array<{ key: string; label: string; colour: string; bytes: number; files: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.bytes));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.colour }} />
              <span className="truncate">{r.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <b>{bytes(r.bytes)}</b> <span className="text-ink-muted">· {r.files.toLocaleString()}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.bytes / max) * 100)}%`, background: r.colour }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const ACTION_TEXT: Record<string, string> = { trash: "Removed", copy: "Copied", move: "Moved", rename: "Renamed" };

export default async function Progress() {
  const p = await getProgress();
  const nothing = !p.filesRemoved && !p.renamed && !p.moved;

  return (
    <>
      <PageHeader title="Your progress" intro="Everything CloudSweep has tidied for you, and the space you've won back. Anything you restore from the Staging bin drops out of these numbers." />
      {nothing ? (
        <Empty
          title="Nothing tidied yet"
          body="Start with duplicates — it's usually the biggest, safest win. Your reclaimed space will build up here."
          action={<LinkButton href="/duplicates">Review duplicates</LinkButton>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label="Space reclaimed" value={bytes(p.reclaimed)} tone="good" hint="Freed once each drive empties its trash" />
            <Stat label="Files removed" value={p.filesRemoved.toLocaleString()} hint="Duplicates, deletes and moves" />
            <Stat label="Files renamed" value={p.renamed.toLocaleString()} />
            <Stat label="Files moved or copied" value={p.moved.toLocaleString()} />
          </div>

          <Card className="mt-6">
            <CardTitle aside={<span className="text-[12px] text-ink-muted">Last 12 weeks</span>}>Space reclaimed each week</CardTitle>
            <div className="flex h-36 items-end gap-1.5 sm:gap-2" role="img" aria-label="Space reclaimed per week">
              {p.weeks.map((w) => {
                const max = Math.max(1, ...p.weeks.map((x) => x.bytes));
                return (
                  <div key={w.week} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`Week of ${new Date(w.week).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}: ${bytes(w.bytes)} · ${w.files} files`}>
                    <div className={`w-full rounded-t-md ${w.bytes ? "bg-good" : "bg-slate-100"}`} style={{ height: `${w.bytes ? Math.max(4, (w.bytes / max) * 100) : 3}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
              <span>{new Date(p.weeks[0].week).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
              <span>This week</span>
            </div>
          </Card>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardTitle>How you reclaimed it</CardTitle>
              {p.byReason.length ? (
                <Bars rows={p.byReason.map((r) => ({ key: r.key, label: REASON_LABEL[r.key] ?? r.key, colour: REASON_COLOUR[r.key] ?? "#64748B", bytes: r.bytes, files: r.files }))} />
              ) : (
                <p className="text-[14px] text-ink-muted">Nothing removed yet.</p>
              )}
            </Card>
            <Card>
              <CardTitle>Freed on each drive</CardTitle>
              {p.byDrive.length ? (
                <Bars rows={p.byDrive.map((r) => ({ key: r.key, label: String(r.label), colour: accountColour(String(r.provider), String(r.label)), bytes: r.bytes, files: r.files }))} />
              ) : (
                <p className="text-[14px] text-ink-muted">Nothing removed yet.</p>
              )}
            </Card>
            <Card>
              <CardTitle>By type of file</CardTitle>
              {p.byKind.length ? (
                <Bars rows={p.byKind.map((r) => ({ key: r.key, label: KIND_LABEL[r.key] ?? r.key, colour: KIND_COLOUR[r.key] ?? "#64748B", bytes: r.bytes, files: r.files }))} />
              ) : (
                <p className="text-[14px] text-ink-muted">Nothing removed yet.</p>
              )}
            </Card>
          </div>

          <Card className="mt-6" pad={false}>
            <div className="px-5 pt-5 sm:px-6">
              <CardTitle aside={<LinkButton href="/bin" variant="ghost">Staging bin</LinkButton>}>Recent activity</CardTitle>
            </div>
            <ul className="divide-y divide-line text-[14px]">
              {p.recent.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                  <span className="w-20 shrink-0 text-[12px] font-medium uppercase tracking-wide text-ink-muted">{ACTION_TEXT[a.kind] ?? a.kind}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{a.kind === "rename" && a.from ? `${a.from} → ${a.name}` : a.name}</span>
                    <span className="block truncate text-[12px] text-ink-muted">
                      {a.drive ?? "—"}
                      {a.reason ? ` · ${REASON_LABEL[a.reason] ?? a.reason}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[12px] text-ink-muted">
                    {a.bytes && a.kind === "trash" ? <b className="block text-ink">{bytes(a.bytes)}</b> : null}
                    {ago(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
