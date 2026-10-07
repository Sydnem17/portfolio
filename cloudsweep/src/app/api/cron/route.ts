import { NextResponse } from "next/server";
import { runPendingSteps } from "@/lib/jobs";

export const maxDuration = 60;

/** Advances running jobs while nobody has the site open. Call every few minutes from a scheduler. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json({ steps: await runPendingSteps(45_000) });
}

export const dynamic = "force-dynamic";
