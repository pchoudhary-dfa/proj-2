"use client";

import {
  buildLocaleAppPath,
  getLocaleFromPathname,
  isLocaleLoginPath,
  isLocaleDashboardEditorPath,
} from "@/lib/constants";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAppConfig } from "@/contexts/AppConfigContext";
import Header from "./Header";
import { getTranslationsFallback } from "@/lib/i18n/translations";
import { useCore } from "@/contexts/CoreContext";

const _fb = getTranslationsFallback("en");
const fallbackT = (code: string, fb?: string) => _fb[code] ?? fb ?? code;

function navAccordionSectionForPathname(pathname: string | null): string | null {
  const p = pathname ?? "";
  if (/^\/[^/]+\/administration$/.test(p)) {
    return "administration";
  }else{
    return null;
  }
}
export default function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [administrationOpen, setAdministrationOpen] = useState(false);
  const { appVersion } = useAppConfig();
  const core = useCore();
  const t = core?.t ?? fallbackT;

  const dashboardHref = useMemo(
    () => buildLocaleAppPath(locale, "dashboard"),
    [locale]
  );
  const datawarehouseHref = useMemo(
    () => buildLocaleAppPath(locale, "datawarehouse"),
    [locale]
  );
  const headerFooterHref = useMemo(
    () => buildLocaleAppPath(locale, "header-footer"),
    [locale]
  );
  const administrationHref = useMemo(
    () => buildLocaleAppPath(locale, "administration"),
    [locale]
  );
  const translationsHref = `${administrationHref}?section=translations`;
  const userManagementHref = `${administrationHref}?section=user-management`;
  const transactionLogsHref = `${administrationHref}?section=transaction-logs`;
  const settingsHref = `${administrationHref}?section=settings`;

  const isDashboardPath =
    pathname === dashboardHref || pathname.startsWith(`${dashboardHref}/`);
  const isDatawarehousePath = pathname === datawarehouseHref;
  const isHeaderFooterPath =
    pathname === headerFooterHref ||
    pathname.startsWith(`${headerFooterHref}/`);
  const isAdministrationPath =
    pathname === administrationHref ||
    pathname.startsWith(`${administrationHref}/`);

  // Wire each gate to hasPermission() when auth permissions are available.
  const canViewDashboard = true;
  const canViewDatawarehouse = true;
  const canViewHeaderFooter = true;
  const canViewAdministration = true;
  const canViewUsers = true;
  const canViewTranslations = true;
  const canViewTransactionLogs = true;
  const canViewSettings = true;

  useEffect(() => {
    const section = navAccordionSectionForPathname(pathname)
    setAdministrationOpen(section === 'administration');
  }, [isAdministrationPath]);

  const width = collapsed
    ? "var(--width-sidebar-collapsed)"
    : "var(--width-sidebar)";

  const navItemClass = (active: boolean) =>
    `nav-item${active ? " active" : ""}${collapsed ? " !justify-center !px-2" : ""}`;

  if (isLocaleLoginPath(pathname ?? "")) {
    return <>{children}</>;
  }
  return (
    <>
      <div className="indicator-page flex h-screen min-h-0 w-full flex-col overflow-x-hidden">
        <Header />
        <div className="flex min-h-0 flex-1 w-full min-w-0">
          {!isLocaleDashboardEditorPath(pathname) && (
            <aside className="sb" style={{ width }}>
              <nav className="sb-nav scrollbar-hide">
                {collapsed ? (
                  <>
                    {canViewDashboard && (
                      <Link
                        href={dashboardHref}
                        title={t("DASHBOARD", "Dashboard")}
                        className={navItemClass(isDashboardPath)}
                      >
                        <span className=" material-icons nav-item-left justify-center gap-0">
                        dashboard                        
                        </span>
                      </Link>
                    )}
                    {canViewDatawarehouse && (
                      <Link
                        href={datawarehouseHref}
                        title={t("LABEL_DATAWAREHOUSE", "Datawarehouse")}
                        className={navItemClass(isDatawarehousePath)}
                      >
                        <span className=" material-icons nav-item-left justify-center gap-0">
                        storage                        
                        </span>
                      </Link>
                    )}
                    {canViewHeaderFooter && (
                      <Link
                        href={headerFooterHref}
                        title={t("HEADER_FOOTER", "Header/Footer")}
                        className={navItemClass(isHeaderFooterPath)}
                      >
                        <span className=" material-icons nav-item-left justify-center gap-0">
                        density_large                        
                        </span>
                      </Link>
                    )}
                    {canViewAdministration && (
                      <div
                        className={`nav-item${collapsed ? " !justify-center !px-2" : ""}`}
                        title={t("ADMINISTRATION", "Administration")}
                      >
                        <span className=" material-icons nav-item-left justify-center gap-0">
                        admin_panel_settings                        
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {canViewDashboard && (
                      <Link
                        href={dashboardHref}
                        className={navItemClass(isDashboardPath)}
                      >
                        <span className="nav-item-left">
                          <span className="material-icons">dashboard</span>                        
                          <span className="truncate">
                            {t("DASHBOARD", "Dashboard")}
                          </span>
                        </span>
                      </Link>
                    )}
                    {canViewDatawarehouse && (
                      <Link
                        href={datawarehouseHref}
                        className={navItemClass(isDatawarehousePath)}
                      >
                        <span className="nav-item-left">
                          <span className="material-icons">storage</span>                        
                          <span className="truncate">
                            {t("LABEL_DATAWAREHOUSE", "Datawarehouse")}
                          </span>
                        </span>
                      </Link>
                    )}
                    {canViewHeaderFooter && (
                      <Link
                        href={headerFooterHref}
                        className={navItemClass(isHeaderFooterPath)}
                      >
                        <span className="nav-item-left">
                          <span className="material-icons">density_large</span>                        
                          <span className="truncate">
                            {t("HEADER_FOOTER", "Header/Footer")}
                          </span>
                        </span>
                      </Link>
                    )}
                    {canViewAdministration && (
                      <>
                        <div
                          className="nav-item parent"
                          onClick={() => setAdministrationOpen((o) => !o)}
                        >
                          <span className="nav-item-left">
                            <span className="material-icons">admin_panel_settings</span>                        
                            <span className="truncate">
                              {t("ADMINISTRATION", "Administration")}
                            </span>
                          </span>
                          <span
                            className={`chev ${administrationOpen ? "" : "-rotate-90"}`}
                            aria-hidden
                          >
                            <span className="material-icons">expand_more</span>
                          </span>
                        </div>
                        {administrationOpen && (
                          <div className="nav-children">
                            {canViewTranslations && (
                              <Link href={translationsHref} className={`nav-child`}>
                                {t("TRANSLATIONS")}
                              </Link>
                            )}
                            
                            {canViewUsers && (
                              <Link href={userManagementHref} className={`nav-child`}>
                                {t("USERS")}
                              </Link>
                            )}
                            {canViewTransactionLogs && (
                              <Link href={transactionLogsHref} className={`nav-child`}>
                                {t("TRANSACTION_LOGS")}
                              </Link>
                            )}
                            {canViewSettings && (
                              <Link href={settingsHref} className={`nav-child`}>
                                {t("SETTINGS")}
                              </Link>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </nav>

              <div className="sb-bottom">
                {!collapsed ? (
                  <p className="sb-footer-version">v{appVersion}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => !c)}
                  className="btn-comp-secondary absolute right-0 bottom-6 z-[2] !h-[34px] !w-5 !min-w-5 !max-w-5 !rounded-l-md !rounded-r-none !p-0 !gap-0 !px-0 border border-[color:color-mix(in_srgb,var(--color-on-primary)_12%,var(--color-border))] !shadow-[0_1px_3px_rgb(0_0_0_/_0.08)] hover:!shadow-md text-text-muted hover:!text-text"
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {collapsed ? (
                    <span className="material-icons">chevron_right</span>
                  ) : (
                    <span className="material-icons">chevron_left</span>
                  )}
                </button>
              </div>
            </aside>
          )}
          <div className="sys-config bg-surface-muted">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
