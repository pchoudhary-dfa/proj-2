"use client";

// ---------------------------------------------------------------------------
// GET /dw/{dw_id}/reports/{slug}   (analytics/* slugs)
//   Query params: page, page_size, search, search_by, sort_field, sort_order
//   Report type is selected from the in-page filter bar and persisted to localStorage.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  InlineEditableTable,
  EditableDataGridThead,
  ServerDrivenListTbody,
  buildListRequestUrl,
  gridSortIcon,
  type EditableGridColumnDef,
  type GridSortDirection,
} from "@/components/TableView";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import { SelectField } from "@/components/SelectField";
import { SearchInputBar } from "@/components/SearchInputBar";
import { MultiSelectDropdown, type MultiSelectOption } from "@/components/MultiSelectDropdown";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { getRequest, getFileResponse } from "@/lib/api/http";
import { getDWAPIURL, REFERENCE_PATH_AREA_LEVELS, REFERENCE_PATH_TIME_PERIODS } from "@/lib/constants";
import { FIELD_LABEL_MAP, REPORT_DISPLAY_FIELDS, columnWidthFor, REPORT_SUPPORTS_TIME_PERIOD } from "@/lib/reports/reportColumns";
import { getAnalyticalReportOptions, ANALYTICAL_REPORT_DEFAULT_VALUE } from "@/lib/reports/reportTypes";

// ---------------------------------------------------------------------------
// Column → backend field mappings (per report type)
// ---------------------------------------------------------------------------

/** Columns that support server-side search (search_by param). */
const REPORT_SEARCH_BY: Record<string, Record<string, string>> = {
  "analytics/coverage/indicator-by-area":      { i_name: "i_name" },
  "analytics/coverage/indicator-by-timeperiod":{ i_name: "i_name" },
  "analytics/coverage/area-completeness":      { ar_name: "ar_name" },
  "analytics/coverage/indicator-subgroup":     { i_name: "i_name", sg_name: "sg_name" },
  "analytics/volume/top-indicators":           { i_name: "i_name" },
  "analytics/volume/ius-density":              { i_name: "i_name", sg_name: "sg_name" },
  "analytics/volume/subgroup-distribution":    { sg_name: "sg_name" },
  "analytics/utilisation/source-usage":        { src_name: "src_name" },
  "analytics/utilisation/ic-coverage":         { ic_name: "ic_name" },
};

/** Columns that support server-side sort (sort_field param). */
const REPORT_SORT_FIELD: Record<string, Record<string, string>> = {
  "analytics/coverage/indicator-by-area": {
    i_name: "i_name", areas_with_data: "areas_with_data",
  },
  "analytics/coverage/indicator-by-timeperiod": {
    i_name: "i_name", period_coverage: "periods_with_data",
  },
  "analytics/coverage/area-completeness": {
    ar_name: "ar_name", ius_with_data: "ius_with_data",
  },
  "analytics/coverage/indicator-subgroup": {
    i_name: "i_name", sg_name: "sg_name", data_row_count: "data_row_count",
  },
  "analytics/volume/top-indicators": {
    i_name: "i_name", total_data_rows: "total_data_rows",
  },
  "analytics/volume/ius-density": {
    i_name: "i_name", sg_name: "sg_name",
    total_rows: "total_rows", avg_data_value: "avg_data_value",
  },
  "analytics/volume/subgroup-distribution": {
    sg_name: "sg_name", total_data_rows: "total_data_rows",
    distinct_indicators: "distinct_indicators", distinct_areas: "distinct_areas",
  },
  "analytics/utilisation/source-usage": {
    src_name: "src_name", total_data_rows: "total_data_rows",
    distinct_ius: "distinct_ius", distinct_areas: "distinct_areas",
  },
  "analytics/utilisation/ic-coverage": {
    ic_name: "ic_name", ic_type: "ic_type",
    total_data_rows: "total_data_rows", mapped_ius_count: "mapped_ius_count",
  },
};

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type ReportMeta = {
  total_count: number;
  total_pages: number;
  page: number;
  page_size: number;
  count: number;
};

interface FetchOpts {
  search?: string;
  searchBy?: string;
  sortField?: string;
  sortOrder?: string;
  timePeriod?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AnalyticalReportPage() {
  const { t } = useCore();
  const params = useParams<{ locale: string; dw_id: string }>();
  const dwId = readParam(params?.dw_id);

  const { setToolbarExport } = useSidebar();

  // ── localStorage key for report type persistence ─────────────────────────
  const storageKey = `dfa.dm.analyticalReport.reportType.v1:${encodeURIComponent(dwId)}`;

  // ── Local report type state — initialized from localStorage or default ────
  const [reportType, setReportTypeState] = useState<string>(() => {
    if (typeof window === "undefined") return ANALYTICAL_REPORT_DEFAULT_VALUE;
    try {
      return localStorage.getItem(storageKey) ?? ANALYTICAL_REPORT_DEFAULT_VALUE;
    } catch {
      return ANALYTICAL_REPORT_DEFAULT_VALUE;
    }
  });

  const setReportType = useCallback((value: string) => {
    setReportTypeState(value);
    try { localStorage.setItem(storageKey, value); } catch {}
  }, [storageKey]);

  // ── Time period filter state ─────────────────────────────────────────────
  const [timePeriodOptions, setTimePeriodOptions] = useState<MultiSelectOption[]>([]);
  const [selectedTimePeriodNids, setSelectedTimePeriodNids] = useState<string[]>([]);
  const [timePeriodOpen, setTimePeriodOpen] = useState(false);
  const [timePeriodSearch, setTimePeriodSearch] = useState("");

  // ── Area level map (numeric level → level name) ──────────────────────────
  const [areaLevelMap, setAreaLevelMap] = useState<Map<number, string>>(new Map());

  // ── Table data ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);

  // ── Search & sort state ──────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<GridSortDirection>(null);
  const [colSearch, setColSearch] = useState<Record<string, string>>({});
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch-ID ref ─────────────────────────────────────────────────────────
  const fetchIdRef = useRef(0);
  const exportBusyRef = useRef(false);

  // ── Computed flags ───────────────────────────────────────────────────────
  const supportsTimePeriod = REPORT_SUPPORTS_TIME_PERIOD.has(reportType);

  const filterButtonClass =
    "list-pick-trigger field-comp--sm flex h-8 w-full items-center justify-between gap-1 px-2 text-xs transition-colors border-border bg-surface hover:border-[color:color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]";

  // ── Fetch area levels + time periods once on mount ───────────────────────
  useEffect(() => {
    if (!dwId) return;
    void getRequest(getDWAPIURL(dwId, REFERENCE_PATH_AREA_LEVELS)).then((res) => {
      const raw = Array.isArray(res?.data) ? (res.data as Record<string, unknown>[]) : [];
      const map = new Map<number, string>();
      for (const level of raw) {
        const n = Number(level.al_level ?? 0);
        const name = String(level.al_name ?? "").trim();
        if (n > 0 && name) map.set(n, name);
      }
      setAreaLevelMap(map);
    });
    void getRequest(getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS)).then((res) => {
      const raw = Array.isArray(res?.data) ? (res.data as Record<string, unknown>[]) : [];
      setTimePeriodOptions(
        raw.map((tp) => ({
          value: String(tp.tp_nid ?? tp.nid ?? ""),
          label: String(tp.tp_timeperiod ?? tp.label ?? ""),
        })).filter((o) => o.value && o.label),
      );
    });
  }, [dwId]);

  // ── Report type options (translated) ─────────────────────────────────────
  const reportOptions = useMemo(() => getAnalyticalReportOptions(t), [t]);

  // ── Core fetch ────────────────────────────────────────────────────────────
  const doFetch = useCallback(
    async (pg: number, ps: number, opts: FetchOpts = {}) => {
      if (!reportType || !dwId) return;
      const myId = ++fetchIdRef.current;
      setLoading(true);
      try {
        const query: Record<string, string | number> = { page: pg, page_size: ps };
        if (opts.search && opts.searchBy) {
          query.search    = opts.search;
          query.search_by = opts.searchBy;
        }
        if (opts.sortField) {
          query.sort_field  = opts.sortField;
          query.sort_order  = opts.sortOrder ?? "asc";
        }
        if (opts.timePeriod) query.time_period = opts.timePeriod;
        const url = buildListRequestUrl(getDWAPIURL(dwId, `/reports/${reportType}`), query);
        const res = await getRequest(url);
        if (myId !== fetchIdRef.current) return;
        const raw: Record<string, unknown>[] = Array.isArray(res?.data)
          ? (res.data as Record<string, unknown>[])
          : [];
        setRows(raw.map((row, i) => ({ ...row, _idx: i })));
        setMeta((res?.meta as ReportMeta) ?? null);
        setPage(pg);
      } finally {
        if (myId === fetchIdRef.current) setLoading(false);
      }
    },
    [dwId, reportType]
  );

  // ── Build fetch opts from current state ──────────────────────────────────
  const currentFetchOpts = useCallback(
    (overrideSortCol?: string | null, overrideSortDir?: GridSortDirection): FetchOpts => {
      const searchByMap = REPORT_SEARCH_BY[reportType ?? ""] ?? {};
      const sortFieldMap = REPORT_SORT_FIELD[reportType ?? ""] ?? {};
      const activeEntry = Object.entries(colSearch).find(([, v]) => v.trim());
      const activeSortCol = overrideSortCol !== undefined ? overrideSortCol : sortCol;
      const activeSortDir = overrideSortDir !== undefined ? overrideSortDir : sortDir;
      const searchBy = activeEntry ? searchByMap[activeEntry[0]] : undefined;
      const sortField = activeSortCol ? sortFieldMap[activeSortCol] : undefined;
      const timePeriod = selectedTimePeriodNids.join(",") || undefined;
      return {
        search:     searchBy && activeEntry && activeEntry[1].trim() ? activeEntry[1].trim() : undefined,
        searchBy:   searchBy && activeEntry && activeEntry[1].trim() ? searchBy : undefined,
        sortField:  sortField ?? undefined,
        sortOrder:  (activeSortDir ?? "asc") as string,
        timePeriod,
      };
    },
    [colSearch, sortCol, sortDir, reportType, selectedTimePeriodNids]
  );

  // ── Re-fetch and reset when report type changes ──────────────────────────
  useEffect(() => {
    setSortCol(null);
    setSortDir(null);
    setColSearch({});
    setSelectedTimePeriodNids([]);
    setRows([]);
    setMeta(null);
    setPage(1);
    void doFetch(1, pageSize, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType]);

  // ── Sort toggle (3-state: none → asc → desc → none) ─────────────────────
  const handleSort = useCallback(
    (colId: string) => {
      let newSortCol: string | null;
      let newSortDir: GridSortDirection;
      if (sortCol !== colId) { newSortCol = colId; newSortDir = "asc"; }
      else if (sortDir === "asc") { newSortCol = colId; newSortDir = "desc"; }
      else { newSortCol = null; newSortDir = null; }
      setSortCol(newSortCol);
      setSortDir(newSortDir);
      void doFetch(1, pageSize, currentFetchOpts(newSortCol, newSortDir));
    },
    [sortCol, sortDir, pageSize, doFetch, currentFetchOpts]
  );

  // ── Column search — debounced ─────────────────────────────────────────────
  const handleColSearchChange = useCallback(
    (colId: string, term: string) => {
      setColSearch({ [colId]: term });
      const backendField = (REPORT_SEARCH_BY[reportType ?? ""] ?? {})[colId];
      if (!backendField) return;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      const sortFieldMap = REPORT_SORT_FIELD[reportType ?? ""] ?? {};
      const sortField = sortCol ? sortFieldMap[sortCol] : undefined;
      const sortOrder = sortDir ?? undefined;
      searchTimerRef.current = setTimeout(() => {
        void doFetch(1, pageSize, {
          search:    term.trim() || undefined,
          searchBy:  term.trim() ? backendField : undefined,
          sortField: sortField ?? undefined,
          sortOrder: sortOrder as string | undefined,
        });
      }, 400);
    },
    [reportType, sortCol, sortDir, pageSize, doFetch]
  );

  // ── Virtual column renderers (computed from multiple backend fields) ────────
  const VIRTUAL_CELL_RENDERERS: Record<string, (row: Record<string, unknown>) => ReactNode> = {
    period_span: (row) => {
      const e = row.earliest_period, l = row.latest_period;
      if (e == null && l == null) return <span className="text-text-muted">—</span>;
      const label = `${e ?? "—"} → ${l ?? "—"}`;
      return <span className="block min-w-0 truncate" title={label}>{label}</span>;
    },
    period_coverage: (row) => {
      const w = row.periods_with_data, tot = row.total_periods;
      if (w == null || tot == null) return <span className="text-text-muted">—</span>;
      return `${w} / ${tot}`;
    },
    ar_level: (row) => {
      const level = row.ar_level;
      if (level == null) return <span className="text-text-muted">—</span>;
      const name = areaLevelMap.get(Number(level));
      const label = name ?? String(level);
      return <span className="block min-w-0 truncate" title={label}>{label}</span>;
    },
    i_u_name: (row) => {
      const i = row.i_name, u = row.u_name;
      if (!i && !u) return <span className="text-text-muted">—</span>;
      const label = [i, u].filter(Boolean).join(", ");
      return <span className="block min-w-0 truncate" title={label}>{label}</span>;
    },
  };

  // ── Column definitions ───────────────────────────────────────────────────
  const columns: EditableGridColumnDef<Record<string, unknown>>[] = useMemo(() => {
    const fields = REPORT_DISPLAY_FIELDS[reportType ?? ""] ?? [];
    const searchByMap = REPORT_SEARCH_BY[reportType ?? ""] ?? {};
    const sortFieldMap = REPORT_SORT_FIELD[reportType ?? ""] ?? {};

    const snCol: EditableGridColumnDef<Record<string, unknown>> = {
      id: "__sn",
      layout: { width: 50, minWidth: 36 },
      defaultWidth: 50,
      className: "td-text-cell",
      resizable: false,
      header: { kind: "label" as const, text: t("SERIAL_NO", "S.No.") },
      cell: ({ rowIndex }) => String((page - 1) * pageSize + rowIndex + 1),
    };

    return [snCol, ...fields.map((fieldKey) => {
      const [tKey, fallback] = FIELD_LABEL_MAP[fieldKey] ?? [fieldKey, fieldKey];
      const canSort = fieldKey in sortFieldMap;
      const canSearch = fieldKey in searchByMap;
      const label = t(tKey, fallback);

      const header = canSort ? {
        kind: "sort" as const,
        text: label,
        onSort: () => handleSort(fieldKey),
        sortAriaLabel: `Sort by ${label}`,
        sortActive: sortCol === fieldKey,
        sortDirection: sortCol === fieldKey ? sortDir : undefined,
        sortIcon: gridSortIcon(sortCol === fieldKey, sortCol === fieldKey ? sortDir : null),
      } : { kind: "label" as const, text: label };

      const filterCell = canSearch ? (
        <SearchInputBar
          embedded
          placeholder={t("SEARCH_PLACEHOLDER")}
          value={colSearch[fieldKey] ?? ""}
          onChange={(e) => handleColSearchChange(fieldKey, e.target.value)}
          aria-label={label}
        />
      ) : undefined;

      return {
        id: fieldKey,
        layout: { width: columnWidthFor(fieldKey), minWidth: 80 },
        defaultWidth: columnWidthFor(fieldKey),
        className: "td-text-cell",
        header,
        filterCell,
        cell: ({ row }: { row: Record<string, unknown> }) => {
          if (fieldKey in VIRTUAL_CELL_RENDERERS) return VIRTUAL_CELL_RENDERERS[fieldKey]!(row);
          const val = row[fieldKey];
          if (val === null || val === undefined) return <span className="text-text-muted">—</span>;
          if (typeof val === "boolean") return val ? "✓" : "✗";
          return <span className="block min-w-0 truncate" title={String(val)}>{String(val)}</span>;
        },
      };
    })];
  }, [reportType, t, sortCol, sortDir, colSearch, handleSort, handleColSearchChange, page, pageSize, areaLevelMap]);

  // ── Show filter row when the current report supports any searchable column ─
  const showFilterRow = Object.keys(REPORT_SEARCH_BY[reportType ?? ""] ?? {}).length > 0;

  // ── Export: download XLSX with all active query params ───────────────────
  const handleExport = useCallback(async () => {
    if (exportBusyRef.current || !reportType || !dwId) return;
    exportBusyRef.current = true;
    try {
      const opts = currentFetchOpts();
      const exportParams = new URLSearchParams({ export: "true" });
      if (opts.search && opts.searchBy) {
        exportParams.set("search",    opts.search);
        exportParams.set("search_by", opts.searchBy);
      }
      if (opts.sortField) {
        exportParams.set("sort_field",  opts.sortField);
        exportParams.set("sort_order",  opts.sortOrder ?? "asc");
      }
      if (opts.timePeriod) exportParams.set("time_period", opts.timePeriod);
      const url = `${getDWAPIURL(dwId, `/reports/${reportType}`)}?${exportParams.toString()}`;
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
      let filename = `analytical-report-${reportType.replace(/\//g, "-")}.xlsx`;
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
  }, [dwId, reportType, t, currentFetchOpts]);

  // ── Register Export button in toolbar ────────────────────────────────────
  useEffect(() => {
    setToolbarExport({
      onClick: () => void handleExport(),
      disabled: meta === null || loading,
    });
    return () => setToolbarExport(null);
  }, [setToolbarExport, handleExport, meta, loading]);

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

          {supportsTimePeriod && (
            <>
              <span className="text-xs font-semibold text-primary whitespace-nowrap">
                {t("TIME_PERIOD", "Time Period")}
              </span>
              <div className="min-w-[160px] max-w-[300px] flex-1">
                <MultiSelectDropdown
                  open={timePeriodOpen}
                  onOpenChange={(open) => {
                    setTimePeriodOpen(open);
                    if (!open) void doFetch(1, pageSize, currentFetchOpts());
                  }}
                  options={timePeriodOptions}
                  selectedValues={selectedTimePeriodNids}
                  onToggleValue={(v) => {
                    setSelectedTimePeriodNids((prev) =>
                      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
                    );
                  }}
                  searchQuery={timePeriodSearch}
                  onSearchChange={setTimePeriodSearch}
                  emptyLabel={t("SELECT", "Select")}
                  showSelectAll
                  selectAllLabel={t("COMMON_SELECT_ALL", "Select All")}
                  deselectAllLabel={t("COMMON_DESELECT_ALL", "Deselect All")}
                  triggerClassName={filterButtonClass}
                  menuPortal
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Data table ──────────────────────────────────────────────────────── */}
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
              rows={rows}
              columns={columns as EditableGridColumnDef<unknown>[]}
              getRowId={(row) => String(row._idx as number)}
              editingRowId={null}
              colSpan={columns.length}
              emptyMessage={t("NO_ROWS_TO_SHOW")}
              showLoadingRow={loading}
              showEmptyRow={!loading && rows.length === 0}
              showDataRows={!loading}
            />
          }
          pagination={{
            page,
            totalPages: meta?.total_pages ?? 0,
            totalCount: meta?.total_count ?? 0,
            pageSize,
            onPageChange: (p) => void doFetch(p, pageSize, currentFetchOpts()),
            onPageSizeChange: (ps) => {
              setPageSize(ps);
              void doFetch(1, ps, currentFetchOpts());
            },
            resetPageOnPageSizeChange: false,
            countNoun: t("ROWS"),
          }}
        />
      </div>

    </div>
  );
}
