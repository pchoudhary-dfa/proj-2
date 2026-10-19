"use client";

import { Loader } from "@/components/Loader";
import {
  APP_NAME_CONFIG_KEY,
  APP_TITLE_CONFIG_KEY,
  FLAVOR_COLOR_CONFIG_KEY,
  FLAVOR_COLOR_HOVER_CONFIG_KEY,
  FLAVOR_LOGO_CONFIG_KEY,
  fetchAppConfig,
  getAppConfigValue,
  type AppConfigData,
} from "@/lib/api/core";
import { getAppVersion } from "@/lib/version";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AppConfigContextValue = {
  config: AppConfigData;
  isLoading: boolean;
  error: string | null;
  appName: string | null;
  appTitle: string | null;
  logo: string | null;
  appVersion: string;
};

const AppConfigContext = createContext<AppConfigContextValue | null>(null);
const EMPTY_CONFIG: AppConfigData = {};
let appConfigRequestPromise: ReturnType<typeof fetchAppConfig> | null = null;

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

function isValidCssColor(value: string): boolean {
  return typeof CSS !== "undefined" && CSS.supports("color", value);
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

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfigData>(EMPTY_CONFIG);
  const [appVersion, setAppVersion] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!appConfigRequestPromise) {
        appConfigRequestPromise = fetchAppConfig();
      }
      const result = await appConfigRequestPromise;
      if (cancelled) return;
      if (result.success !== true) {
        setError(result.err_message ?? "Failed to load app config");
        setIsLoading(false);
        return;
      }
      setConfig(result.data);
      setError(null);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getAppVersion();
        if (!cancelled) setAppVersion(v);
      } catch {
        if (!cancelled) setAppVersion("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const primaryColor = getAppConfigValue(config, FLAVOR_COLOR_CONFIG_KEY);
    const hoverColor = getAppConfigValue(config, FLAVOR_COLOR_HOVER_CONFIG_KEY);
    const appTitle = getAppConfigValue(config, APP_TITLE_CONFIG_KEY);

    applyCssVar(
      "--color-primary",
      primaryColor && isValidCssColor(primaryColor) ? primaryColor : null
    );
    applyCssVar(
      "--color-primary-hover",
      hoverColor && isValidCssColor(hoverColor) ? hoverColor : null
    );

    if (typeof document !== "undefined" && appTitle) {
      document.title = appTitle;
    }
  }, [config]);

  const value = useMemo<AppConfigContextValue>(() => {
    return {
      config,
      isLoading,
      error,
      appName: getAppConfigValue(config, APP_NAME_CONFIG_KEY),
      appTitle: getAppConfigValue(config, APP_TITLE_CONFIG_KEY),
      logo: toAssetHref(getAppConfigValue(config, FLAVOR_LOGO_CONFIG_KEY)),
      appVersion,
    };
  }, [config, error, isLoading]);

  return (
    <AppConfigContext.Provider value={value}>
      {isLoading ? (
        <div className="flex min-h-screen w-full items-center justify-center bg-surface text-center text-text">
          <Loader/>
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
  );}

export function useAppConfig(): AppConfigContextValue {
  const ctx = useContext(AppConfigContext);
  if (!ctx) {
    throw new Error("useAppConfig must be used within AppConfigProvider");
  }
  return ctx;
}
