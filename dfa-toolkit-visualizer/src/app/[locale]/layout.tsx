import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { ConditionalHeader } from "@/components/ConditionalHeader";
import { AppConfigApplier } from "@/components/AppConfigApplier";
import { AccessibilityRoot } from "@/components/Accessibility";
import { CoreProvider } from "@/contexts/CoreContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { VisualizerStateProvider } from "@/contexts/VisualizerStateContext";
import { SignedFetchProvider } from "@/components/SignedFetchProvider";
import PWARegister from "@/components/PWARegister";
import { PWAMetadata } from "@/components/PWAMetadata";
import { AppToaster } from "@/components/AppToaster";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <CoreProvider locale={locale}>
      <AuthProvider>
        <SignedFetchProvider>
          <AppConfigApplier />
          <PWAMetadata />
          <VisualizerStateProvider>
            <AccessibilityRoot>
              <div className="app-body flex flex-col">
                <ConditionalHeader locale={locale as Locale} />
                <main className="app-main-body">{children}</main>
              </div>
            </AccessibilityRoot>
          </VisualizerStateProvider>
          <PWARegister />
          <AppToaster />
        </SignedFetchProvider>
      </AuthProvider>
    </CoreProvider>
  );
}

