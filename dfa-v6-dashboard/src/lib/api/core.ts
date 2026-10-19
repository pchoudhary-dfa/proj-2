import { apiFetch } from "@/lib/api/client";
import { getAppConfigApiUrl,getTranslationsApiUrl,FALLBACK_DEFAULT_LOCALE,API_BASE_URL,getSystemLanguageApiUrl,FALLBACK_ALLOWED_LOCALE_CODES } from "@/lib/constants";

export const APP_TITLE_CONFIG_KEY = "APP_TITLE";
export const APP_NAME_CONFIG_KEY = "APP_NAME";
export const FLAVOR_COLOR_CONFIG_KEY = "FLAVOR_COLOR";
export const FLAVOR_COLOR_HOVER_CONFIG_KEY = "FLAVOR_COLOR_HOVER";
export const FLAVOR_LOGO_CONFIG_KEY = "FLAVOR_LOGO";
export const LANGUAGE_DEFAULT_CONFIG_KEY = "LANGUAGE_DEFAULT";

export type AppConfigEntry = {
  value: string;
  description?: string;
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
  status?: number;
  errors?: Record<string, unknown>;
};

export type AppConfigResult = AppConfigSuccess | AppConfigError;

function normalizeLocaleSegment(raw: string): string {
  const v = raw.trim().replace(/_/g, "-");
  if (!v || !/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(v)) {
    return FALLBACK_DEFAULT_LOCALE;
  }
  return v;
}

function parseAppConfigData(raw: unknown): AppConfigData {
  if (!raw || typeof raw !== "object") return {};
  const out: AppConfigData = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      out[key] = { value };
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const rec = value as Record<string, unknown>;
    out[key] = {
      value: typeof rec.value === "string" ? rec.value : "",
      ...(typeof rec.description === "string"
        ? { description: rec.description }
        : {}),
      ...(typeof rec.is_system === "boolean" ? { is_system: rec.is_system } : {}),
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
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

export async function fetchAppConfig(
  options: { baseUrl?: string,signal?: AbortSignal; cache?: RequestCache } = {}
): Promise<AppConfigResult> {
  const url = getAppConfigApiUrl();
  const headers = { Accept: "application/json" };
  try {
    const response = await apiFetch(url, {
      method: "GET",
      headers,
      cache: options.cache ?? "no-store",
      signal: options.signal,
    });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok || json.success !== true) {
      return {
        success: false,
        status: response.status,
        err_message:
          (json.err_message as string | undefined) ??
          (json.message as string | undefined) ??
          `HTTP ${response.status}`,
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
        error instanceof Error ? error.message : "Failed to load app config",
    };
  }
}

// --- System languages (GET /system-language) --------------------------------

export interface SystemLanguageRow {
  id: number;
  locale: string;
  name?: string;
  description: string;
  is_rtl: boolean;
  is_default: boolean;
  is_deleted: boolean;
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
