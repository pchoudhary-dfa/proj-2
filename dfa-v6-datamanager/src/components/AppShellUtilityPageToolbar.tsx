"use client";

import { PageToolbar } from "@/components/PageToolbar";
import { useCore } from "@/contexts/CoreContext";
import { getPageConfigForPathname } from "@/lib/constants";
import { usePathname } from "next/navigation";

/**
 * Page chrome row (icon + title + divider + disabled delete + spacer) for app-shell
 * utility routes, matching administration / warehouse list toolbars.
 */
export function AppShellUtilityPageToolbar() {
  const pathname = usePathname();
  const { t } = useCore();
  const pageConfig = getPageConfigForPathname(pathname);
  const title = pageConfig?.titleKey ? t(pageConfig.titleKey) : "";
  const icon = pageConfig?.icon ?? "table_chart";

  return (
    <PageToolbar
      title={title}
      icon={icon}
      toolbarExtra={null}
      bulkDelete={null}
      toolbarExport={null}
      toolbarImport={null}
      hideActions={false}
      hideImportExport
      hideDelete
    />
  );
}
