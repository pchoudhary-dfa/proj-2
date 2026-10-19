"use client";

// ---------------------------------------------------------------------------
// GET /dw/{dw_id}/reports/data/published/full
//   Query params: page, page_size, area, indicator, unit, subgroup,
//                 time_period, source, search, search_by, sort_field, sort_order
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import type { AreaItem } from "dfa-v6-comp-area";
import type { IndicatorItem } from "dfa-v6-comp-indicator";
import type { TimePeriodItem } from "dfa-v6-comp-timeperiod";
import { AreaSelectionModal } from "@/components/AreaSelectionModal";
import { IndicatorSelectionModal } from "@/components/IndicatorSelectionModal";
import { TimePeriodSelectionModal } from "@/components/TimePeriodSelectionModal";
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
import {
  MultiSelectDropdown,
  type MultiSelectOption,
} from "@/components/MultiSelectDropdown";
import type { EditableGridFilterDef } from "@/components/editableGridFilter";
import { useCore } from "@/contexts/CoreContext";
// import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
// import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import { getFileResponse, getRequest } from "@/lib/api/http";
import { fetchAllDwSources } from "@/lib/api/sources";
import { getDWAPIURL, REPORT_DATA_PUBLISHED_FULL } from "@/lib/constants";
import type { SourceRaw } from "@/lib/api/types";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import { useSidebar } from "@/contexts/SidebarContext";
import Drawer from "@/components/Drawer";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type PublishedDataRow = {
  dt_nid: number;
  dt_value: number | null;
  dt_text_value: string;
  dt_is_textual: boolean;
  i_nid: number;
  i_gid: string;
  i_name: string;
  u_nid: number;
  u_gid: string;
  u_name: string;
  sg_nid: number;
  sg_gid: string;
  sg_name: string;
  ar_nid: number;
  ar_gid: string;
  ar_name: string;
  ar_level: number;
  tp_nid: number;
  tp_timeperiod: string;
  src_nid: number;
  src_gid: string;
  src_name: string;
  formatted_dt_value: string;
  fn_nid: number | null;
  fn_gid: string;
  fn_text: string;
};

type PublishedDataMeta = {
  total_count: number;
  total_pages: number;
  page: number;
  page_size: number;
  count: number;
  footnote_count: number;
  footnotes: { fn_nid: number; fn_gid: string; fn_text: string }[];
};

// ---------------------------------------------------------------------------
// Column → backend field mappings
// ---------------------------------------------------------------------------

/** Columns that support server-side search (search_by param). */
const COL_SEARCH_BY: Record<string, string> = {
  indicator: "i_name",
  subgroup:  "sg_name",
  area:      "ar_name",
  time_period: "tp_timeperiod",
  source:    "src_name",
};

/** Columns that support server-side sort (sort_field param). */
const COL_SORT_FIELD: Record<string, string> = {
  indicator:   "i_name",
  subgroup:    "sg_name",
  area:        "ar_name",
  time_period: "tp_timeperiod",
  data:        "dt_value",
  source:      "src_name",
};

/** Field names (used as col IDs in group mode) that support server-side text search. */
const GROUP_SEARCHABLE_FIELDS = new Set([
  "i_name", "u_name", "sg_name", "ar_name", "tp_timeperiod", "src_name",
]);

// ---------------------------------------------------------------------------
// Advanced filter dimension / function option lists
// ---------------------------------------------------------------------------

const AGG_BY_DIMS = [
  { value: "indicator",           labelKey: "LABEL_INDICATOR" },
  { value: "unit",                labelKey: "UNIT" },
  { value: "subgroup",            labelKey: "SUBGROUP" },
  { value: "area",                labelKey: "AREA" },
  { value: "area_level",          labelKey: "AREA_LEVEL" },
  { value: "time_period",         labelKey: "TIME_PERIOD" },
  { value: "source",              labelKey: "SOURCE" },
  { value: "dt_is_mrd",           labelKey: "ISMRD" },
  { value: "dt_is_planned_value", labelKey: "IS_PLANNED_VALUE" },
] as const;

const AGG_FUNCTIONS = [
  { value: "count", labelKey: "COUNT" },
  { value: "sum",   labelKey: "SUM" },
  { value: "avg",   labelKey: "AVERAGE" },
  { value: "min",   labelKey: "MIN" },
  { value: "max",   labelKey: "MAX" },
] as const;

/** Maps each aggregate-by dimension value → API response field name + column display metadata. */
const AGG_DIM_TO_COL: Record<string, { field: string; translationKey: string; width: number; minWidth: number }> = {
  indicator:           { field: "i_name",             translationKey: "LABEL_INDICATOR",  width: 380, minWidth: 160 },
  unit:                { field: "u_name",             translationKey: "UNIT",             width: 140, minWidth: 80  },
  subgroup:            { field: "sg_name",            translationKey: "SUBGROUP",         width: 140, minWidth: 100 },
  area:                { field: "ar_name",            translationKey: "AREA",             width: 140, minWidth: 80  },
  area_level:          { field: "ar_level",           translationKey: "AREA_LEVEL",       width: 100, minWidth: 80  },
  time_period:         { field: "tp_timeperiod",      translationKey: "TIME_PERIOD",      width: 110, minWidth: 110 },
  source:              { field: "src_name",           translationKey: "SOURCE",           width: 200, minWidth: 100 },
  dt_is_mrd:           { field: "dt_is_mrd",          translationKey: "ISMRD",            width: 100, minWidth: 80  },
  dt_is_planned_value: { field: "dt_is_planned_value",translationKey: "IS_PLANNED_VALUE", width: 130, minWidth: 100 },
};

/** Maps each aggregate function value → API response field name + column display metadata. */
const AGG_FN_TO_COL: Record<string, { field: string; translationKey: string; width: number; minWidth: number }> = {
  count: { field: "dt_value_count", translationKey: "COUNT",   width: 100, minWidth: 80 },
  sum:   { field: "dt_value_sum",   translationKey: "SUM",     width: 100, minWidth: 80 },
  avg:   { field: "dt_value_avg",   translationKey: "AVERAGE", width: 100, minWidth: 80 },
  min:   { field: "dt_value_min",   translationKey: "MIN",     width: 100, minWidth: 80 },
  max:   { field: "dt_value_max",   translationKey: "MAX",     width: 100, minWidth: 80 },
};

// ---------------------------------------------------------------------------
// Fetch options type
// ---------------------------------------------------------------------------

interface FetchOpts {
  search?: string;
  searchBy?: string;
  sortField?: string;
  sortOrder?: string;
  dataFilters?: string[];
}

/** Dedupes concurrent identical report GETs (Strict Mode remount + restore auto-fetch). */
const dataReportFetchInFlight = new Map<string, Promise<void>>();
/** Dedupes restore-triggered auto-fetch per saved filter key. */
const dataReportRestoreFetchInFlight = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function toOptions<T>(
  arr: T[],
  getValue: (item: T) => string | number | undefined | null,
  getLabel: (item: T) => string | null | undefined
): MultiSelectOption[] {
  const result: MultiSelectOption[] = [];
  for (const item of arr) {
    const v = getValue(item);
    if (v == null) continue;
    const s = String(v);
    if (!s) continue;
    result.push({ value: s, label: getLabel(item) ?? s });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DataReportPage() {
  const { t } = useCore();
  const params = useParams<{ locale: string; dw_id: string }>();
  const locale = readParam(params?.locale) || "en";
  const dwId = readParam(params?.dw_id);

  // ── Filter selection state ────────────────────────────────────────────────
  const [selectedAreas, setSelectedAreas] = useState<AreaItem[]>([]);
  const [selectedIusItems, setSelectedIusItems] = useState<IndicatorItem[]>([]);
  const [selectedTimePeriodItems, setSelectedTimePeriodItems] = useState<TimePeriodItem[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  // ── Search state for source dropdown ────────────────────────────────────
  const [sourceSearch, setSourceSearch] = useState("");

  // ── Dropdown / modal open state ──────────────────────────────────────────
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [iusModalOpen, setIusModalOpen] = useState(false);
  const [timePeriodModalOpen, setTimePeriodModalOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);

  // ── Reference options (loaded from API) ─────────────────────────────────
  const [sourceOptions, setSourceOptions] = useState<MultiSelectOption[]>([]);

  // ── Table data ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<PublishedDataRow[]>([]);
  const [meta, setMeta] = useState<PublishedDataMeta | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);

  // ── Column search state (one active column at a time → server-side) ──────
  const [colSearch, setColSearch] = useState<Record<string, string>>({});

  // ── Sort state (server-side) ──────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<GridSortDirection>(null);

  // ── Filter bar collapsed state ────────────────────────────────────────────
  const [filterBarOpen, setFilterBarOpen] = useState(true);

  // ── Data value filter state ───────────────────────────────────────────────
  const [dataValueOp, setDataValueOp] = useState<string>("gte");
  const [dataValueInput, setDataValueInput] = useState<string>("");

  // ── Advanced filters — applied (chips + sent to API on main Apply) ────────
  const [advIsmrd, setAdvIsmrd] = useState<"true" | "false" | "">("");
  const [advIsPlannedValue, setAdvIsPlannedValue] = useState<"true" | "false" | "">("");
  const [advIstextualdata, setAdvIstextualdata] = useState<"true" | "false" | "">("");
  const [advIsDefaultSubgroup, setAdvIsDefaultSubgroup] = useState<"true" | "false" | "all">("true");
  const [advAggregateBy, setAdvAggregateBy] = useState<string[]>([]);
  const [advAgg, setAdvAgg] = useState<string[]>([]);

  // ── Active aggregate state — reflects what was actually last fetched ───────
  // Columns update only when a fetch completes, not when the drawer Apply is clicked.
  const [activeAggregateBy, setActiveAggregateBy] = useState<string[]>([]);
  const [activeAgg, setActiveAgg] = useState<string[]>([]);

  // ── Advanced filters — draft (live while drawer is open) ─────────────────
  const [draftIsmrd, setDraftIsmrd] = useState<"true" | "false" | "">("");
  // const [draftIsPlannedValue, setDraftIsPlannedValue] = useState<"true" | "false" | "">("");
  const [draftIstextualdata, setDraftIstextualdata] = useState<"true" | "false" | "">("");
  const [draftIsDefaultSubgroup, setDraftIsDefaultSubgroup] = useState<"true" | "false" | "all">("true");
  const [draftAggregateBy, setDraftAggregateBy] = useState<string[]>([]);
  const [draftAgg, setDraftAgg] = useState<string[]>([]);

  const [advDrawerOpen, setAdvDrawerOpen] = useState(false);

  // ── Aggregate By / Aggregate Functions dropdown state (inside drawer) ────
  const [aggByDropdownOpen, setAggByDropdownOpen] = useState(false);
  const [aggBySearch, setAggBySearch] = useState("");
  const [aggFnsDropdownOpen, setAggFnsDropdownOpen] = useState(false);
  const [aggFnsSearch, setAggFnsSearch] = useState("");

  const aggByOptions = useMemo<MultiSelectOption[]>(
    () => AGG_BY_DIMS.map(({ value, labelKey }) => ({ value, label: t(labelKey) })),
    [t]
  );
  const aggFnOptions = useMemo<MultiSelectOption[]>(
    () => AGG_FUNCTIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) })),
    [t]
  );

  // ── Debounce timer refs ───────────────────────────────────────────────────
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataFilterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);
  const doFetchRef = useRef<
    (pg: number, ps: number, opts?: FetchOpts) => Promise<void>
  >(() => Promise.resolve());

  // ── localStorage key for filter persistence ──────────────────────────────
  const storageKey = `dfa.dm.dataReport.filters.v1:${encodeURIComponent(dwId)}`;

  // ── Ref to trigger auto-fetch once after filters are restored ────────────
  const pendingAutoFetchRef = useRef(false);

  // ── Sidebar toolbar wiring ───────────────────────────────────────────────
  const { setToolbarExport, setSidebarCollapsed } = useSidebar();
  const exportBusyRef = useRef(false);

  // ── Permission guard (disabled — reports visible to all DW users, no backend resource codes yet)
  // const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.reports.parent, {
  //   parentResourceCode: DW_ROUTE_PERMISSIONS.reports.parent,
  // });

  // ── Load source options on DW change (all pages via fetchAllDwSources) ──
  useEffect(() => {
    if (!dwId) return;
    let cancelled = false;

    void (async () => {
      const res = await fetchAllDwSources(dwId, locale);
      if (cancelled) return;

      if (!res.ok) {
        setSourceOptions([]);
        return;
      }
      const data = res.rows as SourceRaw[];
      setSourceOptions(
        toOptions(data, (s) => s.src_nid, (s) => s.src_name ?? s.src_title ?? "")
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [dwId, locale]);

  // ── Restore filters from localStorage on mount ───────────────────────────
  useEffect(() => {
    if (!dwId) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        areas: AreaItem[];
        iusItems: IndicatorItem[];
        timePeriodItems: TimePeriodItem[];
        sources: string[];
      };
      if (parsed.areas?.length)           setSelectedAreas(parsed.areas);
      if (parsed.iusItems?.length)        setSelectedIusItems(parsed.iusItems);
      if (parsed.timePeriodItems?.length) setSelectedTimePeriodItems(parsed.timePeriodItems);
      if (parsed.sources?.length)         setSelectedSources(parsed.sources);
      pendingAutoFetchRef.current = true;
    } catch {}
  }, [dwId, storageKey]);

  // ── Core fetch — sends all filters + server-side search/sort ─────────────
  const doFetch = useCallback(
    async (pg: number, ps: number, opts: FetchOpts = {}) => {
      if (!selectedAreas.length || !selectedIusItems.length) {
        toast.error(t("AREA_AND_INDICATOR_REQUIRED"));
        return;
      }

      const query: Record<string, string | number> = {
        page: pg,
        page_size: ps,
        area: selectedAreas.map((a) => String(a.nid ?? a.id)).join(","),
        indicator: selectedIusItems.map((i) => String(i.nid ?? i.id)).join(","),
      };
      if (selectedTimePeriodItems.length)
        query.time_period = selectedTimePeriodItems.map((i) => String(i.nid ?? i.id)).join(",");
      if (selectedSources.length) query.source = selectedSources.join(",");

      if (advIsmrd !== "") query.ismrd = advIsmrd;
      if (advIsPlannedValue !== "") query.isplannedvalue = advIsPlannedValue;
      if (advIstextualdata !== "") query.istextualdata = advIstextualdata;
      query.isdefaultsubgroup = advIsDefaultSubgroup;
      if (advAggregateBy.length) query.aggregate_by = advAggregateBy.join(",");
      if (advAgg.length) query.agg = advAgg.join(",");

      // Search is supported in both normal and group mode; sort is normal mode only.
      if (opts.search && opts.searchBy) {
        query.search = opts.search;
        query.search_by = opts.searchBy;
      }
      if (!advAggregateBy.length && opts.sortField) {
        query.sort_field = opts.sortField;
        query.sort_order = opts.sortOrder ?? "asc";
      }

      let url = buildListRequestUrl(getDWAPIURL(dwId, REPORT_DATA_PUBLISHED_FULL), query);
      if (!advAggregateBy.length && opts.dataFilters?.length) {
        const extra = opts.dataFilters.map((f) => `filter=${encodeURIComponent(f)}`).join("&");
        url += (url.includes("?") ? "&" : "?") + extra;
      }

      const inFlight = dataReportFetchInFlight.get(url);
      if (inFlight) {
        await inFlight;
        return;
      }

      const myId = ++fetchIdRef.current;
      const run = (async () => {
        setLoading(true);
        try {
          const res = await getRequest(url);
          if (myId !== fetchIdRef.current) return;
          setRows(Array.isArray(res?.data) ? (res.data as PublishedDataRow[]) : []);
          setMeta((res?.meta as PublishedDataMeta) ?? null);
          setPage(pg);
          // Sync column structure to what was actually fetched
          setActiveAggregateBy(advAggregateBy);
          setActiveAgg(advAgg);
        } catch {
          if (myId !== fetchIdRef.current) return;
          toast.error(
            t(
              "REQUEST_TOO_LARGE",
              "Request is too large — too many items selected. Please reduce your selection and try again."
            )
          );
        } finally {
          if (myId === fetchIdRef.current) setLoading(false);
        }
      })();

      dataReportFetchInFlight.set(url, run);
      try {
        await run;
      } finally {
        dataReportFetchInFlight.delete(url);
      }
    },
    [dwId, selectedAreas, selectedIusItems, selectedTimePeriodItems, selectedSources,
     advIsmrd, advIsPlannedValue, advIstextualdata, advIsDefaultSubgroup, advAggregateBy, advAgg, t]
  );

  doFetchRef.current = doFetch;

  // ── Auto-fetch once after filter restoration ──────────────────────────────
  useEffect(() => {
    if (!pendingAutoFetchRef.current) return;
    if (!selectedAreas.length || !selectedIusItems.length) return;
    pendingAutoFetchRef.current = false;

    const existing = dataReportRestoreFetchInFlight.get(storageKey);
    if (existing) {
      void existing;
      return;
    }

    const promise = doFetchRef.current(1, pageSize).finally(() => {
      dataReportRestoreFetchInFlight.delete(storageKey);
    });
    dataReportRestoreFetchInFlight.set(storageKey, promise);
  }, [selectedAreas, selectedIusItems, pageSize, storageKey]);

  // ── Build fetch opts from current state ──────────────────────────────────
  const currentFetchOpts = useCallback(
    (
      overrideSortCol?: string | null,
      overrideSortDir?: GridSortDirection,
      overrideDataOp?: string,
      overrideDataInput?: string,
    ): FetchOpts => {
      const activeEntry = Object.entries(colSearch).find(([, v]) => v.trim());
      const searchBy = activeEntry
        ? (COL_SEARCH_BY[activeEntry[0]] ?? (GROUP_SEARCHABLE_FIELDS.has(activeEntry[0]) ? activeEntry[0] : undefined))
        : undefined;

      const activeSortCol  = overrideSortCol   !== undefined ? overrideSortCol   : sortCol;
      const activeSortDir  = overrideSortDir   !== undefined ? overrideSortDir   : sortDir;
      const activeOp       = overrideDataOp    !== undefined ? overrideDataOp    : dataValueOp;
      const activeInput    = overrideDataInput !== undefined ? overrideDataInput : dataValueInput;

      const dataFilters: string[] = [];
      if (activeInput.trim() && activeOp) {
        dataFilters.push(`data_value:${activeOp}:${activeInput.trim()}`);
      }

      return {
        search:      searchBy && activeEntry ? activeEntry[1].trim() : undefined,
        searchBy,
        sortField:   activeSortCol ? COL_SORT_FIELD[activeSortCol] ?? undefined : undefined,
        sortOrder:   activeSortDir ?? undefined,
        dataFilters: dataFilters.length ? dataFilters : undefined,
      };
    },
    [colSearch, sortCol, sortDir, dataValueOp, dataValueInput]
  );

  // ── Reset all filters and table ──────────────────────────────────────────
  const handleReset = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch {}
    setSelectedAreas([]);
    setSelectedIusItems([]);
    setSelectedTimePeriodItems([]);
    setSelectedSources([]);
    setRows([]);
    setMeta(null);
    setPage(1);
    setColSearch({});
    setSortCol(null);
    setSortDir(null);
    setDataValueOp("gte");
    setDataValueInput("");
    setAdvIsmrd(""); setDraftIsmrd("");
    // setAdvIsPlannedValue(""); setDraftIsPlannedValue("");
    setAdvIstextualdata(""); setDraftIstextualdata("");
    setAdvIsDefaultSubgroup("true"); setDraftIsDefaultSubgroup("true");
    setAdvAggregateBy([]); setDraftAggregateBy([]);
    setAdvAgg([]); setDraftAgg([]);
    setActiveAggregateBy([]); setActiveAgg([]);
  }, [storageKey]);

  // ── Advanced drawer: open (sync draft from applied) and Apply ────────────
  const openAdvDrawer = useCallback(() => {
    setDraftIsmrd(advIsmrd);
    // setDraftIsPlannedValue(advIsPlannedValue);
    setDraftIstextualdata(advIstextualdata);
    setDraftIsDefaultSubgroup(advIsDefaultSubgroup);
    setDraftAggregateBy(advAggregateBy);
    setDraftAgg(advAgg);
    setAdvDrawerOpen(true);
    setSidebarCollapsed(true);
  }, [advIsmrd, advIsPlannedValue, advIstextualdata, advIsDefaultSubgroup, advAggregateBy, advAgg, setSidebarCollapsed]);

  const handleDrawerReset = useCallback(() => {
    setDraftIsmrd("");
    // setDraftIsPlannedValue("");
    setDraftIstextualdata("");
    setDraftIsDefaultSubgroup("true");
    setDraftAggregateBy([]);
    setDraftAgg([]);
  }, []);

  const handleDrawerApply = useCallback(() => {
    // Enforce: functions require at least one dimension
    const safeAgg = draftAggregateBy.length > 0 ? draftAgg : [];

    // If switching into or out of group mode, reset stale sort/search/data-filter state
    const wasGroupMode = advAggregateBy.length > 0;
    const willBeGroupMode = draftAggregateBy.length > 0;
    if (wasGroupMode !== willBeGroupMode) {
      setSortCol(null);
      setSortDir(null);
      setColSearch({});
      setDataValueOp("gte");
      setDataValueInput("");
    }

    setAdvIsmrd(draftIsmrd);
    // setAdvIsPlannedValue(draftIsPlannedValue);
    setAdvIstextualdata(draftIstextualdata);
    setAdvIsDefaultSubgroup(draftIsDefaultSubgroup);
    setAdvAggregateBy(draftAggregateBy);
    setAdvAgg(safeAgg);
    setDraftAgg(safeAgg);
    setAdvDrawerOpen(false);
  }, [draftIsmrd, draftIstextualdata, draftIsDefaultSubgroup,
      draftAggregateBy, draftAgg, advAggregateBy]);
      // draftIsPlannedValue,

  // ── Export: download XLSX with current applied filters ───────────────────
  const handleExport = useCallback(async () => {
    if (exportBusyRef.current) return;
    if (!selectedAreas.length || !selectedIusItems.length) return;
    exportBusyRef.current = true;
    try {
      const params = new URLSearchParams({
        area: selectedAreas.map((a) => String(a.nid ?? a.id)).join(","),
        indicator: selectedIusItems.map((i) => String(i.nid ?? i.id)).join(","),
        export: "true",
      });
      if (selectedTimePeriodItems.length)
        params.set("time_period", selectedTimePeriodItems.map((i) => String(i.nid ?? i.id)).join(","));
      if (selectedSources.length)
        params.set("source", selectedSources.join(","));
      if (dataValueInput.trim() && dataValueOp)
        params.append("filter", `data_value:${dataValueOp}:${dataValueInput.trim()}`);

      if (advIsmrd !== "")                   params.set("ismrd",             advIsmrd);
      if (advIsPlannedValue !== "")          params.set("isplannedvalue",    advIsPlannedValue);
      if (advIstextualdata !== "")           params.set("istextualdata",     advIstextualdata);
      params.set("isdefaultsubgroup", advIsDefaultSubgroup);
      if (advAggregateBy.length)             params.set("aggregate_by",      advAggregateBy.join(","));
      if (advAgg.length)                     params.set("agg",               advAgg.join(","));

      const url = `${getDWAPIURL(dwId, REPORT_DATA_PUBLISHED_FULL)}?${params.toString()}`;
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
      let filename = `data-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
  }, [dwId, selectedAreas, selectedIusItems, selectedTimePeriodItems, selectedSources, dataValueOp, dataValueInput,
      advIsmrd, advIsPlannedValue, advIstextualdata, advIsDefaultSubgroup, advAggregateBy, advAgg, t]);

  // ── Register Export button in toolbar; disable when no data loaded ────────
  useEffect(() => {
    setToolbarExport({
      onClick: () => void handleExport(),
      disabled: meta === null || loading,
    });
    return () => setToolbarExport(null);
  }, [setToolbarExport, handleExport, meta, loading]);

  // ── Sort toggle (3-state: none → asc → desc → none) → triggers refetch ──
  const handleSort = useCallback(
    (colId: string) => {
      let newSortCol: string | null;
      let newSortDir: GridSortDirection;

      if (sortCol !== colId) {
        newSortCol = colId;
        newSortDir = "asc";
      } else if (sortDir === "asc") {
        newSortCol = colId;
        newSortDir = "desc";
      } else {
        newSortCol = null;
        newSortDir = null;
      }

      setSortCol(newSortCol);
      setSortDir(newSortDir);

      if (selectedAreas.length && selectedIusItems.length) {
        doFetch(1, pageSize, currentFetchOpts(newSortCol, newSortDir));
      }
    },
    [sortCol, sortDir, selectedAreas, selectedIusItems, pageSize, doFetch, currentFetchOpts]
  );

  // ── Column search change — one active at a time, debounced server fetch ──
  const handleColSearchChange = useCallback(
    (colId: string, term: string) => {
      setColSearch({ [colId]: term });

      const backendField = COL_SEARCH_BY[colId] ?? (GROUP_SEARCHABLE_FIELDS.has(colId) ? colId : undefined);
      if (!backendField) return; // Column not searchable server-side

      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      // Capture sort values at call time to avoid stale closure in timeout
      const sortField  = sortCol ? COL_SORT_FIELD[sortCol] ?? undefined : undefined;
      const sortOrder  = sortDir ?? undefined;

      searchTimerRef.current = setTimeout(() => {
        if (!selectedAreas.length || !selectedIusItems.length) return;
        doFetch(1, pageSize, {
          search:    term.trim() || undefined,
          searchBy:  term.trim() ? backendField : undefined,
          sortField,
          sortOrder,
        });
      }, 400);
    },
    [selectedAreas, selectedIusItems, pageSize, doFetch, sortCol, sortDir]
  );

  // ── Data value filter change — debounced server fetch ────────────────────
  const handleDataFilterChange = useCallback(
    (newOp: string, newInput: string) => {
      if (dataFilterTimerRef.current) clearTimeout(dataFilterTimerRef.current);

      const sortField   = sortCol ? COL_SORT_FIELD[sortCol] ?? undefined : undefined;
      const sortOrder   = sortDir ?? undefined;
      const activeEntry = Object.entries(colSearch).find(([, v]) => v.trim());
      const searchBy    = activeEntry
        ? (COL_SEARCH_BY[activeEntry[0]] ?? (GROUP_SEARCHABLE_FIELDS.has(activeEntry[0]) ? activeEntry[0] : undefined))
        : undefined;
      const search      = searchBy && activeEntry ? activeEntry[1].trim() : undefined;

      dataFilterTimerRef.current = setTimeout(() => {
        if (!selectedAreas.length || !selectedIusItems.length) return;
        const dataFilters: string[] = [];
        if (newInput.trim() && newOp) {
          dataFilters.push(`data_value:${newOp}:${newInput.trim()}`);
        }
        doFetch(1, pageSize, {
          search,
          searchBy,
          sortField,
          sortOrder,
          dataFilters: dataFilters.length ? dataFilters : undefined,
        });
      }, 400);
    },
    [selectedAreas, selectedIusItems, pageSize, doFetch, sortCol, sortDir, colSearch]
  );

  // ── Column definitions ───────────────────────────────────────────────────
  // True only after a fetch has completed with aggregate dims — columns don't
  // change just because the drawer's Apply was clicked.
  const isGroupMode = activeAggregateBy.length > 0;

  const columns: EditableGridColumnDef<Record<string, unknown>>[] = useMemo(
    () => {
      const makeSearchFilter = (colId: string, label: string): EditableGridFilterDef => ({
        kind: "search",
        placeholder: t("SEARCH_PLACEHOLDER"),
        value: colSearch[colId] ?? "",
        onChange: (value) => handleColSearchChange(colId, value),
        ariaLabel: label,
      });

      const snCol: EditableGridColumnDef<Record<string, unknown>> = {
        id: "__sn",
        layout: { width: 50, minWidth: 36 },
        defaultWidth: 50,
        className: "td-text-cell",
        resizable: false,
        header: { kind: "label" as const, text: t("SERIAL_NO", "S.No.") },
        cell: ({ rowIndex }) => String((page - 1) * pageSize + rowIndex + 1),
      };

      // ── Aggregate / group mode: build columns from selected dims + fns ──────
      if (isGroupMode) {
        const dimCols = activeAggregateBy
          .map((dim) => AGG_DIM_TO_COL[dim])
          .filter(Boolean)
          .map(({ field, translationKey, width, minWidth }) => ({
            id: field,
            layout: { width, minWidth },
            defaultWidth: width,
            className: "td-text-cell",
            header: { kind: "label" as const, text: t(translationKey) },
            ...(GROUP_SEARCHABLE_FIELDS.has(field)
              ? { filter: makeSearchFilter(field, t(translationKey)) }
              : {}),
            cell: ({ row }: { row: Record<string, unknown> }) => {
              const val = row[field];
              const str = val != null ? String(val) : "—";
              return <span className="block min-w-0 truncate" title={str}>{str}</span>;
            },
          }));

        const fnCols = activeAgg
          .map((fn) => AGG_FN_TO_COL[fn])
          .filter(Boolean)
          .map(({ field, translationKey, width, minWidth }) => ({
            id: field,
            layout: { width, minWidth },
            defaultWidth: width,
            className: "td-text-cell",
            header: { kind: "label" as const, text: t(translationKey) },
            cell: ({ row }: { row: Record<string, unknown> }) =>
              row[field] != null ? String(row[field]) : "—",
          }));

        return [snCol, ...dimCols, ...fnCols];
      }

      // ── Normal mode: static 7-column layout ─────────────────────────────────
      const makeSortHeader = (colId: string, label: string) => ({
        kind: "sort" as const,
        text: label,
        onSort: () => handleSort(colId),
        sortAriaLabel: `Sort by ${label}`,
        sortActive: sortCol === colId,
        sortDirection: sortCol === colId ? sortDir : undefined,
        sortIcon: gridSortIcon(sortCol === colId, sortCol === colId ? sortDir : null),
      });

      return [
        snCol,
        {
          id: "indicator",
          layout: { width: 380, minWidth: 160 },
          defaultWidth: 380,
          className: "td-text-cell",
          header: makeSortHeader("indicator", `${t("LABEL_INDICATOR")}`),
          filter: makeSearchFilter("indicator", `${t("LABEL_INDICATOR")}`),
          cell: ({ row }: { row: Record<string, unknown> }) => {
            const r = row as unknown as PublishedDataRow;
            const unit = r.u_name?.trim();
            const label = unit ? `${r.i_name}, ${unit}` : r.i_name;
            return <span className="block min-w-0 truncate" title={label}>{label}</span>;
          },
        },
        {
          id: "subgroup",
          layout: { width: 140, minWidth: 100 },
          defaultWidth: 140,
          className: "td-text-cell",
          header: makeSortHeader("subgroup", t("SUBGROUP")),
          filter: makeSearchFilter("subgroup", t("SUBGROUP")),
          cell: ({ row }: { row: Record<string, unknown> }) =>
            (row as unknown as PublishedDataRow).sg_name,
        },
        {
          id: "area",
          layout: { width: 140, minWidth: 80 },
          defaultWidth: 140,
          className: "td-text-cell",
          header: makeSortHeader("area", t("AREA")),
          filter: makeSearchFilter("area", t("AREA")),
          cell: ({ row }: { row: Record<string, unknown> }) =>
            (row as unknown as PublishedDataRow).ar_name,
        },
        {
          id: "time_period",
          layout: { width: 110, minWidth: 110 },
          defaultWidth: 110,
          className: "td-text-cell",
          header: makeSortHeader("time_period", t("TIME_PERIOD")),
          filter: makeSearchFilter("time_period", t("TIME_PERIOD")),
          cell: ({ row }: { row: Record<string, unknown> }) =>
            (row as unknown as PublishedDataRow).tp_timeperiod,
        },
        {
          id: "data",
          layout: { width: 200, minWidth: 150 },
          defaultWidth: 200,
          className: "td-text-cell",
          header: makeSortHeader("data", t("DATA")),
          filterCell: (
            <div className="flex w-full items-center gap-0.5">
              <SelectField
                value={dataValueOp}
                onChange={(e) => {
                  const newOp = e.target.value;
                  setDataValueOp(newOp);
                  if (dataValueInput.trim()) {
                    handleDataFilterChange(newOp, dataValueInput);
                  }
                }}
                className="w-[60px] shrink-0 [&_button]:!h-7 [&_button]:!min-h-7 [&_button]:!px-1 [&_button]:!text-xs"
                aria-label="Operator"
                menuPortal
              >
                <option value="eq">=</option>
                <option value="neq">≠</option>
                <option value="gt">&gt;</option>
                <option value="gte">≥</option>
                <option value="lt">&lt;</option>
                <option value="lte">≤</option>
              </SelectField>
              <TextField
                type="number"
                fieldSize="sm"
                value={dataValueInput}
                onChange={(e) => {
                  const newVal = e.target.value;
                  setDataValueInput(newVal);
                  handleDataFilterChange(dataValueOp, newVal);
                }}
                placeholder={t("VALUE", "Value")}
                aria-label={t("DATA")}
                className="flex-1"
              />
            </div>
          ),
          cell: ({ row }: { row: Record<string, unknown> }) => {
            const r = row as unknown as PublishedDataRow;
            return r.formatted_dt_value ?? r.dt_value ?? "—";
          },
        },
        {
          id: "source",
          layout: { width: 200, minWidth: 100 },
          defaultWidth: 200,
          className: "td-text-cell",
          header: makeSortHeader("source", t("SOURCE")),
          filter: makeSearchFilter("source", t("SOURCE")),
          cell: ({ row }: { row: Record<string, unknown> }) =>
            (row as unknown as PublishedDataRow).src_name,
        },
        {
          id: "footnote",
          layout: { width: 150, minWidth: 80 },
          defaultWidth: 150,
          className: "td-text-cell",
          header: { kind: "label" as const, text: t("FOOTNOTE") },
          cell: ({ row }: { row: Record<string, unknown> }) => {
            const fn_text = (row as unknown as PublishedDataRow).fn_text;
            return (
              <span className="block min-w-0 truncate" title={fn_text || undefined}>
                {fn_text || "—"}
              </span>
            );
          },
        },
      ];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isGroupMode, activeAggregateBy, activeAgg, t, sortCol, sortDir, colSearch, handleSort, handleColSearchChange, dataValueOp, dataValueInput, handleDataFilterChange, page, pageSize]
  );

  // ── Guard (disabled — see permission guard comment above) ────────────────
  // if (!allowed) return null;

  // ── Derived display labels ───────────────────────────────────────────────
  const placeholder = t("SELECT");

  const filterButtonClass =
    "list-pick-trigger field-comp--sm flex h-8 w-full items-center justify-between gap-1 px-2 text-xs transition-colors border-border bg-surface hover:border-[color:color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]";

  const filterSummaryChipClass = "status-chip tone-pill--primary";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b-2 border-border bg-[color:color-mix(in_srgb,var(--color-primary)_5%,var(--color-surface))]">

        {/* Always-visible summary row */}
        <div className="flex items-center gap-2 px-4 py-2.5 text-xs border-b border-primary/15">
          <span className="material-icons !text-base text-primary">tune</span>
          <span className="font-bold text-primary tracking-wide">{t("FILTERS", "Filters")}</span>
          {selectedAreas.length > 0 && (
            <span className={filterSummaryChipClass}>
              {t("AREA")}: {selectedAreas.length}
            </span>
          )}
          {selectedIusItems.length > 0 && (
            <span className={filterSummaryChipClass}>
              {t("INDICATOR_UNIT_SUBGROUP", "IUS")}: {selectedIusItems.length}
            </span>
          )}
          {selectedTimePeriodItems.length > 0 && (
            <span className={filterSummaryChipClass}>
              {t("TIME_PERIOD")}: {selectedTimePeriodItems.length}
            </span>
          )}
          {selectedSources.length > 0 && (
            <span className={filterSummaryChipClass}>
              {t("SOURCE")}: {selectedSources.length}
            </span>
          )}
          {advIsmrd !== "" && (
            <span className={filterSummaryChipClass}>
              {t("ISMRD")}: {advIsmrd === "true" ? t("MRD_ONLY") : t("NON_MRD")}
            </span>
          )}
          {advIsPlannedValue !== "" && (
            <span className={filterSummaryChipClass}>
              {t("IS_PLANNED_VALUE")}: {advIsPlannedValue === "true" ? t("PLANNED") : t("ACTUAL")}
            </span>
          )}
          {advIstextualdata !== "" && (
            <span className={filterSummaryChipClass}>
              {t("IS_TEXTUAL_DATA")}: {advIstextualdata === "true" ? t("TEXTUAL") : t("NUMERIC")}
            </span>
          )}
          {advIsDefaultSubgroup !== "true" && (
            <span className={filterSummaryChipClass}>
              {t("IS_DEFAULT_SUBGROUP")}: {advIsDefaultSubgroup === "false" ? t("FALSE") : t("ALL")}
            </span>
          )}
          {advAggregateBy.length > 0 && (
            <span className={filterSummaryChipClass}>
              {t("AGGREGATE_BY")}: {advAggregateBy.length}
            </span>
          )}
          {advAgg.length > 0 && (
            <span className={filterSummaryChipClass}>
              {t("AGG_FUNCTIONS")}: {advAgg.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => setFilterBarOpen((prev) => !prev)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-primary hover:bg-primary/10"
            aria-label={filterBarOpen ? t("COLLAPSE_FILTERS", "Collapse filters") : t("EXPAND_FILTERS", "Expand filters")}
          >
            <span className="material-icons !text-sm">
              {filterBarOpen ? "expand_less" : "expand_more"}
            </span>
          </button>
        </div>

        {/* Collapsible dropdowns row */}
        {filterBarOpen && (
          <div className="flex flex-wrap items-end gap-2 px-4 py-3">

            {/* Area (required) */}
            <div className="flex min-w-[140px] flex-1 flex-col gap-0.5">
              <span className="text-xs font-semibold text-text">
                {t("AREA")}
                <span className="text-error ml-0.5">*</span>
              </span>
              <button
                type="button"
                onClick={() => setAreaModalOpen(true)}
                className={filterButtonClass}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
                  {selectedAreas.length === 0 ? (
                    <span className="truncate text-text-muted">{placeholder}</span>
                  ) : (
                    <>
                      <span className="truncate text-text">{selectedAreas[0].label}</span>
                      {selectedAreas.length > 1 && (
                        <span className="ml-0.5 inline-flex h-4 shrink-0 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
                          +{selectedAreas.length - 1}
                        </span>
                      )}
                    </>
                  )}
                </span>
                <span className="material-icons !text-sm shrink-0 text-text-muted" aria-hidden>
                  expand_more
                </span>
              </button>
            </div>

            {/* IUS (required) */}
            <div className="flex min-w-[160px] flex-[2] flex-col gap-0.5">
              <span className="text-xs font-semibold text-text">
                {t("INDICATOR_UNIT_SUBGROUP", "IUS")}
                <span className="text-error ml-0.5">*</span>
              </span>
              <button
                type="button"
                onClick={() => setIusModalOpen(true)}
                className={filterButtonClass}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
                  {selectedIusItems.length === 0 ? (
                    <span className="truncate text-text-muted">{placeholder}</span>
                  ) : (
                    <>
                      <span className="truncate text-text">{selectedIusItems[0].label}</span>
                      {selectedIusItems.length > 1 && (
                        <span className="ml-0.5 inline-flex h-4 shrink-0 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
                          +{selectedIusItems.length - 1}
                        </span>
                      )}
                    </>
                  )}
                </span>
                <span className="material-icons !text-sm shrink-0 text-text-muted" aria-hidden>
                  expand_more
                </span>
              </button>
            </div>

            {/* Time Period */}
            <div className="flex min-w-[140px] flex-1 flex-col gap-0.5">
              <span className="text-xs font-semibold text-text">{t("TIME_PERIOD")}</span>
              <button
                type="button"
                onClick={() => setTimePeriodModalOpen(true)}
                className={filterButtonClass}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
                  {selectedTimePeriodItems.length === 0 ? (
                    <span className="truncate text-text-muted">{placeholder}</span>
                  ) : (
                    <>
                      <span className="truncate text-text">{selectedTimePeriodItems[0].label}</span>
                      {selectedTimePeriodItems.length > 1 && (
                        <span className="ml-0.5 inline-flex h-4 shrink-0 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
                          +{selectedTimePeriodItems.length - 1}
                        </span>
                      )}
                    </>
                  )}
                </span>
                <span className="material-icons !text-sm shrink-0 text-text-muted" aria-hidden>
                  expand_more
                </span>
              </button>
            </div>

            {/* Source */}
            <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
              <span className="text-xs font-semibold text-text">{t("SOURCE")}</span>
              <div className="w-full">
                <MultiSelectDropdown
                  open={sourceOpen}
                  onOpenChange={setSourceOpen}
                  options={sourceOptions}
                  selectedValues={selectedSources}
                  onToggleValue={(v) =>
                    setSelectedSources((prev) =>
                      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
                    )
                  }
                  searchQuery={sourceSearch}
                  onSearchChange={setSourceSearch}
                  emptyLabel={placeholder}
                  menuPortal
                  autoWidth
                />
              </div>
            </div>

            {/* Advanced Filters button */}
            <div className="flex shrink-0 flex-col gap-0.5">
              <span className="text-xs invisible select-none">&nbsp;</span>
              <SecondaryButton
                type="button"
                onClick={openAdvDrawer}
                icon="tune"
                aria-label={t("ADVANCED_FILTERS")}
              >
                {t("ADVANCED_FILTERS")}
                {(advIsmrd !== "" || advIsPlannedValue !== "" || advIstextualdata !== "" ||
                  advIsDefaultSubgroup !== "true" || advAggregateBy.length > 0 || advAgg.length > 0) && (
                  <span className="ml-0.5 inline-flex h-4 shrink-0 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
                    {[advIsmrd, advIsPlannedValue, advIstextualdata,
                      advIsDefaultSubgroup !== "true" ? "x" : "",
                      ...advAggregateBy, ...advAgg].filter(Boolean).length}
                  </span>
                )}
              </SecondaryButton>
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 flex-col gap-0.5">
              <span className="text-xs invisible select-none">&nbsp;</span>
              <div className="flex gap-2">
              <PrimaryButton
                type="button"
                disabled={!selectedAreas.length || !selectedIusItems.length}
                onClick={() => {
                  try {
                    localStorage.setItem(
                      storageKey,
                      JSON.stringify({
                        areas: selectedAreas,
                        iusItems: selectedIusItems,
                        timePeriodItems: selectedTimePeriodItems,
                        sources: selectedSources,
                      })
                    );
                  } catch {}
                  setColSearch({});
                  setSortCol(null);
                  setSortDir(null);
                  setDataValueOp("gte");
                  setDataValueInput("");
                  doFetch(1, pageSize);
                  setSidebarCollapsed(true);
                }}
                icon="search"
              >
                {t("APPLY", "Apply")}
              </PrimaryButton>
              <PrimaryButton
                type="button"
                onClick={handleReset}
                icon="restart_alt"
              >
                {t("RESET")}
              </PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Data table ─────────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <InlineEditableTable
          wrapClassName="tbl-wrap h-full"
          thead={
            <thead>
              <EditableDataGridThead
                columns={columns as EditableGridColumnDef<unknown>[]}
                showFilterRow={true}
                allowResize={true}
              />
            </thead>
          }
          tbody={
            <ServerDrivenListTbody
              rows={rows}
              columns={columns as EditableGridColumnDef<unknown>[]}
              getRowId={(row) => {
                const nid = (row as PublishedDataRow).dt_nid;
                return nid != null ? String(nid) : JSON.stringify(row);
              }}
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
            onPageChange: (p) => doFetch(p, pageSize, currentFetchOpts()),
            onPageSizeChange: (ps) => {
              setPageSize(ps);
              doFetch(1, ps, currentFetchOpts());
            },
            resetPageOnPageSizeChange: false,
            countNoun: t("ROWS"),
          }}
        />
      </div>

      {/* ── Selection modals ───────────────────────────────────────────────── */}
      <AreaSelectionModal
        isOpen={areaModalOpen}
        onClose={() => setAreaModalOpen(false)}
        baseUrl={getDWAPIURL(dwId, "")}
        locale={locale}
        selectionMode="MULTIPLE"
        initialSelectedItems={selectedAreas}
        onApply={(items) => {
          setSelectedAreas(items);
          setAreaModalOpen(false);
        }}
      />
      <IndicatorSelectionModal
        isOpen={iusModalOpen}
        onClose={() => setIusModalOpen(false)}
        baseUrl={getDWAPIURL(dwId, "")}
        locale={locale}
        selectionMode="MULTIPLE"
        flatIusList
        initialSelectedItems={selectedIusItems}
        onApply={(items) => {
          setSelectedIusItems(items);
          setIusModalOpen(false);
        }}
      />
      <TimePeriodSelectionModal
        isOpen={timePeriodModalOpen}
        onClose={() => setTimePeriodModalOpen(false)}
        baseUrl={getDWAPIURL(dwId, "")}
        locale={locale}
        selectionMode="MULTIPLE"
        initialSelectedItems={selectedTimePeriodItems}
        onApply={(items) => {
          setSelectedTimePeriodItems(items);
          setTimePeriodModalOpen(false);
        }}
      />

      {/* ── Advanced Filters drawer ─────────────────────────────────────────── */}
      <Drawer
        open={advDrawerOpen}
        onClose={() => setAdvDrawerOpen(false)}
        title={t("ADVANCED_FILTERS")}
        width="360px"
        footer={
          <div className="flex gap-2">
            <SecondaryButton type="button" onClick={handleDrawerReset} icon="restart_alt">
              {t("RESET")}
            </SecondaryButton>
            <PrimaryButton type="button" onClick={handleDrawerApply} icon="check">
              {t("APPLY")}
            </PrimaryButton>
          </div>
        }
      >
        <div className="flex flex-col gap-5">

          {/* ismrd */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-text">{t("ISMRD")}</span>
            <p className="text-xs text-text">{t("ISMRD_DESC")}</p>
            <SelectField
              value={draftIsmrd}
              onChange={(e) => setDraftIsmrd(e.target.value as "true" | "false" | "")}
              menuPortal
            >
              <option value="">{t("ALL")}</option>
              <option value="true">{t("MRD_ONLY")}</option>
              <option value="false">{t("NON_MRD")}</option>
            </SelectField>
          </div>

          {/* isplannedvalue */}
          {/* <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-text">{t("IS_PLANNED_VALUE")}</span>
            <p className="text-xs text-text">{t("IS_PLANNED_VALUE_DESC")}</p>
            <SelectField
              value={draftIsPlannedValue}
              onChange={(e) => setDraftIsPlannedValue(e.target.value as "true" | "false" | "")}
              menuPortal
            >
              <option value="">{t("ALL")}</option>
              <option value="true">{t("PLANNED")}</option>
              <option value="false">{t("ACTUAL")}</option>
            </SelectField>
          </div> */}

          {/* istextualdata */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-text">{t("IS_TEXTUAL_DATA")}</span>
            <p className="text-xs text-text">{t("IS_TEXTUAL_DATA_DESC")}</p>
            <SelectField
              value={draftIstextualdata}
              onChange={(e) => setDraftIstextualdata(e.target.value as "true" | "false" | "")}
              menuPortal
            >
              <option value="">{t("ALL")}</option>
              <option value="true">{t("TEXTUAL")}</option>
              <option value="false">{t("NUMERIC")}</option>
            </SelectField>
          </div>

          {/* isdefaultsubgroup */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-text">{t("IS_DEFAULT_SUBGROUP")}</span>
            <p className="text-xs text-text">{t("IS_DEFAULT_SUBGROUP_DESC")}</p>
            <SelectField
              value={draftIsDefaultSubgroup}
              onChange={(e) => setDraftIsDefaultSubgroup(e.target.value as "true" | "false" | "all")}
              menuPortal
            >
              <option value="true">{t("TRUE")}</option>
              <option value="false">{t("FALSE")}</option>
              <option value="all">{t("ALL")}</option>
            </SelectField>
          </div>

          {/* aggregate_by */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-text">{t("AGGREGATE_BY")}</span>
            <p className="text-xs text-text">{t("AGGREGATE_BY_DESC")}</p>
            <MultiSelectDropdown
              open={aggByDropdownOpen}
              onOpenChange={setAggByDropdownOpen}
              options={aggByOptions}
              selectedValues={draftAggregateBy}
              onToggleValue={(v) =>
                setDraftAggregateBy((prev) => {
                  const next = prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v];
                  if (next.length === 0) setDraftAgg([]);
                  return next;
                })
              }
              searchQuery={aggBySearch}
              onSearchChange={setAggBySearch}
              emptyLabel={t("SELECT")}
              menuPortal
            />
          </div>

          {/* agg */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-text">{t("AGG_FUNCTIONS")}</span>
            <p className="text-xs text-text">{t("AGG_FUNCTIONS_DESC")}</p>
            {/* {draftAggregateBy.length === 0 && (
              <p className="text-xs text-text-muted">{t("AGG_FUNCTIONS_DISABLED_HINT")}</p>
            )} */}
            <MultiSelectDropdown
              open={aggFnsDropdownOpen}
              onOpenChange={setAggFnsDropdownOpen}
              options={aggFnOptions}
              selectedValues={draftAgg}
              onToggleValue={(v) =>
                setDraftAgg((prev) =>
                  prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
                )
              }
              searchQuery={aggFnsSearch}
              onSearchChange={setAggFnsSearch}
              emptyLabel={t("SELECT")}
              disabled={draftAggregateBy.length === 0}
              menuPortal
              placement="top"
            />
          </div>

        </div>
      </Drawer>
    </div>
  );
}
