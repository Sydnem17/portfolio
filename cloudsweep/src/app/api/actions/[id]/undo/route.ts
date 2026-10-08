import { handler } from "@/lib/api";
import { undoAction } from "@/lib/undo";

export const POST = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  await undoAction(Number(params.id));
  return { ok: true };
});

export const dynamic = "force-dynamic";
