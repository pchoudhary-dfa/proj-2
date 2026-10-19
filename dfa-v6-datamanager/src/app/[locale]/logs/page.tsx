"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCore } from "@/contexts/CoreContext";
import type { ToolbarExportConfig } from "@/contexts/SidebarContext";
import Breadcrumb from "@/components/Breadcrumb";
import { PageToolbar } from "@/components/PageToolbar";
import EmailLogsAdminTab from "@/components/administration/EmailLogsAdminTab";
import ServerErrorsAdminTab from "@/components/logs/ServerErrorsAdminTab";
import { hasPermission, APP_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import { usePermissionGuard } from "@/hooks/usePermissionGuard";

type LogsSubTab = "email-logs" | "server-errors";

function resolveLogsSubTab(sectionRaw: string | null): LogsSubTab {
  if (sectionRaw === "server-errors") return "server-errors";
  return "email-logs";
}

function canViewEmailLogs(): boolean {
  return (
    hasPermission(APP_ROUTE_PERMISSIONS.logs.emailLogs.view, "R") ||
    hasPermission(APP_ROUTE_PERMISSIONS.administration.emailTemplates.view, "R")
  );
}

export default function LogsPage() {
  const { t } = useCore();
  const searchParams = useSearchParams();
  const sectionRaw = searchParams.get("section");
  const [toolbarExport, setToolbarExport] = useState<ToolbarExportConfig | null>(null);

  usePermissionGuard({
    any: [
      APP_ROUTE_PERMISSIONS.logs.emailLogs.view,
      APP_ROUTE_PERMISSIONS.logs.serverErrors.view,
      APP_ROUTE_PERMISSIONS.administration.emailTemplates.view,
    ],
  });

  const canViewEmail = canViewEmailLogs();
  const canViewServerErrors = hasPermission(
    APP_ROUTE_PERMISSIONS.logs.serverErrors.view,
    "R"
  );

  const resolvedTab = resolveLogsSubTab(sectionRaw);
  const activeSubTab: LogsSubTab = useMemo(() => {
    if (resolvedTab === "server-errors" && canViewServerErrors) return "server-errors";
    if (resolvedTab === "email-logs" && canViewEmail) return "email-logs";
    if (canViewEmail) return "email-logs";
    if (canViewServerErrors) return "server-errors";
    return "email-logs";
  }, [resolvedTab, canViewEmail, canViewServerErrors]);

  const hideToolbar = activeSubTab === "email-logs";

  const subTitle =
    activeSubTab === "server-errors" ? t("SERVER_ERRORS") : t("EMAIL_LOGS");
  const subIcon = activeSubTab === "server-errors" ? "error_outline" : "history";

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
      <Breadcrumb />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!hideToolbar ? (
          <PageToolbar
            title={subTitle}
            icon={subIcon}
            toolbarExtra={null}
            bulkDelete={null}
            toolbarExport={toolbarExport}
            toolbarImport={null}
            hideActions={false}
            hideImportExport={false}
            hideImport
            hideDelete
          />
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {activeSubTab === "email-logs" ? (
            <EmailLogsAdminTab />
          ) : (
            <ServerErrorsAdminTab onToolbarExportChange={setToolbarExport} />
          )}
        </div>
      </div>
    </main>
  );
}
