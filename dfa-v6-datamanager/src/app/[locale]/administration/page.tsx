"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCore } from "@/contexts/CoreContext";
import Breadcrumb from "@/components/Breadcrumb";
import { PageToolbar } from "@/components/PageToolbar";
import UsersAdminTab from "@/components/administration/UsersAdminTab";
import RolesAdminTab from "@/components/administration/RolesAdminTab";
import EmailTemplatesAdminTab from "@/components/administration/EmailTemplatesAdminTab";
import HelpAdminTab from "@/components/administration/HelpAdminTab";
import { buildLocaleAppPath, FALLBACK_DEFAULT_LOCALE } from "@/lib/constants";
import AppConfigurationAdminTab from "@/components/administration/AppConfigurationAdminTab";
import { hasPermission, APP_ROUTE_PERMISSIONS, hasAnyPermission } from "@/lib/auth/user";
import { usePermissionGuard } from "@/hooks/usePermissionGuard";

type AdminSubTab = "users" | "roles" | "email-templates" | "help" | "configuration";

function resolveAdminSubTab(sectionRaw: string | null): AdminSubTab {
  if (sectionRaw === "configuration") return "configuration";
  if (sectionRaw === "roles") return "roles";
  if (sectionRaw === "email-templates") return "email-templates";
  if (sectionRaw === "help") return "help";
  return "users";
}

export default function AdministrationPage() {
  const { t } = useCore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sectionRaw = searchParams.get("section");
  const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;

  useEffect(() => {
    if (sectionRaw === "email-logs") {
      router.replace(`${buildLocaleAppPath(locale, "logs")}?section=email-logs`);
    }
  }, [sectionRaw, locale, router]);

  usePermissionGuard({
    any: [
      APP_ROUTE_PERMISSIONS.administration.users.view,
      APP_ROUTE_PERMISSIONS.administration.roles.view,
      APP_ROUTE_PERMISSIONS.administration.emailTemplates.view,
      APP_ROUTE_PERMISSIONS.administration.help.view,
      APP_ROUTE_PERMISSIONS.settings.view,
    ],
  });

  const canViewUsers = hasPermission(APP_ROUTE_PERMISSIONS.administration.users.view, "R");
  const canViewRoles = hasPermission(APP_ROUTE_PERMISSIONS.administration.roles.view, "R");
  const canViewEmail = hasPermission(APP_ROUTE_PERMISSIONS.administration.emailTemplates.view, "R");
  const canViewHelp = hasPermission(APP_ROUTE_PERMISSIONS.administration.help.view, "R");
  const canViewConfiguration =
    hasPermission(APP_ROUTE_PERMISSIONS.settings.view, "R") ||
    hasAnyPermission(APP_ROUTE_PERMISSIONS.settings.view);

  const resolvedTab = resolveAdminSubTab(sectionRaw);
  const activeSubTab: AdminSubTab = useMemo(() => {
    if (resolvedTab === "configuration" && canViewConfiguration) return "configuration";
    if (resolvedTab === "users" && canViewUsers) return "users";
    if (resolvedTab === "roles" && canViewRoles) return "roles";
    if (resolvedTab === "email-templates" && canViewEmail) return "email-templates";
    if (resolvedTab === "help" && canViewHelp) return "help";
    if (canViewUsers) return "users";
    if (canViewRoles) return "roles";
    if (canViewEmail) return "email-templates";
    if (canViewHelp) return "help";
    if (canViewConfiguration) return "configuration";
    return "users";
  }, [resolvedTab, canViewUsers, canViewRoles, canViewEmail, canViewHelp, canViewConfiguration]);

  const [deleteDisabled, setDeleteDisabled] = useState(true);
  const deleteHandlerRef = useRef<(() => void) | null>(null);

  const handleDelete = useCallback(() => {
    deleteHandlerRef.current?.();
  }, []);

  const bulkDelete = useMemo(
    () => ({
      onClick: handleDelete,
      disabled: deleteDisabled,
    }),
    [handleDelete, deleteDisabled]
  );

  const isEmailSection = activeSubTab === "email-templates";
  const hideAdminToolbar = isEmailSection || activeSubTab === "help";

  const canDeleteActiveTab =
    (activeSubTab === "users" && hasPermission(APP_ROUTE_PERMISSIONS.administration.users.crud, "D")) ||
    (activeSubTab === "roles" && hasPermission(APP_ROUTE_PERMISSIONS.administration.roles.crud, "D"));

  const subTitle = useMemo(() => {
    switch (activeSubTab) {
      case "configuration":
        return t("CONFIGURATION");
      case "roles":
        return t("ROLES");
      case "email-templates":
        return t("EMAIL_TEMPLATES");
      case "help":
        return t("HELP_ADMIN");
      default:
        return t("USERS");
    }
  }, [activeSubTab, t]);

  const subIcon = useMemo(() => {
    switch (activeSubTab) {
      case "configuration":
        return "tune";
      case "roles":
        return "shield";
      case "email-templates":
        return "mark_email_read";
      case "help":
        return "help_outline";
      default:
        return "people";
    }
  }, [activeSubTab]);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
      <Breadcrumb activeTab="administration" />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!hideAdminToolbar ? (
          <PageToolbar
            title={subTitle}
            icon={subIcon}
            toolbarExtra={null}
            bulkDelete={bulkDelete}
            toolbarExport={null}
            toolbarImport={null}
            hideActions={false}
            hideImportExport
            hideDelete={!canDeleteActiveTab}
          />
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {activeSubTab === "configuration" ? (
            <AppConfigurationAdminTab />
          ) : activeSubTab === "users" ? (
            <UsersAdminTab
              onDeleteStateChange={(disabled, handler) => {
                setDeleteDisabled(disabled);
                deleteHandlerRef.current = handler;
              }}
            />
          ) : activeSubTab === "roles" ? (
            <RolesAdminTab
              onDeleteStateChange={(disabled, handler) => {
                setDeleteDisabled(disabled);
                deleteHandlerRef.current = handler;
              }}
            />
          ) : activeSubTab === "email-templates" ? (
            <EmailTemplatesAdminTab />
          ) : (
            <HelpAdminTab />
          )}
        </div>
      </div>
    </main>
  );
}
