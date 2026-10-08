import { StagingBin } from "@/components/StagingBin";
import { PageHeader } from "@/components/ui";
import { num, query } from "@/lib/db";

export default async function Bin() {
  const staged = await query<any>(
    `SELECT a.id, a.name, a.bytes, a.detail, a.created_at, a.account_id, acc.label, acc.provider
     FROM actions a JOIN accounts acc ON acc.id = a.account_id WHERE a.kind = 'trash' AND NOT a.undone ORDER BY a.id DESC LIMIT 2000`,
  );
  const history = await query<any>(
    `SELECT a.id, a.kind, a.name, a.bytes, a.undone, a.created_at, a.detail, acc.label FROM actions a LEFT JOIN accounts acc ON acc.id = a.account_id
     WHERE a.kind <> 'trash' OR a.undone ORDER BY a.id DESC LIMIT 100`,
  );
  return (
    <>
      <PageHeader
        title="Staging bin"
        intro="Everything CloudSweep removes lands here first, across every drive. Restore anything in one click. Each provider permanently deletes its trash on its own schedule (usually 30 days), so nothing is wiped by surprise."
      />
      <StagingBin
        items={staged.map((r) => ({ id: Number(r.id), name: r.name, bytes: num(r.bytes), path: r.detail?.path ?? "", reason: r.detail?.reason ?? "", at: new Date(r.created_at).toISOString(), account: r.label, provider: r.provider }))}
        history={history.map((r) => ({ id: Number(r.id), kind: r.kind, name: r.name, bytes: num(r.bytes), undone: r.undone, at: new Date(r.created_at).toISOString(), account: r.label, to: r.detail?.to ?? null }))}
      />
    </>
  );
}
