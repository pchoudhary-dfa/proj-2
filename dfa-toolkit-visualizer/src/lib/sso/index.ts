/**
 * SSO Module - Client-side Public API
 * Single entry point for client-side SSO functionality.
 * 
 * IMPORTANT: This file ONLY exports client-safe code.
 * Server-side code must import directly from "@/lib/sso/server".
 * 
 * Usage:
 * - Client code: import from "@/lib/sso"
 * - Server code: import from "@/lib/sso/server"
 */

// Client-side exports (safe for browser)
export {
  fetchSsoProvidersOnce,
  persistSsoUserMetadata,
  clearSsoSession,
  isSsoUser,
  exchangeSsoCode,
  ssoLogout,
} from "./client";

// Types (safe everywhere)
export type { SsoProviderListItem, SsoAuthResponse, SsoBffLoginResponse, SsoBffLogoutResponse, SsoBffRefreshResponse } from "./types";

// Constants (safe everywhere)
export {
  SSO_ENABLED_CONFIG_KEY,
  DFA_ACCESS_COOKIE,
  DFA_REFRESH_COOKIE,
  DFA_PERMISSIONS_SUMMARY_COOKIE,
  ACCESS_COOKIE_MAX_AGE_SEC,
  REFRESH_COOKIE_MAX_AGE_SEC,
  COOKIE_SECURE,
} from "./constants";
