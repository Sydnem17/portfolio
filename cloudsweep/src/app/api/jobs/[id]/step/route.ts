import { handler } from "@/lib/api";
import { runStep } from "@/lib/jobs";

export const maxDuration = 60;
export const POST = handler(async (_req: Request, { params }: { params: { id: string } }) => ({ job: await runStep(params.id) }));

export const dynamic = "force-dynamic";
