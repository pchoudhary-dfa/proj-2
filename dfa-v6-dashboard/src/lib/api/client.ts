/**
 * Central API client – adds X-Api-Key, X-Api-Timestamp, X-Api-Signature
 * for DFA Toolkit API calls via the same-origin BFF (/api/backend/...).
 * On 401 Unauthorized (browser only), attempts one /api/auth/refresh, then clears the session.
 */
import { signRequest } from "@/lib/auth/signature";
import { clearLegacyAuthCookies } from "@/lib/auth/cookie";
import {
  API_PROXY_PREFIX,
  BFF_API_PREFIX,
  API_KEY,
  API_PUBLIC_KEY,
  API_SIGNATURE,
  X_APP_KEY_HEADER,
  X_APP_SIGNATURE_HEADER,
  X_APP_TIMESTAMP_HEADER,
} from "@/lib/constants";

let hasTriggeredUnauthorizedRedirect = false;

let refreshInFlight: Promise<boolean> | null = null;

export type ApiFetchInit = RequestInit & {
  headers?: HeadersInit;
};

export type BuildApiHeadersOptions = {
  acceptLanguage?: string;
  headers?: Record<string, string>;
};

/**
 * Synchronous header builder for UI packages that call fetch() internally
 * (e.g. dfa-v6-comp-login). Sets X-Api-Key and static signature/timestamp
 * so BFF can identify the app. The BFF always re-signs upstream.
 */
export function buildApiHeaders(
  options: BuildApiHeadersOptions = {}
): Record<string, string> {
  const out: Record<string, string> = { ...(options.headers ?? {}) };

  if (API_KEY && !out[X_APP_KEY_HEADER]) {
    out[X_APP_KEY_HEADER] = API_KEY;
  }
  if (API_PUBLIC_KEY && API_SIGNATURE) {
    if (!out[X_APP_TIMESTAMP_HEADER]) {
      out[X_APP_TIMESTAMP_HEADER] = String(Math.floor(Date.now() / 1000));
    }
    if (!out[X_APP_SIGNATURE_HEADER]) {
      out[X_APP_SIGNATURE_HEADER] = API_SIGNATURE;
    }
  }
  if (options.acceptLanguage && !out["Accept-Language"]) {
    out["Accept-Language"] = options.acceptLanguage;
  }

  return out;
}

/**
 * Build headers for authentication API calls (login, register, password reset).
 * Does NOT include Authorization Bearer (used for unauthenticated endpoints).
 */
export function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  if (API_KEY) {
    headers[X_APP_KEY_HEADER] = API_KEY;
  }

  return headers;
}

function getBackendPathWithQuery(input: RequestInfo | URL): string {
  const url =
    typeof input === "string"
      ? new URL(input, input.startsWith("http") ? undefined : "http://host")
      : input instanceof Request
        ? new URL(input.url)
        : input;
  const pathname = url.pathname;
  const search = url.search;
  if (pathname.startsWith(BFF_API_PREFIX)) {
    const rest = pathname.slice(BFF_API_PREFIX.length) || "/";
    return rest + search;
  }
  if (pathname.startsWith(API_PROXY_PREFIX)) {
    const rest = pathname.slice(API_PROXY_PREFIX.length) || "/";
    return rest + search;
  }
  return pathname + search;
}

function getRequestPath(input: RequestInfo | URL): string {
  const url =
    typeof input === "string"
      ? new URL(input, input.startsWith("http") ? undefined : "http://host")
      : input instanceof Request
        ? new URL(input.url)
        : input;
  return url.pathname;
}

function shouldSkipUnauthorizedRedirect(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  if (/(^|\/)auth\/(login|register)\/?$/.test(lower)) return true;
  if (/(^|\/)auth\/refresh\/?$/.test(lower)) return true;
  if (lower.includes("/api/auth/")) return true;
  if (lower.endsWith("/app-config/") || lower.endsWith("/app-config"))
    return true;
  if (lower.endsWith("/system-language")) return true;
  return false;
}

async function clearAuthSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* ignore */
  }
  clearLegacyAuthCookies();
}

async function applyAuthHeaders(
  input: RequestInfo | URL,
  method: string,
  headers: Headers
): Promise<void> {
  if (API_KEY && !headers.has(X_APP_KEY_HEADER)) {
    headers.set(X_APP_KEY_HEADER, API_KEY);
  }

  if (API_PUBLIC_KEY && API_SIGNATURE) {
    if (
      !headers.has(X_APP_TIMESTAMP_HEADER) &&
      !headers.has(X_APP_SIGNATURE_HEADER)
    ) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const pathWithQuery = getBackendPathWithQuery(input);
      const sig = (
        await signRequest(
          method,
          pathWithQuery,
          API_PUBLIC_KEY,
          API_SIGNATURE,
          timestamp
        )
      ).signature;
      headers.set(X_APP_TIMESTAMP_HEADER, timestamp);
      headers.set(X_APP_SIGNATURE_HEADER, sig);
    }
  }
}

async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  const run = async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      return res.ok;
    } catch {
      return false;
    }
  };
  refreshInFlight = run().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * Fetch wrapper that injects X-Api-Key and Ed25519 signature headers.
 * Browser calls use credentials: "include" for HttpOnly cookies.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: ApiFetchInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const method = (init.method ?? "GET").toUpperCase();

  await applyAuthHeaders(input, method, headers);

  const browser = typeof document !== "undefined";
  let res = await fetch(input, {
    ...init,
    headers,
    ...(browser ? { credentials: "include" as RequestCredentials } : {}),
  });

  if (browser && res.status === 401) {
    const pathname = getRequestPath(input);
    if (!shouldSkipUnauthorizedRedirect(pathname)) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        const headers2 = new Headers(init.headers ?? {});
        await applyAuthHeaders(input, method, headers2);
        res = await fetch(input, {
          ...init,
          headers: headers2,
          credentials: "include",
        });
      }
      if (res.status === 401) {
        await clearAuthSession();
        const currentPath = window.location.pathname;
        const alreadyOnLogin = currentPath === "/";
        if (!alreadyOnLogin && !hasTriggeredUnauthorizedRedirect) {
          hasTriggeredUnauthorizedRedirect = true;
          window.location.assign("/");
        }
      }
    }
  }

  return res;
}
