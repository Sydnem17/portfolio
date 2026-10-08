import { z } from "zod";
import { handler } from "@/lib/api";
import { recordLocalRenamed } from "@/lib/local";

const Body = z.object({
  renames: z.array(z.object({ id: z.string(), from: z.string().max(255), to: z.string().min(1).max(255) })).max(5000),
  batch: z.string().optional(),
  undoOf: z.string().optional(),
});

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const b = Body.parse(await req.json());
  return recordLocalRenamed(params.id, b.renames, { batch: b.batch, undoOf: b.undoOf });
});

export const dynamic = "force-dynamic";
