import { z } from "zod";
import { handler } from "@/lib/api";
import { createJob } from "@/lib/jobs";

const Body = z.object({ itemIds: z.array(z.string()).min(1).max(20000), reason: z.string().max(100).optional(), permanent: z.boolean().optional() });

/** Moves items to their provider's trash/recycle bin (recoverable) as a resumable job. */
export const POST = handler(async (req: Request) => {
  const body = Body.parse(await req.json());
  return { job: await createJob("trash", null, body, { done: 0, total: body.itemIds.length }) };
});

export const dynamic = "force-dynamic";
