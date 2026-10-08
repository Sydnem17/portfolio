import { z } from "zod";
import { handler } from "@/lib/api";
import { recordLocalRestored } from "@/lib/local";

const Body = z.object({ actionIds: z.array(z.number().int()).max(5000) });

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => recordLocalRestored(params.id, Body.parse(await req.json()).actionIds));

export const dynamic = "force-dynamic";
