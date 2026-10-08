import { contextFor } from "@/lib/accounts";
import { num, one } from "@/lib/db";
import { getProvider } from "@/lib/providers";

export const maxDuration = 30;
const MAX_CHUNK = 4 * 1024 * 1024;

const GUESS: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", pdf: "application/pdf",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", csv: "text/plain; charset=utf-8", json: "text/plain; charset=utf-8",
};

/**
 * Streams a file for in-browser preview with HTTP Range support, so video seeks and plays
 * without downloading the whole file. Content is proxied, never stored.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const it = await one<any>("SELECT i.account_id, i.remote_id, i.size, i.mime, i.name, a.provider FROM items i JOIN accounts a ON a.id = i.account_id WHERE i.id = $1", [params.id]);
  if (!it) return new Response("Not found", { status: 404 });
  if (it.provider === "local") return new Response("This file is on your computer; open it from File Explorer.", { status: 409 });
  const size = num(it.size);
  if (!size) return new Response("Empty file", { status: 404 });
  const ext = String(it.name).toLowerCase().split(".").pop() ?? "";
  const type = GUESS[ext] ?? it.mime ?? "application/octet-stream";

  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  const start = m?.[1] ? Number(m[1]) : 0;
  const end = Math.min(m?.[2] ? Number(m[2]) : start + MAX_CHUNK - 1, start + MAX_CHUNK - 1, size - 1);
  if (start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });

  const data = await getProvider(it.provider).downloadRange(await contextFor(it.account_id), it.remote_id, start, end);
  const partial = Boolean(m) || data.length < size;
  return new Response(new Uint8Array(data), {
    status: partial ? 206 : 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(data.length),
      "Accept-Ranges": "bytes",
      ...(partial ? { "Content-Range": `bytes ${start}-${start + data.length - 1}/${size}` } : {}),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(it.name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
