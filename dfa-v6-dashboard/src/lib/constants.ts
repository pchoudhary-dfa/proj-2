/**
 * Core constants – DFA Dashboard env contract.
 */

export const APP_BASE_ID =
  process.env.NEXT_PUBLIC_APP_BASE_ID ??
  process.env.APP_BASE_ID ??
  "DTK_DASHBOARD";
export const APP_ID =
  process.env.NEXT_PUBLIC_APP_ID ?? process.env.APP_ID ?? "DFADASHBOARD";

export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export const API_KEY =
  process.env.NEXT_PUBLIC_API_KEY ?? "dfa_dashboard_fed_app";

export const API_SIGNATURE = process.env.NEXT_PUBLIC_API_SIGNATURE ?? "";

export const API_PUBLIC_KEY = (
  process.env.NEXT_PUBLIC_API_PUBLIC_KEY ?? ""
).trim();

export const BFF_API_PREFIX = "/api/backend";
export const BFF_AUTH_PREFIX = "/api/auth";

/** Same-origin BFF for dfa-v6-comp-login (`baseUrl` → POST `${baseUrl}/login`). */
export const AUTH_SESSION_BFF_BASE = BFF_AUTH_PREFIX;

/** @deprecated Browser API traffic always uses BFF_API_PREFIX. */
export const API_PROXY_PREFIX = "/api/proxy";

export const SERVER_TOOLKIT_API_BASE = (
  process.env.DFA_TOOLKIT_INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

/**
 * Base URL for API fetches: browser -> BFF; server -> direct toolkit URL.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return BFF_API_PREFIX;
  }
  return SERVER_TOOLKIT_API_BASE;
}

export const X_APP_KEY_HEADER = "X-Api-Key";
export const X_APP_SIGNATURE_HEADER = "X-Api-Signature";
export const X_APP_TIMESTAMP_HEADER = "X-Api-Timestamp";
export const SYSTEM_LANGUAGE_PATH_SEGMENT = "/system-language";


export const FALLBACK_DEFAULT_LOCALE = "en";
export const FALLBACK_ALLOWED_LOCALE_CODES = [FALLBACK_DEFAULT_LOCALE];

const LOCALE_SEGMENT_RE = /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/;

/** BCP-47-style locale tag used as the first URL segment (e.g. `en`, `pt-BR`). */
export function isLocaleSegment(segment: string): boolean {
  return LOCALE_SEGMENT_RE.test(segment.trim());
}

/** `/{locale}` login surface (exactly one segment). */
export function isLocaleLoginPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 1 && isLocaleSegment(segments[0]);
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed.includes("://")) {
    return trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  }
  try {
    return new URL(trimmed).pathname;
  } catch {
    return trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  }
}

/** `/{locale}/dashboard/{dashboardId}` editor surface (exactly three segments). */
export function isLocaleDashboardEditorPath(pathname: string): boolean {
  const segments = normalizePathname(pathname).split("/").filter(Boolean);
  if (segments.length !== 3) return false;

  const [locale, section, dashboardId] = segments;
  return (
    isLocaleSegment(locale) &&
    section === "dashboard" &&
    dashboardId.trim().length > 0
  );
}

export function getLocaleFromPathname(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0];
  return first && isLocaleSegment(first) ? first : FALLBACK_DEFAULT_LOCALE;
}

export const DEFAULT_DASH_FAVICON = '/images/dfa_dash.png';
export const DEFAULT_LOGIN_LOGO = '/images/dfa_dash_logo.png';

export const APP_COPYRIGHT_HOLDER =
  process.env.NEXT_PUBLIC_COPYRIGHT_HOLDER ?? "DataForAll";

export const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION ?? "5.4.1"; 

export const APP_CONFIG_PATH = "/app-config";
export const TRANSLATIONS_PATH = '/translations';
export const IAM_USER_PATH = "/iam/user";
export const DW_PATH = "/dw";

export function getAppConfigApiUrl(): string {
  return `${getApiBaseUrl()}${APP_CONFIG_PATH}`;
}

export function getSystemLanguageApiUrl(): string {
  return `${getApiBaseUrl()}${SYSTEM_LANGUAGE_PATH_SEGMENT}`;
}

export function getTranslationsApiUrl(): string{
  return `${getApiBaseUrl()}${TRANSLATIONS_PATH}`
}

export function getIamUserApiUrl(): string {
  return `${getApiBaseUrl()}${IAM_USER_PATH}`;
}

export function getDatawarehouseListApiUrl(): string {
  return `${getApiBaseUrl()}${DW_PATH}`;
}

export function buildLocaleAppPath(locale:string,path:string):string{
  const seg = locale.trim() || FALLBACK_DEFAULT_LOCALE;
  return `/${seg}/${path}`
}

const LOCALE_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  pt: "Portuguese",
  "pt-BR": "Portuguese (Brazil)",
};

/** Human-readable locale label for header language selector. */
export function getLocaleDisplayName(locale: string): string {
  const normalized = locale.trim();
  return (
    LOCALE_DISPLAY_NAMES[normalized] ??
    LOCALE_DISPLAY_NAMES[normalized.split("-")[0] ?? ""] ??
    normalized
  );
}