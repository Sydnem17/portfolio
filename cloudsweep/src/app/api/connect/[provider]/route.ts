import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/api";
import { sign } from "@/lib/crypto";
import { getProvider } from "@/lib/providers";

/** Starts OAuth. The state value is signed and also pinned in a short-lived cookie (CSRF protection). */
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const provider = getProvider(params.provider);
  if (!provider.isConfigured()) return NextResponse.redirect(new URL(`/accounts?error=${encodeURIComponent(`${provider.name} is not configured on the server yet. See README → Connect your storage.`)}`, req.url));
  const state = sign(`${params.provider}.${randomBytes(16).toString("hex")}`);
  const res = NextResponse.redirect(provider.authorizeUrl(state, `${appUrl(req)}/api/oauth/${params.provider}`));
  res.cookies.set("cs_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return res;
}

export const dynamic = "force-dynamic";
