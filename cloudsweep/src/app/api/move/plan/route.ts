import { handler } from "@/lib/api";
import { MoveBody, planMove, summariseMove } from "@/lib/organise";

export const POST = handler(async (req: Request) => summariseMove(await planMove(MoveBody.parse(await req.json()))));

export const dynamic = "force-dynamic";
