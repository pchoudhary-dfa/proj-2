import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, locales } from "@/lib/i18n/config";
import * as constants from "@/lib/constants";
import { buildLoginRedirectTarget, validateReturnUrl } from "@/lib/auth/returnUrl";
import { isAccessTokenExpired } from "@/lib/auth/jwt";
import { DFA_ACCESS_COOKIE } from "@/lib/sso/constants";
import { unwrapAppConfigValue } from "@/lib/appConfig/utils";

function getLocaleFromPathname(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (!first) return null;
  return locales.includes(first as (typeof locales)[number]) ? first : null;
}

/** Routes under /{locale}/ that do not require sign-in (gallery remains protected). */
function isPublicAppRoute(segments: string[]): boolean {
  if (segments.length === 1) return true;
  const routeSegment = segments[1];
  return routeSegment === "visualizer" || routeSegment === "visualize";
}

function pickBestLocale(req: NextRequest): string {
  const cookieLocale = req.cookies.get("NEXT_LOCALE")?.value;
  if (cookieLocale && locales.includes(cookieLocale as (typeof locales)[number])) {
    return cookieLocale;
  }

  const accept = req.headers.get("accept-language") || "";
  const requested = accept
    .split(",")
    .map((p) => p.trim().split(";")[0])
    .filter(Boolean)
    .map((tag) => tag.split("-")[0].toLowerCase());

  for (const lang of requested) {
    if (locales.includes(lang as (typeof locales)[number])) return lang;
  }

  return defaultLocale;
}

/** 
 * Check if user is authenticated by looking for httpOnly access token cookie.
 * SSO and local auth both set this cookie via BFF routes.
 */
function isAuthenticated(req: NextRequest): boolean {
  // Check for httpOnly access token cookie (SSO + local auth)
  const accessToken = req.cookies.get(DFA_ACCESS_COOKIE)?.value;
  if (accessToken && !isAccessTokenExpired(accessToken)) return true;

  // Backward compatibility: check legacy localStorage-based token cookie
  const legacyToken = req.cookies.get(constants.AUTH_TOKEN_STORAGE_KEY)?.value;
  return !!legacyToken && !isAccessTokenExpired(legacyToken);
}

/**
 * Fetch LANGUAGE_DEFAULT from app-config.
 * Proxy on → /api/proxy (Node signs). Proxy off → direct API + browser/edge signing when configured.
 */
async function resolveDefaultLocale(requestOrigin?: string): Promise<string> {
  try {
    const proxyEnabled =
      process.env.NEXT_PUBLIC_ENABLE_API_PROXY?.toLowerCase() === "true";
    const pathWithQuery = "/app-config";
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    let url: string;
    if (proxyEnabled) {
      const origin =
        requestOrigin ??
        process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
        "http://localhost:3000";
      url = `${origin}/api/proxy/app-config`;
    } else {
      const base = (
        process.env.DFA_TOOLKIT_INTERNAL_API_URL ??
        process.env.NEXT_PUBLIC_API_BASE_URL ??
        "http://127.0.0.1:8000"
      ).replace(/\/$/, "");
      url = `${base}${pathWithQuery}`;
      const apiKey = process.env.NEXT_PUBLIC_API_KEY?.trim();
      if (apiKey) headers[constants.X_APP_KEY_HEADER] = apiKey;
      const pem = (process.env.NEXT_PUBLIC_API_SIGNING_PRIVATE_KEY ?? "").trim();
      const gate = (process.env.NEXT_PUBLIC_API_SIGNATURE ?? "").trim();
      if (pem && gate) {
        const { signRequest } = await import("@/lib/auth/signature");
        const { timestamp, signature } = await signRequest("GET", pathWithQuery, pem, gate);
        headers[constants.X_APP_TIMESTAMP_HEADER] = timestamp;
        headers[constants.X_APP_SIGNATURE_HEADER] = signature;
      }
    }

    const res = await fetch(url, {
      cache: "no-store",
      headers,
    });
    const json = (await res.json()) as { success?: boolean; data?: Record<string, unknown> };
    const lang = unwrapAppConfigValue(json?.data?.LANGUAGE_DEFAULT);
    if (lang && locales.includes(lang as (typeof locales)[number])) {
      return lang;
    }
  } catch {
    // ignore: use static default
  }
  return defaultLocale;
}

async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Handle /auth route without locale prefix
  if (pathname === "/auth") {
    const locale = await resolveDefaultLocale(req.nextUrl.origin);
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${locale}/auth`;
    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set("NEXT_LOCALE", locale, { path: "/" });
    return res;
  }

  // Legacy redirects: /signin, /register, /reset-password → /auth?route=X
  if (pathname === "/signin") {
    const locale = await resolveDefaultLocale(req.nextUrl.origin);
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${locale}/auth`;
    redirectUrl.searchParams.set("route", "signin");
    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set("NEXT_LOCALE", locale, { path: "/" });
    return res;
  }

  if (pathname === "/register") {
    const locale = await resolveDefaultLocale(req.nextUrl.origin);
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${locale}/auth`;
    redirectUrl.searchParams.set("route", "register");
    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set("NEXT_LOCALE", locale, { path: "/" });
    return res;
  }

  if (pathname === "/reset-password") {
    const locale = await resolveDefaultLocale(req.nextUrl.origin);
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = `/${locale}/auth`;
    redirectUrl.searchParams.set("route", "reset-password");
    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set("NEXT_LOCALE", locale, { path: "/" });
    return res;
  }

  if (pathname === "/" || pathname === "") {
    // Check if there's a reset token on root - redirect to auth with reset-password route
    const hasResetToken = !!req.nextUrl.searchParams.get("token");
    const locale = await resolveDefaultLocale(req.nextUrl.origin);
    const url = req.nextUrl.clone();
    
    if (hasResetToken) {
      url.pathname = `/${locale}/auth`;
      url.searchParams.set("route", "reset-password");
    } else {
      url.pathname = `/${locale}/`;
    }
    
    const res = NextResponse.redirect(url);
    res.cookies.set("NEXT_LOCALE", locale, { path: "/" });
    return res;
  }

  const localeInPath = getLocaleFromPathname(pathname);
  
  // Check if authenticated user is accessing /auth route
  if (localeInPath) {
    const segments = pathname.split("/").filter(Boolean);
    const routeSegment = segments[1]; // After locale
    
    if (routeSegment === "auth") {
      // Bypass auth check for SSO callback route (needed before cookies are set)
      if (segments[2] === "sso" && segments[3] === "callback") {
        const res = NextResponse.next();
        res.cookies.set("NEXT_LOCALE", localeInPath, { path: "/" });
        return res;
      }
      
      // Don't block auth route with reset token (user needs to set new password)
      const hasResetToken = !!req.nextUrl.searchParams.get("token");
      const routeParam = req.nextUrl.searchParams.get("route");
      
      if (isAuthenticated(req) && !(routeParam === "reset-password" && hasResetToken)) {
        const defaultDest = `/${localeInPath}/`;
        const returnUrlParam = req.nextUrl.searchParams.get("returnUrl");
        const destination = returnUrlParam
          ? validateReturnUrl(returnUrlParam, defaultDest)
          : defaultDest;
        return NextResponse.redirect(new URL(destination, req.url));
      }

      const res = NextResponse.next();
      res.cookies.set("NEXT_LOCALE", localeInPath, { path: "/" });
      return res;
    }

    // Legacy route redirects: /{locale}/signin, /{locale}/register, /{locale}/reset-password
    if (routeSegment === "signin") {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = `/${localeInPath}/auth`;
      redirectUrl.searchParams.set("route", "signin");
      return NextResponse.redirect(redirectUrl);
    }
    
    if (routeSegment === "register") {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = `/${localeInPath}/auth`;
      redirectUrl.searchParams.set("route", "register");
      return NextResponse.redirect(redirectUrl);
    }
    
    if (routeSegment === "reset-password") {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = `/${localeInPath}/auth`;
      redirectUrl.searchParams.set("route", "reset-password");
      return NextResponse.redirect(redirectUrl);
    }

    if (!isPublicAppRoute(segments) && !isAuthenticated(req)) {
      const returnTarget = buildLoginRedirectTarget(pathname, req.nextUrl.search);
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = `/${localeInPath}/auth`;
      redirectUrl.search = "";
      redirectUrl.searchParams.set("route", "signin");
      if (returnTarget) {
        redirectUrl.searchParams.set("returnUrl", returnTarget);
      }
      return NextResponse.redirect(redirectUrl);
    }
    
    const res = NextResponse.next();
    res.cookies.set("NEXT_LOCALE", localeInPath, { path: "/" });
    return res;
  }

  const locale = pickBestLocale(req);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;

  const res = NextResponse.redirect(url);
  res.cookies.set("NEXT_LOCALE", locale, { path: "/" });
  return res;
}

export default middleware;

export const config = {
  matcher: ["/((?!_next|api|favicon\\.ico|[^/]+\\.[a-zA-Z0-9]+).*)"],
};
