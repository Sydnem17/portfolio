import { z } from "zod";
import { handler } from "@/lib/api";
import { recordLocalPurged } from "@/lib/purge";

const Body = z.object({ actionIds: z.array(z.number().int()).max(5000).optional(), itemIds: z.array(z.string()).max(5000).optional(), reason: z.string().max(40).optional() });

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => recordLocalPurged(params.id, Body.parse(await req.json())));

export const dynamic = "force-dynamic";
