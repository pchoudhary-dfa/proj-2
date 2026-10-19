import type { Metadata } from "next";
import "@dfa-v6/styleguide/globals.css";
import "./product-tokens.css";
import { Geist, Geist_Mono } from "next/font/google";
import { DEFAULT_DASH_FAVICON } from "@/lib/constants";
import { AppConfigProvider } from "@/contexts/AppConfigContext";
import { cookies } from "next/headers";
import { defaultLocale } from "@/lib/i18n/config";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DFA Dashboard",
  description: "DFA v6 Dashboard",
  icons: {
    icon: DEFAULT_DASH_FAVICON,
    shortcut: DEFAULT_DASH_FAVICON,
    apple: DEFAULT_DASH_FAVICON,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const lang = cookieStore.get("NEXT_LOCALE")?.value ?? defaultLocale;
  return (
    <html
      lang="en"
    >
      <head>
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
      <body className="app-body min-h-screen font-body antialiased">
        <AppConfigProvider>
          {children}
        </AppConfigProvider>
        <Toaster position="top-right" richColors closeButton />
        </body>
    </html>
  );
}
