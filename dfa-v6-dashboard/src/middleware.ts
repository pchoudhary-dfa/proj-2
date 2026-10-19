import { getAuthCookieName, getRefreshCookieName } from "@/lib/auth/cookie";
import {
  buildLocaleAppPath,
  getLocaleFromPathname,
  isLocaleLoginPath,
} from "@/lib/constants";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LOGIN_PATH = "/";

/**
 * Auth-aware middleware:
 * - /api/* and /_next/* pass through untouched.
 * - / and /{locale} are login surfaces (locale root requires no session).
 * - Authenticated users on /{locale} are sent to /{locale}/dashboard.
 * - All other routes require a dfa_access or dfa_refresh cookie; unauthenticated
 *   users are redirected to /.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/") || path.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (path === LOGIN_PATH || path === "") {
    return NextResponse.next();
  }

  if (path === "/reset-password") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.delete("mode");
    redirectUrl.searchParams.set("route", "reset-password");
    return NextResponse.redirect(redirectUrl);
  }

  const token =
    request.cookies.get(getAuthCookieName())?.value ||
    request.cookies.get(getRefreshCookieName())?.value;

  if (isLocaleLoginPath(path)) {
    if (token) {
      const locale = getLocaleFromPathname(path);
      return NextResponse.redirect(
        new URL(buildLocaleAppPath(locale, "dashboard"), request.url)
      );
    }
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
