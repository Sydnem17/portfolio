import { NextResponse } from "next/server";
import { saveConnectedAccount } from "@/lib/accounts";
import { appUrl } from "@/lib/api";
import { verify } from "@/lib/crypto";
import { createJob } from "@/lib/jobs";
import { getProvider } from "@/lib/providers";

export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/accounts?${q}`, req.url));
  const err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (err) return back(`error=${encodeURIComponent(err)}`);

  const state = url.searchParams.get("state");
  const cookie = req.headers.get("cookie")?.match(/cs_oauth_state=([^;]+)/)?.[1];
  const payload = verify(state);
  if (!payload || !cookie || decodeURIComponent(cookie) !== state || !payload.startsWith(`${params.provider}.`)) return back("error=Sign-in%20expired.%20Please%20try%20again.");

  try {
    const provider = getProvider(params.provider);
    const tokens = await provider.exchangeCode(url.searchParams.get("code") ?? "", `${appUrl(req)}/api/oauth/${params.provider}`);
    if (!tokens.refreshToken) return back("error=The%20provider%20did%20not%20grant%20offline%20access.%20Remove%20CloudSweep%20from%20your%20account%20permissions%20and%20connect%20again.");
    const id = await saveConnectedAccount(params.provider, tokens);
    await createJob("scan", id);
    const res = back(`connected=${id}`);
    res.cookies.delete("cs_oauth_state");
    return res;
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
}

export const dynamic = "force-dynamic";
