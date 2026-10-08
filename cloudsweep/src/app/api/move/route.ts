import { handler } from "@/lib/api";
import { MoveBody, startMove } from "@/lib/organise";

export const POST = handler(async (req: Request) => ({ job: await startMove(MoveBody.parse(await req.json())) }));

export const dynamic = "force-dynamic";
