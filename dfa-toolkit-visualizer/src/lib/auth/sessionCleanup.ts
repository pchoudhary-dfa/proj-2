import { clearStorage } from "@/lib/auth/authService";

/**
 * Clear httpOnly auth cookies via the BFF logout route and wipe client storage.
 * Safe to call when the session is already invalid — logout always clears cookies.
 */
export async function clearServerSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Network error — still clear local state
  }
  clearStorage();
}

/**
 * When the client has no user but stale httpOnly cookies may still exist,
 * clear them so middleware allows navigation to /auth.
 */
export async function clearStaleSessionIfNeeded(hasUser: boolean): Promise<void> {
  if (hasUser || typeof window === "undefined") return;
  try {
    const res = await fetch("/api/auth/session-status", {
      credentials: "include",
    });
    if (res.status === 401) {
      await clearServerSession();
    }
  } catch {
    // Proceed with navigation — JWT expiry check in middleware is the fallback
  }
}
