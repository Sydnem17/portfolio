import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "./lib/session";

/** Everything except the login page, the cron endpoint (own bearer secret) and static assets needs a session. */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/") || pathname === "/api/cron") return NextResponse.next();
  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.svg).*)"] };
