import { handler } from "@/lib/api";
import { cancelJob, getJob } from "@/lib/jobs";

export const GET = handler(async (_req: Request, { params }: { params: { id: string } }) => ({ job: await getJob(params.id) }));
export const DELETE = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  await cancelJob(params.id);
  return { ok: true };
});

export const dynamic = "force-dynamic";
