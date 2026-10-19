"use client";

// ---------------------------------------------------------------------------
// Operational Reports
//   Single page with an in-page report-type dropdown (5 report types).
//   Data is fetched from the backend — pagination is server-driven.
//   The table area is a child component keyed by report type + workflow,
//   so switching either dropdown remounts and resets page state.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debouncedValue;
}

const FILTER_DEBOUNCE_MS = 300;
import { useParams } from "next/navigation";
import {
  InlineEditableTable,
  EditableDataGridThead,
  ServerDrivenListTbody,
  buildListRequestUrl,
  type EditableGridColumnDef,
} from "@/components/TableView";
import { SelectField, type SelectFieldOption } from "@/components/SelectField";
// Loader removed — table uses built-in showLoadingRow instead.
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { getRequest, getFileResponse } from "@/lib/api/http";
import {
  getDWAPIURL,
  REPORT_OPERATIONAL_REPORTS,
  COMPLETENESS_HIGH_THRESHOLD,
  COMPLETENESS_MEDIUM_THRESHOLD,
} from "@/lib/constants";
import type {
  WorkflowListItem,
  OperationalReportResult,
  OperationalReportColumnLabels,
} from "@/lib/api/types";
import {
  getOperationalReportOptions,
  getOperationalReportConfig,
  OPERATIONAL_REPORT_DEFAULT_VALUE,
  getSubmissionStatusLabel,
  getActionNeededLabel,
  getReviewStatusLabel,
  type OperationalReportConfig,
} from "@/lib/reports/operationalReports";
import { StatusChip } from "@/components/StatusChip";
import { DateRangePicker } from "@/components/DateRangePicker";
import { formatDateString } from "@/services/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

const DEFAULT_COL_WIDTH = 150;

function formatDateTimeString(value: string | null | undefined): string {
  if (!value || !value.trim()) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const DATE_ONLY_FIELDS = new Set([
  "date_submitted",
  "date_returned",
  "date_approved",
  "last_submission",
]);
const DATE_TIME_FIELDS = new Set(["last_updated", "last_login"]);

function CompletenessBar({ value }: { value: unknown }) {
  const pct =
    typeof value === "number"
      ? value
      : parseInt(String(value).replace(/[^0-9.-]/g, ""), 10);
  if (!Number.isFinite(pct)) return <span className="text-text-muted">—</span>;
  const clamped = Math.max(0, Math.min(100, pct));
  const barClass =
    clamped >= COMPLETENESS_HIGH_THRESHOLD
      ? "bg-success"
      : clamped >= COMPLETENESS_MEDIUM_THRESHOLD
        ? "bg-warning"
        : "bg-error";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 shrink-0 rounded-full overflow-hidden bg-border">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-xs font-medium tabular-nums text-right text-text">
        {clamped}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table — one instance per report type (keyed remount resets its state)
// ---------------------------------------------------------------------------

// Status filter keys send values as direct query params; all other text
// filters use the backend's search + search_by pair (one at a time).
const STATUS_FILTER_KEYS = new Set(["submission_status", "action_needed", "review_status"]);

type SortState = { column: string | null; direction: "asc" | "desc" | null };

function OperationalReportTable({
  config,
  dwId,
  workflowId,
  areaLevelLabel: parentLabel,
  parentAreaLevelLabel: parentParentLabel,
  onCurrentTimePeriodChange,
  onExportParamsChange,
}: {
  config: OperationalReportConfig;
  dwId: string;
  workflowId: string;
  areaLevelLabel: string;
  parentAreaLevelLabel: string;
  onCurrentTimePeriodChange?: (label: string | null) => void;
  onExportParamsChange?: (params: Record<string, unknown>) => void;
}) {
  const { t } = useCore();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [columnLabels, setColumnLabels] = useState<OperationalReportColumnLabels | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  // ── Filter state ─────────────────────────────────────────────────────────
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [dateFilters, setDateFilters] = useState<Record<string, { from: string; to: string }>>({});
  const [sort, setSort] = useState<SortState>({ column: null, direction: null });

  // Debounced versions used for API calls — UI inputs read the raw state for
  // immediate feedback; the fetch only fires after the user stops typing.
  const debouncedColumnFilters = useDebounce(columnFilters, FILTER_DEBOUNCE_MS);
  const debouncedDateFilters = useDebounce(dateFilters, FILTER_DEBOUNCE_MS);

  const setColumnFilter = useCallback((key: string, value: string) => {
    if (STATUS_FILTER_KEYS.has(key)) {
      // Status dropdowns are independent — send as direct params.
      setColumnFilters((prev) => ({ ...prev, [key]: value }));
    } else {
      // Text search: only one field at a time (backend only accepts one search+search_by).
      setColumnFilters((prev) => {
        const statusOnly = Object.fromEntries(
          Object.entries(prev).filter(([k]) => STATUS_FILTER_KEYS.has(k)),
        );
        return value ? { ...statusOnly, [key]: value } : statusOnly;
      });
    }
    setPage(1);
  }, []);

  const setDateFilter = useCallback((key: string, range: { from: string; to: string }) => {
    setDateFilters((prev) => ({ ...prev, [key]: range }));
    setPage(1);
  }, []);

  // 3-stage sort cycle: asc → desc → none (reset)
  const handleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (prev.column !== key) return { column: key, direction: "asc" };
      if (prev.direction === "asc") return { column: key, direction: "desc" };
      return { column: null, direction: null };
    });
    setPage(1);
  }, []);

  // ── Fetch report data ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReportError(null);

    // Status filters → direct params (e.g. submission_status=1)
    const activeStatusFilters = Object.fromEntries(
      Object.entries(debouncedColumnFilters).filter(([k, v]) => STATUS_FILTER_KEYS.has(k) && v !== ""),
    );
    // Text search → search + search_by (single active field enforced by setColumnFilter)
    const textEntry = Object.entries(debouncedColumnFilters).find(
      ([k, v]) => !STATUS_FILTER_KEYS.has(k) && v !== "",
    );
    const searchParams = textEntry ? { search: textEntry[1], search_by: textEntry[0] } : {};

    const activeDateParams = Object.fromEntries(
      Object.entries(debouncedDateFilters).flatMap(([key, { from, to }]) => [
        ...(from ? [[`${key}_from`, from]] : []),
        ...(to ? [[`${key}_to`, to]] : []),
      ]),
    );

    const activeExtraParams = {
      ...(sort.column && sort.direction
        ? { sort_field: sort.column, sort_order: sort.direction }
        : {}),
      ...activeStatusFilters,
      ...searchParams,
      ...activeDateParams,
    };

    onExportParamsChange?.(activeExtraParams);

    const url = buildListRequestUrl(
      `${getDWAPIURL(dwId, REPORT_OPERATIONAL_REPORTS)}/${encodeURIComponent(workflowId)}/${config.apiSlug}`,
      {
        page,
        page_size: pageSize,
        ...activeExtraParams,
      },
    );

    void (async () => {
      try {
        const res = (await getRequest(url, undefined, {
          suppressErrorMessage: true,
        })) as OperationalReportResult;
        if (cancelled) return;

        if (res?.success && res.data) {
          setRows(res.data.rows as unknown as Record<string, unknown>[]);
          setColumnLabels(res.data.column_labels);
          onCurrentTimePeriodChange?.(res.data.current_timeperiod_label ?? null);
        } else {
          setRows([]);
          setColumnLabels(null);
          onCurrentTimePeriodChange?.(null);
          setReportError(res?.err_message ?? res?.message ?? "Failed to load data");
        }

        if (res?.meta) {
          setTotalCount(res.meta.total_count);
          setTotalPages(res.meta.total_pages);
        } else {
          setTotalCount(0);
          setTotalPages(1);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setTotalCount(0);
          setTotalPages(1);
          onCurrentTimePeriodChange?.(null);
          setReportError("Failed to load data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dwId, workflowId, config.apiSlug, page, pageSize, debouncedColumnFilters, debouncedDateFilters, sort, onCurrentTimePeriodChange, onExportParamsChange]);

  const areaLevelLabel = columnLabels?.district_label || parentLabel;
  const parentAreaLevelLabel = columnLabels?.state_label || parentParentLabel;

  // ── Status filter option sets ────────────────────────────────────────────
  const submissionStatusOptions = useMemo(() => [
    { value: "", label: t("ALL", "All") },
    { value: "0", label: t("NOT_SUBMITTED", "Not Submitted") },
    { value: "1", label: t("SUBMITTED", "Submitted") },
  ], [t]);

  const actionNeededOptions = useMemo(() => [
    { value: "", label: t("ALL", "All") },
    { value: "0", label: t("NO_ACTION", "No action") },
    { value: "1", label: t("PENDING_REVISION", "Pending Revision") },
    { value: "2", label: t("PENDING_SUBMISSION", "Pending Submission") },
  ], [t]);

  const reviewStatusOptions = useMemo(() => [
    { value: "", label: t("ALL", "All") },
    { value: "0", label: t("APPROVED", "Approved") },
    { value: "1", label: t("PENDING_REVIEW", "Pending review") },
    { value: "2", label: t("REVISION", "Revision") },
  ], [t]);

  // ── Column definitions ───────────────────────────────────────────────────
  const columns: EditableGridColumnDef<Record<string, unknown>>[] = useMemo(() => {
    const snCol: EditableGridColumnDef<Record<string, unknown>> = {
      id: "__sn",
      layout: { width: 50, minWidth: 36 },
      defaultWidth: 50,
      className: "td-text-cell",
      resizable: false,
      header: { kind: "label" as const, text: t("SERIAL_NO", "S.No.") },
      cell: ({ rowIndex }) => String((page - 1) * pageSize + rowIndex + 1),
    };

    return [snCol, ...config.columns.map((col) => {
      const areaBase =
        col.areaRole === "area" ? areaLevelLabel
        : col.areaRole === "parent" ? parentAreaLevelLabel
        : null;
      const label = areaBase
        ? (col.areaAssigned ? `${areaBase} ${t("ASSIGNED", "Assigned")}` : areaBase)
        : t(col.tKey, col.fallback);
      const width = col.width ?? DEFAULT_COL_WIDTH;

      const isActive = sort.column === col.key && sort.direction !== null;
      const header = col.sortable
        ? {
            kind: "sort" as const,
            text: label,
            onSort: () => handleSort(col.key),
            sortActive: isActive,
            sortDirection: isActive ? sort.direction : undefined,
            sortAriaLabel: label,
          }
        : { kind: "label" as const, text: label };

      // Filter cell for date columns
      const isDateCol = DATE_ONLY_FIELDS.has(col.key) || DATE_TIME_FIELDS.has(col.key);
      const dateRange = dateFilters[col.key] ?? { from: "", to: "" };

      // Filter def for status / search / none
      let filterDef: EditableGridColumnDef<Record<string, unknown>>["filter"] = null;
      let filterCellNode: EditableGridColumnDef<Record<string, unknown>>["filterCell"] = null;

      if (isDateCol) {
        filterCellNode = (
          <DateRangePicker
            from={dateRange.from}
            to={dateRange.to}
            onChange={(range) => setDateFilter(col.key, range)}
            placeholder={t("SELECT")}
          />
        );
      } else if (col.key === "submission_status") {
        filterDef = {
          kind: "select" as const,
          value: columnFilters[col.key] ?? "",
          onChange: (v) => setColumnFilter(col.key, v),
          options: submissionStatusOptions,
          ariaLabel: label,
          menuPortal: true,
        };
      } else if (col.key === "action_needed") {
        filterDef = {
          kind: "select" as const,
          value: columnFilters[col.key] ?? "",
          onChange: (v) => setColumnFilter(col.key, v),
          options: actionNeededOptions,
          ariaLabel: label,
          menuPortal: true,
        };
      } else if (col.key === "review_status") {
        filterDef = {
          kind: "select" as const,
          value: columnFilters[col.key] ?? "",
          onChange: (v) => setColumnFilter(col.key, v),
          options: reviewStatusOptions,
          ariaLabel: label,
          menuPortal: true,
        };
      } else if (col.searchable) {
        filterDef = {
          kind: "search" as const,
          value: columnFilters[col.key] ?? "",
          onChange: (v) => setColumnFilter(col.key, v),
          placeholder: "Search...",
          ariaLabel: label,
          size: "sm",
        };
      }

      return {
        id: col.key,
        layout: { width, minWidth: 80 },
        defaultWidth: width,
        className: "td-text-cell",
        header,
        ...(filterDef !== null ? { filter: filterDef } : {}),
        ...(filterCellNode !== null ? { filterCell: filterCellNode } : {}),
        cell: ({ row }: { row: Record<string, unknown> }) => {
          const val = row[col.key];

          if (col.key === "submission_status") {
            const label = getSubmissionStatusLabel(val, t);
            const statusToken = Number(val) === 1 ? "SUBMITTED" : "NOT_SUBMITTED";
            return <StatusChip status={statusToken} label={label} />;
          }
          if (col.key === "action_needed") {
            const label = getActionNeededLabel(val, t);
            const numVal = Number(val);
            // 0 = No action, 1 = Pending Revision, 2 = Pending Submission
            const statusToken =
              numVal === 0 ? "APPROVED" : numVal === 1 ? "REVISION" : "PENDING_REVIEW";
            return <StatusChip status={statusToken} label={label} />;
          }
          if (col.key === "review_status") {
            const label = getReviewStatusLabel(val, t);
            const numVal = Number(val);
            const statusToken =
              numVal === 0 ? "APPROVED" : numVal === 1 ? "PENDING_REVIEW" : "REVISION";
            return <StatusChip status={statusToken} label={label} />;
          }
          if (col.key === "missing_footnotes") {
            if (val === null || val === undefined || val === "") {
              return <span className="text-text-muted">—</span>;
            }
            const missing = Number(val);
            if (!Number.isFinite(missing)) return <span className="text-text-muted">—</span>;
            const expected = Number(row["expected_data_points"]);
            const denominator = Number.isFinite(expected) ? String(expected) : "?";
            return <span className="font-medium tabular-nums">{`${missing}/${denominator}`}</span>;
          }
          if (col.key === "completeness_rate") {
            return <CompletenessBar value={val} />;
          }

          if (col.parentKey) {
            const parentVal = row[col.parentKey];
            const display = val
              ? (parentVal ? `${String(val)} (${String(parentVal)})` : String(val))
              : "—";
            return <span className="block min-w-0 truncate" title={display}>{display}</span>;
          }

          if (val === null || val === undefined || val === "") {
            return <span className="text-text-muted">—</span>;
          }

          if (DATE_ONLY_FIELDS.has(col.key)) {
            const formatted = formatDateString(String(val));
            return <span className="block min-w-0 truncate" title={formatted}>{formatted}</span>;
          }
          if (DATE_TIME_FIELDS.has(col.key)) {
            const formatted = formatDateTimeString(String(val));
            return <span className="block min-w-0 truncate" title={formatted}>{formatted}</span>;
          }

          return <span className="block min-w-0 truncate" title={String(val)}>{String(val)}</span>;
        },
      };
    })];
  }, [
    config.columns, t, page, pageSize, areaLevelLabel, parentAreaLevelLabel,
    sort, handleSort,
    columnFilters, dateFilters, setColumnFilter, setDateFilter,
    submissionStatusOptions, actionNeededOptions, reviewStatusOptions,
  ]);

  const taggedRows = useMemo(
    () => rows.map((row, i) => ({ ...row, _idx: i })),
    [rows],
  );

  const showFilterRow = true;

  // Surface a fetch error (esp. 404) inline in the content area so the user
  // understands why no data is shown; filters above stay usable.
  if (!loading && reportError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-lg">
        <p className="text-sm text-error text-center">{reportError}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <InlineEditableTable
        wrapClassName="tbl-wrap h-full"
        thead={
          <thead>
            <EditableDataGridThead
              columns={columns as EditableGridColumnDef<unknown>[]}
              showFilterRow={showFilterRow}
              allowResize={true}
            />
          </thead>
        }
        tbody={
          <ServerDrivenListTbody
            rows={taggedRows}
            columns={columns as EditableGridColumnDef<unknown>[]}
            getRowId={(row) => String(row._idx as number)}
            editingRowId={null}
            colSpan={columns.length}
            emptyMessage={t("NO_ROWS_TO_SHOW", "No rows to show")}
            showLoadingRow={loading}
            showEmptyRow={!loading && taggedRows.length === 0}
            showDataRows={!loading}
          />
        }
        pagination={{
          page,
          totalPages,
          totalCount,
          pageSize,
          onPageChange: (p) => setPage(p),
          onPageSizeChange: (ps) => {
            setPageSize(ps);
            setPage(1);
          },
          resetPageOnPageSizeChange: false,
          countNoun: t("ROWS", "rows"),
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function OperationalReportsPage() {
  const { t } = useCore();
  const { setToolbarExport } = useSidebar();
  const params = useParams<{ locale: string; dw_id: string }>();
  const dwId = readParam(params?.dw_id);
  const exportBusyRef = useRef(false);
  // Tracks active filter/sort params from the table so export includes them.
  const exportParamsRef = useRef<Record<string, unknown>>({});

  // ── localStorage key for report type persistence ─────────────────────────
  const storageKey = `dfa.dm.operationalReport.reportType.v1:${encodeURIComponent(dwId)}`;

  const [reportType, setReportTypeState] = useState<string>(() => {
    if (typeof window === "undefined") return OPERATIONAL_REPORT_DEFAULT_VALUE;
    try {
      return localStorage.getItem(storageKey) ?? OPERATIONAL_REPORT_DEFAULT_VALUE;
    } catch {
      return OPERATIONAL_REPORT_DEFAULT_VALUE;
    }
  });

  // ── Current time period label surfaced from the child's API response ──────
  const [currentTimePeriod, setCurrentTimePeriod] = useState<string | null>(null);

  const setReportType = useCallback((value: string) => {
    setReportTypeState(value);
    setCurrentTimePeriod(null);
    try { localStorage.setItem(storageKey, value); } catch {}
  }, [storageKey]);

  // ── Workflow filter — mandatory; fetched from the workflow API ────────────
  const workflowStorageKey = `dfa.dm.operationalReport.workflow.v1:${encodeURIComponent(dwId)}`;
  const [workflowOptions, setWorkflowOptions] = useState<SelectFieldOption[]>([]);
  const [workflowsLoaded, setWorkflowsLoaded] = useState(false);
  const [selectedWorkflow, setSelectedWorkflowState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(workflowStorageKey) ?? "";
    } catch {
      return "";
    }
  });

  const setSelectedWorkflow = useCallback((value: string) => {
    setSelectedWorkflowState(value);
    setCurrentTimePeriod(null);
    try { localStorage.setItem(workflowStorageKey, value); } catch {}
  }, [workflowStorageKey]);

  // ── Mount: fetch reviewable workflows ─────────────────────────────────────
  useEffect(() => {
    if (!dwId) return;
    const url = buildListRequestUrl(getDWAPIURL(dwId, "/workflow"), {
      is_active: true,
      allow_review: true,
    });
    void getRequest(url).then((res) => {
      const items: WorkflowListItem[] = Array.isArray(res?.data)
        ? (res.data as WorkflowListItem[])
        : [];
      const opts = items.map((w) => ({ value: String(w.workflow_id), label: w.workflow_name }));
      setWorkflowOptions(opts);
      setSelectedWorkflowState((prev) =>
        prev && opts.some((o) => o.value === prev) ? prev : String(opts[0]?.value ?? ""),
      );
      setWorkflowsLoaded(true);
    });
  }, [dwId]);

  const reportOptions = useMemo(() => getOperationalReportOptions(t), [t]);
  const config = useMemo(() => getOperationalReportConfig(reportType), [reportType]);

  // ── Export: download XLSX with current report type + workflow ──────────────
  const handleExport = useCallback(async () => {
    if (exportBusyRef.current || !config || !selectedWorkflow || !dwId) return;
    exportBusyRef.current = true;
    try {
      const url = buildListRequestUrl(
        `${getDWAPIURL(dwId, REPORT_OPERATIONAL_REPORTS)}/${encodeURIComponent(selectedWorkflow)}/${config.apiSlug}`,
        { ...exportParamsRef.current, export: "true" },
      );
      const res = await getFileResponse(url);

      if (!res.ok) {
        try {
          const json = (await res.json()) as { err_message?: string };
          toast.error(json.err_message ?? t("EXPORT_FAILED", "Export failed"));
        } catch {
          toast.error(t("EXPORT_FAILED", "Export failed"));
        }
        return;
      }

      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      let filename = `operational-report-${config.apiSlug}.xlsx`;
      if (cd) {
        const quoted = cd.match(/filename="([^"]+)"/i);
        const unquoted = cd.match(/filename=([^;\s]+)/i);
        const raw = quoted?.[1] ?? unquoted?.[1];
        if (raw) filename = raw.replace(/^["']|["']$/g, "");
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success(t("EXPORT_SUCCESS", "Export completed"));
    } catch {
      toast.error(t("EXPORT_FAILED", "Export failed"));
    } finally {
      exportBusyRef.current = false;
    }
  }, [dwId, config, selectedWorkflow, t]);

  // ── Register Export button in toolbar ────────────────────────────────────
  useEffect(() => {
    setToolbarExport({
      onClick: () => void handleExport(),
      disabled: !config || !selectedWorkflow,
    });
    return () => setToolbarExport(null);
  }, [setToolbarExport, handleExport, config, selectedWorkflow]);

  // No workflow has "Allow Review" enabled → hide the filters entirely and
  // explain why the report is unavailable.
  if (workflowsLoaded && workflowOptions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-lg">
        <p className="text-sm text-error text-center">
          {t(
            "NO_REVIEWABLE_WORKFLOWS",
            'No workflow with review enabled was found. Turn on "Allow Review" for a workflow to use this report.',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b-2 border-border bg-[color:color-mix(in_srgb,var(--color-primary)_5%,var(--color-surface))]">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="material-icons !text-base text-primary">tune</span>
          <span className="text-xs font-semibold text-primary whitespace-nowrap">
            {t("REPORT_TYPE", "Report Type")}
          </span>
          <div className="min-w-[220px] max-w-[420px] flex-1">
            <SelectField
              options={reportOptions}
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            />
          </div>
          {/* ── Workflow filter (mandatory; only allow_review:true workflows) ── */}
          <span className="text-xs font-semibold text-primary whitespace-nowrap">
            {t("WORKFLOW", "Workflow")}
          </span>
          <div className="min-w-[180px] max-w-[280px]">
            <SelectField
              options={workflowOptions}
              value={selectedWorkflow}
              onChange={(e) => setSelectedWorkflow(e.target.value)}
            />
          </div>
          {/* ── Current Time Period — read-only, populated from API response ── */}
          {currentTimePeriod && (
            <>
              <span className="h-4 w-px bg-border shrink-0" />
              <span className="text-xs font-semibold text-text-muted whitespace-nowrap">
                {t("CURRENT_TIME_PERIOD", "Current Time Period")}:
              </span>
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary whitespace-nowrap">
                {currentTimePeriod}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Data table (keyed → resets on report-type / workflow change) ────── */}
      {config && selectedWorkflow && (
        <OperationalReportTable
          key={`${config.value}:${selectedWorkflow}`}
          config={config}
          dwId={dwId}
          workflowId={selectedWorkflow}
          areaLevelLabel={t("AREA", "Area")}
          parentAreaLevelLabel={t("REGION", "Region")}
          onCurrentTimePeriodChange={setCurrentTimePeriod}
          onExportParamsChange={(p) => { exportParamsRef.current = p; }}
        />
      )}
    </div>
  );
}
