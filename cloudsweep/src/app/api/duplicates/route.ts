import { handler } from "@/lib/api";
import { getDuplicateReport } from "@/lib/report";

export const GET = handler(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  return getDuplicateReport({
    confidence: u.get("confidence") ?? undefined,
    kind: u.get("kind") ?? undefined,
    account: u.get("account") ?? undefined,
    minSize: Number(u.get("minSize") ?? 0) || undefined,
    q: u.get("q") ?? undefined,
  });
});

export const dynamic = "force-dynamic";
