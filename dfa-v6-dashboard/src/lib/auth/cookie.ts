/**
 * HttpOnly auth cookies are set by Next Route Handlers (/api/auth/login, /api/auth/refresh).
 * This module exposes cookie names for middleware and legacy cleanup only.
 */

export const DFA_ACCESS_COOKIE = "dfa_access";
export const DFA_REFRESH_COOKIE = "dfa_refresh";

export function getAuthCookieName(): string {
  return DFA_ACCESS_COOKIE;
}

export function getRefreshCookieName(): string {
  return DFA_REFRESH_COOKIE;
}

export function clearLegacyAuthCookies(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${DFA_REFRESH_COOKIE}=; path=/; max-age=0`;
}
