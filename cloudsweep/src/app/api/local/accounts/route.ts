import { z } from "zod";
import { handler } from "@/lib/api";
import { createLocalAccount } from "@/lib/local";

const Body = z.object({ folderName: z.string().max(200) });

export const POST = handler(async (req: Request) => createLocalAccount(Body.parse(await req.json()).folderName));

export const dynamic = "force-dynamic";
