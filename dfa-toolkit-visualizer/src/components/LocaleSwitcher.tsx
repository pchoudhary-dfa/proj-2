"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCore } from "@/contexts/CoreContext";
import { locales, type Locale } from "@/lib/i18n/config";

function replaceLocaleInPath(pathname: string, nextLocale: Locale) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return `/${nextLocale}`;
  // If first segment is locale, replace it. Otherwise, prefix.
  if ((locales as readonly string[]).includes(parts[0])) parts[0] = nextLocale;
  else parts.unshift(nextLocale);
  return `/${parts.join("/")}`;
}

export function LocaleSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const { t } = useCore();
  const pathname = usePathname() || "/";

  return (
    <div className="flex items-center gap-2" aria-label={t("VISUALIZER_ARIA_LOCALE_SWITCHER")}>
      <span className="text-xs font-semibold text-slate-500">{t("VISUALIZER_LOCALE_LABEL")}</span>
      {locales.map((l) => {
        const href = replaceLocaleInPath(pathname, l);
        const isActive = l === currentLocale;
        return (
          <Link
            key={l}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "rounded-lg px-2 py-1 text-xs font-bold",
              isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            ].join(" ")}
          >
            {l.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}

