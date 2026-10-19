/**
 * HttpOnly auth cookies are set by Next Route Handlers (`/api/auth/login`, `/api/auth/refresh`).
 * This module exposes cookie names for middleware and legacy cleanup only.
 */

export const DFA_ACCESS_COOKIE = "dfa_access";
export const DFA_REFRESH_COOKIE = "dfa_refresh";

/** @deprecated Non-HttpOnly legacy name; cleared on logout for migration. */
const LEGACY_AUTH_COOKIE = "dfa_token";

export function getAuthCookieName(): string {
  return DFA_ACCESS_COOKIE;
}

export function getRefreshCookieName(): string {
  return DFA_REFRESH_COOKIE;
}

/**
 * Clear legacy client-readable cookies if present (migration from pre-BFF auth).
 *
 * HttpOnly cookies (`dfa_access`, `dfa_refresh`) cannot be cleared from JS;
 * use the BFF logout route (`POST /api/auth/logout`) instead.
 */
export function clearLegacyAuthCookies(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LEGACY_AUTH_COOKIE}=; path=/; max-age=0`;
}
