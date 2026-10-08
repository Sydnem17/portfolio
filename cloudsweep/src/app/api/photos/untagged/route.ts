import { handler } from "@/lib/api";
import { untaggedPhotos } from "@/lib/photos/browser-tags";

/** Photos the free in-browser AI hasn't looked at yet. */
export const GET = handler(async (req: Request) => untaggedPhotos(Math.min(100, Number(new URL(req.url).searchParams.get("limit")) || 24)));

export const dynamic = "force-dynamic";
