import { DuplicatesView } from "@/components/DuplicatesView";
import { listAccounts } from "@/lib/accounts";

export default async function Duplicates() {
  const accounts = await listAccounts();
  return <DuplicatesView accounts={accounts.map((a) => ({ id: a.id, label: a.label, provider: a.provider }))} />;
}
