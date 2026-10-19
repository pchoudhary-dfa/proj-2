import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import "@dfa-v6/styleguide/globals.css";
import "./product-tokens.css";
import { defaultLocale, isLocale, isRtlLocale } from "@/lib/i18n/config";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  display: "swap",
  variable: "--font-noto-arabic",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "DFA Visualizer",
  description: "DFA Visualizer tool to visualize your data",
  icons: {
    icon: "/images/dfa_fav_vis.png",
  },
  manifest: "/manifest.json",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const lang = cookieLocale && isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return (
    <html lang={lang} dir={isRtlLocale(lang) ? "rtl" : "ltr"} className={`${inter.variable} ${notoSansArabic.variable}`}>
      <body className={`${inter.className} app-body`}>{children}</body>
    </html>
  );
}

