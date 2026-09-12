import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Reachable without a session. GUEST_ONLY additionally bounce a signed-in user
// back to the app; the others are fine to visit either way.
const GUEST_ONLY = ["/login", "/register"];
const ALSO_PUBLIC = ["/forgot-password", "/reset-password"];

const matches = (pathname: string, list: string[]) =>
  list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Lightweight gate. Only checks for the presence of the session cookie — the
 * token is properly verified (and the user loaded) in `getCurrentUser()` on the
 * server. Runs before rendering; see Next 16 `proxy.ts` (formerly middleware).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = matches(pathname, GUEST_ONLY) || matches(pathname, ALSO_PUBLIC);

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && matches(pathname, GUEST_ONLY)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Pages only. API routes do their own auth checks and return JSON 401s
  // rather than an HTML redirect.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
