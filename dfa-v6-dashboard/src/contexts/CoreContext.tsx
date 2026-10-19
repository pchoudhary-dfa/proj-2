"use client";

import {
  fetchTranslations,
  type SystemLanguageRow,
  type TranslationsData,
  type TranslationsResult,
} from "@/lib/api/core";
import { getTranslationsFallback } from "@/lib/i18n/translations";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const SystemLanguagesFromServerContext = createContext<SystemLanguageRow[]>([]);

export function SystemLanguagesServerProvider({
  rows,
  children,
}: {
  rows: SystemLanguageRow[];
  children: ReactNode;
}) {
  return (
    <SystemLanguagesFromServerContext.Provider value={rows}>
      {children}
    </SystemLanguagesFromServerContext.Provider>
  );
}

export function useSystemLanguagesFromServer(): SystemLanguageRow[] {
  return useContext(SystemLanguagesFromServerContext);
}

/** One in-flight / resolved promise per locale (mirrors appConfigRequestPromise in AppConfigContext). */
const translationsRequestPromises = new Map<
  string,
  Promise<TranslationsResult>
>();

interface CoreContextValue {
  /** Language segment from the URL (e.g. en, ar). */
  locale: string;
  /** Map of translation code → text (JSON first, then API can add/override). */
  translations: TranslationsData;
  /** True until the translations API call finishes (success or failure). */
  loading: boolean;
  /** Look up a string by code; optional fallback, else shows the code. */
  t: (code: string, fallback?: string) => string;
}

const CoreContext = createContext<CoreContextValue | undefined>(undefined);

export function CoreProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  const jsonFallback = getTranslationsFallback(locale);
  const [translations, setTranslations] =
    useState<TranslationsData>(jsonFallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fallback = getTranslationsFallback(locale);

    let promise = translationsRequestPromises.get(locale);
    if (!promise) {
      promise = fetchTranslations(locale);
      translationsRequestPromises.set(locale, promise);
    }

    promise.then((result) => {
      if (cancelled) return;
      setLoading(false);

      if (!result.success) {
        setTranslations(fallback);
        return;
      }

      setTranslations({ ...fallback, ...result.data });
    });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const t = useCallback(
    (code: string, fallback?: string) =>
      translations[code] ?? fallback ?? code,
    [translations]
  );

  const value: CoreContextValue = { locale, translations, loading, t };

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

/** Like useCore, but returns null outside CoreProvider (e.g. Loader). */
export function useCoreOptional(): CoreContextValue | null {
  return useContext(CoreContext) ?? null;
}
