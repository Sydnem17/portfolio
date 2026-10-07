import { contextFor } from "@/lib/accounts";
import { one } from "@/lib/db";
import { toJpeg } from "@/lib/photos/phash";
import { getProvider } from "@/lib/providers";

/** Thumbnail proxy: provider thumbnail URLs need the account's token, so the server fetches them. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const it = await one<any>("SELECT i.account_id, i.remote_id, a.provider FROM items i JOIN accounts a ON a.id = i.account_id WHERE i.id = $1", [params.id]);
  if (!it) return new Response("Not found", { status: 404 });
  const raw = await getProvider(it.provider).thumbnail(await contextFor(it.account_id), { remoteId: it.remote_id }).catch(() => null);
  const img = raw ? await toJpeg(raw, 400) : null;
  if (!img) return new Response("No thumbnail", { status: 404 });
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
}

export const dynamic = "force-dynamic";
