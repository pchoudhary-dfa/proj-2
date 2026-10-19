"use client";

import { useEffect, useRef } from "react";
import { tryRefreshSession } from "@/lib/api/client";
import { clearStoredAuthUser, getStoredAuthUser } from "@/lib/auth/user";
import { FALLBACK_DEFAULT_LOCALE } from "@/lib/constants";

const SESSION_POLL_INTERVAL_MS = 30_000;
const PROACTIVE_REFRESH_INTERVAL_MS = 9 * 60 * 1000;
const REFRESH_RETRY_DELAY_MS = 5_000;
const MAX_CONSECUTIVE_REFRESH_FAILURES = 3;

/**
 * Invisible client component that keeps the session alive and detects
 * cross-app logouts via session-status polling.
 *
 * Three mechanisms:
 * 0. Session integrity check: On mount, if we are on an authenticated page
 *    but localStorage has no user data (e.g. stale cookie landed us here
 *    without going through login), clears cookies via BFF and redirects
 *    to the login page so the user goes through the full login flow.
 * 1. Session-status polling: Every 30s, calls GET /api/auth/session-status.
 *    If the toolkit API reports the session as revoked (401 — user logged out
 *    from another DFA app), AND a refresh attempt also fails, clears local
 *    state and redirects to login.
 * 2. Proactive token refresh: Refreshes the access token every 9 minutes so
 *    API calls rarely encounter a 401 during normal operation.
 *
 * Refresh failures are handled gracefully: a single 401 from the refresh
 * endpoint does NOT immediately wipe UI state.  The component verifies that
 * the access token is also dead (via session-status) before concluding the
 * session is truly revoked.  This prevents spurious logouts caused by
 * cross-app token rotation or transient backend errors.
 */
export function SessionKeepAlive() {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveRefreshFailuresRef = useRef(0);

  useEffect(() => {
    const getLocale = () => {
      return (
        window.location.pathname.split("/").filter(Boolean)[0] ||
        FALLBACK_DEFAULT_LOCALE
      );
    };

    const isOnLoginPage = () => {
      const segments = window.location.pathname.split("/").filter(Boolean);
      return segments.length <= 1;
    };

    const terminateSession = async () => {
      if (isOnLoginPage()) return;
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch {
        /* BFF unreachable — redirect anyway */
      }
      clearStoredAuthUser();
      const locale = getLocale();
      window.location.assign(`/${locale}?expired=1`);
    };

    // ── Session integrity: redirect to login when cookies landed us on
    //    an authenticated page but localStorage was never populated. ──
    if (!isOnLoginPage() && !getStoredAuthUser()) {
      void terminateSession();
      return;
    }

    /**
     * Check whether the access token is still accepted by the backend.
     * Returns true when the session is alive, false when it is dead.
     */
    const isAccessTokenAlive = async (): Promise<boolean> => {
      try {
        const res = await fetch("/api/auth/session-status", {
          credentials: "include",
        });
        return res.status !== 401;
      } catch {
        return true;
      }
    };

    /**
     * When a proactive refresh fails, verify that the access token is
     * actually dead before wiping UI state.  A refresh 401 can happen
     * due to cross-app token rotation while the access token is still
     * valid for several more minutes.
     */
    const handleRefreshFailure = async () => {
      const alive = await isAccessTokenAlive();
      if (alive) {
        consecutiveRefreshFailuresRef.current += 1;
        if (consecutiveRefreshFailuresRef.current >= MAX_CONSECUTIVE_REFRESH_FAILURES) {
          await terminateSession();
          return;
        }
        retryTimerRef.current = setTimeout(async () => {
          const retryOk = await tryRefreshSession();
          if (retryOk) {
            consecutiveRefreshFailuresRef.current = 0;
          }
        }, REFRESH_RETRY_DELAY_MS);
        return;
      }
      await terminateSession();
    };

    // --- Session-status poll (cross-app SLO detection) ---
    pollRef.current = setInterval(async () => {
      if (!getStoredAuthUser()) return;
      try {
        const res = await fetch("/api/auth/session-status", {
          credentials: "include",
        });
        if (res.status === 401) {
          const refreshed = await tryRefreshSession();
          if (!refreshed) {
            await terminateSession();
          } else {
            consecutiveRefreshFailuresRef.current = 0;
          }
        }
      } catch {
        // Network error — skip this cycle
      }
    }, SESSION_POLL_INTERVAL_MS);

    // --- Proactive refresh timer ---
    refreshRef.current = setInterval(async () => {
      if (!getStoredAuthUser()) return;
      const ok = await tryRefreshSession();
      if (ok) {
        consecutiveRefreshFailuresRef.current = 0;
      } else {
        await handleRefreshFailure();
      }
    }, PROACTIVE_REFRESH_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (refreshRef.current) clearInterval(refreshRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return null;
}
