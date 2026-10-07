import { handler } from "@/lib/api";
import { startConsolidation } from "@/lib/consolidate";
import { ConsolidateBody } from "./schema";

export const POST = handler(async (req: Request) => ({ job: await startConsolidation(ConsolidateBody.parse(await req.json())) }));

export const dynamic = "force-dynamic";
