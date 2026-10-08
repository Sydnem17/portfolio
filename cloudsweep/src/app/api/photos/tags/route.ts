import { handler } from "@/lib/api";
import { BROWSER_TAGGER, BrowserTagsBody, saveBrowserTags } from "@/lib/photos/browser-tags";

export const POST = handler(async (req: Request) => {
  const body = BrowserTagsBody.parse(await req.json());
  // A tab opened before an update still runs the old rules; don't let it overwrite better tags.
  if (body.tagger !== BROWSER_TAGGER) return Response.json({ error: "CloudSweep has been updated — refresh the page to keep tagging." }, { status: 409 });
  return saveBrowserTags(body.tags);
});

export const dynamic = "force-dynamic";
