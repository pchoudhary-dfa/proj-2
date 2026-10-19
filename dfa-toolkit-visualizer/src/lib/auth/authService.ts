/**
 * Auth service: signIn, signOut, register, getSession, getToken, getAuthHeaders.
 * Calls POST /auth/login and POST /auth/register on the backend.
 * 
 * Local auth mode: JWT + user in localStorage.
 * SSO-specific methods moved to @/lib/sso module.
 */

import { AUTH_API_URL, AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from "@/lib/constants";
import { buildSignedHeaders } from "@/lib/api/client";
import type { User, SignInCredentials, AuthLoginResponse, RegisterPayload } from "./types";
import { isAccessTokenExpired } from "./jwt";
import { ssoLogout } from "@/lib/sso";

function getLoginUrl(): string {
  return `${AUTH_API_URL}/login`;
}

function getRegisterUrl(): string {
  return `${AUTH_API_URL}/register`;
}

function getLogoutUrl(): string {
  return `${AUTH_API_URL}/logout`;
}

/** Read the stored JWT. Returns null when absent or on the server. */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Returns an Authorization header object when a token exists, empty object otherwise.
 * Spread into any fetch headers to attach bearer auth.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Persist user + token to localStorage (local auth only).
 * For SSO auth, use persistSsoUserMetadata from @/lib/sso module.
 */
function persistAuth(user: User, token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // storage full or blocked – silent
  }
}

export { persistAuth };

/**
 * Clear auth storage (token + user). Does not touch React state.
 * Call when redirecting away so the next page load sees no session.
 */
export function clearStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Sign in with username and password against POST /auth/login.
 * Persists user + token in localStorage and returns the User.
 */
export async function signIn(credentials: SignInCredentials): Promise<User> {
  const loginUrl = getLoginUrl();
  const res = await fetch(loginUrl, {
    method: "POST",
    headers: await buildSignedHeaders(loginUrl, "POST"),
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
    }),
  });

  if (!res.ok) {
    let message = "Invalid username or password";
    try {
      const body = (await res.json()) as { detail?: string | { msg?: string }[]; message?: string };
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (typeof body.message === "string") {
        message = body.message;
      }
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  const data: AuthLoginResponse = (await res.json()) as AuthLoginResponse;
  const user = mapResponseToUser(data);
  
  persistAuth(user, data.access_token);
  return user;
}

/**
 * Register a new user via POST /auth/register.
 * Sends first_name, last_name, username, email, password. If the backend returns
 * an access_token (same shape as login), persists and returns the User. Otherwise
 * signs in with the new credentials and returns the User.
 */
export async function register(payload: RegisterPayload): Promise<User> {
  const registerUrl = getRegisterUrl();
  const res = await fetch(registerUrl, {
    method: "POST",
    headers: await buildSignedHeaders(registerUrl, "POST"),
    body: JSON.stringify({
      first_name: payload.firstName.trim(),
      last_name: payload.lastName.trim(),
      username: payload.username.trim(),
      email: payload.email.trim(),
      password: payload.password,
    }),
  });

  if (!res.ok) {
    let message = "Registration failed";
    try {
      const body = (await res.json()) as { detail?: string | { msg?: string }[]; message?: string };
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (typeof body.message === "string") {
        message = body.message;
      }
    } catch {
      // keep default
    }
    throw new Error(message);
  }

  const data = (await res.json()) as AuthLoginResponse & { message?: string };

  if (data.access_token) {
    const user = mapResponseToUser(data);
    persistAuth(user, data.access_token);
    return user;
  }

  // Backend returned success without token; sign in with new credentials
  return signIn({
    username: payload.username.trim(),
    password: payload.password,
  });
}

/**
 * Sign out: delegates to SSO logout if SSO user, otherwise clears local session.
 * For SSO users, redirects to IdP logout. For local users, clears local session.
 */
export async function signOut(): Promise<void> {
  if (typeof window === "undefined") return;
  
  // Delegate to SSO logout which handles cookies and IdP redirect
  const logoutUrl = await ssoLogout();
  
  // Also clear local storage for backward compatibility
  clearStorage();
  
  // Redirect to IdP logout if SSO user
  if (logoutUrl) {
    window.location.href = logoutUrl;
  }
}

/**
 * Helper to map backend auth response to User object.
 */
function mapResponseToUser(data: AuthLoginResponse): User {
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
    auth_provider: data.auth_provider ?? "LOCAL",
  };
}

/**
 * Restore session from localStorage.
 * SSO mode: Returns user metadata (tokens in httpOnly cookies, validated server-side).
 * Legacy mode: Returns user when valid (non-expired) token exists in localStorage.
 */
export async function getSession(): Promise<User | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed.id !== "string") {
      clearStorage();
      return null;
    }

    const user = parsed as unknown as User;
    if (typeof user.isSuperAdmin !== "boolean") {
      user.isSuperAdmin = false;
    }

    const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);

    // Cookie-based sessions (BFF): user metadata only; tokens validated server-side.
    if (user.auth_provider === "SSO" || (user.auth_provider === "LOCAL" && !token)) {
      return user;
    }

    // Legacy local auth: bearer token in localStorage.
    if (!token || isAccessTokenExpired(token)) {
      clearStorage();
      return null;
    }

    return user;
  } catch {
    clearStorage();
  }
  return null;
}
