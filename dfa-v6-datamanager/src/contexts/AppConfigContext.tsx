"use client";

import {
  APP_NAME_CONFIG_KEY,
  APP_TITLE_CONFIG_KEY,
  FLAVOR_FAVICON_CONFIG_KEY,
  FLAVOR_LOGO_CONFIG_KEY,
  SSO_ENABLED_CONFIG_KEY,
  fetchAppConfig,
  getAppConfigValue,
  invalidateAppConfigFetchCache,
  parseAllowedImportFileSizeBytes,
  type AppConfigData,
} from "@/lib/api/core";
import { DEFAULT_DM_FAVICON } from "@/lib/constants";
import {
  resolveFlavorColorsFromConfig,
  writeCachedFlavorTheme,
} from "@/lib/flavor-theme";
import { Loader } from "@/components/Loader";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type AppConfigContextValue = {
  config: AppConfigData;
  isLoading: boolean;
  error: string | null;
  appName: string | null;
  appTitle: string | null;
  logo: string | null;
  favicon: string | null;
  /** Max file size (bytes) for import UI; from app-config with 5 MiB fallback. */
  allowedImportFileSizeBytes: number;
  /** SSO login mode toggle — true = SSO-only, false = local-only. Derived from GET /app-config at runtime. */
  ssoEnabled: boolean;
  /** Re-fetch GET /app-config (e.g. after Administration saves unit format settings). */
  refreshConfig: () => Promise<void>;
};

const AppConfigContext = createContext<AppConfigContextValue | null>(null);

const EMPTY_CONFIG: AppConfigData = {};
const DEFAULT_FAVICON = DEFAULT_DM_FAVICON;

/** Drop cached app-config so the next load hits the API (after admin PATCH). */
export function invalidateAppConfigCache(): void {
  invalidateAppConfigFetchCache();
}

function toAssetHref(raw: string | null): string | null {
  if (!raw) return null;
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 64) {
    return `data:image/png;base64,${raw}`;
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/") || raw.startsWith("data:")) {
    return raw;
  }
  return `/${raw.replace(/^\/+/, "")}`;
}

function applyCssVar(name: string, value: string | null): void {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style;
  if (!value) {
    style.removeProperty(name);
    return;
  }
  style.setProperty(name, value);
}

function resolveFaviconHref(config: AppConfigData): string {
  return (
    toAssetHref(getAppConfigValue(config, FLAVOR_FAVICON_CONFIG_KEY)) ??
    DEFAULT_FAVICON
  );
}

function applyFavicon(href: string): void {
  if (typeof document === "undefined") return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

function applyDocumentTitleAndFavicon(config: AppConfigData): void {
  const appTitle = getAppConfigValue(config, APP_TITLE_CONFIG_KEY);
  if (appTitle) {
    document.title = appTitle;
  }
  applyFavicon(resolveFaviconHref(config));
}

function applyThemeFromConfig(config: AppConfigData): void {
  const { primary: resolvedPrimary, hover: resolvedHover } =
    resolveFlavorColorsFromConfig(config);
  const logo = toAssetHref(getAppConfigValue(config, FLAVOR_LOGO_CONFIG_KEY));

  applyCssVar("--color-primary", resolvedPrimary);
  applyCssVar("--color-primary-hover", resolvedHover);
  applyCssVar("--app-logo-url", logo ? `url("${logo}")` : null);

  if (resolvedPrimary || resolvedHover) {
    writeCachedFlavorTheme(resolvedPrimary, resolvedHover);
  }

  applyDocumentTitleAndFavicon(config);
}

async function loadAppConfigIntoState(
  setConfig: (config: AppConfigData) => void,
  setError: (error: string | null) => void
): Promise<boolean> {
  const result = await fetchAppConfig();
  if (result.success !== true) {
    setError(result.err_message ?? "Failed to load app config");
    return false;
  }
  applyThemeFromConfig(result.data);
  setConfig(result.data);
  setError(null);
  return true;
}

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [config, setConfig] = useState<AppConfigData>(EMPTY_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshConfig = useCallback(async () => {
    invalidateAppConfigCache();
    await loadAppConfigIntoState(setConfig, setError);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadAppConfigIntoState(setConfig, setError);
      if (!cancelled) {
        setIsLoading(false);
        if (!ok) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Object.keys(config).length === 0) return;
    applyThemeFromConfig(config);
  }, [config]);

  useEffect(() => {
    if (isLoading || Object.keys(config).length === 0) return;
    applyDocumentTitleAndFavicon(config);
  }, [pathname, config, isLoading]);

  const value = useMemo<AppConfigContextValue>(() => {
    return {
      config,
      isLoading,
      error,
      appName: getAppConfigValue(config, APP_NAME_CONFIG_KEY),
      appTitle: getAppConfigValue(config, APP_TITLE_CONFIG_KEY),
      logo: toAssetHref(getAppConfigValue(config, FLAVOR_LOGO_CONFIG_KEY)),
      favicon:
        toAssetHref(getAppConfigValue(config, FLAVOR_FAVICON_CONFIG_KEY)) ??
        DEFAULT_FAVICON,
      allowedImportFileSizeBytes: parseAllowedImportFileSizeBytes(config),
      ssoEnabled: getAppConfigValue(config, SSO_ENABLED_CONFIG_KEY) === "true",
      refreshConfig,
    };
  }, [config, error, isLoading, refreshConfig]);

  return (
    <AppConfigContext.Provider value={value}>
      {isLoading ? (
        <div className="flex min-h-screen w-full items-center justify-center bg-surface text-center text-text">
          <Loader />
        </div>
      ) : error ? (
        <div className="flex min-h-screen w-full items-center justify-center bg-surface text-center text-text">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">
              Configuration error
            </h1>
            <p className="mt-2 text-sm text-text-muted">
              {error || "Unauthorized"}
            </p>
          </div>
        </div>
      ) : (
        children
      )}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig(): AppConfigContextValue {
  const ctx = useContext(AppConfigContext);
  if (!ctx) {
    throw new Error("useAppConfig must be used within AppConfigProvider");
  }
  return ctx;
}
