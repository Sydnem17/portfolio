import { listAccounts } from "@/lib/accounts";
import { handler } from "@/lib/api";
import { createJob } from "@/lib/jobs";

export const POST = handler(async () => ({ jobs: await Promise.all((await listAccounts()).filter((a) => a.provider !== "local").map((a) => createJob("scan", a.id))) }));

export const dynamic = "force-dynamic";
