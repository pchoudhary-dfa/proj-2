"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { initDFAHelp } from "@dfa/dfa-help-renderer";
import "@dfa/dfa-help-renderer/dist/cjs/index.css";
import { useCore, useSystemLanguagesFromServer } from "@/contexts/CoreContext";
import {
  DfaHelpConfigProvider,
  HELP_CONTENT_LOCALES,
} from "@/contexts/DfaHelpConfigContext";
import { DFA_HELP_KEYDATA_URL } from "@/lib/constants";

type DfaHelpProviderProps = {
  children: ReactNode;
};

function normalizeLocale(locale: string): string {
  return locale.trim().replace(/_/g, "-") || "en";
}

/**
 * Initializes DFA Help renderer once per session (and when locale changes).
 * Mount under {@link CoreProvider} so `defaultLang` matches the active locale.
 */
export function DfaHelpProvider({ children }: DfaHelpProviderProps) {
  const { locale } = useCore();
  const systemLanguageRows = useSystemLanguagesFromServer();

  const defaultLang = normalizeLocale(locale ?? "en");

  const languages = useMemo(() => {
    const sysLocales = systemLanguageRows
      .filter((r) => !r.is_deleted)
      .map((r) => normalizeLocale(r.locale));
    const base =
      sysLocales.length > 0 ? sysLocales : [...HELP_CONTENT_LOCALES];
    return Array.from(new Set([defaultLang, ...base]));
  }, [defaultLang, systemLanguageRows]);

  const configValue = useMemo(
    () => ({ languages, defaultLang }),
    [languages, defaultLang],
  );

  useEffect(() => {
    initDFAHelp({
      apiURL: DFA_HELP_KEYDATA_URL,
      defaultLang,
      languages,
      iconType: "info",
      enable: true,
      colorCode: "#993366",
      colorHoverCode: "#662244",
      colorTextCode: "#ffffff",
      headerBackgroundCode: "#f9fafb",
    });
  }, [defaultLang, languages]);

  return (
    <DfaHelpConfigProvider value={configValue}>{children}</DfaHelpConfigProvider>
  );
}
