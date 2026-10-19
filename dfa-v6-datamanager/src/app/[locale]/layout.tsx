import {
  allowedLocaleCodesFromRows,
  fetchSystemLanguages,
} from "@/lib/api/core";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { SessionKeepAlive } from "@/components/SessionKeepAlive";
import {
  CoreProvider,
  SystemLanguagesServerProvider,
} from "@/contexts/CoreContext";
import { isAllowedAppLocale, isValidLocaleSegment } from "@/lib/i18n/config";
import { isRtlForLocale } from "@/lib/i18n/rtl";
import { DocumentHtmlDirection } from "@/components/DocumentHtmlDirection";
import { DfaHelpProvider } from "@/components/DfaHelpProvider";
import { PWAMetadata } from "@/components/PWAMetadata";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocaleSegment(locale)) notFound();

  let systemLanguageRows: Awaited<ReturnType<typeof fetchSystemLanguages>> = [];
  try {
    systemLanguageRows = await fetchSystemLanguages();
  } catch {
    /* same as fetchAllowedLocaleCodes: fall back for URL validation */
  }

  const hasAuthoritativeList = systemLanguageRows.length > 0;
  if (hasAuthoritativeList) {
    const allowed = allowedLocaleCodesFromRows(systemLanguageRows);
    if (!isAllowedAppLocale(locale, allowed)) notFound();
  }
  // When GET /system-language fails on the server, skip whitelist checks: the client may
  // still load languages and `router.replace("/es")`; rejecting those URLs caused 404s.

  const rtl = isRtlForLocale(locale, systemLanguageRows);
  const htmlLang = locale.trim().replace(/_/g, "-");

  return (
    <SystemLanguagesServerProvider rows={systemLanguageRows}>
      <CoreProvider locale={locale}>
        <DfaHelpProvider>
          <PWAMetadata />
          <DocumentHtmlDirection />
          <div className="min-h-screen" dir={rtl ? "rtl" : "ltr"} lang={htmlLang}>
            <SessionKeepAlive />
            <Sidebar>{children}</Sidebar>
          </div>
        </DfaHelpProvider>
      </CoreProvider>
    </SystemLanguagesServerProvider>
  );
}
