import { z } from "zod";
import { handler } from "@/lib/api";
import { recordLocalStaged } from "@/lib/local";

const Body = z.object({ moves: z.array(z.object({ itemId: z.string(), stagedPath: z.string().max(2000) })).max(5000), reason: z.string().max(40).optional() });

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const b = Body.parse(await req.json());
  return recordLocalStaged(params.id, b.moves, b.reason);
});

export const dynamic = "force-dynamic";
