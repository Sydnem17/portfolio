import { handler } from "@/lib/api";
import { createFolder, FolderBody } from "@/lib/organise";

export const POST = handler(async (req: Request) => {
  const b = FolderBody.parse(await req.json());
  return createFolder(b.accountId, b.path);
});

export const dynamic = "force-dynamic";
