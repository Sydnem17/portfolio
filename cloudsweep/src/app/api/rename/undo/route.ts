import { z } from "zod";
import { handler } from "@/lib/api";
import { undoRenameBatch } from "@/lib/organise";

export const POST = handler(async (req: Request) => undoRenameBatch(z.object({ batch: z.string() }).parse(await req.json()).batch));

export const dynamic = "force-dynamic";
