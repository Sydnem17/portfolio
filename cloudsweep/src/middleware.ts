import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "./lib/session";

/**
 * Public: sign-in, the welcome and privacy pages (Google and Microsoft review these before
 * approving the app) and the cron endpoint (it checks its own secret). Everything else needs a session.
 */
const PUBLIC = new Set(["/login", "/welcome", "/privacy", "/api/cron"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.has(pathname) || pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  // Signed-out visitors to the home page see what the app is, not a bare login form.
  if (pathname === "/") return NextResponse.rewrite(new URL("/welcome", req.url));
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.svg).*)"] };
