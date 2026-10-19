"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  fetchAppConfigAndTranslations,
  fetchSystemLanguages,
  type FetchAppConfigAndTranslationsResult,
} from "../lib/api/core";
import type { AppConfigData, SystemLanguageEntry, TranslationsData } from "../lib/api/types";
import { APP_CONFIG_DEFAULTS } from "@/lib/constants";
import { SSO_ENABLED_CONFIG_KEY } from "@/lib/sso/constants";
import {
  getDataWarehouseIdFromConfig,
  unwrapAppConfigValue,
} from "@/lib/appConfig/utils";
import { getTranslationsFallback } from "@/lib/i18n/translations";
import { isRtlLocale } from "@/lib/i18n/config";
import { Loader } from "@/components/Loader";

type CoreFetchResult = FetchAppConfigAndTranslationsResult;

interface CoreContextValue {
  /** Current app config (in-memory). Use getConfig for a single key. */
  appConfig: AppConfigData;
  /** SSO enabled flag computed from backend config (SSO_ENABLED === "true"). */
  ssoEnabled: boolean;
  /** Current translations (in-memory). Use t(code) for display text. */
  translations: TranslationsData;
  /** Active system languages from GET /system-language. Empty until fetched. */
  systemLanguages: SystemLanguageEntry[];
  /** Effective data warehouse ID from app config (DWS_DEFAULT) only. Pass to API calls that need dwId. */
  dataWarehouseId: string;
  /** True when fetching (initial load or locale change). */
  loading: boolean;
  /** Set when fetch failed. */
  error: { code: string; message: string } | null;
  /** Get config value by key. Returns empty string if missing. */
  getConfig: (key: string) => string;
  /** Get translation by code. Returns fallback or code if missing. */
  t: (code: string, fallback?: string) => string;
  /** Re-fetch app config (e.g. after settings save). Does not reload translations. */
  refreshConfig: () => Promise<void>;
}

const CoreContext = createContext<CoreContextValue | undefined>(undefined);

export interface CoreProviderProps {
  children: ReactNode;
  /** Current locale. Fetches app-config + translations from client (visible in Network tab). */
  locale: string;
}

export function CoreProvider({ children, locale }: CoreProviderProps) {
  const pathname = usePathname();
  const [appConfig, setAppConfig] = useState<AppConfigData>({});
  const [translations, setTranslations] = useState<TranslationsData>({});
  const [systemLanguages, setSystemLanguages] = useState<SystemLanguageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null
  );

  // Auth pages don't require a data warehouse to be configured
  const isAuthRoute = pathname?.includes("/auth") ?? false;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtlLocale(locale) ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const jsonFallback = getTranslationsFallback(locale);

    Promise.all([
      fetchAppConfigAndTranslations(locale),
      fetchSystemLanguages(),
    ]).then(([result, langs]: [CoreFetchResult, SystemLanguageEntry[]]) => {
      if (cancelled) return;
      setLoading(false);
      setSystemLanguages(langs);
      if (!result.ok) {
        const err = result.error;
        setError({
          code: err && "code" in err ? err.code : "UNKNOWN",
          message: err?.message ?? "Failed to load app configuration.",
        });
        setTranslations(jsonFallback);
        return;
      }
      setAppConfig(result.config);
      setTranslations({ ...jsonFallback, ...result.translations });
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const getConfig = useCallback(
    (key: string) =>
      unwrapAppConfigValue(appConfig[key]) || APP_CONFIG_DEFAULTS[key] || "",
    [appConfig]
  );

  const refreshConfig = useCallback(async () => {
    const result = await fetchAppConfigAndTranslations(locale);
    if (result.ok) {
      setAppConfig(result.config);
    }
  }, [locale]);

  const t = useCallback(
    (code: string, fallback?: string) =>
      translations[code] ?? fallback ?? code,
    [translations]
  );

  const dataWarehouseIdValue = getDataWarehouseIdFromConfig(appConfig);
  
  // Compute SSO enabled flag from backend config
  const ssoEnabled = unwrapAppConfigValue(appConfig[SSO_ENABLED_CONFIG_KEY]) === "true";
  
  const value: CoreContextValue = {
    appConfig,
    ssoEnabled,
    translations,
    systemLanguages,
    dataWarehouseId: dataWarehouseIdValue,
    loading,
    error,
    getConfig,
    t,
    refreshConfig,
  };

  const fallbackTranslations = getTranslationsFallback(locale);
  const fallbackT = (key: string) => fallbackTranslations[key] ?? key;
  const initialLoadingLabel =
    fallbackTranslations["COMMON_LOADING"] ?? "Loading...";

  // Show loading screen only for non-auth routes during initial load
  if (loading && !Object.keys(translations).length && !isAuthRoute) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white">
        <Loader
          loadingLabel={initialLoadingLabel}
          showStatusText={false}
          ariaLabel={initialLoadingLabel}
        />
      </div>
    );
  }

  if (error) {
    const titleKey =
      error.code === "APP_NOT_FOUND"
        ? "ERRORS_APP_NOT_FOUND"
        : error.code === "NETWORK_ERROR"
          ? "ERRORS_UNABLE_TO_REACH_SERVER"
          : "ERRORS_CONFIGURATION_ERROR";
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            {fallbackT(titleKey)}
          </h1>
          <p className="mt-2 text-slate-600">{error.message}</p>
          {error.code === "NETWORK_ERROR" && (
            <p className="mt-1 text-sm text-slate-500">
              {fallbackT("ERRORS_API_URL_HINT")}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Allow auth routes to render even without a data warehouse configured
  if (!dataWarehouseIdValue && !isAuthRoute) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            {fallbackT("ERRORS_DATA_WAREHOUSE_NOT_AVAILABLE")}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <CoreContext.Provider value={value}>{children}</CoreContext.Provider>
  );
}

export function useCore() {
  const context = useContext(CoreContext);
  if (context === undefined) {
    throw new Error("useCore must be used within a CoreProvider");
  }
  return context;
}
