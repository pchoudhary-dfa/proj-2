"use client";

import { BcMainToolbar } from "@/components/BcMainToolbar";
import { MainTabsBar } from "@/components/MainTabsBar";
import { useCoreOptional } from "@/contexts/CoreContext";
import { useRouter, usePathname } from "next/navigation";
import { buildLocaleAppPath, FALLBACK_DEFAULT_LOCALE, type LocaleAppPage } from "@/lib/constants";

type BreadcrumbActiveTab = "datawarehouse" | "administration" | "translation";

type BreadcrumbProps = {
  activeTab?: BreadcrumbActiveTab;
  onAddClick?: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
};

export default function Breadcrumb({
  activeTab: activeTabProp,
  onAddClick,
  searchValue,
  onSearchChange,
}: BreadcrumbProps) {
  const core = useCoreOptional();
  const t = core?.t ?? ((code: string, fb?: string) => fb ?? code);
  const router = useRouter();
  const pathname = usePathname();

  const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;

  const activeTab: BreadcrumbActiveTab = activeTabProp ?? (
    /\/administration$/.test(pathname ?? "")
      ? "administration"
      : "datawarehouse"
  );

  const navigateTo = (page: LocaleAppPage) => {
    router.push(buildLocaleAppPath(locale, page));
  };

  const showToolbar = activeTab === "datawarehouse" && (onAddClick || searchValue || onSearchChange);

  /** Top tabs are hidden when the app-shell sidebar (or these utility pages) replaces them. */
  const hideAppLevelTabs =
    /^\/[^/]+\/datawarehouse$/.test(pathname ?? "") ||
    /^\/[^/]+\/administration$/.test(pathname ?? "") ||
    /^\/[^/]+\/preferences$/.test(pathname ?? "") ||
    /^\/[^/]+\/version-log$/.test(pathname ?? "") ||
    /^\/[^/]+\/translations$/.test(pathname ?? "") ||
    /^\/[^/]+\/logs$/.test(pathname ?? "") ||
    /^\/[^/]+\/[^/]+\/logs$/.test(pathname ?? "") ||
    /^\/[^/]+\/[^/]+\/about$/.test(pathname ?? "");

  return (
    <section className="bc-main">
      {!hideAppLevelTabs && (
        <MainTabsBar
          tabs={[
            {
              value: "datawarehouse",
              label: t("LABEL_DATAWAREHOUSE"),
              icon: "storage",
            },
            {
              value: "administration",
              label: t("ADMINISTRATION"),
              icon: "admin_panel_settings",
            },
            {
              value: "translation",
              label: t("TRANSLATIONS"),
              icon: "translate",
            },
          ]}
          activeValue={activeTab}
          onSelect={(v) => {
            if (v === "datawarehouse" || v === "administration" || v === "translation") {
              navigateTo(v === "translation" ? "translations" : v);
            }
          }}
        />
      )}

      {showToolbar && (
        <BcMainToolbar
          title={t("LABEL_DATAWAREHOUSE")}
          onAddClick={onAddClick}
          searchPlaceholder={t("SEARCH_DATABASES")}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
        />
      )}
    </section>
  );
}
