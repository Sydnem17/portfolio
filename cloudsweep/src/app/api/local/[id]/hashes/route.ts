import { z } from "zod";
import { handler } from "@/lib/api";
import { saveLocalHashes } from "@/lib/local";

const Body = z.object({
  hashes: z
    .array(z.object({ itemId: z.string(), md5: z.string().regex(/^[0-9a-f]{32}$/i), sha1: z.string().regex(/^[0-9a-f]{40}$/i), sha256: z.string().regex(/^[0-9a-f]{64}$/i), quickXor: z.string().length(28) }))
    .max(500),
});

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => saveLocalHashes(params.id, Body.parse(await req.json()).hashes));

export const dynamic = "force-dynamic";
