"use client";

// Shared "core" state for the app under [locale]: current language, translation strings, and t().

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  fetchTranslations,
  type SystemLanguageRow,
  type TranslationsData,
  type TranslationsResult,
} from "@/lib/api/core";
import { getTranslationsFallback } from "@/lib/i18n/translations";

const SystemLanguagesFromServerContext = createContext<SystemLanguageRow[]>([]);

/**
 * RSC layout passes GET /system-language rows once so the login page does not refetch.
 * Wraps {@link CoreProvider} from the outside (see `[locale]/layout`).
 */
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

/** What child components get from useCore / useCoreOptional. */
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

export interface CoreProviderProps {
  children: ReactNode;
  locale: string;
}

/** Wrap locale routes (see app/[locale]/layout) so descendants can use useCore(). */
export function CoreProvider({ children, locale }: CoreProviderProps) {
  // Start with bundled JSON for this locale so UI has text before the network returns.
  const jsonFallback = getTranslationsFallback(locale);
  const [translations, setTranslations] =
    useState<TranslationsData>(jsonFallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If locale changes or we unmount, ignore late API responses.
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

      // API strings win over the same keys in the JSON file.
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

/** Use inside CoreProvider only; throws if the provider is missing. */
export function useCore() {
  const context = useContext(CoreContext);
  if (context === undefined) {
    throw new Error("useCore must be used within a CoreProvider");
  }
  return context;
}

/**
 * Like useCore, but returns null if there is no CoreProvider (no throw).
 * Handy for pieces that might sit outside the provider, e.g. some shell UI.
 */
export function useCoreOptional(): CoreContextValue | null {
  return useContext(CoreContext) ?? null;
}
