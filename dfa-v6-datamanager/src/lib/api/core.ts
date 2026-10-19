/**
 * Core API: app-config (default locale), auth (login/register), system languages.
 * Mirrors dfa-toolkit-app-visualizer `core.ts` grouping for non–data-warehouse resources.
 */

import { apiFetch } from "@/lib/api/client";
import {
  API_BASE_URL,
  FALLBACK_ALLOWED_LOCALE_CODES,
  FALLBACK_DEFAULT_LOCALE,
  getAppConfigApiUrl,
  getAuthApiUrl,
  getSystemLanguageApiUrl,
  getTranslationsApiUrl,
} from "@/lib/constants";

// --- App config (GET /app-config) ---------------------------------

/** Key in app-config response `data` object (matches apps/app_db/data/config.json DFA_DM). */
export const LANGUAGE_DEFAULT_CONFIG_KEY = "LANGUAGE_DEFAULT";
export const APP_TITLE_CONFIG_KEY = "APP_TITLE";
export const APP_NAME_CONFIG_KEY = "APP_NAME";
export const FLAVOR_COLOR_CONFIG_KEY = "FLAVOR_COLOR";
export const FLAVOR_COLOR_HOVER_CONFIG_KEY = "FLAVOR_COLOR_HOVER";
export const FLAVOR_FAVICON_CONFIG_KEY = "FLAVOR_FAVICON";
export const FLAVOR_LOGO_CONFIG_KEY = "FLAVOR_LOGO";
export const ENABLED_PRODUCTS_CONFIG_KEY = "ENABLED_PRODUCTS";
/** When `yes`, show the header language selector (GET /system-language). */
export const LANGUAGE_ENABLED_CONFIG_KEY = "LANGUAGE_ENABLED";
/** Max upload size in MiB (1024² bytes); canonical toolkit key. */
export const ALLOWED_IMPORT_FILE_SIZE_MB_CONFIG_KEY = "ALLOWED_IMPORT_FILE_SIZE_MB";
/** Legacy max upload bytes; read when MB key is absent. */
export const ALLOWED_IMPORT_FILE_SIZE_BYTES_CONFIG_KEY = "ALLOWED_IMPORT_FILE_SIZE_BYTES";
/** SSO login mode toggle: "true" = SSO-only, "false"/unset = local-only. Read at runtime. */
export const SSO_ENABLED_CONFIG_KEY = "SSO_ENABLED";
/** Application identifier key from system_configuration; matches the backend app_key (e.g. "DFA_DM"). */
export const APP_ID_CONFIG_KEY = "APP_ID";
/** Footer line shown at the bottom of the app (login + shell). */
export const APP_FOOTER_NOTE_CONFIG_KEY = "APP_FOOTER_NOTE";
/** Last warehouse refresh timestamp shown in the sidebar when non-empty. */
export const LAST_REFRESHED_TIME_CONFIG_KEY = "LAST_REFRESHED_TIME";

const FALLBACK_ALLOWED_IMPORT_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const APP_CONFIG_PATH = "/app-config";

function normalizeLocaleSegment(raw: string): string {
  const v = raw.trim().replace(/_/g, "-");
  if (!v || !/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(v)) {
    return FALLBACK_DEFAULT_LOCALE;
  }
  return v;
}

export type AppConfigEntry = {
  value: string;
  description: string;
  /** Present when the toolkit returns `is_system` on GET /app-config. */
  is_system?: boolean;
};

export type AppConfigData = Record<string, AppConfigEntry>;

export type AppConfigSuccess = {
  success: true;
  message?: string;
  data: AppConfigData;
};

export type AppConfigError = {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
  status?: number;
};

export type AppConfigResult = AppConfigSuccess | AppConfigError;

function buildAppConfigUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${APP_CONFIG_PATH}`;
}

function buildAppConfigPatchUrl(baseUrl?: string): string {
  return baseUrl != null ? buildAppConfigUrl(baseUrl) : getAppConfigApiUrl();
}

function parseAppConfigData(raw: unknown): AppConfigData {
  if (!raw || typeof raw !== "object") return {};
  const out: AppConfigData = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    // Support both app-config payload shapes:
    // 1) { KEY: { value: "...", description: "..." } }
    // 2) { KEY: "..." }
    if (typeof value === "string") {
      out[key] = { value, description: "" };
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const valueObj = value as Record<string, unknown>;
    const entryValue = valueObj.value;
    const entryDescription = valueObj.description;
    const entryIsSystem = valueObj.is_system;
    out[key] = {
      value: typeof entryValue === "string" ? entryValue : "",
      description: typeof entryDescription === "string" ? entryDescription : "",
      ...(typeof entryIsSystem === "boolean" ? { is_system: entryIsSystem } : {}),
    };
  }
  return out;
}

export function getAppConfigValue(
  data: AppConfigData | undefined,
  key: string
): string | null {
  const raw = data?.[key]?.value;
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v ? v : null;
}

/**
 * Resolved max import file size from app-config `ALLOWED_IMPORT_FILE_SIZE_MB` (MiB),
 * then legacy `ALLOWED_IMPORT_FILE_SIZE_BYTES`, or 50 MiB when missing or invalid.
 */
export function parseAllowedImportFileSizeBytes(
  data: AppConfigData | undefined
): number {
  const mbRaw = getAppConfigValue(data, ALLOWED_IMPORT_FILE_SIZE_MB_CONFIG_KEY);
  if (mbRaw != null) {
    const mib = Number.parseInt(mbRaw, 10);
    if (Number.isFinite(mib) && mib > 0) return mib * 1024 * 1024;
  }
  const bytesRaw = getAppConfigValue(data, ALLOWED_IMPORT_FILE_SIZE_BYTES_CONFIG_KEY);
  if (bytesRaw != null) {
    const n = Number.parseInt(bytesRaw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return FALLBACK_ALLOWED_IMPORT_FILE_SIZE_BYTES;
}

/** Short label for toast copy, e.g. `5 MB` or `2.5 MB` (binary units). */
export function formatAllowedImportSizeLabel(maxBytes: number): string {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return "0 B";
  const mib = maxBytes / (1024 * 1024);
  if (mib >= 1) {
    return Number.isInteger(mib) ? `${mib} MB` : `${mib.toFixed(1)} MB`;
  }
  const kib = maxBytes / 1024;
  if (kib >= 1) {
    return Number.isInteger(kib) ? `${kib} KB` : `${kib.toFixed(1)} KB`;
  }
  return `${Math.round(maxBytes)} B`;
}

/**
 * Client-safe app config fetch.
 * Uses only X-Api-Key and never sends bearer token.
 */
export type AppConfigPatchPayload = Record<
  string,
  { value: string; description?: string; is_system?: boolean | null }
>;

export type AppConfigPatchSuccess = {
  success: true;
  message?: string;
  data: {
    requested_count: number;
    updated_count: number;
    updated_keys: string[];
    missing_keys: string[];
  };
};

export type AppConfigPatchResult = AppConfigPatchSuccess | AppConfigError;

/**
 * PATCH /app-config — updates existing keys for the app resolved from X-Api-Key.
 * Uses signed `apiFetch` (session cookies + app client signature).
 */
export async function patchAppConfig(
  payload: AppConfigPatchPayload,
  options: { baseUrl?: string; signal?: AbortSignal } = {}
): Promise<AppConfigPatchResult> {
  const url = buildAppConfigPatchUrl(options.baseUrl);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  try {
    const res = await apiFetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
      signal: options.signal,
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!res.ok || json.success !== true) {
      return {
        success: false,
        status: res.status,
        err_message:
          (json.err_message as string | undefined) ??
          (json.message as string | undefined) ??
          `HTTP ${res.status}`,
        errors: json.errors as Record<string, unknown> | undefined,
      };
    }

    const rawData = json.data as Record<string, unknown> | undefined;
    const data = {
      requested_count: Number(rawData?.requested_count ?? 0),
      updated_count: Number(rawData?.updated_count ?? 0),
      updated_keys: Array.isArray(rawData?.updated_keys)
        ? (rawData?.updated_keys as unknown[]).filter((k): k is string => typeof k === "string")
        : [],
      missing_keys: Array.isArray(rawData?.missing_keys)
        ? (rawData?.missing_keys as unknown[]).filter((k): k is string => typeof k === "string")
        : [],
    };

    return {
      success: true,
      message: json.message as string | undefined,
      data,
    };
  } catch (error) {
    return {
      success: false,
      err_message:
        error instanceof Error ? error.message : "Failed to patch app config",
    };
  }
}

type FetchAppConfigOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
  cache?: RequestCache;
  /**
   * When set, adds `is_system` query param (Toolkit GET /app-config).
   * Use `false` to return only user-editable keys (exclude system-managed rows).
   */
  isSystem?: boolean;
  /**
   * When true, request full UNIT_DATA_FORMAT_CATALOG (all codes + formatting_enabled).
   * Default client fetch returns only enabled selectable formats.
   */
  unitFormatCatalogFull?: boolean;
};

/** One in-flight / resolved promise per option set (Strict Mode + duplicate callers). */
const appConfigRequestPromises = new Map<string, Promise<AppConfigResult>>();

function appConfigRequestCacheKey(options: FetchAppConfigOptions): string {
  return JSON.stringify({
    baseUrl: options.baseUrl ?? null,
    cache: options.cache ?? null,
    isSystem: options.isSystem ?? null,
    unitFormatCatalogFull: options.unitFormatCatalogFull ?? null,
  });
}

/** Drop cached GET /app-config promises (e.g. after Administration PATCH). */
export function invalidateAppConfigFetchCache(): void {
  appConfigRequestPromises.clear();
}

async function fetchAppConfigOnce(
  options: FetchAppConfigOptions = {}
): Promise<AppConfigResult> {
  const path =
    options.baseUrl != null
      ? buildAppConfigUrl(options.baseUrl)
      : getAppConfigApiUrl();
  const params = new URLSearchParams();
  if (options.isSystem === true) params.set("is_system", "true");
  else if (options.isSystem === false) params.set("is_system", "false");
  if (options.unitFormatCatalogFull === true) {
    params.set("unit_format_catalog", "full");
  }
  const qs = params.toString();
  const url = qs ? `${path}?${qs}` : path;
  const headers: Record<string, string> = { Accept: "application/json" };

  try {
    const res = await apiFetch(url, {
      method: "GET",
      headers,
      cache: options.cache ?? "no-store",
      signal: options.signal,
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!res.ok || json.success !== true) {
      return {
        success: false,
        status: res.status,
        err_message:
          (json.err_message as string | undefined) ??
          (json.message as string | undefined) ??
          `HTTP ${res.status}`,
        errors: json.errors as Record<string, unknown> | undefined,
      };
    }

    return {
      success: true,
      message: json.message as string | undefined,
      data: parseAppConfigData(json.data),
    };
  } catch (error) {
    return {
      success: false,
      err_message:
        error instanceof Error ? error.message : "Failed to fetch app config",
    };
  }
}

export async function fetchAppConfig(
  options: FetchAppConfigOptions = {}
): Promise<AppConfigResult> {
  const key = appConfigRequestCacheKey(options);
  const existing = appConfigRequestPromises.get(key);
  if (existing) return existing;

  const promise = fetchAppConfigOnce(options);
  appConfigRequestPromises.set(key, promise);
  void promise.then((result) => {
    if (result.success !== true) {
      appConfigRequestPromises.delete(key);
    }
  });
  return promise;
}

/**
 * Resolve default locale from backend app-config (LANGUAGE_DEFAULT).
 * Uses X-Api-Key only (no bearer token).
 * Safe to call from Route Handlers and Server Components (Node).
 */
export async function resolveDefaultAppLocale(): Promise<string> {
  const result = await fetchAppConfig({
    baseUrl: API_BASE_URL,
    cache: "no-store",
  });
  if (result.success !== true) {
    return FALLBACK_DEFAULT_LOCALE;
  }
  const raw = getAppConfigValue(result.data, LANGUAGE_DEFAULT_CONFIG_KEY);
  return raw ? normalizeLocaleSegment(raw) : FALLBACK_DEFAULT_LOCALE;
}

// --- Auth (login / register) ------------------------------------------------

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  /** Present only for non-BFF clients; browser login uses HttpOnly cookies instead. */
  access_token?: string;
  refresh_token?: string;
  token_type: string;
  user_id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  api_keys?: string[];
  roles?: { dw_id: number | null; role_id: number; role: string; role_name: string }[];
  permissions?: Record<string, unknown>;
}

export interface RegisterPayload {
  first_name: string;
  last_name?: string;
  username: string;
  email?: string;
  password?: string;
}

export interface RegisterResponse {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  password_auto_generated: boolean;
}

export async function loginApi(
  credentials: LoginCredentials
): Promise<LoginResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(credentials),
  });
  const data = (await res.json()) as LoginResponse | { detail?: string };
  if (!res.ok) {
    const message =
      typeof (data as { detail?: string }).detail === "string"
        ? (data as { detail: string }).detail
        : "Invalid username or password";
    throw new Error(message);
  }
  return data as LoginResponse;
}

export async function registerApi(
  payload: RegisterPayload
): Promise<RegisterResponse> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      first_name: payload.first_name,
      last_name: payload.last_name ?? null,
      username: payload.username,
      email: payload.email ?? null,
      password: payload.password ?? null,
    }),
  });
  const data = (await res.json()) as RegisterResponse | { detail?: string };
  if (!res.ok) {
    const message =
      typeof (data as { detail?: string }).detail === "string"
        ? (data as { detail: string }).detail
        : "Registration failed";
    throw new Error(message);
  }
  return data as RegisterResponse;
}

export async function resetPasswordRequestApi(
  username: string
): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch(`${getAuthApiUrl()}/password/reset-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username }),
  });
  const data = (await res.json()) as { success?: boolean; message?: string; err_message?: string };
  if (!res.ok) {
    throw new Error(data.err_message ?? data.message ?? "Password reset failed");
  }
  return { success: true, message: data.message ?? "" };
}

// --- System languages (GET /system-language) --------------------------------

export interface SystemLanguageRow {
  id: number;
  locale: string;
  is_rtl: boolean;
  is_default: boolean;
  is_deleted: boolean;
  /** GET /system-language may include one of these for the human-readable label. */
  name?: string;
  language_name?: string;
  lang_name?: string;
  label?: string;
  display_name?: string;
  title?: string;
  native_name?: string;
}

type ListSuccess = {
  success: true;
  message?: string;
  data: SystemLanguageRow[];
};

/** Persisted key for login / app locale preference (optional follow-up for i18n). */
export const SELECTED_LOCALE_STORAGE_KEY = "dfa-selected-locale";

/** One in-flight / resolved promise per runtime (RSC layout + client login + Strict Mode). */
let systemLanguagesRequestPromise: Promise<SystemLanguageRow[]> | null = null;

export async function fetchSystemLanguages(): Promise<SystemLanguageRow[]> {
  if (!systemLanguagesRequestPromise) {
    const raw = (async (): Promise<SystemLanguageRow[]> => {
      const res = await apiFetch(getSystemLanguageApiUrl(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const json = (await res.json()) as
        | ListSuccess
        | { success: false; err_message?: string };
      if (!res.ok || json.success !== true || !Array.isArray(json.data)) {
        const msg =
          json.success === false && typeof json.err_message === "string"
            ? json.err_message
            : "Failed to load languages";
        throw new Error(msg);
      }
      return json.data;
    })();
    systemLanguagesRequestPromise = raw.catch((err) => {
      systemLanguagesRequestPromise = null;
      throw err;
    });
  }
  return systemLanguagesRequestPromise;
}

/**
 * Allowed `[locale]` URL segments derived from GET /system-language rows.
 * On empty list, falls back to {@link FALLBACK_ALLOWED_LOCALE_CODES}.
 */
export function allowedLocaleCodesFromRows(rows: SystemLanguageRow[]): string[] {
  const codes = rows
    .filter((r) => !r.is_deleted)
    .map((r) => r.locale.trim().replace(/_/g, "-"))
    .filter((loc) => /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(loc));
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of codes) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  return unique.length > 0 ? unique : [...FALLBACK_ALLOWED_LOCALE_CODES];
}

/**
 * Locale codes allowed in `/{locale}/...` — same source as the login/signup language dropdown.
 * On failure or empty response, falls back to {@link FALLBACK_ALLOWED_LOCALE_CODES}.
 */
export async function fetchAllowedLocaleCodes(): Promise<string[]> {
  try {
    return allowedLocaleCodesFromRows(await fetchSystemLanguages());
  } catch {
    return [...FALLBACK_ALLOWED_LOCALE_CODES];
  }
}

/**
 * Human-readable language name for `languageCode` (BCP 47), in `displayLocale`
 * (e.g. Spanish shown as "inglés" / "francés" when displayLocale is `es`).
 */
export function languageDisplayName(
  languageCode: string,
  displayLocale: string
): string {
  try {
    const tag = languageCode.trim().replace(/_/g, "-");
    if (!tag) return languageCode;
    const dl = displayLocale.trim().replace(/_/g, "-");
    const locales = dl ? [dl, "en"] : ["en"];
    const dn = new Intl.DisplayNames(locales, { type: "language" });
    const primary = tag.split(/[-/]/)[0] ?? tag;
    const resolved = dn.of(tag) ?? dn.of(primary);
    if (resolved && resolved.toLowerCase() !== tag.toLowerCase()) {
      return resolved;
    }

    try {
      const regionDn = new Intl.DisplayNames(locales, { type: "region" });
      const upper = tag.toUpperCase();
      if (upper.length === 2 || upper.length === 3) {
        const region = regionDn.of(upper);
        if (region) return region;
      }
    } catch {
      /* ignore */
    }
    if (resolved) return resolved;
    return languageCode;
  } catch {
    return languageCode;
  }
}

const API_SYSTEM_LANGUAGE_LABEL_KEYS = [
  "name",
  "language_name",
  "lang_name",
  "label",
  "display_name",
  "title",
  "native_name",
] as const;

function readApiSystemLanguageLabel(row: SystemLanguageRow): string | undefined {
  const rec = row as unknown as Record<string, unknown>;
  for (const key of API_SYSTEM_LANGUAGE_LABEL_KEYS) {
    const v = rec[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const [key, v] of Object.entries(rec)) {
    if (typeof v !== "string" || !v.trim()) continue;
    const nk = key.toLowerCase().replace(/_/g, "");
    if (
      nk === "languagename" ||
      nk === "langname" ||
      nk === "displayname" ||
      nk === "nativename"
    ) {
      return v.trim();
    }
  }
  return undefined;
}

/**
 * Label for a system-language row: backend name when present, else endonym
 * (language in its own locale), else name in the active UI locale.
 */
export function systemLanguageRowLabel(
  row: SystemLanguageRow,
  displayLocale: string
): string {
  const api = readApiSystemLanguageLabel(row);
  if (api) return api;
  const code = row.locale.trim().replace(/_/g, "-");
  if (!code) return row.locale;
  const endonym = languageDisplayName(code, code);
  if (endonym.toLowerCase() !== code.toLowerCase()) return endonym;
  const ui = languageDisplayName(code, displayLocale);
  if (ui.toLowerCase() !== code.toLowerCase()) return ui;
  return code;
}

/** Map API rows to Login component `languages` prop. */
export function systemLanguagesToOptions(
  rows: SystemLanguageRow[],
  displayLocale: string
): { value: string; label: string }[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.locale.localeCompare(b.locale);
  });
  return sorted.map((r) => ({
    value: r.locale,
    label: systemLanguageRowLabel(r, displayLocale),
  }));
}

export function pickDefaultLocale(
  rows: SystemLanguageRow[],
  preferred?: string | null
): string | undefined {
  if (!rows.length) return undefined;
  if (preferred) {
    const match = rows.find(
      (r) =>
        r.locale === preferred ||
        r.locale.toLowerCase() === preferred.toLowerCase()
    );
    if (match) return match.locale;
    const prefix = preferred.split(/[-_]/)[0]?.toLowerCase();
    if (prefix) {
      const byPrefix = rows.find((r) =>
        r.locale.toLowerCase().startsWith(prefix)
      );
      if (byPrefix) return byPrefix.locale;
    }
  }
  const def = rows.find((r) => r.is_default);
  return def?.locale ?? rows[0]?.locale;
}

// --- Translations (GET /translations, no trailing slash) --------------------

export type TranslationsData = Record<string, string>;

export type TranslationsSuccess = {
  success: true;
  data: TranslationsData;
};

export type TranslationsError = {
  success: false;
  code: string;
  message: string;
};

export type TranslationsResult = TranslationsSuccess | TranslationsError;

/**
 * `data` must be a plain object of translation code → string. Locale is chosen by the
 * server from `Accept-Language` on the request ({@link fetchTranslations}).
 */
function normalizeTranslationsPayload(data: unknown): TranslationsData {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  const out: TranslationsData = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/**
 * Fetch translated strings from the backend.
 * Sends `Accept-Language` so the backend can return locale-specific text.
 */
export async function fetchTranslations(
  locale: string
): Promise<TranslationsResult> {
  const path = getTranslationsApiUrl();

  try {
    const res = await apiFetch(path, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": locale,
      },
      cache: "no-store",
    });

    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!res.ok || json.success !== true) {
      return {
        success: false,
        code: (json.code as string | undefined) ?? "UNKNOWN_ERROR",
        message:
          (json.message as string | undefined) ??
          (json.err_message as string | undefined) ??
          `HTTP ${res.status}`,
      };
    }

    const data = normalizeTranslationsPayload(json.data);

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      code: "NETWORK_ERROR",
      message:
        error instanceof Error ? error.message : "Failed to fetch translations",
    };
  }
}

// --- System Applications (GET /system-api-clients) ---------------------------------

export interface SystemApplication {
  id: number;
  app_name: string;
  app_key: string;
  app_type: string;
  api_key: string;
  auth_method: string;
  origin_url: string;
  description: string;
  owner_user_id: number;
  status: string;
  allowed_ips: string | null;
  requires_user_auth: number;
  created: string;
  modified: string;
}

/**
 * Fetch all system applications (API clients).
 * Returns only active frontend applications.
 */
export async function fetchSystemApplications(): Promise<SystemApplication[]> {
  try {
    const response = await apiFetch("/api/backend/system-api-clients", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch applications: ${response.statusText}`);
      return [];
    }

    const result = await response.json();
    
    if (result.success && Array.isArray(result.data)) {
      // Filter only active frontend applications
      return result.data.filter(
        (app: SystemApplication) => app.status === "ACTIVE" && app.app_type === "FED"
      );
    }

    return [];
  } catch (error) {
    console.error("Error fetching system applications:", error);
    return [];
  }
}
