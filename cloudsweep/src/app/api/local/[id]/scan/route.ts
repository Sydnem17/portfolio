import { z } from "zod";
import { handler } from "@/lib/api";
import { ingestLocalScan } from "@/lib/local";

const Body = z.object({
  scanId: z.string().min(8).max(64),
  done: z.boolean(),
  entries: z
    .array(z.object({ path: z.string().max(2000), isFolder: z.boolean(), size: z.number().nonnegative(), modifiedAt: z.string().nullable() }))
    .max(2000),
});

/** Receives one batch of a folder walk done in the browser. */
export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const b = Body.parse(await req.json());
  return ingestLocalScan(params.id, b.scanId, b.entries, b.done);
});

export const dynamic = "force-dynamic";
