"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { MainTabsBar } from "@/components/MainTabsBar";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { TimePeriodSelectionModal } from "@/components/TimePeriodSelectionModal";
import type { TimePeriodItem } from "dfa-v6-comp-timeperiod";
import { textFieldClassName } from "@/components/TextField";
import { TextAreaField } from "@/components/TextAreaField";
import { getRequest, postRequest, deleteRequest } from "@/lib/api/http";
import { getDWAPIURL, REFERENCE_PATH_LANGUAGES, API_BASE_URL } from "@/lib/constants";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import { useDwCrudPermissions } from "@/hooks/useDwCrudPermissions";
import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import {
  InlineEditableTable,
  EditableDataGridThead,
  ServerDrivenListTbody,
  type EditableGridColumnDef,
} from "@/components/TableView";
import { StatusChip } from "@/components/StatusChip";

type TabId = "data" | "history";

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

interface LanguageRaw {
  lang_nid?: number;
  lang_name: string | null;
  lang_code: string | null;
  lang_is_default: boolean;
  lang_is_global_lock: boolean;
}

interface IndicatorClassificationTypeRaw {
  ic_type: string;
  ic_type_name: string;
}

interface PackageDetail {
  data_files: string;
  languages: string;
  ic_types?: string | null;
  exclude_no_data: boolean;
  exclude_time_periods?: string | null;
}

interface MobilePackage {
  id: number;
  update_version: number;
  package_status: "building" | "created" | "published" | "failed";
  comments?: string | null;
  map_level_id?: string | null;
  is_deleted: boolean;
  created_on: string;
  published_on?: string | null;
  deleted_on?: string | null;
  detail?: PackageDetail | null;
}

const STATUS_LABELS: Record<string, string> = {
  building: "Building",
  created: "Ready",
  published: "Published",
  failed: "Failed",
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" })
    + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// History table — uses the shared InlineEditableTable pattern
// ---------------------------------------------------------------------------

function buildHistoryCols(
  t: (key: string, fallback?: string) => string,
): EditableGridColumnDef<MobilePackage>[] {
  return [
    {
      id: "sno",
      header: t("S_NO", "S.No"),
      layout: { width: 5, unit: "%" },
      cellOverflowHidden: true,
      cell: ({ rowIndex }) => <span>{rowIndex + 1}</span>,
    },
    {
      id: "update_type",
      header: t("UPDATE_TYPE", "Update Type"),
      layout: { width: 9, unit: "%" },
      cellOverflowHidden: true,
      cell: () => <span>data</span>,
    },
    {
      id: "update_version",
      header: t("UPDATE_VERSION", "Update Version"),
      layout: { width: 11, unit: "%" },
      cellOverflowHidden: true,
      cell: ({ row }) => <span>{row.update_version}</span>,
    },
    {
      id: "package_status",
      header: t("STATUS", "Status"),
      layout: { width: 10, unit: "%" },
      cellOverflowHidden: true,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1">
          {row.package_status === "building" && !row.is_deleted ? (
            <span className="material-icons animate-spin !text-xs text-warning" aria-hidden>
              autorenew
            </span>
          ) : null}
          <StatusChip
            status={row.package_status}
            label={STATUS_LABELS[row.package_status] ?? row.package_status}
          />
        </span>
      ),
    },
    {
      id: "comments",
      header: t("COMMENTS", "Comments"),
      layout: { width: 19, unit: "%" },
      cellOverflowHidden: true,
      cell: ({ row }) => (
        <span className="block truncate">{row.comments || "—"}</span>
      ),
    },
    {
      id: "created_on",
      header: t("CREATED_ON", "Created On"),
      layout: { width: 16, unit: "%" },
      cellOverflowHidden: true,
      cell: ({ row }) => <span>{fmtDate(row.created_on)}</span>,
    },
    {
      id: "published_on",
      header: t("PUBLISHED_ON", "Published On"),
      layout: { width: 18, unit: "%" },
      cellOverflowHidden: true,
      cell: ({ row }) => <span>{fmtDate(row.published_on)}</span>,
    },
    {
      id: "is_deleted",
      header: t("DELETED", "Deleted"),
      layout: { width: 7, unit: "%" },
      cellOverflowHidden: true,
      cell: ({ row }) => <span>{row.is_deleted ? t("YES", "Yes") : t("NO", "No")}</span>,
    },
  ];
}

function HistoryTable({
  packages,
  loading,
  t,
}: {
  packages: MobilePackage[];
  loading: boolean;
  t: (key: string, fallback?: string) => string;
}) {
  const cols = buildHistoryCols(t);
  const showEmpty = !loading && packages.length === 0;
  const showData = packages.length > 0;

  return (
    <InlineEditableTable
      loading={loading}
      thead={
        <thead>
          <EditableDataGridThead columns={cols} showFilterRow={false} />
        </thead>
      }
      tbody={
        <ServerDrivenListTbody
          rows={packages}
          columns={cols}
          getRowId={(r) => String(r.id)}
          editingRowId={null}
          colSpan={cols.length}
          showLoadingRow={false}
          showEmptyRow={showEmpty}
          showDataRows={showData}
          emptyMessage={t("NO_PACKAGES_YET", "No packages yet")}
        />
      }
    />
  );
}

// Treat a package as still building while the client tracks an in-flight build
// (covers the gap before the first poll returns, and brief failed flashes during retries).
const PENDING_BUILD_GRACE_MS = 2 * 60 * 1000;

function withPendingBuildStatus(
  pkg: MobilePackage,
  pendingBuildIds: ReadonlySet<number>,
  pendingSinceById: ReadonlyMap<number, number>,
): MobilePackage {
  if (!pendingBuildIds.has(pkg.id)) return pkg;
  if (pkg.package_status === "created" || pkg.package_status === "published") return pkg;

  const startedAt = pendingSinceById.get(pkg.id) ?? 0;
  const withinGrace = startedAt > 0 && Date.now() - startedAt < PENDING_BUILD_GRACE_MS;
  const anyRawBuilding = pkg.package_status === "building";

  if (anyRawBuilding || (pkg.package_status === "failed" && withinGrace)) {
    return { ...pkg, package_status: "building" };
  }
  return pkg;
}

// ---------------------------------------------------------------------------
// Data tab action buttons — shows Publish + Delete when a ready package exists
// ---------------------------------------------------------------------------

function DataTabActions({
  packages,
  historyLoading,
  submitting,
  actionInFlight,
  canCreate,
  canDelete,
  onCreatePackage,
  onPublish,
  onDelete,
  t,
}: {
  packages: MobilePackage[];
  historyLoading: boolean;
  submitting: boolean;
  actionInFlight: number | null;
  canCreate: boolean;
  canDelete: boolean;
  onCreatePackage: () => void;
  onPublish: (pkg: MobilePackage) => void;
  onDelete: (pkg: MobilePackage) => void;
  t: (key: string, fallback?: string) => string;
}) {
  const buildingPkg = packages.find((p) => p.package_status === "building" && !p.is_deleted) ?? null;
  const readyPkg = packages.find((p) => p.package_status === "created" && !p.is_deleted) ?? null;
  const deletablePkg = buildingPkg
    ? null
    : packages.find(
        (p) => (p.package_status === "created" || p.package_status === "failed") && !p.is_deleted
      ) ?? null;

  // While initial history load is in flight, show a neutral loading state
  if (historyLoading && packages.length === 0) {
    return (
      <div className="flex justify-end">
        <PrimaryButton type="button" disabled>
          {t("LOADING", "Loading...")}
        </PrimaryButton>
      </div>
    );
  }

  // A package is currently being built — show inline banner, hide Create
  if (buildingPkg || submitting) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning">
          <span className="material-icons animate-spin !text-sm" aria-hidden>autorenew</span>
          <span>
            {t("BUILDING_PACKAGE_BANNER", "Package v{v} is being built — this may take a few moments.").replace(
              "{v}",
              buildingPkg ? String(buildingPkg.update_version) : "…"
            )}
          </span>
        </div>
      </div>
    );
  }

  const hasActionablePkg = readyPkg !== null || deletablePkg !== null;

  return (
    <div className="flex justify-end gap-2">
      {hasActionablePkg ? (
        <>
          {readyPkg && (
            <PrimaryButton
              type="button"
              onClick={() => onPublish(readyPkg)}
              disabled={!canCreate || actionInFlight === readyPkg.id}
            >
              {actionInFlight === readyPkg.id
                ? t("PUBLISHING", "Publishing...")
                : t("PUBLISH", "Publish")}
            </PrimaryButton>
          )}
          {deletablePkg && (
            <SecondaryButton
              type="button"
              icon="delete"
              onClick={() => onDelete(deletablePkg)}
              disabled={!canDelete || actionInFlight === deletablePkg.id}
            >
              {t("DELETE", "Delete")}
            </SecondaryButton>
          )}
        </>
      ) : (
        <PrimaryButton
          type="button"
          onClick={onCreatePackage}
          disabled={!canCreate || submitting}
        >
          {submitting
            ? t("CREATING", "Creating...")
            : t("CREATE_PACKAGE", "Create Package")}
        </PrimaryButton>
      )}
    </div>
  );

}

export default function PublishDataMobileAppPage() {
  const { t, locale } = useCore();
  const { dwId } = useSidebar();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.publishData.mobileApp);
  const { canCreate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.publishData.mobileApp
  );
  const formReadOnly = !canCreate;
  const [activeTab, setActiveTab] = useState<TabId>("data");

  // Form loading states
  const [languagesLoading, setLanguagesLoading] = useState(true);
  const [icTypesLoading, setIcTypesLoading] = useState(true);

  // API data
  const [availableLanguages, setAvailableLanguages] = useState<LanguageRaw[]>([]);
  const [availableIcTypes, setAvailableIcTypes] = useState<IndicatorClassificationTypeRaw[]>([]);

  // Data tab form state
  const [excludeNoData, setExcludeNoData] = useState(false);
  const [sourceData, setSourceData] = useState(false);
  const [areaData, setAreaData] = useState(false);
  const [indicatorData, setIndicatorData] = useState(false);
  const [indicatorClassificationData, setIndicatorClassificationData] = useState(false);
  const [dataFolders, setDataFolders] = useState(false);
  const [selectedIcTypes, setSelectedIcTypes] = useState<Set<string>>(new Set());
  const [timePeriodModalOpen, setTimePeriodModalOpen] = useState(false);
  const [selectedTimePeriodItems, setSelectedTimePeriodItems] = useState<TimePeriodItem[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState("");
  const [mapLevelId, setMapLevelId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // History tab state
  const [packages, setPackages] = useState<MobilePackage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<number | null>(null);
  const [pendingBuildIds, setPendingBuildIds] = useState<Set<number>>(() => new Set());

  // Restore selections from last package detail once history is loaded
  const selectionsRestoredRef = useRef(false);
  const pendingSinceByIdRef = useRef<Map<number, number>>(new Map());

  const resetFormSelections = useCallback(() => {
    setExcludeNoData(false);
    setSourceData(false);
    setAreaData(false);
    setIndicatorData(false);
    setIndicatorClassificationData(false);
    setDataFolders(false);
    setSelectedIcTypes(new Set());
    setSelectedTimePeriodItems([]);
    setSelectedLanguages(new Set());
    setComments("");
    setMapLevelId("");
    setTimePeriodModalOpen(false);
  }, []);

  // Polling ref — clear on unmount
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const trackPendingBuild = useCallback((packageId: number) => {
    pendingSinceByIdRef.current.set(packageId, Date.now());
    setPendingBuildIds((prev) => new Set(prev).add(packageId));
  }, []);

  const clearPendingBuild = useCallback((packageId: number) => {
    pendingSinceByIdRef.current.delete(packageId);
    setPendingBuildIds((prev) => {
      if (!prev.has(packageId)) return prev;
      const next = new Set(prev);
      next.delete(packageId);
      return next;
    });
  }, []);

  const syncPendingBuilds = useCallback((pkgs: MobilePackage[]) => {
    setPendingBuildIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const id of prev) {
        const pkg = pkgs.find((p) => p.id === id);
        if (!pkg) continue;
        if (pkg.package_status === "created" || pkg.package_status === "published") {
          next.delete(id);
          pendingSinceByIdRef.current.delete(id);
          changed = true;
          continue;
        }
        const startedAt = pendingSinceByIdRef.current.get(id) ?? 0;
        if (
          pkg.package_status === "failed" &&
          startedAt > 0 &&
          Date.now() - startedAt >= PENDING_BUILD_GRACE_MS
        ) {
          next.delete(id);
          pendingSinceByIdRef.current.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const displayPackages = useMemo(
    () =>
      packages.map((p) =>
        withPendingBuildStatus(p, pendingBuildIds, pendingSinceByIdRef.current)
      ),
    [packages, pendingBuildIds]
  );

  const referenceBaseUrl = useMemo(() => {
    if (!dwId) return "";
    return getDWAPIURL(dwId, "");
  }, [dwId]);

  // Direct backend URL shown to mobile app users (?dbid= query param)
  const updateApiUrl = useMemo(() => {
    const base = `${API_BASE_URL.replace(/\/$/, "")}/publish_for_mobile/publish/getUpdate?dbid=${dwId || ""}`;
    return mapLevelId ? `${base}&maplvlid=${mapLevelId}` : base;
  }, [dwId, mapLevelId]);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!dwId) return;
    const fetch = async () => {
      setLanguagesLoading(true);
      try {
        const res = await getRequest(getDWAPIURL(dwId, REFERENCE_PATH_LANGUAGES));
        if (res?.success && Array.isArray(res.data)) setAvailableLanguages(res.data);
      } catch {
        // silent
      } finally {
        setLanguagesLoading(false);
      }
    };
    fetch();
  }, [dwId]);

  useEffect(() => {
    if (!dwId) return;
    const fetch = async () => {
      setIcTypesLoading(true);
      try {
        const res = await getRequest(`${getDWAPIURL(dwId, "/indicator-classifications/type")}`);
        if (res?.success && res.data) {
          setAvailableIcTypes(
            Object.entries(res.data as Record<string, string>).map(([code, name]) => ({
              ic_type: code,
              ic_type_name: String(name),
            }))
          );
        }
      } catch {
        // silent
      } finally {
        setIcTypesLoading(false);
      }
    };
    fetch();
  }, [dwId]);

  const fetchHistory = useCallback(async () => {
    if (!dwId) return;
    setHistoryLoading(true);
    try {
      const res = await getRequest(getDWAPIURL(dwId, "/publish-mobile/packages"));
      if (res?.success && Array.isArray(res.data)) {
        const pkgs = res.data as MobilePackage[];
        syncPendingBuilds(pkgs);
        setPackages(pkgs);

        // Restore form selections from the most recent package detail (once only)
        if (!selectionsRestoredRef.current) {
          selectionsRestoredRef.current = true;
          const latest = pkgs.find((p) => !p.is_deleted && p.package_status !== "published" && p.detail);
          if (latest?.detail) {
            const d = latest.detail;
            const files = (d.data_files || "").split(",").map((s) => s.trim());
            setSourceData(files.includes("source"));
            setAreaData(files.includes("area"));
            setIndicatorData(files.includes("indicator"));
            setIndicatorClassificationData(files.includes("ic"));
            setDataFolders(files.includes("data_folders"));
            setExcludeNoData(d.exclude_no_data ?? false);
            if (d.languages) setSelectedLanguages(new Set(d.languages.split(",").map((s) => s.trim())));
            if (d.ic_types) setSelectedIcTypes(new Set(d.ic_types.split(",").map((s) => s.trim())));
            if (latest.map_level_id) setMapLevelId(latest.map_level_id);
          }
        }
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, [dwId, syncPendingBuilds]);

  // Fetch history on both tabs — Data tab needs package state for action buttons
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // -------------------------------------------------------------------------
  // Polling for "building" packages (active on both tabs)
  // -------------------------------------------------------------------------
  const hasBuildingPackage = displayPackages.some(
    (p) => p.package_status === "building" && !p.is_deleted
  );

  useEffect(() => {
    if (pollerRef.current) clearInterval(pollerRef.current);
    if (hasBuildingPackage) {
      pollerRef.current = setInterval(() => fetchHistory(), 5000);
    }
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, [hasBuildingPackage, fetchHistory]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const toggleIcType = (code: string) =>
    setSelectedIcTypes((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });

  const toggleLanguage = (code: string) =>
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });

  const selectedTimePeriodsDisplay = useMemo(() => {
    if (!selectedTimePeriodItems.length)
      return t("NO_TIME_PERIODS_SELECTED", "No time periods selected");
    if (selectedTimePeriodItems.length === 1) return selectedTimePeriodItems[0].label;
    return t("N_TIME_PERIODS_SELECTED", "{n} time periods selected").replace(
      "{n}",
      String(selectedTimePeriodItems.length)
    );
  }, [selectedTimePeriodItems, t]);

  // -------------------------------------------------------------------------
  // Create package
  // -------------------------------------------------------------------------
  const handleCreatePackage = async () => {
    if (!canCreate) return;
    const anyContent = sourceData || areaData || indicatorData || indicatorClassificationData || dataFolders;
    if (!anyContent) {
      toast.error(t("ERROR_SELECT_CONTENT", "At least one database content type must be selected."));
      return;
    }
    if ((indicatorData || indicatorClassificationData) && selectedIcTypes.size === 0) {
      toast.error(t("ERROR_SELECT_IC_TYPE", "At least one indicator classification type must be selected."));
      return;
    }
    if (selectedLanguages.size === 0) {
      toast.error(t("ERROR_SELECT_LANGUAGE", "At least one language must be selected."));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        database_content: {
          exclude_no_data: excludeNoData,
          source_data: sourceData,
          area_data: areaData,
          indicator_data: indicatorData,
          indicator_classification_data: indicatorClassificationData,
          data_folders: dataFolders,
        },
        indicator_classifications: Array.from(selectedIcTypes),
        exclude_time_periods: selectedTimePeriodItems.map((i) => String(i.nid || i.id)),
        languages: Array.from(selectedLanguages),
        comments,
        map_level_id: mapLevelId,
      };

      const res = (await postRequest(
        getDWAPIURL(dwId || "", "/publish-mobile/packages"),
        payload as unknown as Record<string, unknown>,
        undefined,
        undefined,
        { suppressErrorMessage: true }
      )) as { success: boolean; message?: string; err_message?: string };

      if (res?.success) {
        toast.success(res.message || t("PACKAGE_QUEUED", "Package queued for building"));
        const created = (res as { data?: MobilePackage }).data;
        if (created?.id != null) {
          trackPendingBuild(created.id);
          setPackages((prev) => [
            { ...created, package_status: "building", is_deleted: false },
            ...prev.filter((p) => p.id !== created.id),
          ]);
        }
        fetchHistory();
      } else {
        toast.error(res.err_message || t("PACKAGE_CREATE_FAILED", "Failed to create package"));
      }
    } catch (e: unknown) {
      toast.error(t("PACKAGE_CREATE_FAILED", "Failed to create package"));
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Publish package
  // -------------------------------------------------------------------------
  const handlePublish = async (pkg: MobilePackage) => {
    if (!canCreate) return;
    setActionInFlight(pkg.id);
    try {
      const res = (await postRequest(
        getDWAPIURL(dwId || "", `/publish-mobile/packages/${pkg.id}/publish`),
        {},
        undefined,
        undefined,
        { suppressErrorMessage: true }
      )) as { success: boolean; message?: string; err_message?: string };

      if (res?.success) {
        toast.success(res.message || t("PACKAGE_PUBLISHED", "Package published"));
        resetFormSelections();
        fetchHistory();
      } else {
        toast.error(res.err_message || t("PUBLISH_FAILED", "Failed to publish package"));
      }
    } catch {
      toast.error(t("PUBLISH_FAILED", "Failed to publish package"));
    } finally {
      setActionInFlight(null);
    }
  };

  // -------------------------------------------------------------------------
  // Delete package
  // -------------------------------------------------------------------------
  const handleDelete = async (pkg: MobilePackage) => {
    if (!canDelete) return;
    setActionInFlight(pkg.id);
    try {
      const res = (await deleteRequest(
        getDWAPIURL(dwId || "", `/publish-mobile/packages/${pkg.id}`),
        undefined,
        undefined,
        { suppressErrorMessage: true }
      )) as { success: boolean; err_message?: string };

      if (res?.success !== false) {
        clearPendingBuild(pkg.id);
        toast.success(t("PACKAGE_DELETED", "Package deleted"));
        resetFormSelections();
        selectionsRestoredRef.current = false;
        fetchHistory();
      } else {
        toast.error(res.err_message || t("DELETE_FAILED", "Failed to delete package"));
      }
    } catch {
      toast.error(t("DELETE_FAILED", "Failed to delete package"));
    } finally {
      setActionInFlight(null);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (!allowed) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Tabs */}
      <div className="page-subtabs-row">
        <MainTabsBar
          tabs={[
            { value: "data" as const, label: t("DATA", "Data"), icon: "table_chart" },
            { value: "history" as const, label: t("HISTORY", "History"), icon: "history" },
          ]}
          activeValue={activeTab}
          onSelect={setActiveTab}
        />
      </div>

      <div className="flex-1 overflow-y-auto bg-surface">
        {/* ------------------------------------------------------------------ */}
        {/* DATA TAB                                                            */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "data" && (
          <div className="p-6">
            <p className="mb-6 text-xs text-text">
              {t("PUBLISH_DATA_MOBILE_APP_DESCRIPTION")}
            </p>

            {/* Database Content */}
            <div className="mb-6">
              <h3 className="mb-3 text-xs font-bold text-text">
                <span className="text-error">*</span> {t("DATABASE_CONTENT", "Database Content")}
              </h3>
              <div className="space-y-2">
                {[
                  { state: excludeNoData, setter: setExcludeNoData, key: "EXCLUDE_NO_DATA", fallback: "Exclude Indicators with no data" },
                  { state: sourceData, setter: setSourceData, key: "SOURCE_DATA_OPTION", fallback: "Source Data - changes made in the Source module" },
                  { state: areaData, setter: setAreaData, key: "AREA_DATA_OPTION", fallback: "Area Data - changes made in the Areas or Area Level modules" },
                  {
                    state: indicatorData,
                    setter: setIndicatorData,
                    key: "INDICATOR_DATA_OPTION",
                    fallback: "Indicator Data - for any Indicator related details e.g. in Indicators, indicators classifications, units etc",
                  },
                  {
                    state: indicatorClassificationData,
                    setter: setIndicatorClassificationData,
                    key: "IC_DATA_OPTION",
                    fallback: "Indicator Classification Data - for indicator classification related details e.g. Goals, Sectors, Themes etc",
                  },
                  { state: dataFolders, setter: setDataFolders, key: "DATA_FOLDERS_OPTION", fallback: "Data Folders - changes in data values for any IUS combination" },
                ].map(({ state, setter, key, fallback }) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-text">
                    <input
                      type="checkbox"
                      className="checkbox-comp"
                      checked={state}
                      disabled={formReadOnly}
                      onChange={(e) => setter(e.target.checked)}
                    />
                    <span>{t(key, fallback)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Indicator Classifications */}
            <div className="mb-6">
              <h3 className="mb-3 text-xs font-bold text-text">
                <span className="text-error">*</span>{" "}
                {t("INDICATOR_CLASSIFICATIONS", "Indicator Classifications")}
              </h3>
              <p className="mb-3 text-xs text-text-muted">
                {t(
                  "SELECT_IC_TYPE_DESCRIPTION",
                  "Select at least one of the Indicator Classification types to classify the indicators in the mobile application"
                )}
              </p>
              {icTypesLoading ? (
                <div className="text-xs text-text-muted">
                  {t("LOADING_CLASSIFICATION_TYPES", "Loading classification types…")}
                </div>
              ) : availableIcTypes.length === 0 ? (
                <div className="text-xs text-text-muted">
                  {t("NO_IC_TYPES_AVAILABLE", "No indicator classification types available")}
                </div>
              ) : (
                <div className="space-y-2">
                  {availableIcTypes.map((icType) => (
                    <label key={icType.ic_type} className="flex items-center gap-2 text-xs text-text">
                      <input
                        type="checkbox"
                        className="checkbox-comp"
                        checked={selectedIcTypes.has(icType.ic_type)}
                        disabled={formReadOnly}
                        onChange={() => toggleIcType(icType.ic_type)}
                      />
                      <span>{icType.ic_type}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Time Periods */}
            <div className="mb-6">
              <h3 className="mb-3 text-xs font-bold text-text">
                {t("TIME_PERIODS_OPTIONAL", "Time Periods (Optional)")}
              </h3>
              <p className="mb-3 text-xs text-text-muted">
                {t(
                  "SELECT_TIME_PERIODS_EXCLUDE_DESCRIPTION",
                  "Select Time Periods which you want to exclude in the mobile application"
                )}
              </p>
              <SecondaryButton
                type="button"
                icon="event"
                disabled={formReadOnly}
                onClick={() => setTimePeriodModalOpen(true)}
              >
                {selectedTimePeriodsDisplay}
              </SecondaryButton>
              {selectedTimePeriodItems.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedTimePeriodItems.map((item) => (
                    <span
                      key={item.id || item.nid}
                      className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs text-primary"
                    >
                      {item.label}
                      <button
                        type="button"
                        disabled={formReadOnly}
                        onClick={() =>
                          setSelectedTimePeriodItems((prev) =>
                            prev.filter((i) => (i.id || i.nid) !== (item.id || item.nid))
                          )
                        }
                        className="hover:text-error disabled:opacity-50"
                        aria-label={t("REMOVE_ITEM", "Remove {item}").replace("{item}", item.label || "")}
                      >
                        <Mi name="close" className="!text-xs" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Languages */}
            <div className="mb-6">
              <h3 className="mb-3 text-xs font-bold text-text">
                <span className="text-error">*</span> {t("LANGUAGES", "Languages")}
              </h3>
              <p className="mb-3 text-xs text-text-muted">
                {t(
                  "LANGUAGES_SELECTION_DESCRIPTION",
                  "The Language option should be selected depending on which language data needs to be updated in the mobile app"
                )}
              </p>
              {languagesLoading ? (
                <div className="text-xs text-text-muted">{t("LOADING_LANGUAGES", "Loading languages…")}</div>
              ) : availableLanguages.length === 0 ? (
                <div className="text-xs text-text-muted">{t("NO_LANGUAGES_AVAILABLE", "No languages available")}</div>
              ) : (
                <div className="space-y-2">
                  {availableLanguages.map((lang) => (
                    <label key={lang.lang_code} className="flex items-center gap-2 text-xs text-text">
                      <input
                        type="checkbox"
                        className="checkbox-comp"
                        checked={selectedLanguages.has(lang.lang_code || "")}
                        disabled={formReadOnly}
                        onChange={() => toggleLanguage(lang.lang_code || "")}
                      />
                      <span>
                        {lang.lang_name} [{lang.lang_code}]
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="mb-6 max-w-xl">
              <h3 className="mb-3 text-xs font-bold text-text">{t("COMMENTS", "Comments")}</h3>
              <p className="mb-3 text-xs text-text-muted">
                {t(
                  "COMMENTS_DESCRIPTION",
                  "You may add in any description and comments regarding the changes being published."
                )}
              </p>
              <TextAreaField
                fieldSize="sm"
                className="w-full min-h-[80px] max-h-none resize-y py-1.5 leading-normal"
                value={comments}
                disabled={formReadOnly}
                onChange={(e) => setComments(e.target.value)}
                placeholder={t("ADD_COMMENTS_PLACEHOLDER", "Add comments...")}
              />
            </div>

            {/* API URL */}
            <div className="mb-6 max-w-xl">
              <h3 className="mb-3 text-xs font-bold text-text">{t("API_URL", "API Url")}</h3>
              <div className="mb-3">
                <label className="form-label mb-1 block text-text-muted">{t("MAP_LEVEL_ID", "Map Level ID")}</label>
                <input
                  type="text"
                  className={textFieldClassName("sm", "max-w-xs")}
                  value={mapLevelId}
                  disabled={formReadOnly}
                  onChange={(e) => setMapLevelId(e.target.value)}
                  placeholder={t("MAP_LEVEL_ID_PLACEHOLDER", "e.g. 2")}
                />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="text"
                  className={textFieldClassName("sm", "min-w-0 flex-1")}
                  value={updateApiUrl}
                  readOnly
                />
                <SecondaryButton
                  type="button"
                  icon="content_copy"
                  onClick={() => {
                    navigator.clipboard.writeText(updateApiUrl);
                    toast.success(t("URL_COPIED", "URL copied to clipboard"));
                  }}
                  title={t("COPY_URL", "Copy URL")}
                  aria-label={t("COPY_URL", "Copy URL")}
                />
              </div>
            </div>

            {/* Action buttons */}
            <DataTabActions
              packages={displayPackages}
              historyLoading={historyLoading}
              submitting={submitting}
              actionInFlight={actionInFlight}
              canCreate={canCreate}
              canDelete={canDelete}
              onCreatePackage={handleCreatePackage}
              onPublish={handlePublish}
              onDelete={handleDelete}
              t={t}
            />
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* HISTORY TAB                                                         */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === "history" && (
          <HistoryTable
            packages={displayPackages}
            loading={historyLoading}
            t={t}
          />
        )}
      </div>

      {/* Time Period Selection Modal */}
      <TimePeriodSelectionModal
        isOpen={timePeriodModalOpen}
        onClose={() => setTimePeriodModalOpen(false)}
        baseUrl={referenceBaseUrl}
        locale={locale}
        initialSelectedItems={selectedTimePeriodItems}
        selectionMode="MULTIPLE"
        onApply={(items) => {
          setSelectedTimePeriodItems(items);
          setTimePeriodModalOpen(false);
        }}
      />
    </div>
  );
}
