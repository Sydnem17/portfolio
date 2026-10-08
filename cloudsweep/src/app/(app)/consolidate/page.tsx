import { ConsolidateWizard } from "@/components/ConsolidateWizard";
import { Empty, PageHeader } from "@/components/ui";
import { listAccounts } from "@/lib/accounts";

export default async function Consolidate() {
  // Copying from or to folders on this computer is planned for a later update.
  const accounts = (await listAccounts()).filter((a) => a.provider !== "local");
  if (accounts.length < 2)
    return (
      <>
        <PageHeader title="Consolidate" />
        <Empty title="Connect at least two drives" body="Consolidation moves or copies files from one cloud into another. Add a second storage account (or load the demo library) to start." />
      </>
    );
  return <ConsolidateWizard accounts={accounts.map((a) => ({ id: a.id, label: a.label, provider: a.provider, free: a.quota_total != null && a.quota_used != null ? a.quota_total - a.quota_used : null, isPrimary: a.is_primary }))} />;
}
