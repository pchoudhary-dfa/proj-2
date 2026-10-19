import { getAuthCookieName, getRefreshCookieName } from "@/lib/auth/cookie";
import { buildLoginRedirectTarget, validateReturnUrl } from "@/lib/auth/returnUrl";
import {
  FALLBACK_DEFAULT_LOCALE,
  buildLocaleAppPath,
} from "@/lib/constants";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LOGIN_PATH = "/";
const LOCALE_SEGMENT_REGEX = /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/;

const PERMISSIONS_COOKIE = "dfa_permissions_summary";

const ROUTE_PERMISSION_MAP: Record<string, string[]> = {
  administration: ["iam_user", "iam_role", "sys_email", "sys_help_admin", "sys_settings"],
  logs: ["sys_email_logs", "sys_error_logs", "sys_email"],
  translations: ["sys_language_management"],
};

function hasRoutePermission(
  permSummary: string[],
  routeKey: string
): boolean {
  if (permSummary.includes("__super_admin__")) return true;
  const required = ROUTE_PERMISSION_MAP[routeKey];
  if (!required) return true;
  return required.some((code) => permSummary.includes(code));
}

async function getDefaultLocaleFromBootstrap(request: NextRequest): Promise<string> {
  try {
    const url = new URL("/api/bootstrap/default-locale", request.nextUrl.origin);
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return FALLBACK_DEFAULT_LOCALE;
    const data = (await res.json()) as { locale?: string };
    const loc = data.locale?.trim();
    if (loc && /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(loc)) return loc;
    return FALLBACK_DEFAULT_LOCALE;
  } catch {
    return FALLBACK_DEFAULT_LOCALE;
  }
}

/**
 * Auth + locale-aware login:
 * - `/` is handled by the root Server Component (redirect to /{defaultLocale}).
 * - `/login` redirects to `/{defaultLocale}` (or datawarehouse if already authenticated).
 * - `/{locale}` is the login UI; authenticated users are sent to `/{locale}/datawarehouse`.
 * - Other routes require auth; unauthenticated users go to `/{defaultLocale}`.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const routeParam = request.nextUrl.searchParams.get("route");
  const hasResetToken = !!request.nextUrl.searchParams.get("token");
  const isResetPasswordRequest =
    routeParam === "reset-password" || hasResetToken;

  if (path.startsWith("/api/") || path.startsWith("/_next") || path.startsWith("/auth/sso/")) {
    return NextResponse.next();
  }

  if (path === "/reset-password") {
    const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value?.trim();
    const locale =
      cookieLocale && LOCALE_SEGMENT_REGEX.test(cookieLocale)
        ? cookieLocale
        : await getDefaultLocaleFromBootstrap(request);
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}`;
    redirectUrl.searchParams.delete("mode");
    redirectUrl.searchParams.set("route", "reset-password");
    return NextResponse.redirect(redirectUrl);
  }

  const segments = path.split("/").filter(Boolean);
  const token =
    request.cookies.get(getAuthCookieName())?.value ||
    request.cookies.get(getRefreshCookieName())?.value;

  const isRoot = path === LOGIN_PATH || path === "";
  const isLocaleHome =
    segments.length === 1 &&
    LOCALE_SEGMENT_REGEX.test(segments[0] ?? "");

  if (path === "/login") {
    const defaultLocale = await getDefaultLocaleFromBootstrap(request);
    if (token) {
      return NextResponse.redirect(
        new URL(buildLocaleAppPath(defaultLocale, "datawarehouse"), request.url)
      );
    }
    return NextResponse.redirect(new URL(`/${defaultLocale}`, request.url));
  }

  if (isRoot) {
    if (isResetPasswordRequest) {
      const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value?.trim();
      const locale =
        cookieLocale && LOCALE_SEGMENT_REGEX.test(cookieLocale)
          ? cookieLocale
          : await getDefaultLocaleFromBootstrap(request);
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/${locale}`;
      if (!redirectUrl.searchParams.has("route")) {
        redirectUrl.searchParams.set("route", "reset-password");
      }
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  if (isLocaleHome) {
    const locale = segments[0]!;
    if (token && !isResetPasswordRequest) {
      const defaultDest = buildLocaleAppPath(locale, "datawarehouse");
      const returnUrlParam = request.nextUrl.searchParams.get("returnUrl");
      const destination = returnUrlParam
        ? validateReturnUrl(returnUrlParam, defaultDest)
        : defaultDest;
      const res = NextResponse.redirect(new URL(destination, request.url));
      res.cookies.set("NEXT_LOCALE", locale, { path: "/" });
      return res;
    }
    // Normalize: if a reset token is present but `route=reset-password` is missing, redirect to add it.
    if (hasResetToken && routeParam !== "reset-password") {
      const normalized = request.nextUrl.clone();
      normalized.searchParams.set("route", "reset-password");
      const res = NextResponse.redirect(normalized);
      res.cookies.set("NEXT_LOCALE", locale, { path: "/" });
      return res;
    }
    const res = NextResponse.next();
    res.cookies.set("NEXT_LOCALE", locale, { path: "/" });
    return res;
  }

  if (!token) {
    const defaultLocale = await getDefaultLocaleFromBootstrap(request);
    const localeFromPath = segments[0];
    const loginLocale =
      localeFromPath && LOCALE_SEGMENT_REGEX.test(localeFromPath)
        ? localeFromPath
        : defaultLocale;
    const returnTarget = buildLoginRedirectTarget(path, request.nextUrl.search);
    const loginUrl = new URL(`/${loginLocale}`, request.url);
    if (returnTarget) {
      loginUrl.searchParams.set("returnUrl", returnTarget);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Permission-based route protection for app-level pages
  const routeSegment = segments[1];
  if (
    routeSegment &&
    ROUTE_PERMISSION_MAP[routeSegment]
  ) {
    const permCookie = request.cookies.get(PERMISSIONS_COOKIE)?.value;
    if (permCookie) {
      try {
        const summary = JSON.parse(permCookie) as string[];
        if (!hasRoutePermission(summary, routeSegment)) {
          const locale = segments[0] ?? FALLBACK_DEFAULT_LOCALE;
          return NextResponse.redirect(
            new URL(buildLocaleAppPath(locale, "datawarehouse"), request.url)
          );
        }
      } catch {
        // Malformed cookie — allow through; client-side guard will handle
      }
    }
  }

  const localeFromPath = segments[0];
  if (localeFromPath && LOCALE_SEGMENT_REGEX.test(localeFromPath)) {
    const res = NextResponse.next();
    res.cookies.set("NEXT_LOCALE", localeFromPath, { path: "/" });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
