import { handler } from "@/lib/api";
import { createJob } from "@/lib/jobs";

export const POST = handler(async (_req: Request, { params }: { params: { id: string } }) => ({ job: await createJob("scan", params.id) }));

export const dynamic = "force-dynamic";
