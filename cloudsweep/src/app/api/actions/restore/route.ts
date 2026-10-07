import { z } from "zod";
import { handler } from "@/lib/api";
import { undoAction } from "@/lib/undo";

const Body = z.object({ ids: z.array(z.number().int()).min(1).max(100) });

/** Restores up to 100 staged items per call; the client calls again for larger batches. */
export const POST = handler(async (req: Request) => {
  const { ids } = Body.parse(await req.json());
  const failed: Array<{ id: number; error: string }> = [];
  for (const id of ids) await undoAction(id).catch((e) => failed.push({ id, error: (e as Error).message }));
  return { restored: ids.length - failed.length, failed };
});

export const dynamic = "force-dynamic";
