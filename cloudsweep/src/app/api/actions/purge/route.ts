import { z } from "zod";
import { handler } from "@/lib/api";
import { purgeStaged } from "@/lib/purge";

const Body = z.object({ ids: z.array(z.number().int()).min(1).max(100) });

/** Permanently deletes up to 100 Staging-bin items per call; the client calls again for more. */
export const POST = handler(async (req: Request) => purgeStaged(Body.parse(await req.json()).ids));

export const dynamic = "force-dynamic";
