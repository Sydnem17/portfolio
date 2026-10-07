import { timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/session";

const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.APP_PASSWORD;
  if (!expected || !process.env.APP_SECRET) return NextResponse.json({ error: "Server is missing APP_PASSWORD or APP_SECRET." }, { status: 500 });
  const h = (s: string) => createHash("sha256").update(s).digest();
  if (!password || !timingSafeEqual(h(password), h(expected))) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  attempts.delete(ip);
  const s = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, s.value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: s.maxAge, path: "/" });
  return res;
}

export const dynamic = "force-dynamic";
