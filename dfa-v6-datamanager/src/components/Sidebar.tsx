"use client";

/**
 * Authenticated layout: left sidebar (warehouse + nav), top toolbar, and main content.
 * On login/excluded routes, renders children only.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppConfig } from "@/contexts/AppConfigContext";
import { useCoreOptional } from "@/contexts/CoreContext";
import { getTranslationsFallback } from "@/lib/i18n/translations";
import {
  SidebarProvider,
  type FileImportSubmitHandler,
  type FileImportTemplateHandler,
} from "@/contexts/SidebarContext";
import FileImport from "@/components/FileImport";
import Header from "@/components/Header";
import { PageToolbar } from "@/components/PageToolbar";
import { getRequest } from "@/lib/api/http";
import type {
  DatawarehouseListItem,
  DatawarehousesListError,
  DatawarehousesListResponse,
  DatawarehousesListSuccess,
  FetchDatawarehousesParams,
} from "@/lib/api/types";
import {
  FALLBACK_DEFAULT_LOCALE,
  buildLocaleAppPath,
  getAuthMePermissionsUrl,
  getDatawarehousesListUrl,
  getPageConfigForPathname,
  isLocaleOnlyLoginPath,
  isComputeExecutionLogDetailPath,
  LAYOUT_EXCLUDED_PATHS,
  SELECTED_DW_STORAGE_KEY,
  type DwOption,
} from "@/lib/constants";
import {
  getAppConfigValue,
  LAST_REFRESHED_TIME_CONFIG_KEY,
} from "@/lib/api/core";
import { getAppVersion } from "@/lib/version";
import {
  hasResource,
  hasPermission,
  hasAnyPermission,
  hasDwPermission,
  hasAnyDwPermission,
  getUserWorkflowsMeta,
  setStoredDwPermissions,
  clearStoredDwPermissions,
  APP_ROUTE_PERMISSIONS,
  DW_ROUTE_PERMISSIONS,
} from "@/lib/auth/user";
import type { AppPermissions } from "@/lib/auth/user";
import type {
  BulkDeleteToolbarConfig,
  ToolbarExportConfig,
  ToolbarImportConfig,
} from "@/contexts/SidebarContext";

async function fetchDatawarehousesListItems(
  params: FetchDatawarehousesParams = {}
): Promise<DatawarehouseListItem[]> {
  const searchParams = new URLSearchParams();
  if (params.skip != null) searchParams.set("skip", String(params.skip));
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  if (params.active_only === true) searchParams.set("active_only", "true");
  const url = `${getDatawarehousesListUrl()}?${searchParams.toString()}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as DatawarehousesListResponse;
  if (
    (json as DatawarehousesListSuccess).success !== true ||
    !Array.isArray((json as DatawarehousesListSuccess).data)
  ) {
    throw new Error(
      (json as DatawarehousesListError).err_message ?? "Invalid response"
    );
  }
  return (json as DatawarehousesListSuccess).data;
}

async function fetchDatawarehouses(
  params: FetchDatawarehousesParams = {}
): Promise<DwOption[]> {
  const data = await fetchDatawarehousesListItems(params);
  return data.map((item) => ({
    id: String(item.id),
    name: item.dw_connection_name,
    indicatorCount: undefined,
    datawarehouseType: item.db_source_type,
    hostAddress: item.db_host_address,
    username: item.db_user,
    port:
      item.db_port == null
        ? undefined
        : typeof item.db_port === "number"
          ? String(item.db_port)
          : item.db_port,
    databaseName: item.db_database,
    defaultLanguage: item.dw_default_language,
  }));
}

function readStoredDwId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(SELECTED_DW_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

const _fb = getTranslationsFallback("en");
const fallbackT = (code: string, fb?: string) => _fb[code] ?? fb ?? code;

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

type NavAccordionSection =
  | "template"
  | "data_entry"
  | "administration"
  | "publish_data"
  | "logs"
  | "reports";

function navAccordionSectionForPathname(pathname: string | null): NavAccordionSection | null {
  const p = pathname ?? "";
  if (/^\/[^/]+\/administration$/.test(p)) {
    return "administration";
  }
  if (
    /^\/[^/]+\/[^/]+\/workflow$/.test(p) ||
    /^\/[^/]+\/[^/]+\/languages$/.test(p) ||
    /^\/[^/]+\/[^/]+\/tools$/.test(p)
  ) {
    return "administration";
  }
  if (
    /^\/[^/]+\/[^/]+\/data-entry\/dataset(?:\/[^/]+)?$/.test(p) ||
    /^\/[^/]+\/[^/]+\/data-review\/dataset(?:\/[^/]+)?$/.test(p) ||
    /^\/[^/]+\/[^/]+\/timeperiod$/.test(p) ||
    /^\/[^/]+\/[^/]+\/sources$/.test(p) ||
    /^\/[^/]+\/[^/]+\/compute-engine\/execute$/.test(p) ||
    /^\/[^/]+\/[^/]+\/compute-engine\/execute\/logs\/[^/]+$/.test(p)
  ) {
    return "data_entry";
  }
  if (
    /^\/[^/]+\/[^/]+\/indicator$/.test(p) ||
    /^\/[^/]+\/[^/]+\/units$/.test(p) ||
    /^\/[^/]+\/[^/]+\/subgroups$/.test(p) ||
    /^\/[^/]+\/[^/]+\/areas$/.test(p) ||
    /^\/[^/]+\/[^/]+\/indicator-classifications$/.test(p)
  ) {
    return "template";
  }
  if (
    /^\/[^/]+\/[^/]+\/publish-data\/mobile-app$/.test(p)
  ) {
    return "publish_data";
  }
  if (/^\/[^/]+\/[^/]+\/logs$/.test(p)) {
    return "logs";
  }
  if (/^\/[^/]+\/[^/]+\/reports\/data-report$/.test(p)) {
    return "reports";
  }
  if (/^\/[^/]+\/[^/]+\/reports\/analytical-report$/.test(p)) {
    return "reports";
  }
  if (/^\/[^/]+\/[^/]+\/reports\/quality-report$/.test(p)) {
    return "reports";
  }
  if (/^\/[^/]+\/[^/]+\/reports\/operational-reports$/.test(p)) {
    return "reports";
  }
  if (/^\/[^/]+\/[^/]+\/reports\/operational-dashboard$/.test(p)) {
    return "reports";
  }
  return null;
}

function SidebarBottom({
  sidebarCollapsed,
  setSidebarCollapsed,
  appVersion,
  versionTitlePrefix = "v",
}: {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean | ((p: boolean) => boolean)) => void;
  appVersion: string;
  versionTitlePrefix?: string;
}) {
  const core = useCoreOptional();
  const t = core?.t ?? fallbackT;
  const { config } = useAppConfig();
  const lastRefreshedTime = getAppConfigValue(config, LAST_REFRESHED_TIME_CONFIG_KEY);
  const showRefreshNote = !sidebarCollapsed && lastRefreshedTime != null;

  return (
    <div className={`sb-bottom${showRefreshNote ? " min-h-[5.5rem]" : ""}`}>
      {showRefreshNote && (
        <p className="absolute bottom-7 left-0 right-0 z-[1] px-2.5 text-[11px] leading-[15px] text-on-primary-fg-dim border-b border-[color:color-mix(in_srgb,var(--color-on-primary)_15%,transparent)] mb-1 pb-2">
          {t("REFRESH_NOTE")}
          {lastRefreshedTime}
        </p>
      )}
      {!sidebarCollapsed && appVersion !== "" && (
        <span className="sb-footer-version">{`${versionTitlePrefix}${appVersion}`}</span>
      )}
      <button
        type="button"
        className="btn-comp-secondary absolute right-0 bottom-6 z-[2] !h-[34px] !w-5 !min-w-5 !max-w-5 !rounded-l-md !rounded-r-none !p-0 !gap-0 !px-0
            border border-[color:color-mix(in_srgb,var(--color-on-primary)_12%,var(--color-border))]
            !shadow-[0_1px_3px_rgb(0_0_0_/_0.08)] hover:!shadow-md text-text-muted hover:!text-text"
        onClick={() => setSidebarCollapsed((c) => !c)}
        aria-label={sidebarCollapsed ? t("EXPAND_SIDEBAR") : t("COLLAPSE_SIDEBAR")}
        title={
          sidebarCollapsed && appVersion !== ""
            ? `${versionTitlePrefix}${appVersion}`
            : undefined
        }
      >
        <Mi
          name={sidebarCollapsed ? "chevron_right" : "chevron_left"}
          className="!text-sm"
        />
      </button>
    </div>
  );
}

/** Left column: data warehouse picker + primary navigation links. */
function SidebarNav({
  dwId,
  setDwId,
  dwOptions,
  sidebarCollapsed,
  setSidebarCollapsed,
  dwDropdownOpen,
  setDwDropdownOpen,
  dwPermissionsVersion,
  appVersion,
}: {
  dwId: string;
  setDwId: (id: string) => void;
  dwOptions: DwOption[];
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean | ((p: boolean) => boolean)) => void;
  dwDropdownOpen: boolean;
  setDwDropdownOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  dwPermissionsVersion: number;
  appVersion: string;
}) {
  const core = useCoreOptional();
  const t = core?.t ?? fallbackT;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const dwDropdownRef = useRef<HTMLDivElement | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [dataEntryOpen, setDataEntryOpen] = useState(false);
  const [administrationOpen, setAdministrationOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [publishDataOpen, setPublishDataOpen] = useState(false);
  const normalizedDwId = String(dwId).trim();

  // Template section permission checks
  // Note: Template section currently has no parent resource; check each child directly
  // Future: use DW_ROUTE_PERMISSIONS.template.parent once backend provides it
  const showIndicators = useMemo(
    () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.template.indicators),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showUnits = useMemo(
    () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.template.units),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showSubgroups = useMemo(
    () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.template.subgroups),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showClassifications = useMemo(
    () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.template.classifications),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showAreas = useMemo(
    () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.template.areas),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showTemplateSection = showIndicators || showUnits || showSubgroups || showClassifications || showAreas;

  // Data Management section permission checks
  // Check parent resource for section-level access, then children for individual pages
  const hasDataManagementAccess = useMemo(
    () => hasDwPermission(DW_ROUTE_PERMISSIONS.dataManagement.parent, "R"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showDataEntry = useMemo(
    () => hasDataManagementAccess && hasAnyDwPermission(DW_ROUTE_PERMISSIONS.dataManagement.dataEntry),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion, hasDataManagementAccess]
  );
  const showDataReview = useMemo(
    () => hasDataManagementAccess && hasAnyDwPermission(DW_ROUTE_PERMISSIONS.dataManagement.dataReview),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion, hasDataManagementAccess]
  );
  const showTimePeriod = useMemo(
    () => hasDataManagementAccess && hasAnyDwPermission(DW_ROUTE_PERMISSIONS.dataManagement.timePeriod),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion, hasDataManagementAccess]
  );
  const showSources = useMemo(
    () => hasDataManagementAccess && hasAnyDwPermission(DW_ROUTE_PERMISSIONS.dataManagement.sources),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion, hasDataManagementAccess]
  );
  const showCalculateIus = useMemo(
    () => hasDataManagementAccess && hasAnyDwPermission(DW_ROUTE_PERMISSIONS.dataManagement.calculateIus),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion, hasDataManagementAccess]
  );
  const showDataManagementSection = hasDataManagementAccess && (showDataEntry || showDataReview || showTimePeriod || showSources || showCalculateIus);

  // Administration section permission checks
  // Note: Administration section currently has no parent resource; check each child directly
  // Future: use DW_ROUTE_PERMISSIONS.administration.parent once backend provides it
  const showWorkflow = useMemo(
    () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.administration.workflow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showLanguages = useMemo(
    () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.administration.languages),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showTools = useMemo(
    () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.administration.tools),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showAdministrationSection = showWorkflow || showLanguages || showTools;

  const showTransactionLogs = useMemo(
    () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.logs.transactionLogs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showLogsSection = showTransactionLogs;

  // TODO(backend): "dm_dw_reports", "dm_dw_data_reports", "dm_dw_analytical_reports",
  // and "dm_dw_quality_reports" are not yet registered in the backend IAM. Reports are
  // visible to all DW users until backend resource codes exist. Re-enable the permission
  // checks below once backend is ready.
  // const showReports = useMemo(
  //   () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.reports.parent),
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  //   [dwPermissionsVersion]
  // );
  // const showDataReports = useMemo(
  //   () => showReports && hasAnyDwPermission(DW_ROUTE_PERMISSIONS.reports.dataReports),
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  //   [dwPermissionsVersion, showReports]
  // );
  // const showAnalyticalReports = useMemo(
  //   () => showReports && hasAnyDwPermission(DW_ROUTE_PERMISSIONS.reports.analyticalReports),
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  //   [dwPermissionsVersion, showReports]
  // );
  // const showQualityReports = useMemo(
  //   () => showReports && hasAnyDwPermission(DW_ROUTE_PERMISSIONS.reports.qualityReports),
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  //   [dwPermissionsVersion, showReports]
  // );
  const showDataReports = true;
  const showAnalyticalReports = true;
  const showQualityReports = true;
  const showOperationalDashboard = showDataReview;
  const showOperationalReports = true;
  const showReportsSection = showDataReports || showAnalyticalReports || showQualityReports || showOperationalDashboard || showOperationalReports;
  const showPublishDataMobileApp = useMemo(
    () => hasAnyDwPermission(DW_ROUTE_PERMISSIONS.publishData.mobileApp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dwPermissionsVersion]
  );
  const showPublishDataSection = showPublishDataMobileApp;

  const currentDwName =
    dwOptions.find((d) => String(d.id).trim() === normalizedDwId)?.name ??
    normalizedDwId;

  const indicatorsHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "indicator", dwId);
  }, [pathname, dwId]);

  const unitsHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "units", dwId);
  }, [pathname, dwId]);

  const overviewHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "overview", dwId);
  }, [pathname, dwId]);

  const subgroupsHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "subgroups", dwId);
  }, [pathname, dwId]);

  const areasHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "areas", dwId);
  }, [pathname, dwId]);

  const classificationsHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "indicator-classifications", dwId);
  }, [pathname, dwId]);

  const userWorkflows = useMemo(() => getUserWorkflowsMeta(), [pathname, dwId, dwPermissionsVersion]);

  const dataEntryHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    const basePath = buildLocaleAppPath(loc, "data-entry", dwId);
    const datasetBase = `${basePath}/dataset`;
    if (userWorkflows.length === 1) {
      const wf = userWorkflows[0];
      return `${datasetBase}?workflow_id=${wf.workflow_id}`;
    }
    return datasetBase;
  }, [pathname, dwId, userWorkflows]);

  const dataReviewHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    const datasetBase = `${buildLocaleAppPath(loc, "data-review", dwId)}/dataset`;
    if (userWorkflows.length === 1) {
      const wf = userWorkflows[0];
      const wfParam = `?workflow_id=${wf.workflow_id}`;
      return wf.allow_review === true
        ? datasetBase
        : `${datasetBase}${wfParam}`;
    }
    return datasetBase;
  }, [pathname, dwId, userWorkflows]);

  const timeperiodHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "timeperiod", dwId);
  }, [pathname, dwId]);

  const workflowHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "workflow", dwId);
  }, [pathname, dwId]);

  const languagesHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "languages", dwId);
  }, [pathname, dwId]);

  const toolsHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "tools", dwId);
  }, [pathname, dwId]);

  const administrationHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "administration");
  }, [pathname]);

  const computeExecuteHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    const dwSeg = String(dwId).trim();
    if (!dwSeg) return `/${loc}/compute-engine/execute`;
    return `/${loc}/${dwSeg}/compute-engine/execute`;
  }, [pathname, dwId]);

  const sourcesHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "sources", dwId);
  }, [pathname, dwId]);

  const datawarehouseHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "datawarehouse");
  }, [pathname]);

  const publishDataMobileAppHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return `/${loc}/${dwId}/publish-data/mobile-app`;
  }, [pathname, dwId]);

  const logsHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return buildLocaleAppPath(loc, "logs", dwId);
  }, [pathname, dwId]);

  const logsTransactionHref = `${logsHref}?section=transaction-logs`;

  const dataReportsHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return `/${loc}/${dwId}/reports/data-report`;
  }, [pathname, dwId]);

  const analyticalReportHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return `/${loc}/${dwId}/reports/analytical-report`;
  }, [pathname, dwId]);

  const qualityReportHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return `/${loc}/${dwId}/reports/quality-report`;
  }, [pathname, dwId]);

  const operationalDashboardHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return `/${loc}/${dwId}/reports/operational-dashboard`;
  }, [pathname, dwId]);

  const operationalReportsHref = useMemo(() => {
    const m = pathname?.match(/^\/([^/]+)/);
    const loc = m?.[1] ?? FALLBACK_DEFAULT_LOCALE;
    return `/${loc}/${dwId}/reports/operational-reports`;
  }, [pathname, dwId]);

  const isDwLogsPath = /^\/[^/]+\/[^/]+\/logs$/.test(pathname ?? "");
  const isTransactionLogsSection =
    isDwLogsPath &&
    (searchParams.get("section") === "transaction-logs" || !searchParams.get("section"));

  useEffect(() => {
    if (!dwDropdownOpen || sidebarCollapsed) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!dwDropdownRef.current) return;
      if (dwDropdownRef.current.contains(event.target as Node)) return;
      setDwDropdownOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDwDropdownOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [dwDropdownOpen, setDwDropdownOpen, sidebarCollapsed]);

  useEffect(() => {
    const section = navAccordionSectionForPathname(pathname);
    setTemplateOpen(section === "template");
    setDataEntryOpen(section === "data_entry");
    setAdministrationOpen(section === "administration");
    setLogsOpen(section === "logs");
    setReportsOpen(section === "reports");
    setPublishDataOpen(section === "publish_data");
  }, [pathname]);

  const computeExecuteActive =
    /^\/[^/]+\/[^/]+\/compute-engine\/execute(\/logs\/[^/]+)?$/.test(
      pathname ?? ""
    );

  return (
    <aside
      className={
        sidebarCollapsed ? "sb sb--collapsed w-[64px]" : "sb"
      }
    >
      <div
        className={
          sidebarCollapsed
            ? "sb-dw-block justify-center py-3.5 px-0"
            : "sb-dw-block"
        }
        onClick={sidebarCollapsed ? () => setSidebarCollapsed(false) : undefined}
      >
        <button
          type="button"
          className="btn-comp-secondary !w-8 !min-w-8 !max-w-8 !p-0 !gap-0 !px-0 !shadow-none !bg-transparent !text-on-primary hover:!shadow-none
              border border-[color:color-mix(in_srgb,var(--color-on-primary)_40%,transparent)]
              hover:!bg-[color:color-mix(in_srgb,var(--color-on-primary)_15%,transparent)]"
          aria-label={t("COMMON_BACK")}
          onClick={(e) => {
            e.stopPropagation();
            router.push(datawarehouseHref);
          }}
        >
          <Mi name="arrow_back" className="!text-sm" />
        </button>
        <div
          ref={dwDropdownRef}
          className={
            sidebarCollapsed
              ? "hidden"
              : "flex min-w-0 flex-1 items-center gap-1"
          }
        >
          <div
            className="sb-dw-header-center"
            onClick={() => setDwDropdownOpen((o) => !o)}
          >
            {!sidebarCollapsed && (
              <>
                <span className="sb-dw-name">{currentDwName}</span>
              </>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              type="button"
              className="sb-dw-chev-btn"
              aria-label={t("NAV_SWITCH_DATABASE")}
              aria-expanded={dwDropdownOpen}
              onClick={() => setDwDropdownOpen((o) => !o)}
            >
              <span className={`chev ${dwDropdownOpen ? "rotate-180" : ""}`}>
                <Mi name="expand_more" className="!text-sm" />
              </span>
            </button>
          )}
          {dwDropdownOpen && !sidebarCollapsed && (
            <div
              className="sb-dw-drop open"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sb-dw-drop-list">
                {dwOptions.length === 0 ? (
                  <div className="sb-dw-opt empty">{t("NO_DATABASES")}</div>
                ) : (
                  dwOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`btn-comp-secondary sb-dw-opt !h-auto !min-h-0 w-full !justify-start !rounded-none !py-2.5 !shadow-none ${
                        String(opt.id).trim() === normalizedDwId ? "cur" : ""
                      }`}
                      onClick={() => {
                        setDwId(opt.id);
                        setDwDropdownOpen(false);
                        if (/^\/[^/]+\/(?:[^/]+\/)?indicator$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "indicator", opt.id));
                        } else if (/^\/[^/]+\/[^/]+\/overview$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "overview", opt.id));
                        } else if (/^\/[^/]+\/[^/]+\/units$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "units", opt.id));
                        } else if (/^\/[^/]+\/[^/]+\/subgroups$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "subgroups", opt.id));
                        } else if (/^\/[^/]+\/[^/]+\/areas$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "areas", opt.id));
                        } else if (
                          /^\/[^/]+\/[^/]+\/indicator-classifications$/.test(pathname ?? "")
                        ) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(
                            buildLocaleAppPath(locale, "indicator-classifications", opt.id)
                          );
                        } else if (
                          /^\/[^/]+\/[^/]+\/data-entry(?:\/dataset(?:\/[^/]+)?)?$/.test(
                            pathname ?? ""
                          )
                        ) {
                          const parts = pathname?.split("/").filter(Boolean) ?? [];
                          const locale = parts[0] ?? FALLBACK_DEFAULT_LOCALE;
                          const datasetId =
                            parts.length >= 5 && parts[3] === "dataset"
                              ? parts[4]?.trim()
                              : "";
                          const suffix = datasetId
                            ? `/dataset/${encodeURIComponent(datasetId)}`
                            : "/dataset";
                          router.push(`/${locale}/${opt.id}/data-entry${suffix}`);
                        } else if (
                          /^\/[^/]+\/[^/]+\/data-review(?:\/dataset(?:\/[^/]+)?)?$/.test(
                            pathname ?? ""
                          )
                        ) {
                          const parts = pathname?.split("/").filter(Boolean) ?? [];
                          const locale = parts[0] ?? FALLBACK_DEFAULT_LOCALE;
                          const datasetId =
                            parts.length >= 5 && parts[3] === "dataset"
                              ? parts[4]?.trim()
                              : "";
                          const suffix = datasetId
                            ? `/dataset/${encodeURIComponent(datasetId)}`
                            : "/dataset";
                          router.push(`/${locale}/${opt.id}/data-review${suffix}`);
                        } else if (/^\/[^/]+\/[^/]+\/timeperiod$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "timeperiod", opt.id));
                        } else if (/^\/[^/]+\/[^/]+\/workflow$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "workflow", opt.id));
                        } else if (/^\/[^/]+\/[^/]+\/languages$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "languages", opt.id));
                        } else if (/^\/[^/]+\/[^/]+\/tools$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "tools", opt.id));
                        } else if (/^\/[^/]+\/[^/]+\/sources$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "sources", opt.id));
                        } else if (/^\/[^/]+\/[^/]+\/about$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "about", opt.id));
                        } else if (
                          /^\/[^/]+\/[^/]+\/compute-engine\/execute$/.test(pathname ?? "") ||
                          /^\/[^/]+\/[^/]+\/compute-engine\/execute\/logs\/[^/]+$/.test(
                            pathname ?? ""
                          )
                        ) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(`/${locale}/${opt.id}/compute-engine/execute`);
                        } else if (/^\/[^/]+\/[^/]+\/publish-data\/mobile-app$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(`/${locale}/${opt.id}/publish-data/mobile-app`);
                        } else if (/^\/[^/]+\/[^/]+\/reports\/data-report$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(`/${locale}/${opt.id}/reports/data-report`);
                        } else if (/^\/[^/]+\/[^/]+\/reports\/analytical-report$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(`/${locale}/${opt.id}/reports/analytical-report`);
                        } else if (/^\/[^/]+\/[^/]+\/reports\/quality-report$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(`/${locale}/${opt.id}/reports/quality-report`);
                        } else if (/^\/[^/]+\/[^/]+\/reports\/operational-reports$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(`/${locale}/${opt.id}/reports/operational-reports`);
                        } else if (/^\/[^/]+\/version-log$/.test(pathname ?? "")) {
                          const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
                          router.push(buildLocaleAppPath(locale, "version-log"));
                        }
                      }}
                    >
                      <span className="truncate">{opt.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <nav
        className={
          sidebarCollapsed
            ? "sb-nav relative z-[1] py-2 px-1 pb-14"
            : "sb-nav"
        }
      >
        {sidebarCollapsed ? (
          <>
            <Link
              href={overviewHref}
              title="Overview"
              className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                pathname === overviewHref ||
                /^\/[^/]+\/[^/]+\/overview$/.test(pathname ?? "")
                  ? "active"
                  : ""
              }`}
            >
              <span className="nav-item-left justify-center gap-0 text-[0]">
                <Mi name="grid_view" />
              </span>
            </Link>
            {showIndicators && (
              <Link
                href={indicatorsHref}
                title={t("INDICATORS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === indicatorsHref ||
                  /^\/[^/]+\/[^/]+\/indicator$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="table_chart" />
                </span>
              </Link>
            )}
            {showUnits && (
              <Link
                href={unitsHref}
                title={t("UNITS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === unitsHref ||
                  /^\/[^/]+\/[^/]+\/units$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="straighten" />
                </span>
              </Link>
            )}
            {showSubgroups && (
              <Link
                href={subgroupsHref}
                title={t("SUBGROUPS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === subgroupsHref ||
                  /^\/[^/]+\/[^/]+\/subgroups$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="groups" />
                </span>
              </Link>
            )}
            {showClassifications && (
              <Link
                href={classificationsHref}
                title={t("CLASSIFICATIONS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === classificationsHref ||
                  /^\/[^/]+\/[^/]+\/indicator-classifications$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="category" />
                </span>
              </Link>
            )}
            {showAreas && (
              <Link
                href={areasHref}
                title={t("AREAS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === areasHref ||
                  /^\/[^/]+\/[^/]+\/areas$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="map" />
                </span>
              </Link>
            )}
            {showDataEntry && (
              <Link
                href={dataEntryHref}
                title={t("DATA_ENTRY")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === dataEntryHref ||
                  /^\/[^/]+\/[^/]+\/data-entry\/dataset(?:\/[^/]+)?$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="edit_note" />
                </span>
              </Link>
            )}
            {showTimePeriod && (
              <Link
                href={timeperiodHref}
                title={t("TIME_PERIOD")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === timeperiodHref ||
                  /^\/[^/]+\/[^/]+\/timeperiod$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="calendar_month" />
                </span>
              </Link>
            )}
            {showSources && (
              <Link
                href={sourcesHref}
                title={t("SOURCES")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === sourcesHref ||
                  /^\/[^/]+\/[^/]+\/sources$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="description" />
                </span>
              </Link>
            )}
            {showCalculateIus && (
              <Link
                href={computeExecuteHref}
                title={t("CALCULATE_IUS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  computeExecuteActive ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="functions" />
                </span>
              </Link>
            )}
            {showWorkflow && (
              <Link
                href={workflowHref}
                title={t("WORKFLOW")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === workflowHref ||
                  /^\/[^/]+\/[^/]+\/workflow$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="shield" />
                </span>
              </Link>
            )}
            {showLanguages && (
              <Link
                href={languagesHref}
                title={t("LANGUAGES")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === languagesHref ||
                  /^\/[^/]+\/[^/]+\/languages$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="language" />
                </span>
              </Link>
            )}
            {showTools && (
              <Link
                href={toolsHref}
                title={t("TOOLS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  pathname === toolsHref ||
                  /^\/[^/]+\/[^/]+\/tools$/.test(pathname ?? "")
                    ? "active"
                    : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="build" />
                </span>
              </Link>
            )}
            {showPublishDataSection && (
              <Link
                href={publishDataMobileAppHref}
                title={t("PUBLISH_DATA", "Publish Data")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  /^\/[^/]+\/[^/]+\/publish-data\/mobile-app$/.test(pathname ?? "") ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="upload" />
                </span>
              </Link>
            )}
            {showReportsSection && (
              <Link
                href={dataReportsHref}
                title={t("REPORTS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  /^\/[^/]+\/[^/]+\/reports\/(data-report|analytical-report|quality-report|operational-reports | operational-dashboard)$/.test(pathname ?? "") ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="bar_chart" />
                </span>
              </Link>
            )}
            {showTransactionLogs && (
              <Link
                href={logsTransactionHref}
                title={t("TRANSACTION_LOGS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  isDwLogsPath && isTransactionLogsSection ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="receipt_long" />
                </span>
              </Link>
            )}
          </>
        ) : (
          <>
            <Link
              href={overviewHref}
              className={`nav-item ${
                pathname === overviewHref ||
                /^\/[^/]+\/[^/]+\/overview$/.test(pathname ?? "")
                  ? "active"
                  : ""
              }`}
            >
              <span className="nav-item-left">
                <Mi name="grid_view" />
                {t("OVERVIEW")}
              </span>
            </Link>
            {showTemplateSection && (
              <>
                <div
                  className="nav-item parent"
                  onClick={() => setTemplateOpen((o) => !o)}
                >
                  <span className="nav-item-left">
                    <Mi name="table_chart" />
                    {t("TEMPLATE")}
                  </span>
                  <span className={`chev ${templateOpen ? "" : "-rotate-90"}`}>
                    <Mi name="expand_more" className="!text-sm" />
                  </span>
                </div>
                {templateOpen && (
                  <div className="nav-children">
                    {showIndicators && (
                      <Link
                        href={indicatorsHref}
                        className={`nav-child ${pathname === indicatorsHref || /^\/[^/]+\/[^/]+\/indicator$/.test(pathname ?? "") ? "active" : ""}`}
                      >
                        {t("INDICATORS")}
                      </Link>
                    )}
                    {showUnits && (
                      <Link
                        href={unitsHref}
                        className={`nav-child ${pathname === unitsHref || /^\/[^/]+\/[^/]+\/units$/.test(pathname ?? "") ? "active" : ""}`}
                      >
                        {t("UNITS")}
                      </Link>
                    )}
                    {showSubgroups && (
                      <Link
                        href={subgroupsHref}
                        className={`nav-child ${pathname === subgroupsHref || /^\/[^/]+\/[^/]+\/subgroups$/.test(pathname ?? "") ? "active" : ""}`}
                      >
                        {t("SUBGROUPS")}
                      </Link>
                    )}
                    {showClassifications && (
                      <Link
                        href={classificationsHref}
                        className={`nav-child ${pathname === classificationsHref || /^\/[^/]+\/[^/]+\/indicator-classifications$/.test(pathname ?? "") ? "active" : ""}`}
                      >
                        {t("CLASSIFICATIONS")}
                      </Link>
                    )}
                    {showAreas && (
                      <Link
                        href={areasHref}
                        className={`nav-child ${pathname === areasHref || /^\/[^/]+\/[^/]+\/areas$/.test(pathname ?? "") ? "active" : ""}`}
                      >
                        {t("AREAS")}
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
            {showDataManagementSection && (
              <>
                <div
                  className="nav-item parent"
                  onClick={() => setDataEntryOpen((o) => !o)}
                >
                  <span className="nav-item-left">
                    <Mi name="edit_note" /> {t("DATA_MANAGEMENT")}
                  </span>
                  <span className={`chev ${dataEntryOpen ? "" : "-rotate-90"}`}>
                    <Mi name="expand_more" className="!text-sm" />
                  </span>
                </div>
                {dataEntryOpen && (
                  <div className="nav-children">
                    {showDataEntry && (
                      <Link
                        href={dataEntryHref}
                        className={`nav-child ${
                          /^\/[^/]+\/[^/]+\/data-entry\/dataset(?:\/[^/]+)?$/.test(pathname ?? "")
                            ? "active"
                            : ""
                        }`}
                      >
                        {t("DATA_ENTRY")}
                      </Link>
                    )}
                    {showDataReview && (
                      <Link
                        href={dataReviewHref}
                        className={`nav-child ${
                          /^\/[^/]+\/[^/]+\/data-review\/dataset(?:\/[^/]+)?$/.test(pathname ?? "")
                            ? "active"
                            : ""
                        }`}
                      >
                        {t("DATA_REVIEW")}
                      </Link>
                    )}
                    {showTimePeriod && (
                      <Link
                        href={timeperiodHref}
                        className={`nav-child ${
                          pathname === timeperiodHref ||
                          /^\/[^/]+\/[^/]+\/timeperiod$/.test(pathname ?? "")
                            ? "active"
                            : ""
                        }`}
                      >
                        {t("TIME_PERIOD")}
                      </Link>
                    )}
                    {showSources && (
                      <Link
                        href={sourcesHref}
                        className={`nav-child ${
                          pathname === sourcesHref ||
                          /^\/[^/]+\/[^/]+\/sources$/.test(pathname ?? "")
                            ? "active"
                            : ""
                        }`}
                      >
                        {t("SOURCES")}
                      </Link>
                    )}
                    {showCalculateIus && (
                      <Link
                        href={computeExecuteHref}
                        className={`nav-child ${computeExecuteActive ? "active" : ""}`}
                      >
                        {t("CALCULATE_IUS")}
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
            {showAdministrationSection && (
              <>
                <div
                  className="nav-item parent"
                  onClick={() => setAdministrationOpen((o) => !o)}
                >
                  <span className="nav-item-left">
                    <Mi name="shield" />
                    {t("ADMINISTRATION")}
                  </span>
                  <span className={`chev ${administrationOpen ? "" : "-rotate-90"}`}>
                    <Mi name="expand_more" className="!text-sm" />
                  </span>
                </div>
                {administrationOpen && (
                  <div className="nav-children">
                    {showWorkflow && (
                      <Link
                        href={workflowHref}
                        className={`nav-child ${
                          pathname === workflowHref ||
                          /^\/[^/]+\/[^/]+\/workflow$/.test(pathname ?? "")
                            ? "active"
                            : ""
                        }`}
                      >
                        {t("WORKFLOW")}
                      </Link>
                    )}
                    {showLanguages && (
                      <Link
                        href={languagesHref}
                        className={`nav-child ${
                          pathname === languagesHref ||
                          /^\/[^/]+\/[^/]+\/languages$/.test(pathname ?? "")
                            ? "active"
                            : ""
                        }`}
                      >
                        {t("LANGUAGES")}
                      </Link>
                    )}
                    {showTools && (
                      <Link
                        href={toolsHref}
                        className={`nav-child ${
                          pathname === toolsHref ||
                          /^\/[^/]+\/[^/]+\/tools$/.test(pathname ?? "")
                            ? "active"
                            : ""
                        }`}
                      >
                        {t("TOOLS")}
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
            {showPublishDataSection && (
              <>
                <div
                  className="nav-item parent"
                  onClick={() => setPublishDataOpen((o) => !o)}
                >
                  <span className="nav-item-left">
                    <Mi name="upload" />
                    {t("PUBLISH_DATA", "Publish Data")}
                  </span>
                  <span className={`chev ${publishDataOpen ? "" : "-rotate-90"}`}>
                    <Mi name="expand_more" className="!text-sm" />
                  </span>
                </div>
                {publishDataOpen && (
                  <div className="nav-children">
                    {showPublishDataMobileApp && (
                      <Link
                        href={publishDataMobileAppHref}
                        className={`nav-child ${
                          /^\/[^/]+\/[^/]+\/publish-data\/mobile-app$/.test(pathname ?? "") ? "active" : ""
                        }`}
                      >
                        {t("MOBILE_APP", "Mobile App")}
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
            {showReportsSection && (
              <>
                <div
                  className="nav-item parent"
                  onClick={() => setReportsOpen((o) => !o)}
                >
                  <span className="nav-item-left">
                    <Mi name="bar_chart" />
                    {t("REPORTS")}
                  </span>
                  <span className={`chev ${reportsOpen ? "" : "-rotate-90"}`}>
                    <Mi name="expand_more" className="!text-sm" />
                  </span>
                </div>
                {reportsOpen && (
                  <div className="nav-children">
                    {showDataReports && (
                      <Link
                        href={dataReportsHref}
                        className={`nav-child ${
                          /^\/[^/]+\/[^/]+\/reports\/data-report$/.test(pathname ?? "") ? "active" : ""
                        }`}
                      >
                        {t("DATA_REPORT")}
                      </Link>
                    )}
                    {showAnalyticalReports && (
                      <Link
                        href={analyticalReportHref}
                        className={`nav-child ${
                          /^\/[^/]+\/[^/]+\/reports\/analytical-report$/.test(pathname ?? "") ? "active" : ""
                        }`}
                      >
                        {t("ANALYTICAL_REPORT")}
                      </Link>
                    )}
                    {showQualityReports && (
                      <Link
                        href={qualityReportHref}
                        className={`nav-child ${
                          /^\/[^/]+\/[^/]+\/reports\/quality-report$/.test(pathname ?? "") ? "active" : ""
                        }`}
                      >
                        {t("QUALITY_REPORT")}
                      </Link>
                    )}
                    {showOperationalReports && (
                      <Link
                        href={operationalReportsHref}
                        className={`nav-child ${
                          /^\/[^/]+\/[^/]+\/reports\/operational-reports$/.test(pathname ?? "") ? "active" : ""
                        }`}
                      >
                        {t("OPERATIONAL_REPORTS")}
                      </Link>
                    )}
                    {showOperationalDashboard && (
                      <Link
                        href={operationalDashboardHref}
                        className={`nav-child ${
                          /^\/[^/]+\/[^/]+\/reports\/operational-dashboard$/.test(pathname ?? "") ? "active" : ""
                        }`}
                      >
                        {t("OPERATIONAL_DASHBOARD")}
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
            {showLogsSection && (
              <>
                <div
                  className="nav-item parent"
                  onClick={() => setLogsOpen((o) => !o)}
                >
                  <span className="nav-item-left">
                    <Mi name="receipt_long" />
                    {t("LOGS")}
                  </span>
                  <span className={`chev ${logsOpen ? "" : "-rotate-90"}`}>
                    <Mi name="expand_more" className="!text-sm" />
                  </span>
                </div>
                {logsOpen && (
                  <div className="nav-children">
                    {showTransactionLogs && (
                      <Link
                        href={logsTransactionHref}
                        className={`nav-child ${
                          isDwLogsPath && isTransactionLogsSection ? "active" : ""
                        }`}
                      >
                        {t("TRANSACTION_LOGS")}
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </nav>

      <SidebarBottom
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        appVersion={appVersion}
      />
    </aside>
  );
}

/** Sidebar for global routes: datawarehouse list + administration (no warehouse context). */
function AppLevelSidebarNav({
  sidebarCollapsed,
  setSidebarCollapsed,
  appVersion,
}: {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean | ((p: boolean) => boolean)) => void;
  appVersion: string;
}) {
  const core = useCoreOptional();
  const t = core?.t ?? fallbackT;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
  const datawarehouseHref = buildLocaleAppPath(locale, "datawarehouse");
  const administrationHref = buildLocaleAppPath(locale, "administration");
  const logsHref = buildLocaleAppPath(locale, "logs");
  const translationsHref = buildLocaleAppPath(locale, "translations");
  const adminUsersHref = `${administrationHref}?section=users`;
  const adminRolesHref = `${administrationHref}?section=roles`;
  const adminEmailTemplatesHref = `${administrationHref}?section=email-templates`;
  const adminHelpHref = `${administrationHref}?section=help`;
  const adminConfigurationHref = `${administrationHref}?section=configuration`;
  const logsEmailLogsHref = `${logsHref}?section=email-logs`;
  const logsServerErrorsHref = `${logsHref}?section=server-errors`;

  const isDatawarehousePath = /^\/[^/]+\/datawarehouse$/.test(pathname ?? "");
  const isAdministrationPath = /^\/[^/]+\/administration$/.test(pathname ?? "");
  const isLogsPath = /^\/[^/]+\/logs$/.test(pathname ?? "");
  const isTranslationsPath = /^\/[^/]+\/translations$/.test(pathname ?? "");
  const adminSection = searchParams.get("section");
  const logsSection = isLogsPath ? searchParams.get("section") : null;
  const isRolesSection = adminSection === "roles";
  const isEmailTemplatesSection = adminSection === "email-templates";
  const isHelpSection = adminSection === "help";
  const isConfigurationSection = adminSection === "configuration";
  const isUsersSection =
    !adminSection || adminSection === "users";
  const isEmailLogsSection =
    logsSection === "email-logs" || (!logsSection && isLogsPath);
  const isServerErrorsSection = logsSection === "server-errors";

  const canViewDatawarehouse = hasPermission(APP_ROUTE_PERMISSIONS.datawarehouse.view, "R");
  const canViewUsers = hasPermission(APP_ROUTE_PERMISSIONS.administration.users.view, "R");
  const canViewRoles = hasPermission(APP_ROUTE_PERMISSIONS.administration.roles.view, "R");
  const canViewEmail = hasPermission(APP_ROUTE_PERMISSIONS.administration.emailTemplates.view, "R");
  const canViewEmailLogs =
    hasPermission(APP_ROUTE_PERMISSIONS.logs.emailLogs.view, "R") || canViewEmail;
  const canViewServerErrors = hasPermission(APP_ROUTE_PERMISSIONS.logs.serverErrors.view, "R");
  const canViewHelp = hasPermission(APP_ROUTE_PERMISSIONS.administration.help.view, "R");
  const canViewConfiguration =
    hasPermission(APP_ROUTE_PERMISSIONS.settings.view, "R") ||
    hasAnyPermission(APP_ROUTE_PERMISSIONS.settings.view);
  const canViewAdministration =
    canViewUsers || canViewRoles || canViewEmail || canViewHelp || canViewConfiguration;
  const canViewLogsSection = canViewEmailLogs || canViewServerErrors;
  const canViewTranslations = hasPermission(APP_ROUTE_PERMISSIONS.translations.view, "R");

  /** Closed on datawarehouse; expands when a child route (users / roles) is active. */
  const [adminOpen, setAdminOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    setAdminOpen(isAdministrationPath);
    setLogsOpen(isLogsPath);
  }, [isAdministrationPath, isLogsPath]);

  return (
    <aside
      className={sidebarCollapsed ? "sb sb--collapsed w-[64px]" : "sb"}
    >
      <nav className={sidebarCollapsed ? "sb-nav py-2 px-1" : "sb-nav"}>
        {sidebarCollapsed ? (
          <>
            {canViewDatawarehouse && (
              <Link
                href={datawarehouseHref}
                title={t("LABEL_DATAWAREHOUSE")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  isDatawarehousePath ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="storage" />
                </span>
              </Link>
            )}
            {canViewRoles && (
              <Link
                href={adminRolesHref}
                title={t("ROLES")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  isAdministrationPath && isRolesSection ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="shield" />
                </span>
              </Link>
            )}
            {canViewUsers && (
              <Link
                href={adminUsersHref}
                title={t("USERS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  isAdministrationPath && isUsersSection ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="people" />
                </span>
              </Link>
            )}
            {canViewEmail && (
              <Link
                href={adminEmailTemplatesHref}
                title={t("EMAIL_TEMPLATES")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  isAdministrationPath && isEmailTemplatesSection ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="mark_email_read" />
                </span>
              </Link>
            )}
            {canViewTranslations && (
              <Link
                href={translationsHref}
                title={t("TRANSLATIONS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  isTranslationsPath ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="translate" />
                </span>
              </Link>
            )}
            {canViewEmailLogs && (
              <Link
                href={logsEmailLogsHref}
                title={t("EMAIL_LOGS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  isLogsPath && isEmailLogsSection ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="history" />
                </span>
              </Link>
            )}
            {canViewServerErrors && (
              <Link
                href={logsServerErrorsHref}
                title={t("SERVER_ERRORS")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  isLogsPath && isServerErrorsSection ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="error_outline" />
                </span>
              </Link>
            )}
            {canViewHelp && (
              <Link
                href={adminHelpHref}
                title={t("HELP_ADMIN")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  isAdministrationPath && isHelpSection ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="help_outline" />
                </span>
              </Link>
            )}
            {canViewConfiguration && (
              <Link
                href={adminConfigurationHref}
                title={t("CONFIGURATION")}
                className={`nav-item py-2.5 justify-center border-l-0 pl-0 ${
                  isAdministrationPath && isConfigurationSection ? "active" : ""
                }`}
              >
                <span className="nav-item-left justify-center gap-0 text-[0]">
                  <Mi name="tune" />
                </span>
              </Link>
            )}
          </>
        ) : (
          <>
            {canViewDatawarehouse && (
              <Link
                href={datawarehouseHref}
                className={`nav-item ${isDatawarehousePath ? "active" : ""}`}
              >
                <span className="nav-item-left">
                  <Mi name="storage" />
                  {t("LABEL_DATAWAREHOUSE")}
                </span>
              </Link>
            )}
            {canViewAdministration && (
              <>
                <div
                  className="nav-item parent"
                  onClick={() => setAdminOpen((o) => !o)}
                >
                  <span className="nav-item-left">
                    <Mi name="admin_panel_settings" />
                    {t("ADMINISTRATION")}
                  </span>
                  <span className={`chev ${adminOpen ? "" : "-rotate-90"}`}>
                    <Mi name="expand_more" className="!text-sm" />
                  </span>
                </div>
                {adminOpen && (
                  <div className="nav-children">
                    {canViewRoles && (
                      <Link
                        href={adminRolesHref}
                        className={`nav-child ${
                          isAdministrationPath && isRolesSection ? "active" : ""
                        }`}
                      >
                        {t("ROLES")}
                      </Link>
                    )}
                    {canViewUsers && (
                      <Link
                        href={adminUsersHref}
                        className={`nav-child ${
                          isAdministrationPath && isUsersSection ? "active" : ""
                        }`}
                      >
                        {t("USERS")}
                      </Link>
                    )}
                    {canViewEmail && (
                      <Link
                        href={adminEmailTemplatesHref}
                        className={`nav-child ${
                          isAdministrationPath && isEmailTemplatesSection ? "active" : ""
                        }`}
                      >
                        {t("EMAIL_TEMPLATES")}
                      </Link>
                    )}
                    {canViewHelp && (
                      <Link
                        href={adminHelpHref}
                        className={`nav-child ${
                          isAdministrationPath && isHelpSection ? "active" : ""
                        }`}
                      >
                        {t("HELP_ADMIN")}
                      </Link>
                    )}
                    {canViewConfiguration && (
                      <Link
                        href={adminConfigurationHref}
                        className={`nav-child ${
                          isAdministrationPath && isConfigurationSection ? "active" : ""
                        }`}
                      >
                        {t("CONFIGURATION")}
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
            {canViewTranslations && (
              <Link
                href={translationsHref}
                className={`nav-item ${isTranslationsPath ? "active" : ""}`}
              >
                <span className="nav-item-left">
                  <Mi name="translate" />
                  {t("TRANSLATIONS")}
                </span>
              </Link>
            )}
            {canViewLogsSection && (
              <>
                <div
                  className="nav-item parent"
                  onClick={() => setLogsOpen((o) => !o)}
                >
                  <span className="nav-item-left">
                    <Mi name="receipt_long" />
                    {t("LOGS")}
                  </span>
                  <span className={`chev ${logsOpen ? "" : "-rotate-90"}`}>
                    <Mi name="expand_more" className="!text-sm" />
                  </span>
                </div>
                {logsOpen && (
                  <div className="nav-children">
                    {canViewEmailLogs && (
                      <Link
                        href={logsEmailLogsHref}
                        className={`nav-child ${
                          isLogsPath && isEmailLogsSection ? "active" : ""
                        }`}
                      >
                        {t("EMAIL_LOGS")}
                      </Link>
                    )}
                    {canViewServerErrors && (
                      <Link
                        href={logsServerErrorsHref}
                        className={`nav-child ${
                          isLogsPath && isServerErrorsSection ? "active" : ""
                        }`}
                      >
                        {t("SERVER_ERRORS")}
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </nav>

      <SidebarBottom
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        appVersion={appVersion}
        versionTitlePrefix="V "
      />
    </aside>
  );
}

export function Sidebar({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dwId, setDwId] = useState("");
  const [dwOptions, setDwOptions] = useState<DwOption[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dwDropdownOpen, setDwDropdownOpen] = useState(false);
  const [toolbarExtra, setToolbarExtra] = useState<ReactNode>(null);
  const [bulkDelete, setBulkDelete] = useState<BulkDeleteToolbarConfig | null>(null);
  const [toolbarExport, setToolbarExport] = useState<ToolbarExportConfig | null>(
    null
  );
  const [toolbarImport, setToolbarImport] = useState<ToolbarImportConfig | null>(
    null
  );
  const [selectedReportType, setSelectedReportType] = useState<string>("");
  const [fileImportOpen, setFileImportOpen] = useState(false);
  const [fileImportSubmitHandler, setFileImportSubmitHandler] =
    useState<FileImportSubmitHandler | null>(null);
  const [fileImportTemplateHandler, setFileImportTemplateHandler] =
    useState<FileImportTemplateHandler | null>(null);
  const [dwPermissionsVersion, setDwPermissionsVersion] = useState(0);
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getAppVersion();
        if (!cancelled) setAppVersion(v);
      } catch {
        if (!cancelled) setAppVersion("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setDwIdPersisted = useCallback((id: string) => {
    const next = String(id).trim();
    setDwId(next);
    try {
      window.localStorage.setItem(SELECTED_DW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const isExcluded = useMemo(
    () =>
      LAYOUT_EXCLUDED_PATHS.some(
        (p) => p === pathname || pathname.startsWith(p + "/")
      ) || isLocaleOnlyLoginPath(pathname),
    [pathname]
  );
  const isDatawarehouseRoute = useMemo(
    () => /^\/[^/]+\/datawarehouse$/.test(pathname ?? ""),
    [pathname]
  );
  const isAdministrationRoute = useMemo(
    () => /^\/[^/]+\/administration$/.test(pathname ?? ""),
    [pathname]
  );
  const isLogsRoute = useMemo(
    () => /^\/[^/]+\/logs$/.test(pathname ?? ""),
    [pathname]
  );
  const isAboutRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/about$/.test(pathname ?? ""),
    [pathname]
  );
  const isVersionLogRoute = useMemo(
    () => /^\/[^/]+\/version-log$/.test(pathname ?? ""),
    [pathname]
  );
  const isPreferencesRoute = useMemo(
    () => /^\/[^/]+\/preferences$/.test(pathname ?? ""),
    [pathname]
  );
  const isTranslationsRoute = useMemo(
    () => /^\/[^/]+\/translations$/.test(pathname ?? ""),
    [pathname]
  );
  const isAppShellRoute =
    isDatawarehouseRoute ||
    isAdministrationRoute ||
    isLogsRoute ||
    isPreferencesRoute ||
    isVersionLogRoute ||
    isAboutRoute ||
    isTranslationsRoute;
  const isComputeLogDetailShellLess = useMemo(
    () => isComputeExecutionLogDetailPath(pathname),
    [pathname]
  );

  // Restore selected warehouse before paint so indicators page first fetch uses the right DW.
  useLayoutEffect(() => {
    if (isExcluded) return;
    const stored = readStoredDwId();
    if (stored) setDwId(stored);
  }, [isExcluded]);

  // If route carries dw id (/{locale}/{dwId}/...), sync context + localStorage.
  useEffect(() => {
    const parts = pathname?.split("/").filter(Boolean) ?? [];
    if (parts.length < 2) return;
    if (parts[1] === "datawarehouse") return;
    if (parts[1] === "administration") return;
    if (parts[1] === "logs") return;
    if (parts[1] === "version-log" || parts[1] === "about-us" || parts[1] === "preferences" || parts[1] === "translations") return;
    if (parts.length > 3) {
      const okComputeExecute =
        parts.length === 4 &&
        parts[2] === "compute-engine" &&
        parts[3] === "execute";
      const okComputeLogDetail =
        parts.length === 6 &&
        parts[2] === "compute-engine" &&
        parts[3] === "execute" &&
        parts[4] === "logs";
      const okDataManagementDataset =
        parts.length >= 4 &&
        (parts[2] === "data-entry" || parts[2] === "data-review") &&
        parts[3] === "dataset" &&
        (parts.length === 4 || parts.length === 5);
      const okPublishData =
        parts.length === 4 &&
        parts[2] === "publish-data" &&
        parts[3] === "mobile-app";
      const okReportsDataReports =
        parts.length === 4 &&
        parts[2] === "reports" &&
        parts[3] === "data-report";
      if (!okComputeExecute && !okComputeLogDetail && !okDataManagementDataset && !okPublishData && !okReportsDataReports) return;
    }
    if (
      parts.length === 3 &&
      parts[2] !== "indicator" &&
      parts[2] !== "overview" &&
      parts[2] !== "units" &&
      parts[2] !== "subgroups" &&
      parts[2] !== "areas" &&
      parts[2] !== "indicator-classifications" &&
      parts[2] !== "timeperiod" &&
      parts[2] !== "workflow" &&
      parts[2] !== "sources" &&
      parts[2] !== "logs" &&
      parts[2] !== "about"
    ) {
      return;
    }

    const routeDwId = parts[1]?.trim();
    if (!routeDwId) return;
    setDwIdPersisted(routeDwId);
  }, [pathname, setDwIdPersisted]);

  // Only fetch datawarehouses when the dashboard is shown (not on login/excluded paths).
  // Avoids 401 → redirect loop on "/" when user is not logged in.
  useEffect(() => {
    if (isExcluded || isAppShellRoute) return;
    let cancelled = false;
    fetchDatawarehouses({ limit: 1000, active_only: true })
      .then((list) => {
        if (!cancelled) {
          setDwOptions(list);
          const ids = new Set(list.map((d) => String(d.id).trim()));
          setDwId((current) => {
            const currentId = String(current).trim();
            let next = currentId;
            if (ids.has(currentId)) next = currentId;
            else {
              const stored = readStoredDwId();
              if (stored && ids.has(stored)) next = stored;
              else if (list.length > 0) next = list[0].id;
              else next = currentId;
            }
            if (next !== current) {
              try {
                window.localStorage.setItem(SELECTED_DW_STORAGE_KEY, next);
              } catch {
                /* ignore */
              }
            }
            return next;
          });
        }
      })
      .catch(() => {
        if (!cancelled) setDwOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isExcluded, isAppShellRoute]);

  useEffect(() => {
    const trimmedDwId = dwId.trim();
    if (isExcluded || isAppShellRoute || !trimmedDwId) {
      clearStoredDwPermissions();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = getAuthMePermissionsUrl(trimmedDwId);
        const json = (await getRequest(url, undefined, {
          suppressErrorMessage: true,
        })) as {
          success?: boolean;
          data?: {
            is_super_admin?: boolean;
            roles?: AppPermissions["roles"];
            resources?: AppPermissions["resources"];
            workflow_access?: AppPermissions["workflow_access"];
          };
        };
        if (cancelled) return;
        if (json?.success && json?.data) {
          const d = json.data;
          setStoredDwPermissions(trimmedDwId, {
            is_super_admin: d.is_super_admin ?? false,
            roles: Array.isArray(d.roles) ? d.roles : [],
            resources: Array.isArray(d.resources) ? d.resources : [],
            workflow_access: d.workflow_access ?? {
              workflows: [],
              resources: {},
              assignments: [],
            },
          });
          setDwPermissionsVersion((v) => v + 1);
        }
      } catch {
        if (!cancelled) clearStoredDwPermissions();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dwId, isExcluded, isAppShellRoute]);

  const core = useCoreOptional();
  const t = core?.t ?? fallbackT;

  const pageConfig = getPageConfigForPathname(pathname);
  const icon = pageConfig?.icon ?? "table_chart";
  const isOverviewRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/overview$/.test(pathname ?? ""),
    [pathname]
  );
  const isComputeExecuteRoute = useMemo(
    () =>
      /^\/[^/]+\/[^/]+\/compute-engine\/execute(\/logs\/[^/]+)?$/.test(
        pathname ?? ""
      ),
    [pathname]
  );
  const isWorkflowRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/workflow$/.test(pathname ?? ""),
    [pathname]
  );
  const isToolsRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/tools$/.test(pathname ?? ""),
    [pathname]
  );
  const isPublishDataMobileAppRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/publish-data\/mobile-app$/.test(pathname ?? ""),
    [pathname]
  );
  const isDataReportRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/reports\/data-report$/.test(pathname ?? ""),
    [pathname]
  );
  const isQualityReportRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/reports\/quality-report$/.test(pathname ?? ""),
    [pathname]
  )
  const isAnalyticalReportRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/reports\/analytical-report$/.test(pathname ?? ""),
    [pathname]
  )
  const isOperationalReportsRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/reports\/operational-reports$/.test(pathname ?? ""),
    [pathname]
  )

  const isDwLogsRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/logs$/.test(pathname ?? ""),
    [pathname]
  );

  const isSubgroupRoute = useMemo(
    () => /^\/[^/]+\/[^/]+\/subgroups$/.test(pathname ?? ""),
    [pathname]
  )
  
  let title = pageConfig?.titleKey ? t(pageConfig.titleKey) : "";
  if (isPublishDataMobileAppRoute) {
    title = `${title} - ${t("MOBILE_APP")}`;
  }
  const isDataManagementRoute = useMemo(
    () =>
      /^\/[^/]+\/[^/]+\/data-entry\/dataset(?:\/[^/]+)?$/.test(pathname ?? "") ||
      /^\/[^/]+\/[^/]+\/data-review\/dataset(?:\/[^/]+)?$/.test(pathname ?? ""),
    [pathname]
  );
  const dataManagementDetailMatch = useMemo(() => {
    const match = (pathname ?? "").match(
      /^\/([^/]+)\/([^/]+)\/(data-entry|data-review)\/dataset\/([^/]+)$/
    );
    if (!match) return null;
    return {
      locale: match[1],
      dwId: match[2],
      section: match[3],
    };
  }, [pathname]);
  const toolbarTitlePrefix = useMemo<ReactNode>(() => {
    if (!dataManagementDetailMatch) return null;
    const goBackToList = () => {
      router.push(
        `/${dataManagementDetailMatch.locale}/${dataManagementDetailMatch.dwId}/${dataManagementDetailMatch.section}/dataset`
      );
    };
    return (
      <button
        type="button"
        className="btn-comp-primary !w-8 !min-w-8 !p-0 shrink-0"
        onClick={goBackToList}
        aria-label={t("BACK_TO_DATASET_LIST", "Back to dataset list")}
        title={t("BACK_TO_DATASET_LIST", "Back to dataset list")}
      >
        <Mi name="arrow_back" className="!text-sm" />
      </button>
    );
  }, [dataManagementDetailMatch, router, t]);
  const isTemplateImportRoute = useMemo(
    () =>
      /^\/[^/]+\/(?:[^/]+\/)?(indicator|units|subgroups|areas|indicator-classifications|timeperiod)$/.test(
        pathname ?? ""
      ),
    [pathname]
  );
  const effectiveToolbarImport = useMemo<ToolbarImportConfig | null>(() => {
    if (!isTemplateImportRoute) return toolbarImport;
    return {
      onClick: () => setFileImportOpen(true),
      disabled: toolbarImport?.disabled ?? false,
    };
  }, [isTemplateImportRoute, toolbarImport]);

  useEffect(() => {
    if (!isTemplateImportRoute) setFileImportOpen(false);
  }, [isTemplateImportRoute]);

  const setFileImportSubmitHandlerSafe = useCallback(
    (handler: FileImportSubmitHandler | null) => {
      setFileImportSubmitHandler(() => handler);
    },
    []
  );

  const setFileImportTemplateHandlerSafe = useCallback(
    (handler: FileImportTemplateHandler | null) => {
      setFileImportTemplateHandler(() => handler);
    },
    []
  );

  const contextValue = useMemo(
    () => ({
      dwId,
      setDwId: setDwIdPersisted,
      dwOptions,
      sidebarCollapsed,
      setSidebarCollapsed,
      dwDropdownOpen,
      setDwDropdownOpen,
      toolbarExtra,
      setToolbarExtra,
      bulkDelete,
      setBulkDelete,
      toolbarExport,
      setToolbarExport,
      toolbarImport,
      setToolbarImport,
      dwPermissionsVersion,
      fileImportSubmitHandler,
      setFileImportSubmitHandler: setFileImportSubmitHandlerSafe,
      fileImportTemplateHandler,
      setFileImportTemplateHandler: setFileImportTemplateHandlerSafe,
      selectedReportType: (isAnalyticalReportRoute || isQualityReportRoute) ? selectedReportType : null,
      setSelectedReportType,
    }),
    [
      dwId,
      setDwIdPersisted,
      dwOptions,
      sidebarCollapsed,
      dwDropdownOpen,
      toolbarExtra,
      bulkDelete,
      toolbarExport,
      toolbarImport,
      dwPermissionsVersion,
      fileImportSubmitHandler,
      fileImportTemplateHandler,
      setFileImportSubmitHandlerSafe,
      setFileImportTemplateHandlerSafe,
      isAnalyticalReportRoute,
      isQualityReportRoute,
      selectedReportType,
    ]
  );

  if (isExcluded || isComputeLogDetailShellLess) {
    return <div key="shell-excluded">{children}</div>;
  }

  if (isAppShellRoute) {
    return (
      <SidebarProvider key="shell-app" value={contextValue}>
        <div className="indicator-page flex h-screen min-h-0 w-full flex-col overflow-x-hidden">
          <Header />
          <div className="flex min-h-0 flex-1 w-full min-w-0">
            <AppLevelSidebarNav
              sidebarCollapsed={sidebarCollapsed}
              setSidebarCollapsed={setSidebarCollapsed}
              appVersion={appVersion}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
              {children}
            </div>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider key="shell-dw" value={contextValue}>
      <div className="indicator-page overflow-x-hidden">
        {/*
          Was `.shell` in globals.css (removed during cleanup). Must stay flex + full viewport height
          or sidebar + main stack/break and content collapses to the bottom.
        */}
        <div className="flex h-screen min-h-0 w-full min-w-0">
          <SidebarNav
            dwId={dwId}
            setDwId={setDwIdPersisted}
            dwOptions={dwOptions}
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            dwDropdownOpen={dwDropdownOpen}
            setDwDropdownOpen={setDwDropdownOpen}
            dwPermissionsVersion={dwPermissionsVersion}
            appVersion={appVersion}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
            <PageToolbar
              title={title}
              icon={icon}
              titlePrefix={toolbarTitlePrefix}
              toolbarExtra={toolbarExtra}
              bulkDelete={bulkDelete}
              toolbarExport={toolbarExport}
              toolbarImport={effectiveToolbarImport}
              hideActions={
                isOverviewRoute ||
                isAboutRoute ||
                isVersionLogRoute ||
                isDataManagementRoute ||
                isComputeExecuteRoute
              }
              hideImportExport={
                isWorkflowRoute || isComputeExecuteRoute || isDataManagementRoute || isToolsRoute || isPublishDataMobileAppRoute
              }
              hideImport={
                isDwLogsRoute ||
                isWorkflowRoute ||
                isComputeExecuteRoute ||
                isDataManagementRoute ||
                isToolsRoute ||
                isPublishDataMobileAppRoute ||
                isDataReportRoute ||
                isQualityReportRoute ||
                isAnalyticalReportRoute ||
                isOperationalReportsRoute ||
                isSubgroupRoute
              }
              hideDelete={
                isDwLogsRoute ||
                isDataManagementRoute ||
                isToolsRoute ||
                isPublishDataMobileAppRoute ||
                isDataReportRoute ||
                isQualityReportRoute ||
                isAnalyticalReportRoute ||
                isOperationalReportsRoute
              }
              notificationDwId={dwId}
            />
            {children}
          </div>
        </div>
        <FileImport
          open={fileImportOpen}
          onClose={() => setFileImportOpen(false)}
          title={title || "Data"}
          onImport={
            isTemplateImportRoute && fileImportSubmitHandler
              ? fileImportSubmitHandler
              : undefined
          }
          onTemplateClick={
            isTemplateImportRoute && fileImportTemplateHandler
              ? fileImportTemplateHandler
              : undefined
          }
        />
      </div>
    </SidebarProvider>
  );
}
