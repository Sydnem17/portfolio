import { handler } from "@/lib/api";
import { RenameBody, startRename } from "@/lib/organise";

export const POST = handler(async (req: Request) => startRename(RenameBody.parse(await req.json()).renames));

export const dynamic = "force-dynamic";
