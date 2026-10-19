/**
 * Central API client – adds X-Api-Key, X-Api-Timestamp, X-Api-Signature (SIGNATURE auth)
 * for DFA Toolkit API calls via the same-origin BFF (`/api/backend/...`).
 * On 401 Unauthorized (browser only), attempts one `/api/auth/refresh`, then clears the session.
 */
import { signRequest } from "@/lib/auth/signature";
import { clearLegacyAuthCookies } from "@/lib/auth/cookie";
import { buildLoginRedirectTarget } from "@/lib/auth/returnUrl";
import {
  API_PROXY_PREFIX,
  BFF_API_PREFIX,
  API_KEY,
  API_PUBLIC_KEY,
  API_SIGNATURE,
  FALLBACK_DEFAULT_LOCALE,
  X_APP_KEY_HEADER,
  X_APP_SIGNATURE_HEADER,
  X_APP_TIMESTAMP_HEADER,
  isLocaleOnlyLoginPath,
} from "@/lib/constants";

let hasTriggeredUnauthorizedRedirect = false;

/** Single-flight refresh so concurrent 401s share one refresh call. */
let refreshInFlight: Promise<boolean> | null = null;

export type ApiFetchInit = RequestInit & {
  headers?: HeadersInit;
};

export type BuildApiHeadersOptions = {
  acceptLanguage?: string;
  headers?: Record<string, string>;
};

/**
 * Synchronous header builder for UI packages that call `fetch()` internally.
 * Mirrors the core auth headers so package-level calls include the same API
 * identity as the rest of the app.
 */
export function buildApiHeaders(
  options: BuildApiHeadersOptions = {}
): Record<string, string> {
  const out: Record<string, string> = { ...(options.headers ?? {}) };

  if (API_KEY && !out[X_APP_KEY_HEADER]) {
    out[X_APP_KEY_HEADER] = API_KEY;
  }
  // Sync helper cannot sign; callers that need auth must use apiFetch (async signRequest).
  if (options.acceptLanguage && !out["Accept-Language"]) {
    out["Accept-Language"] = options.acceptLanguage;
  }

  return out;
}

/**
 * Build headers for authentication API calls (login, register, password reset).
 * Returns a plain object suitable for passing to the Login component.
 * Does NOT include Authorization Bearer (used for unauthenticated endpoints).
 */
export function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  
  if (API_KEY) {
    headers[X_APP_KEY_HEADER] = API_KEY;
  }
  
  // For auth endpoints, we don't include signing headers as they require the request path
  // The Login component will handle signing internally or we can use API_KEY only
  
  return headers;
}

/**
 * Resolve request URL to the path+query the backend will see (for signing).
 */
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
  if (lower.endsWith("/app-config/") || lower.endsWith("/app-config")) return true;
  if (lower.endsWith("/system-language")) return true;
  if (lower.includes("/api/bootstrap/default-locale")) return true;
  return false;
}

async function clearAuthSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }
  clearLegacyAuthCookies();
}

async function applyDmAuthHeaders(
  input: RequestInfo | URL,
  method: string,
  headers: Headers
): Promise<void> {
  if (API_KEY && !headers.has(X_APP_KEY_HEADER)) {
    headers.set(X_APP_KEY_HEADER, API_KEY);
  }

  if (API_PUBLIC_KEY && API_SIGNATURE) {
    if (!headers.has(X_APP_TIMESTAMP_HEADER) && !headers.has(X_APP_SIGNATURE_HEADER)) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const pathWithQuery = getBackendPathWithQuery(input);
      const signature = (
        await signRequest(
          method,
          pathWithQuery,
          API_PUBLIC_KEY,
          API_SIGNATURE,
          timestamp
        )
      ).signature;
      headers.set(X_APP_TIMESTAMP_HEADER, timestamp);
      headers.set(X_APP_SIGNATURE_HEADER, signature);
    }
  }
}

export async function tryRefreshSession(): Promise<boolean> {
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
 * Fetch that injects X-Api-Key and signature headers for DFA Data Manager auth.
 * Browser calls use `credentials: "include"` for HttpOnly cookies.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: ApiFetchInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const method = (init.method ?? "GET").toUpperCase();

  await applyDmAuthHeaders(input, method, headers);

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
        await applyDmAuthHeaders(input, method, headers2);
        res = await fetch(input, {
          ...init,
          headers: headers2,
          credentials: "include",
        });
      }
      if (res.status === 401) {
        await clearAuthSession();
        const currentPath = window.location.pathname;
        const alreadyOnLoginSurface =
          currentPath === "/" || isLocaleOnlyLoginPath(currentPath);
        if (!alreadyOnLoginSurface && !hasTriggeredUnauthorizedRedirect) {
          hasTriggeredUnauthorizedRedirect = true;
          const locale =
            window.location.pathname.split("/").filter(Boolean)[0] ||
            FALLBACK_DEFAULT_LOCALE;
          const returnTarget = buildLoginRedirectTarget(
            window.location.pathname,
            window.location.search
          );
          const loginUrl = new URL(`/${locale}`, window.location.origin);
          if (returnTarget) {
            loginUrl.searchParams.set("returnUrl", returnTarget);
          }
          window.location.assign(loginUrl.toString());
        }
      }
    }
  }

  return res;
}
