import { handler } from "@/lib/api";
import { renameSources, Selection } from "@/lib/organise";

/** Details of the selected files for the rename preview (dates, places, folders, neighbouring names). */
export const POST = handler(async (req: Request) => renameSources(Selection.parse(await req.json())));

export const dynamic = "force-dynamic";
