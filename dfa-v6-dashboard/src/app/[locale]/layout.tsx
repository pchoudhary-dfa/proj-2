import { notFound } from "next/navigation";
import { isAllowedAppLocale, isRtlForLocale, isValidLocaleSegment } from "@/lib/i18n/config";
import { allowedLocaleCodesFromRows, fetchSystemLanguages } from "@/lib/api/core";
import { CoreProvider, SystemLanguagesServerProvider } from "@/contexts/CoreContext";
import Sidebar from "@/components/Sidebar";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isValidLocaleSegment(locale)) notFound();

  let systemLanguageRows = [];

  systemLanguageRows = await fetchSystemLanguages();

  const hasAuthoritativeList = systemLanguageRows.length > 0;
  if (hasAuthoritativeList) {
    const allowed = allowedLocaleCodesFromRows(systemLanguageRows);
    if (!isAllowedAppLocale(locale, allowed)) notFound();
  }
  const rtl = isRtlForLocale(locale, systemLanguageRows);
  const htmlLang = locale.trim().replace(/_/g, "-");
  return (
    <SystemLanguagesServerProvider rows={systemLanguageRows}>
      <CoreProvider locale = {locale}>
        <div lang={htmlLang} dir={rtl ? "rtl" : "ltr"} className="min-h-screen ">
          <Sidebar>{children}</Sidebar>
        </div>
      </CoreProvider>
    </SystemLanguagesServerProvider>
  );
}