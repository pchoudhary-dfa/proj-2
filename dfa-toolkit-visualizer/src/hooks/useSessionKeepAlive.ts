"use client";

import { useEffect, useRef } from "react";
import { ensureRefreshed, emitSessionExpired } from "@/lib/api/tokenRefresh";
import { isAuthPathname } from "@/lib/auth/returnUrl";
import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/constants";

const SESSION_POLL_INTERVAL_MS = 30_000;
const REFRESH_SAFETY_MARGIN_MS = 60_000;
const FALLBACK_REFRESH_INTERVAL_MS = 9 * 60 * 1000;

/**
 * Parse the JWT `exp` claim from a raw token string.
 * Returns the expiry as a Unix timestamp in milliseconds, or null if unparseable.
 */
function getTokenExpiryMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1])) as { exp?: number };
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/**
 * Compute how many ms until we should proactively refresh.
 * Reads the access token from localStorage; falls back to a fixed interval
 * when proxy mode is on and no token is available client-side.
 */
function computeRefreshDelay(): number {
  if (typeof window === "undefined") return FALLBACK_REFRESH_INTERVAL_MS;
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!token) return FALLBACK_REFRESH_INTERVAL_MS;
  const expiryMs = getTokenExpiryMs(token);
  if (!expiryMs) return FALLBACK_REFRESH_INTERVAL_MS;
  const delay = expiryMs - Date.now() - REFRESH_SAFETY_MARGIN_MS;
  return Math.max(delay, 5_000);
}

/**
 * Keeps the user session alive and detects cross-app logouts.
 *
 * Two mechanisms:
 * 1. Session-status polling (every 30s): Calls GET /api/auth/session-status.
 *    If the API reports the session as revoked (401), triggers session expiry.
 * 2. Proactive token refresh: Schedules a refresh 1 minute before the access
 *    token expires so API calls rarely hit a 401 in normal operation.
 *
 * Both are started when `isAuthenticated` becomes true and stopped on cleanup.
 */
export function useSessionKeepAlive(isAuthenticated: boolean): void {
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    // --- Session-status poll (cross-app SLO detection) ---
    pollTimerRef.current = setInterval(async () => {
      if (isAuthPathname(window.location.pathname)) return;
      try {
        const res = await fetch("/api/auth/session-status", {
          credentials: "include",
        });
        if (res.status === 401) {
          // 401 could mean: (a) session truly revoked, or (b) access token just
          // expired and middleware rejected before our handler ran.
          // Attempt a refresh to distinguish — if refresh succeeds the session
          // is still alive (the token was just stale).
          const refreshed = await ensureRefreshed();
          if (!refreshed) {
            emitSessionExpired();
          }
        }
      } catch {
        // Network error — skip this cycle; retry on next interval
      }
    }, SESSION_POLL_INTERVAL_MS);

    // --- Proactive refresh timer ---
    const scheduleRefresh = () => {
      const delayMs = computeRefreshDelay();
      refreshTimerRef.current = setTimeout(async () => {
        if (isAuthPathname(window.location.pathname)) return;
        const ok = await ensureRefreshed();
        if (!ok) {
          emitSessionExpired();
        } else {
          scheduleRefresh();
        }
      }, delayMs);
    };
    scheduleRefresh();

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [isAuthenticated]);
}
