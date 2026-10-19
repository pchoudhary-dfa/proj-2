"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";
import type { Locale } from "@/lib/i18n/config";

const EMBED_PATH_SEGMENT = "/visualize/embed";
const AUTH_PATH = "/auth";

/**
 * Renders the app header unless the current route is the chart-only embed
 * or an authentication page (/auth).
 */
export function ConditionalHeader({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? "";
  if (pathname.includes(EMBED_PATH_SEGMENT)) return null;
  if (pathname.includes(AUTH_PATH)) return null;
  return <Header locale={locale} />;
}
