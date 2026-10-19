/**
 * SSO-related constants
 * Centralized location for all SSO configuration keys and cookie names.
 */

/** Key in backend system_configuration table to read SSO_ENABLED flag at runtime */
export const SSO_ENABLED_CONFIG_KEY = "SSO_ENABLED";

/** HttpOnly cookie name for JWT access token (10min expiry) */
export const DFA_ACCESS_COOKIE = "dfa_viz_access";

/** HttpOnly cookie name for JWT refresh token (7d expiry) */
export const DFA_REFRESH_COOKIE = "dfa_viz_refresh";

/** Non-httpOnly cookie for middleware route permission checks */
export const DFA_PERMISSIONS_SUMMARY_COOKIE = "dfa_viz_permissions_summary";

/** Align with toolkit-api defaults: ACCESS_TOKEN_EXPIRE_MINUTES=10 */
export const ACCESS_COOKIE_MAX_AGE_SEC = 60 * 10; // 10 minutes

/** Align with toolkit-api defaults: REFRESH_TOKEN_EXPIRE_DAYS=7 */
export const REFRESH_COOKIE_MAX_AGE_SEC = 86400 * 7; // 7 days

/** Secure flag for cookies (production only) */
export const COOKIE_SECURE = process.env.NODE_ENV === "production";
