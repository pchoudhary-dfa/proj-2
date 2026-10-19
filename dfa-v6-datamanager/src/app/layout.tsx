import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { AppToaster } from "@/components/AppToaster";
import PWARegister from "@/components/PWARegister";
import { AppConfigProvider } from "@/contexts/AppConfigContext";
import { defaultLocale } from "@/lib/i18n/config";
import { fetchAppConfig } from "@/lib/api/core";
import {
  FLAVOR_THEME_CACHE_SCRIPT,
  flavorColorsToHtmlStyle,
  resolveFlavorColorsFromConfig,
} from "@/lib/flavor-theme";
import "@dfa-v6/styleguide/globals.css";
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "DFA v6 Data Manager",
  description: "DFA v6 Data Manager",
  icons: {
    icon: "/images/dfa_def_dm.png",
  },
  manifest: "/manifest.json",
};

async function resolveServerFlavorHtmlStyle(): Promise<CSSProperties | undefined> {
  try {
    const result = await fetchAppConfig({ cache: "no-store" });
    if (result.success !== true) return undefined;
    return flavorColorsToHtmlStyle(resolveFlavorColorsFromConfig(result.data));
  } catch {
    return undefined;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const lang = cookieStore.get("NEXT_LOCALE")?.value ?? defaultLocale;
  const flavorHtmlStyle = await resolveServerFlavorHtmlStyle();

  return (
    <html
      lang={lang}
      className={inter.variable}
      style={flavorHtmlStyle}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: FLAVOR_THEME_CACHE_SCRIPT }}
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://fonts.gstatic.com/s/materialicons/v145/flUhRq6tzZclQEJ-Vdg-IuiaDsNZ.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://fonts.gstatic.com/s/materialsymbolsoutlined/v323/kJF1BvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oDMzByHX9rA6RzaxHMPdY43zj-jCxv3fzvRNU22ZXGJpEpjC_1v-p_4MrImHCIJIZrDCvHOem.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${inter.className} min-h-screen bg-surface text-xs text-text antialiased`}
        suppressHydrationWarning
      >
        <AppConfigProvider>
          {children}
          <AppToaster />
          <PWARegister />
        </AppConfigProvider>
      </body>
    </html>
  );
}
