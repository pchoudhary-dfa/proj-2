/**
 * SSO Client-side module
 * Consolidates all SSO-related client logic: code exchange, provider fetching, session management.
 * UI components and contexts use these functions.
 */

import type { User } from "@/lib/auth/types";
import type { SsoProviderListItem, SsoBffLoginResponse } from "./types";
import { AUTH_USER_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY } from "@/lib/constants";

/**
 * SSO Provider Management
 */

let inflight: Promise<SsoProviderListItem[] | null> | null = null;

/**
 * Fetch active SSO providers once per page load (dedupes React Strict Mode double effects).
 * Returns null on error or if SSO is not configured.
 */
export function fetchSsoProvidersOnce(): Promise<SsoProviderListItem[] | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/auth/sso/providers");
      if (!res.ok) return null;
      const json = await res.json();
      const items = json?.data;
      return Array.isArray(items) ? (items as SsoProviderListItem[]) : null;
    } catch {
      return null;
    }
  })();
  return inflight;
}

/**
 * SSO Session Management
 */

/**
 * Persist user metadata to localStorage only (not token).
 * Used in SSO flow where tokens are in httpOnly cookies.
 */
export function persistSsoUserMetadata(user: User): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // storage full or blocked – silent
  }
}

/**
 * Clear SSO session data from localStorage.
 * Does not clear cookies (handled server-side via BFF logout).
 */
export function clearSsoSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Check if the current user authenticated via SSO (vs local username/password).
 */
export function isSsoUser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return false;
    const user = JSON.parse(raw) as { auth_provider?: string };
    return user.auth_provider === "SSO";
  } catch {
    return false;
  }
}

/**
 * SSO Code Exchange
 */

/**
 * Helper to map BFF login response to User object (tokens live in httpOnly cookies).
 */
export function mapBffResponseToUser(data: SsoBffLoginResponse): User {
  const permScopes = Object.values(data.permissions ?? {});
  const isSuperAdmin = permScopes.some((p) => p.is_super_admin);
  const roles = permScopes.flatMap((p) => p.roles ?? []).map((r) => ({
    dw_id: r.dw_id == null ? null : String(r.dw_id),
    role_id: r.role_id,
    role: r.role_code,
    role_name: r.role_name,
  }));

  return {
    id: String(data.user_id),
    username: data.username,
    email: data.email,
    displayName: data.username,
    roles,
    isSuperAdmin,
    auth_provider: data.auth_provider ?? "SSO",
  };
}

/**
 * Exchange SSO one-time code for session.
 * Calls POST /api/auth/login with { code }, which sets httpOnly cookies server-side.
 * Returns the User object and stores it in localStorage (tokens in cookies).
 */
export async function exchangeSsoCode(code: string): Promise<User> {
  const loginUrl = "/api/auth/login"; // BFF route, not backend direct
  const res = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include", // Important: send/receive cookies
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    let message = "SSO code exchange failed";
    try {
      const body = (await res.json()) as { err_message?: string; detail?: string };
      message = body.err_message ?? body.detail ?? message;
    } catch {
      // keep default
    }
    throw new Error(message);
  }

  const data = (await res.json()) as SsoBffLoginResponse;
  const user = mapBffResponseToUser(data);

  persistSsoUserMetadata(user);
  persistBffAccessToken(data.access_token);
  return user;
}

/** Persist user metadata from a BFF login response (local or SSO; tokens in cookies). */
export function persistSessionFromBffLogin(data: SsoBffLoginResponse): User {
  const user = mapBffResponseToUser(data);
  persistSsoUserMetadata(user);
  persistBffAccessToken(data.access_token);
  return user;
}

/**
 * Store the access token in localStorage when the BFF includes it (proxy-off mode).
 * In proxy-on mode the BFF omits the token and the proxy injects Bearer from the cookie.
 */
function persistBffAccessToken(token: string | undefined): void {
  if (typeof window === "undefined" || !token) return;
  try {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // storage full or blocked
  }
}

/**
 * SSO Logout
 * Calls BFF /api/auth/logout to clear cookies and get optional IdP logout URL.
 * For SSO users, returns IdP logout URL. For local users, returns null.
 */
export async function ssoLogout(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  let logoutUrl: string | null = null;

  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    if (res.ok) {
      const data = (await res.json()) as { logout_url?: string };
      logoutUrl = data.logout_url ?? null;
    }
  } catch {
    // Network error — still clear local session
  }

  clearSsoSession();

  return logoutUrl;
}
