import { handler } from "@/lib/api";
import { BrowserTagsBody, saveBrowserTags } from "@/lib/photos/browser-tags";

export const POST = handler(async (req: Request) => saveBrowserTags(BrowserTagsBody.parse(await req.json()).tags));

export const dynamic = "force-dynamic";
