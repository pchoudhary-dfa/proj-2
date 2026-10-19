"use client";

const AUTH_USER_STORAGE_KEY = "dfa-auth-user";

export type StoredAuthUser = {
  user_id?: number;
  username?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  api_keys?: string[];
};

export function setStoredAuthUser(user: StoredAuthUser): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function setStoredAuthUserFromLoginResponse(
  response: Record<string, unknown>
): void {
  setStoredAuthUser({
    user_id:
      typeof response.user_id === "number" ? response.user_id : undefined,
    username:
      typeof response.username === "string" ? response.username : undefined,
    first_name:
      typeof response.first_name === "string" ? response.first_name : undefined,
    last_name:
      typeof response.last_name === "string" ? response.last_name : undefined,
    email: typeof response.email === "string" ? response.email : undefined,
    api_keys: Array.isArray(response.api_keys)
      ? response.api_keys.filter((item): item is string => typeof item === "string")
      : undefined,
  });
}

export function getStoredAuthUser(): StoredAuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuthUser;
  } catch {
    return null;
  }
}

export function clearStoredAuthUser(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
