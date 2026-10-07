import { LibraryView } from "@/components/LibraryView";
import { listAccounts } from "@/lib/accounts";

export default async function Library() {
  const accounts = await listAccounts();
  return <LibraryView accounts={accounts.map((a) => ({ id: a.id, label: a.label, provider: a.provider }))} />;
}
