import { AccountRow } from "@/components/AccountRow";
import { AddLocalFolder } from "@/components/AddLocalFolder";
import { DemoButton } from "@/components/DemoButton";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { listAccounts } from "@/lib/accounts";
import { num, query } from "@/lib/db";
import { accountColour, PROVIDER_COLOUR } from "@/lib/format";
import { PROVIDERS } from "@/lib/providers";

export default async function Accounts({ searchParams }: { searchParams: { error?: string; connected?: string } }) {
  const accounts = await listAccounts();
  const counts = new Map(
    (await query<any>("SELECT account_id, COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM items WHERE NOT trashed GROUP BY account_id")).map((r) => [r.account_id, { n: num(r.n), bytes: num(r.bytes) }]),
  );
  const available = Object.values(PROVIDERS).filter((p) => p.id !== "demo" && p.id !== "local");

  return (
    <>
      <PageHeader
        title="Storage accounts"
        intro="Connect as many drives as you like — several Google accounts, personal and work OneDrive, Dropbox, and folders or USB drives on this computer. Give each one a name you'll recognise with ✎ Rename. Every tool works across all of them."
      />
      {searchParams.error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-800">{searchParams.error}</div>}
      {searchParams.connected && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-800">Connected. The first scan is running — progress shows in the bottom corner.</div>
      )}

      {accounts.length > 0 && (
        <Card pad={false} className="mb-8">
          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <AccountRow key={a.id} account={{ ...a, files: counts.get(a.id)?.n ?? 0, bytes: counts.get(a.id)?.bytes ?? 0, colour: accountColour(a.provider, a.label), providerName: PROVIDERS[a.provider as keyof typeof PROVIDERS]?.name ?? a.provider }} />
            ))}
          </ul>
        </Card>
      )}

      <CardTitle>Add storage</CardTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {available.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full" style={{ background: PROVIDER_COLOUR[p.id] }} />
              <h3 className="text-[16px] font-semibold">{p.name}</h3>
              {!p.isConfigured() && <Badge tone="warn">Setup needed</Badge>}
            </div>
            <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-muted">{p.blurb}</p>
            {p.isConfigured() ? (
              <a href={`/api/connect/${p.id}`} className="mt-4 inline-flex justify-center rounded-xl bg-ink px-4 py-2.5 text-[14px] font-medium text-white hover:bg-black">
                Connect {p.name}
              </a>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-ink-muted">
                Add the {p.name} app credentials to the site’s environment variables. The README has click-by-click steps.
              </p>
            )}
          </Card>
        ))}
        <Card className="flex flex-col">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full" style={{ background: PROVIDER_COLOUR.local }} />
            <h3 className="text-[16px] font-semibold">This computer</h3>
            <Badge tone="brand">New</Badge>
          </div>
          <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-muted">{PROVIDERS.local.blurb}</p>
          <AddLocalFolder />
        </Card>
        <Card className="flex flex-col border-dashed">
          <h3 className="text-[16px] font-semibold">Demo library</h3>
          <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-muted">{PROVIDERS.demo.blurb}</p>
          <div className="mt-4">
            <DemoButton variant="ghost" />
          </div>
        </Card>
      </div>
      <p className="mt-6 text-[13px] leading-relaxed text-ink-muted">
        Need another service (Box, iCloud, pCloud, S3, WebDAV)? Each one is a single adapter file implementing the same contract — see <code className="rounded bg-slate-100 px-1">src/lib/providers</code>.
      </p>
    </>
  );
}
