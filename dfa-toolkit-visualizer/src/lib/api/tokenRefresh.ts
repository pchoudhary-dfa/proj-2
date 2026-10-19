/**
 * Centralized token refresh manager.
 *
 * Provides a single-flight refresh lock so concurrent 401 responses coalesce
 * into one POST /api/auth/refresh call. After a successful refresh the caller
 * retries the original request exactly once.
 *
 * When ENABLE_API_PROXY is false (all production deployments), the BFF refresh
 * response includes the new access_token in the JSON body so we can update
 * localStorage for subsequent direct Bearer calls.
 */

import { ENABLE_API_PROXY, AUTH_TOKEN_STORAGE_KEY } from "@/lib/constants";
import { isAuthPathname, isPublicAppPathname } from "@/lib/auth/returnUrl";
import { clearServerSession } from "@/lib/auth/sessionCleanup";

const SESSION_EXPIRED_EVENT = "dfa:session-expired";

let refreshPromise: Promise<boolean> | null = null;

/**
 * Trigger a single token refresh via the BFF. Concurrent callers share the
 * same in-flight promise so the backend only sees one refresh request.
 */
export async function ensureRefreshed(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return false;

      if (!ENABLE_API_PROXY) {
        try {
          const data = (await res.json()) as { access_token?: string };
          if (data.access_token) {
            localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.access_token);
          }
        } catch {
          // non-JSON or parse error — cookies were still rotated
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Handle cross-app session expiry (SLO detection).
 * Behavior depends on the current page context:
 * - Auth page: dispatch event only (no navigation).
 * - Public page (/en, /en/visualizer, /en/visualize): clear session silently,
 *   stay on current page. Header will update to show Sign In.
 * - Protected page (/en/gallery, etc.): clear session and redirect to the
 *   locale home page (public).
 */
export function emitSessionExpired(): void {
  if (typeof window === "undefined") return;

  const { pathname } = window.location;

  if (isAuthPathname(pathname)) {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    return;
  }

  if (isPublicAppPathname(pathname)) {
    void clearServerSession().then(() => {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    });
    return;
  }

  const locale = pathname.split("/")[1] || "en";
  void clearServerSession().finally(() => {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    window.location.href = `/${locale}`;
  });
}

export { SESSION_EXPIRED_EVENT };
