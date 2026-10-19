/** sessionStorage key for post-login return path (SSO round-trip backup). */
export const AUTH_RETURN_URL_STORAGE_KEY = "auth_return_url";

const RETURN_TO_MAX_LEN = 2048;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const LOCALE_SEGMENT_RE = /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/;
const MAX_RETURN_URL_UNWRAP_DEPTH = 5;

/** True when pathname is the locale-only login page (`/{locale}`). */
export function isLoginPathname(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 1 && LOCALE_SEGMENT_RE.test(segments[0] ?? "");
}

export function isAuthPathname(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "auth") return true;
  return segments.length >= 2 && segments[1] === "auth";
}

function tryDecodeReturnParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Validate an in-app relative return path (open-redirect guard).
 * Returns fallback when candidate is missing or unsafe.
 */
export function validateReturnUrl(
  candidate: string | null | undefined,
  fallback: string,
  depth = 0
): string {
  const raw = (candidate ?? "").trim();
  if (!raw) return fallback;
  if (depth > MAX_RETURN_URL_UNWRAP_DEPTH) return fallback;

  const qIdx = raw.indexOf("?");
  const pathPart = qIdx === -1 ? raw : raw.slice(0, qIdx);

  if ((isAuthPathname(pathPart) || isLoginPathname(pathPart)) && qIdx !== -1) {
    const inner = new URLSearchParams(raw.slice(qIdx + 1)).get("returnUrl");
    if (inner) {
      return validateReturnUrl(tryDecodeReturnParam(inner), fallback, depth + 1);
    }
    return fallback;
  }

  if (raw.length > RETURN_TO_MAX_LEN) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (SCHEME_RE.test(raw)) return fallback;
  if (raw.includes("#")) return fallback;
  if (raw.includes("@")) return fallback;
  if (pathPart.toLowerCase().includes("/auth")) return fallback;

  return raw;
}

/**
 * Safe return path when redirecting unauthenticated users to login.
 * Returns null when no returnUrl should be appended (already on login).
 */
export function buildLoginRedirectTarget(
  pathname: string,
  search: string
): string | null {
  const normalizedSearch = search
    ? search.startsWith("?")
      ? search
      : `?${search}`
    : "";

  if (isLoginPathname(pathname) || isAuthPathname(pathname)) {
    const params = new URLSearchParams(normalizedSearch.slice(1));
    const existing = params.get("returnUrl");
    if (!existing) return null;
    return validateReturnUrl(tryDecodeReturnParam(existing), "") || null;
  }

  const candidate = pathname + normalizedSearch;
  return validateReturnUrl(candidate, "") || null;
}

/** Current browser path + query string for use as returnUrl. */
export function getCurrentReturnPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

export function persistReturnUrl(url: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(AUTH_RETURN_URL_STORAGE_KEY, url);
  } catch {
    // storage blocked or full
  }
}

export function consumeReturnUrl(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = sessionStorage.getItem(AUTH_RETURN_URL_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_RETURN_URL_STORAGE_KEY);
    return stored ? validateReturnUrl(stored, fallback) : fallback;
  } catch {
    return fallback;
  }
}

/** Resolve post-login destination: API callback param, then sessionStorage, then fallback. */
export function resolveReturnUrl(
  fromQuery: string | null | undefined,
  fallback: string
): string {
  const fromApi = fromQuery ? validateReturnUrl(fromQuery, "") : "";
  if (fromApi) return fromApi;
  return consumeReturnUrl(fallback);
}

/** Read returnUrl from the current browser location (avoids searchParams hydration lag). */
export function readReturnUrlFromLocation(homeUrl: string): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("returnUrl");
  if (!raw) return null;
  const safe = validateReturnUrl(raw, homeUrl);
  return safe && safe !== homeUrl ? safe : null;
}

/**
 * Resolve the path to send as API ``return_to`` for SSO redirect.
 * Prefers explicit returnUrl, then window.location, then sessionStorage backup.
 */
export function resolveSsoReturnPath(
  returnUrl: string,
  homeUrl: string
): string | null {
  if (returnUrl && returnUrl !== homeUrl) return returnUrl;
  const fromLocation = readReturnUrlFromLocation(homeUrl);
  if (fromLocation) return fromLocation;
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem(AUTH_RETURN_URL_STORAGE_KEY);
      if (stored) {
        const safe = validateReturnUrl(stored, homeUrl);
        if (safe && safe !== homeUrl) return safe;
      }
    } catch {
      /* storage blocked */
    }
  }
  return null;
}

/** Build API SSO redirect URL with app_key and optional return_to. */
export function buildSsoRedirectUrl(
  apiBase: string,
  providerCode: string,
  appKey: string | null | undefined,
  returnPath?: string | null
): string {
  const base = apiBase.replace(/\/$/, "");
  const params = new URLSearchParams();
  if (appKey) params.set("app_key", appKey);
  if (returnPath) {
    const safe = validateReturnUrl(returnPath, "");
    if (safe) params.set("return_to", safe);
  }
  const qs = params.toString();
  return `${base}/auth/sso/${encodeURIComponent(providerCode)}/redirect${qs ? `?${qs}` : ""}`;
}
