import { createDemoAccounts } from "@/lib/accounts";
import { handler } from "@/lib/api";
import { createJob } from "@/lib/jobs";

export const POST = handler(async () => {
  const ids = await createDemoAccounts();
  const jobs = await Promise.all(ids.map((id) => createJob("scan", id)));
  return { accounts: ids, jobs };
});

export const dynamic = "force-dynamic";
