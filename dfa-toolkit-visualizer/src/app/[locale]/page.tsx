import type { Locale } from "@/lib/i18n/config";
import { isLocale } from "@/lib/i18n/config";
import { LandingContent } from "@/components/LandingContent";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale: Locale = isLocale(locale) ? locale : "en";

  return <LandingContent locale={safeLocale} />;
}

