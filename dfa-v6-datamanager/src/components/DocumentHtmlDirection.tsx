"use client";

import { useLayoutEffect } from "react";
import { useCore, useSystemLanguagesFromServer } from "@/contexts/CoreContext";
import { defaultLocale } from "@/lib/i18n/config";
import { isRtlForLocale } from "@/lib/i18n/rtl";

/**
 * Keeps `document.documentElement` `dir` / `lang` in sync with the active locale so portaled UI
 * (e.g. Sonner toasts) follows RTL, and restores defaults when leaving `[locale]` routes.
 */
export function DocumentHtmlDirection() {
  const { locale } = useCore();
  const rows = useSystemLanguagesFromServer();

  useLayoutEffect(() => {
    const html = document.documentElement;
    const rtl = isRtlForLocale(locale, rows);
    html.setAttribute("dir", rtl ? "rtl" : "ltr");
    html.setAttribute("lang", locale.trim().replace(/_/g, "-"));

    return () => {
      html.setAttribute("dir", "ltr");
      html.setAttribute("lang", defaultLocale);
    };
  }, [locale, rows]);

  return null;
}
