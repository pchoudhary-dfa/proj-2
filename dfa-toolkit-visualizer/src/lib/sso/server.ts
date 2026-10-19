/**
 * SSO Server-side module
 * Consolidates all SSO-related server logic: cookie management and BFF handlers.
 * All route handlers in app/api/auth/* delegate to these functions.
 */
import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  DFA_ACCESS_COOKIE,
  DFA_REFRESH_COOKIE,
  DFA_PERMISSIONS_SUMMARY_COOKIE,
  ACCESS_COOKIE_MAX_AGE_SEC,
  REFRESH_COOKIE_MAX_AGE_SEC,
  COOKIE_SECURE,
} from "./constants";
import {
  applyForwardedOrigin,
  applyToolkitAppClientAuthHeaders,
  getInternalToolkitApiUrl,
  getVizApiKey,
  getVizSigningPrivateKeyPem,
} from "@/lib/server/vizUpstream";
import { signToolkitAppRequest } from "@/lib/server/vizAppSign";
import { isAccessTokenExpired } from "@/lib/auth/jwt";

const PROXY_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_API_PROXY?.toLowerCase() === "true";

/**
 * Cookie Management
 */

/**
 * Set httpOnly cookies for access and refresh tokens.
 * Called after successful login or token refresh.
 */
export function applyTokenCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string
): void {
  res.cookies.set(DFA_ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: COOKIE_SECURE,
    maxAge: ACCESS_COOKIE_MAX_AGE_SEC,
  });
  res.cookies.set(DFA_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: COOKIE_SECURE,
    maxAge: REFRESH_COOKIE_MAX_AGE_SEC,
  });
}

/**
 * Clear httpOnly token cookies.
 * Called on logout or when refresh fails.
 */
export function clearTokenCookies(res: NextResponse): void {
  res.cookies.set(DFA_ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: COOKIE_SECURE,
    maxAge: 0,
  });
  res.cookies.set(DFA_REFRESH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: COOKIE_SECURE,
    maxAge: 0,
  });
}

/**
 * Clear permissions summary cookie.
 */
export function clearPermissionsCookie(res: NextResponse): void {
  res.cookies.set(DFA_PERMISSIONS_SUMMARY_COOKIE, "", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: COOKIE_SECURE,
    maxAge: 0,
  });
}

/**
 * Set permissions summary cookie (non-httpOnly for middleware access).
 */
export function applyPermissionsCookie(res: NextResponse, permissions: string[]): void {
  res.cookies.set(DFA_PERMISSIONS_SUMMARY_COOKIE, JSON.stringify(permissions), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: COOKIE_SECURE,
    maxAge: ACCESS_COOKIE_MAX_AGE_SEC,
  });
}

/**
 * BFF Handler: POST /api/auth/login
 * Handles both local credentials and SSO code exchange.
 * Sets httpOnly cookies and permissions summary cookie.
 */
export async function handleLogin(request: NextRequest): Promise<NextResponse> {
  const internal = getInternalToolkitApiUrl();
  const PATH = "/auth/login";
  const url = `${internal}${PATH}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const al = request.headers.get("accept-language");
  if (al) headers.set("Accept-Language", al);
  headers.set("X-Api-Key", getVizApiKey());
  const pem = getVizSigningPrivateKeyPem();
  if (pem) {
    const { timestamp, signature } = signToolkitAppRequest("POST", PATH, pem);
    headers.set("X-Api-Timestamp", timestamp);
    headers.set("X-Api-Signature", signature);
  }

  const body = await request.text();
  const upstream = await fetch(url, { method: "POST", headers, body });

  const text = await upstream.text();
  if (!upstream.ok) {
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  }

  const data = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    token_type?: string;
    permissions?: Record<
      string,
      {
        is_super_admin?: boolean;
        resources?: { resource_code: string; permissions: string[] }[];
      }
    >;
    [key: string]: unknown;
  };
  const { access_token, refresh_token, ...rest } = data;
  const responseBody: Record<string, unknown> = {
    ...rest,
    token_type: data.token_type ?? "bearer",
  };
  if (!PROXY_ENABLED) {
    responseBody.access_token = access_token;
  }
  const res = NextResponse.json(responseBody);
  applyTokenCookies(res, access_token, refresh_token);

  const apiKey = getVizApiKey();
  const appPerms = data.permissions?.[apiKey];
  let summary: string[];
  if (appPerms?.is_super_admin) {
    summary = ["__super_admin__"];
  } else {
    summary = (appPerms?.resources ?? [])
      .filter((r) => r.permissions?.includes("R"))
      .map((r) => r.resource_code);
  }
  applyPermissionsCookie(res, summary);

  return res;
}

/**
 * Proxy a public auth endpoint to the toolkit API (register, password reset, etc.).
 * Login uses handleLogin so httpOnly cookies can be set server-side.
 */
export async function proxyAuthRoute(
  request: NextRequest,
  path: string
): Promise<NextResponse> {
  const internal = getInternalToolkitApiUrl();
  const url = `${internal}${path}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const al = request.headers.get("accept-language");
  if (al) headers.set("Accept-Language", al);
  const auth = request.headers.get("authorization");
  if (auth) headers.set("Authorization", auth);
  applyToolkitAppClientAuthHeaders(headers, request.method, path);

  const method = request.method.toUpperCase();
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.text();
  }
  const upstream = await fetch(url, init);
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

/**
 * BFF Handler: POST /api/auth/logout
 * Calls backend logout, clears cookies, returns optional IdP logout URL.
 */
export async function handleLogout(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(DFA_ACCESS_COOKIE)?.value;

  let logoutUrl: string | null = null;

  if (accessToken) {
    try {
      const internal = getInternalToolkitApiUrl();
      const PATH = "/auth/logout";
      const url = `${internal}${PATH}`;

      const headers = new Headers();
      applyForwardedOrigin(headers, request);
      headers.set("Content-Type", "application/json");
      headers.set("Accept", "application/json");
      headers.set("Authorization", `Bearer ${accessToken}`);
      applyToolkitAppClientAuthHeaders(headers, "POST", PATH);

      const upstream = await fetch(url, {
        method: "POST",
        headers,
        body: "{}",
      });

      if (upstream.ok) {
        const body = await upstream.json();
        logoutUrl = body?.data?.logout_url ?? null;
      }
    } catch {
      // Network error - still clear local session
    }
  }

  const res = NextResponse.json({
    success: true,
    logout_url: logoutUrl,
  });

  clearTokenCookies(res);
  clearPermissionsCookie(res);

  return res;
}

/**
 * BFF Handler: POST /api/auth/refresh
 * Refreshes access token using refresh token from httpOnly cookie.
 */
export async function handleRefresh(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(DFA_REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json(
      { success: false, err_message: "No refresh token" },
      { status: 401 }
    );
  }

  const internal = getInternalToolkitApiUrl();
  const PATH = "/auth/refresh";
  const url = `${internal}${PATH}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  applyToolkitAppClientAuthHeaders(headers, "POST", PATH);

  const upstream = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!upstream.ok) {
    const res = NextResponse.json(
      { success: false, err_message: "Refresh failed" },
      { status: upstream.status }
    );
    clearTokenCookies(res);
    return res;
  }

  const data = (await upstream.json()) as {
    access_token: string;
    refresh_token: string;
    token_type?: string;
  };

  const refreshBody: Record<string, unknown> = {
    success: true,
    token_type: data.token_type ?? "bearer",
  };
  if (!PROXY_ENABLED) {
    refreshBody.access_token = data.access_token;
  }
  const res = NextResponse.json(refreshBody);
  applyTokenCookies(res, data.access_token, data.refresh_token);

  return res;
}

/**
 * BFF Handler: GET /api/auth/session-status
 * Lightweight proxy for cross-app SLO polling.
 * Returns 200 if the user's session is still valid on the toolkit API,
 * or 401 ONLY if the upstream explicitly returns 401 (session revoked).
 * Other errors (403 route not registered, 500, network) return 200 to avoid
 * false-positive logouts — the client will detect real issues on the next poll
 * or via normal API call 401 handling.
 */
export async function handleSessionStatus(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(DFA_ACCESS_COOKIE)?.value;
  if (!accessToken || isAccessTokenExpired(accessToken)) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  const internal = getInternalToolkitApiUrl();
  const PATH = "/auth/session-status";
  const url = `${internal}${PATH}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  applyToolkitAppClientAuthHeaders(headers, "GET", PATH);

  try {
    const upstream = await fetch(url, { method: "GET", headers });
    if (upstream.status === 401) {
      return NextResponse.json({ active: false }, { status: 401 });
    }
    // For any other response (200, 403, 500, etc.) assume session is alive.
    // 403 = route not registered in IAM yet; 500 = transient server error.
    return NextResponse.json({ active: true });
  } catch {
    return NextResponse.json({ active: true });
  }
}

/**
 * BFF Handler: GET /api/auth/sso/providers
 * Proxies request to backend to fetch configured SSO providers.
 */
export async function handleGetProviders(request: NextRequest): Promise<Response> {
  const internal = getInternalToolkitApiUrl();
  const PATH = "/auth/sso/providers";
  const url = `${internal}${PATH}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Accept", "application/json");
  applyToolkitAppClientAuthHeaders(headers, "GET", PATH);

  const upstream = await fetch(url, { method: "GET", headers });

  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
