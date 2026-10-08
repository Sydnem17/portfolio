import { z } from "zod";
import { handler } from "@/lib/api";
import { recordLocalFolder } from "@/lib/local";
import { cleanFolderPath } from "@/lib/organise";

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) =>
  recordLocalFolder(params.id, cleanFolderPath(z.object({ path: z.string().max(400) }).parse(await req.json()).path)),
);

export const dynamic = "force-dynamic";
