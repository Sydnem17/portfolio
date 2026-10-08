import { z } from "zod";
import { handler } from "@/lib/api";
import { createJob, listJobs } from "@/lib/jobs";

export const GET = handler(async () => ({ jobs: await listJobs() }));

const Body = z.object({ type: z.enum(["verify", "analyse"]) });
export const POST = handler(async (req: Request) => {
  const { type } = Body.parse(await req.json());
  return { job: await createJob(type, null) };
});

export const dynamic = "force-dynamic";
