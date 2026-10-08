import { contextFor } from "@/lib/accounts";
import { one } from "@/lib/db";
import { toJpeg } from "@/lib/photos/phash";
import { getProvider } from "@/lib/providers";

/** Thumbnail proxy: provider thumbnail URLs need the account's token, so the server fetches them. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const it = await one<any>("SELECT i.account_id, i.remote_id, a.provider FROM items i JOIN accounts a ON a.id = i.account_id WHERE i.id = $1", [params.id]);
  if (!it) return new Response("Not found", { status: 404 });
  if (it.provider === "local") return new Response(LOCAL_PLACEHOLDER, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=86400" } });
  const raw = await getProvider(it.provider).thumbnail(await contextFor(it.account_id), { remoteId: it.remote_id }).catch(() => null);
  const img = raw ? await toJpeg(raw, 400) : null;
  if (!img) return new Response("No thumbnail", { status: 404 });
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
}

export const dynamic = "force-dynamic";

/** Local files stay on the computer, so their thumbnails are a neutral "on this computer" tile. */
const LOCAL_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="#EEF2FF"/><rect x="44" y="50" width="72" height="48" rx="6" fill="none" stroke="#2F5BFF" stroke-width="6"/><path d="M64 112h32M80 98v14" stroke="#2F5BFF" stroke-width="6" stroke-linecap="round"/></svg>`;
