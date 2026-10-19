"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useCore } from "@/contexts/CoreContext";
import { SelectField, type SelectFieldOption } from "@/components/SelectField";
import { MultiSelectDropdown, type MultiSelectOption } from "@/components/MultiSelectDropdown";
import { DatasetListTable } from "@/components/dataEntry/DatasetListTable";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { EChart } from "@/components/charts/EChart";
import type { EChartsOption, BarSeriesOption } from "echarts";
import { getRequest } from "@/lib/api/http";
import {
  getDWAPIURL,
  REFERENCE_PATH_TIME_PERIODS,
  REFERENCE_PATH_AREAS,
  REFERENCE_PATH_AREA_LEVELS,
  REFERENCE_PATH_DATASET,
  REPORT_OPERATIONAL_DASHBOARD,
} from "@/lib/constants";
import { buildListRequestUrl } from "@/components/TableView";
import { Loader } from "@/components/Loader";
import { formatDateString } from "@/services/utils";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import type {
  WorkflowListItem,
  DataEntryGetResult,
  WorkflowAreaLevelRaw,
  DatasetListItem,
  OperationalDashboardResponse,
  OperationalDashboardAreaRow,
  OperationalDashboardDatasetItem,
  OperationalDashboardResult,
} from "@/lib/api/types";

// Number of columns in the area table (used by the expandable row colSpan).
const AREA_TABLE_COLS = 10;

// Cap the table / completeness charts to ~20 rows, then scroll inside the box —
// keeps the page usable when a workflow has tens of thousands of areas.
const ROWS_BEFORE_SCROLL = 20;
// Approximate pixel heights used to size the scroll boxes for ~20 rows.
const TABLE_ROW_PX = 41; // one data row (px-4 py-2.5)
const TABLE_HEADER_PX = 38; // sticky header row
const CHART_ROW_PX = 38; // one bar row (h-7 + gap-2.5)
const TABLE_MAX_H = TABLE_HEADER_PX + ROWS_BEFORE_SCROLL * TABLE_ROW_PX;
const CHART_MAX_H = ROWS_BEFORE_SCROLL * CHART_ROW_PX;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function completenessBarColor(pct: number): string {
  if (pct >= 100) return "var(--color-success)";
  if (pct >= 75) return "var(--color-warning)";
  return "var(--color-error)";
}

// ── Completeness chart (ECharts) helpers ───────────────────────────────────

// One bar row in the completeness charts (≈ height per category + padding).
const ECHART_BAR_PX = 30;
const ECHART_MIN_H = 140;
const ECHART_TOP_PX = 44; // legend + grid top padding

// Resolve a CSS custom property to a concrete color string (ECharts gradients
// can't read CSS vars). Falls back to the supplied value during SSR.
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function toRgb(color: string): [number, number, number] | null {
  const c = color.trim();
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split("").map((h) => h + h).join("");
    if (hex.length !== 6) return null;
    const n = parseInt(hex, 16);
    if (Number.isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map((p) => parseFloat(p));
    if (parts.length >= 3 && parts.slice(0, 3).every((p) => !Number.isNaN(p))) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  return null;
}

/** Mix a color toward white by `amount` (0–1) for the glossy top of a bar. */
function lighten(color: string, amount: number): string {
  const rgb = toRgb(color);
  if (!rgb) return color;
  const [r, g, b] = rgb.map((v) => Math.round(v + (255 - v) * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Vertical lighter→base gradient that gives a flat bar a raised, 3D feel. */
function depthGradient(base: string) {
  return {
    type: "linear" as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: lighten(base, 0.4) },
      { offset: 1, color: base },
    ],
  };
}

type CompletenessRow = {
  area_nid: number;
  area_name: string;
  completeness_pct: number | null;
};

/** Which color bucket a completeness percentage falls into. */
function completenessBucket(pct: number): "complete" | "partly" | "incomplete" {
  if (pct >= 100) return "complete";
  if (pct >= 75) return "partly";
  return "incomplete";
}

/**
 * Build the horizontal-bar ECharts option for a completeness chart.
 *
 * Default (bucketed) mode: each area's value lands in exactly one of three
 * stacked, color-coded series so the built-in legend toggles a whole color
 * bucket on/off (req 2). Pass `singleColor` instead to render every bar in one
 * color with no legend (used by the by-parent "Completeness by States" chart).
 *
 * Bars use a lighter→base gradient + shadow for depth (req 3) and a per-item
 * tooltip shows the area name + value on hover (req 3).
 */
function buildCompletenessOption(opts: {
  rows: CompletenessRow[];
  legendLabels: { complete: string; partly: string; incomplete: string };
  textColor: string;
  axisColor: string;
  splitColor: string;
  emphasizedNids?: Set<number>;
  emphasizeColor?: string;
  /** When set, render a single series in this color with no bucket legend. */
  singleColor?: string;
}): EChartsOption {
  const {
    rows,
    legendLabels,
    textColor,
    axisColor,
    splitColor,
    emphasizedNids,
    emphasizeColor,
    singleColor,
  } = opts;

  const colors = {
    complete: cssVar("--color-success", "#16a34a"),
    partly: cssVar("--color-warning", "#d97706"),
    incomplete: cssVar("--color-error", "#dc2626"),
  };

  // ECharts category axis renders bottom-up; reverse so the first row sits on top.
  const ordered = [...rows].reverse();

  const categories = ordered.map((r) => {
    const emphasized = emphasizedNids?.has(r.area_nid);
    return emphasized
      ? { value: r.area_name, textStyle: { fontWeight: 700, color: emphasizeColor ?? textColor } }
      : r.area_name;
  });

  const barLabel: BarSeriesOption["label"] = {
    show: true,
    position: "right",
    color: textColor,
    fontWeight: 700,
    fontSize: 11,
    formatter: (p) => (p.value === "-" || p.value == null ? "" : `${p.value}%`),
  };
  const barDepth: BarSeriesOption["itemStyle"] = {
    borderRadius: [0, 5, 5, 0],
    shadowBlur: 6,
    shadowColor: "rgba(0,0,0,0.18)",
    shadowOffsetY: 2,
  };

  const bucketData = (bucket: "complete" | "partly" | "incomplete") =>
    ordered.map((r) =>
      r.completeness_pct != null && completenessBucket(r.completeness_pct) === bucket
        ? Math.round(r.completeness_pct)
        : "-",
    );

  const seriesFor = (
    name: string,
    bucket: "complete" | "partly" | "incomplete",
    base: string,
  ): BarSeriesOption => ({
    name,
    type: "bar",
    stack: "total",
    barWidth: "62%",
    barMaxWidth: 22,
    data: bucketData(bucket),
    itemStyle: { color: depthGradient(base), ...barDepth },
    label: barLabel,
  });

  // Single-color (by-parent) chart: one series, every bar in `singleColor`.
  const singleSeries: BarSeriesOption[] = [
    {
      type: "bar",
      barWidth: "62%",
      barMaxWidth: 22,
      data: ordered.map((r) =>
        r.completeness_pct != null ? Math.round(r.completeness_pct) : "-",
      ),
      itemStyle: { color: depthGradient(singleColor ?? colors.incomplete), ...barDepth },
      label: barLabel,
    },
  ];

  return {
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        const name = p?.name ?? "";
        const value = p?.value;
        return value === "-" || value == null ? `${name}` : `${name}: <b>${value}%</b>`;
      },
    },
    legend: singleColor
      ? { show: false }
      : {
          data: [legendLabels.complete, legendLabels.partly, legendLabels.incomplete],
          top: 6,
          itemWidth: 12,
          itemHeight: 12,
          icon: "roundRect",
          textStyle: { color: textColor, fontSize: 11 },
        },
    grid: { left: 8, right: 48, top: ECHART_TOP_PX, bottom: 8, containLabel: true },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { color: axisColor, fontSize: 10, formatter: "{value}%" },
      splitLine: { lineStyle: { color: splitColor } },
    },
    yAxis: {
      type: "category",
      data: categories,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: splitColor } },
      axisLabel: { color: axisColor, fontSize: 11 },
    },
    series: singleColor
      ? singleSeries
      : [
          seriesFor(legendLabels.complete, "complete", colors.complete),
          seriesFor(legendLabels.partly, "partly", colors.partly),
          seriesFor(legendLabels.incomplete, "incomplete", colors.incomplete),
        ],
  };
}

/** A clickable summary tile that toggles the matching reporting-status filter. */
function StatusTile({
  label,
  count,
  total,
  valueClass,
  value,
  selected,
  onToggle,
  minWidthClass,
  activeLabel,
}: {
  label: string;
  count: number;
  total: number;
  valueClass: string;
  value: string;
  selected: boolean;
  onToggle: (value: string) => void;
  minWidthClass: string;
  activeLabel: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onToggle(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(value);
        }
      }}
      className={`card flex flex-col gap-1 px-4 py-3 flex-1 cursor-pointer transition-shadow hover:shadow-md ${minWidthClass} ${
        selected ? "ring-2 ring-[color:var(--color-primary)]" : ""
      }`}
    >
      <span className="text-xs text-text-muted whitespace-nowrap">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className={`text-3xl font-bold ${valueClass}`}>{count}</span>
        <span className="text-sm text-text-muted">/ {total}</span>
      </div>
      {selected && (
        <span className="label-tag tone-pill--success self-end !text-[10px] !px-1.5 !py-0">
          {activeLabel}
        </span>
      )}
    </div>
  );
}

/** Map an API dataset item into the shape DatasetListTable expects. */
function toDatasetListItem(
  ds: OperationalDashboardDatasetItem,
  area: OperationalDashboardAreaRow,
  dwId: string,
  workflowId: string,
): DatasetListItem {
  return {
    dataset_id: ds.dataset_id,
    dataset_gid: ds.dataset_gid,
    dataset_name: ds.dataset_name,
    dw_id: Number(dwId) || 0,
    workflow_id: Number(workflowId) || 0,
    dataset_status: ds.dataset_status,
    area_nids: [area.area_nid],
    timeperiod_nids: ds.timeperiod_nid != null ? [ds.timeperiod_nid] : [],
    data_point_count: ds.area_dp_total,
    missing_data_count: ds.area_dp_missing,
    created: ds.created ?? null,
    submitted_at: ds.submitted_at ?? null,
    submitted_by_username: ds.submitted_by_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function OperationalDashboardPage() {
  const { t } = useCore();
  const params = useParams<{ locale: string; dw_id: string }>();
  const dwId = readParam(params?.dw_id);

  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.dataManagement.dataReview, {
    parentResourceCode: DW_ROUTE_PERMISSIONS.dataManagement.parent,
  });

  // ── Workflow dropdown (fetched; only allow_review: true) ──────────────────
  const [workflowOptions, setWorkflowOptions] = useState<SelectFieldOption[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [workflowsLoaded, setWorkflowsLoaded] = useState(false);

  // ── Time Period dropdown (fetched) ────────────────────────────────────────
  const [timePeriodOptions, setTimePeriodOptions] = useState<SelectFieldOption[]>([]);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState("");

  // ── Area-level label map (level → name, e.g. 2 → "Area") ──────────────────
  const [levelNameMap, setLevelNameMap] = useState<Map<number, string>>(new Map());
  const [workflowAreaLevel, setWorkflowAreaLevel] = useState<number | null>(null);

  // ── Area dropdown (level-wise; one level above the workflow's area level) ──
  const [areaOptions, setAreaOptions] = useState<MultiSelectOption[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [areaMenuOpen, setAreaMenuOpen] = useState(false);
  const [areaSearch, setAreaSearch] = useState("");

  // ── "Dataset with Areas" toggle (drives the only_assigned_areas query param) ──
  const [datasetWithAreas, setDatasetWithAreas] = useState(true);

  // ── Mount: workflows + area-level labels ──────────────────────────────────
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
      if (opts.length > 0) setSelectedWorkflow(String(opts[0].value));
      setWorkflowsLoaded(true);
    });
    void getRequest(getDWAPIURL(dwId, REFERENCE_PATH_AREA_LEVELS), undefined, {
      suppressErrorMessage: true,
    }).then((res) => {
      const raw = Array.isArray(res?.data) ? (res.data as WorkflowAreaLevelRaw[]) : [];
      const map = new Map<number, string>();
      for (const lvl of raw) map.set(Number(lvl.al_level), String(lvl.al_name));
      setLevelNameMap(map);
    });
  }, [dwId]);

  // ── Workflow-dependent: config → time periods + areas ─────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!dwId || !selectedWorkflow) {
        setAreaOptions([]);
        setSelectedAreas([]);
        setTimePeriodOptions([]);
        setSelectedTimePeriod("");
        setWorkflowAreaLevel(null);
        return;
      }
      // 1. Resolve the selected workflow's data-entry config.
      const cfgUrl = `${getDWAPIURL(dwId, REFERENCE_PATH_DATASET)}/workflow/${encodeURIComponent(
        selectedWorkflow,
      )}?include_workflow=false`;
      const cfg = (await getRequest(cfgUrl, undefined, {
        suppressErrorMessage: true,
      })) as DataEntryGetResult;
      if (cancelled) return;
      const areaLevel = cfg?.success === true && cfg.data ? Number(cfg.data.area_level) : NaN;
      const currTimeperiodNid =
        cfg?.success === true && cfg.data ? Number(cfg.data.curr_timeperiod_nid ?? NaN) : NaN;
      const timeperiodFrequency =
        cfg?.success === true && cfg.data ? cfg.data.timeperiod_frequency : null;
      setWorkflowAreaLevel(Number.isFinite(areaLevel) ? Math.floor(areaLevel) : null);

      // 2. Time periods: current + previous (page_size 2, capped at the current nid),
      //    scoped to the workflow's reporting frequency.
      const tpUrl = buildListRequestUrl(getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS), {
        page_size: 2,
        max_timeperiod_nid: Number.isFinite(currTimeperiodNid) ? currTimeperiodNid : undefined,
        timeperiod_frequency: timeperiodFrequency || undefined,
        sort_field: "enddate",
        sort_order: "desc",
      });
      const tpRes = await getRequest(tpUrl, undefined, { suppressErrorMessage: true });
      if (cancelled) return;
      const tpRaw = Array.isArray(tpRes?.data) ? (tpRes.data as Record<string, unknown>[]) : [];
      const tpOpts = tpRaw
        .map((tp) => ({
          value: String(tp.tp_nid ?? tp.nid ?? ""),
          label: String(tp.tp_timeperiod ?? tp.label ?? ""),
        }))
        .filter((o) => o.value && o.label);
      setTimePeriodOptions(tpOpts);
      const currentValue = String(currTimeperiodNid);
      const current = tpOpts.find((o) => o.value === currentValue);
      setSelectedTimePeriod(current?.value ?? tpOpts[0]?.value ?? "");

      // 3. Areas one level ABOVE the workflow's area level (parent level).
      const parentLevel =
        Number.isFinite(areaLevel) && areaLevel > 1 ? Math.floor(areaLevel) - 1 : NaN;
      if (!Number.isFinite(parentLevel) || parentLevel < 1) {
        setAreaOptions([]);
        setSelectedAreas([]);
        return;
      }
      const areasUrl = buildListRequestUrl(getDWAPIURL(dwId, REFERENCE_PATH_AREAS), {
        hierarchical: false,
        level: parentLevel,
        sort_order: "asc",
        sort_field: "level",
        page: 1,
        page_size: 1000,
      });
      const areasRes = await getRequest(areasUrl);
      if (cancelled) return;
      const raw = Array.isArray(areasRes?.data) ? (areasRes.data as Record<string, unknown>[]) : [];
      const opts = raw
        .map((a) => ({
          value: String(a.ar_nid ?? a.ar_id ?? ""),
          label: String(a.ar_name ?? a.ar_id ?? ""),
        }))
        .filter((o) => o.value && o.label)
        .sort((a, b) => a.label.localeCompare(b.label));
      setAreaOptions(opts);
      setSelectedAreas([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [dwId, selectedWorkflow]);

  // ── Operational dashboard data (workflow + time period scoped) ────────────
  const [dashboard, setDashboard] = useState<OperationalDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!dwId || !selectedWorkflow) {
      setDashboard(null);
      setDashboardError(null);
      setDashboardLoading(false);
      return;
    }
    setDashboardLoading(true);
    setDashboardError(null);
    const url = buildListRequestUrl(getDWAPIURL(dwId, REPORT_OPERATIONAL_DASHBOARD), {
      workflow_id: selectedWorkflow,
      timeperiod_identifier: selectedTimePeriod || undefined,
      only_assigned_areas: datasetWithAreas,
    });
    void (async () => {
      try {
        const res = (await getRequest(url, undefined, {
          suppressErrorMessage: true,
        })) as OperationalDashboardResult;
        if (cancelled) return;
        if (res?.success === true && res.data) {
          setDashboard(res.data);
        } else {
          setDashboard(null);
          setDashboardError(res?.err_message ?? res?.message ?? "Failed to load data");
        }
      } catch {
        if (cancelled) return;
        setDashboard(null);
        setDashboardError("Failed to load data");
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dwId, selectedWorkflow, selectedTimePeriod, datasetWithAreas]);

  // ── Dynamic area-level labels (prefer response, fall back to level map) ───
  const areaLevelLabel =
    dashboard?.area_level_name ??
    (workflowAreaLevel != null ? levelNameMap.get(workflowAreaLevel) : undefined) ??
    t("AREA", "Area");
  const parentAreaLevelLabel =
    dashboard?.parent_level_name ??
    (workflowAreaLevel != null ? levelNameMap.get(workflowAreaLevel - 1) : undefined) ??
    t("REGION", "Region");

  // ── Reporting-status dropdown options (translated) ────────────────────────
  const statusOptions = useMemo<SelectFieldOption[]>(
    () => [
      { value: "", label: t("ALL_STATUSES", "All statuses") },
      { value: "submitted", label: t("SUBMITTED_DATASET", "Submitted Dataset") },
      { value: "not_submitted", label: t("DRAFT", "Draft") },
      { value: "under_review", label: t("UNDER_REVIEW", "Under review") },
      { value: "returned", label: t("RETURNED_FOR_REVISION", "Returned for Revision") },
      { value: "approved", label: t("APPROVED", "Approved") },
    ],
    [t],
  );

  // ── Client-side filter state ──────────────────────────────────────────────
  const [selectedStatus, setSelectedStatus] = useState("");
  // Toggle the reporting-status filter (clicking the active tile clears it).
  const toggleStatus = (value: string) =>
    setSelectedStatus((prev) => (prev === value ? "" : value));
  const selectedStatusLabel =
    statusOptions.find((o) => o.value === selectedStatus && o.value !== "")?.label ?? "";

  // ── Total areas at the workflow's level (denominator for "shown") ─────────
  const totalAreas = dashboard?.areas.length ?? 0;

  // ── Filtered rows (client-side area + reporting-status filters) ───────────
  const filteredRows = useMemo<OperationalDashboardAreaRow[]>(() => {
    const rows = dashboard?.areas ?? [];
    const selectedAreaNames = selectedAreas
      .map((v) => areaOptions.find((o) => o.value === v)?.label)
      .filter((l): l is string => !!l);
    return rows.filter((row) => {
      if (selectedAreaNames.length > 0 && !selectedAreaNames.includes(row.parent_area_name ?? ""))
        return false;
      if (selectedStatus === "submitted" && row.submitted_dataset_count === 0) return false;
      if (selectedStatus === "not_submitted" && row.draft_count === 0) return false;
      if (selectedStatus === "under_review" && row.under_review_count === 0) return false;
      if (selectedStatus === "returned" && row.returned_count === 0) return false;
      if (selectedStatus === "approved" && row.approved_count === 0) return false;
      return true;
    });
  }, [dashboard, selectedAreas, areaOptions, selectedStatus]);

  // ── Expandable row state (keyed by area_nid) ──────────────────────────────
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const expandedArea = useMemo(
    () => (dashboard?.areas ?? []).find((a) => a.area_nid === expandedRowId) ?? null,
    [dashboard, expandedRowId],
  );
  const expandedDatasets = useMemo<DatasetListItem[]>(
    () =>
      expandedArea
        ? expandedArea.datasets.map((ds) =>
            toDatasetListItem(ds, expandedArea, dwId, selectedWorkflow),
          )
        : [],
    [expandedArea, dwId, selectedWorkflow],
  );
  const expandedAreaNameMap = useMemo(() => {
    const map = new Map<number, string>();
    if (expandedArea) map.set(expandedArea.area_nid, expandedArea.area_name);
    return map;
  }, [expandedArea]);
  const expandedTimePeriodNameMap = useMemo(() => {
    const map = new Map<number, string>();
    const nid = dashboard?.selected_timeperiod_nid;
    if (nid != null) {
      const opt = timePeriodOptions.find((o) => o.value === String(nid));
      map.set(nid, typeof opt?.label === "string" ? opt.label : String(nid));
    }
    return map;
  }, [dashboard, timePeriodOptions]);

  // ── Summary stats (straight from the API summary block) ───────────────────
  const stats = useMemo(() => {
    const s = dashboard?.summary;
    const areas = dashboard?.areas ?? [];
    return {
      total:           s?.expected_districts ?? 0,
      activeDistricts: areas.filter((a) => a.submitted_dataset_count > 0).length,
      totalDatasets:   s?.total_datasets ?? 0,
      submitted:       s?.submitted_datasets ?? 0,
      notSubmitted:    s?.not_submitted ?? 0,
      underReview:     s?.under_review ?? 0,
      returned:        s?.returned_for_revision ?? 0,
      approved:        s?.approved ?? 0,
    };
  }, [dashboard]);

  // ── Completeness charts — straight from the API (pre-sorted by the backend) ─
  // by district = completeness_by_district, by state = completeness_by_state.
  const chartRows = useMemo(
    () => dashboard?.completeness_by_district ?? [],
    [dashboard],
  );
  const chartRegions = useMemo(
    () => dashboard?.completeness_by_state ?? [],
    [dashboard],
  );

  // Map each district area_nid → its parent (state) area_nid, so the top-bar
  // Area filter (which holds parent-level nids) can also scope the by-district chart.
  const districtParentNidMap = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const a of dashboard?.areas ?? []) {
      map.set(a.area_nid, a.parent_area_nid ?? null);
    }
    return map;
  }, [dashboard]);

  // ── Completeness charts scoped by the top Area filter ─────────────────────
  // No selection → show everything; otherwise keep only the selected parents
  // (by-state) and the districts beneath them (by-district).
  const filteredChartRows = useMemo(() => {
    if (selectedAreas.length === 0) return chartRows;
    const selectedNids = new Set(selectedAreas.map(Number));
    return chartRows.filter((row) => {
      const parentNid = districtParentNidMap.get(row.area_nid);
      return parentNid != null && selectedNids.has(parentNid);
    });
  }, [chartRows, selectedAreas, districtParentNidMap]);

  // The by-parent (Level-1) chart always shows every parent area regardless of
  // the top Area filter; selected parents are highlighted via their label instead.
  const selectedRegionNids = useMemo(
    () => new Set(selectedAreas.map(Number)),
    [selectedAreas],
  );

  // ── Completeness chart options (ECharts) ──────────────────────────────────
  const legendLabels = useMemo(
    () => ({
      complete: t("LEGEND_100_COMPLETE", "100% complete"),
      partly: t("LEGEND_75_99_PARTLY", "75–99% partly"),
      incomplete: t("LEGEND_BELOW_75_INCOMPLETE", "Below 75% incomplete"),
    }),
    [t],
  );

  const districtChartOption = useMemo<EChartsOption>(
    () =>
      buildCompletenessOption({
        rows: filteredChartRows,
        legendLabels,
        textColor: cssVar("--color-text", "#1f2937"),
        axisColor: cssVar("--color-text-muted", "#6b7280"),
        splitColor: cssVar("--color-border", "#e5e7eb"),
      }),
    [filteredChartRows, legendLabels],
  );

  const regionChartOption = useMemo<EChartsOption>(
    () =>
      buildCompletenessOption({
        rows: chartRegions,
        legendLabels,
        textColor: cssVar("--color-text", "#1f2937"),
        axisColor: cssVar("--color-text-muted", "#6b7280"),
        splitColor: cssVar("--color-border", "#e5e7eb"),
        emphasizedNids: selectedRegionNids,
        emphasizeColor: cssVar("--color-primary", "#2563eb"),
        singleColor: cssVar("--color-primary", "#2563eb"),
      }),
    [chartRegions, legendLabels, selectedRegionNids],
  );

  const districtChartHeight = Math.max(
    ECHART_MIN_H,
    ECHART_TOP_PX + filteredChartRows.length * ECHART_BAR_PX,
  );
  const regionChartHeight = Math.max(
    ECHART_MIN_H,
    ECHART_TOP_PX + chartRegions.length * ECHART_BAR_PX,
  );

  // ── "Last updated" = most recent area update across the dashboard ─────────
  const lastUpdatedLabel = useMemo(() => {
    let max: string | null = null;
    for (const r of dashboard?.areas ?? []) {
      if (r.last_updated && (max === null || r.last_updated > max)) max = r.last_updated;
    }
    return max ? formatDateString(max) : null;
  }, [dashboard]);

  const areaEmptyLabel = `${t("ALL", "All")} ${parentAreaLevelLabel}`;

  if (!allowed) return null;

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

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b-2 border-border bg-[color:color-mix(in_srgb,var(--color-primary)_5%,var(--color-surface))]">
        <div className="flex flex-wrap items-end gap-4 px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text">
              {t("WORKFLOW", "Workflow")}
            </span>
            <div className="w-[200px]">
              <SelectField
                options={workflowOptions}
                value={selectedWorkflow}
                onChange={(e) => setSelectedWorkflow(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text">
              {t("TIME_PERIOD", "Time Period")}
            </span>
            <div className="w-[160px]">
              <SelectField
                options={timePeriodOptions}
                value={selectedTimePeriod}
                onChange={(e) => setSelectedTimePeriod(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text">
              {t("AREA", "Area")}
            </span>
            <div className="w-[180px]">
              <MultiSelectDropdown
                open={areaMenuOpen}
                onOpenChange={setAreaMenuOpen}
                options={areaOptions}
                selectedValues={selectedAreas}
                onToggleValue={(value) =>
                  setSelectedAreas((prev) =>
                    prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
                  )
                }
                searchQuery={areaSearch}
                onSearchChange={setAreaSearch}
                emptyLabel={areaEmptyLabel}
                searchPlaceholder={`${t("SEARCH", "Search")}...`}
                menuPortal
                showSelectAll
                selectAllLabel={t("SELECT_ALL", "Select All")}
                deselectAllLabel={t("DESELECT_ALL", "Deselect All")}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text">
              {t("REPORTING_STATUS", "Reporting Status")}
            </span>
            <div className="w-[180px]">
              <SelectField
                options={statusOptions}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text">
              {t("ONLY_AREAS_ASSIGNED", "Only Areas Assigned")}
            </span>
            <div className="flex h-8 items-center">
              <ToggleSwitch
                checked={datasetWithAreas}
                onCheckedChange={setDatasetWithAreas}
                aria-label={t("ONLY_AREAS_ASSIGNED", "Only Areas Assigned")}
              />
            </div>
          </div>
          {selectedStatusLabel && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold invisible" aria-hidden>
                ·
              </span>
              <div className="flex h-8 items-center gap-2">
                <span className="label-tag tone-pill--primary flex items-center gap-1">
                  {selectedStatusLabel}
                  <button
                    type="button"
                    aria-label={t("REMOVE", "Remove")}
                    onClick={() => setSelectedStatus("")}
                    className="flex items-center hover:opacity-70"
                  >
                    <span className="material-icons !text-sm">close</span>
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedStatus("")}
                  className="text-xs text-primary hover:underline"
                >
                  {t("CLEAR_ALL", "Clear all")}
                </button>
              </div>
            </div>
          )}
          {lastUpdatedLabel && (
            <div className="ml-auto flex items-center gap-1.5 self-center text-xs text-text-muted">
              <span className="h-2 w-2 rounded-full bg-success inline-block" />
              {t("LAST_UPDATED", "Last updated")}
              <span className="font-semibold text-text">{lastUpdatedLabel}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">

        {/* ── Stat cards ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 shrink-0">
          <div
            role="button"
            tabIndex={0}
            aria-pressed={selectedStatus === ""}
            onClick={() => setSelectedStatus("")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelectedStatus("");
              }
            }}
            className={`card flex flex-col gap-1 px-4 py-3 min-w-[150px] flex-1 cursor-pointer transition-shadow hover:shadow-md ${
              selectedStatus === "" ? "ring-2 ring-[color:var(--color-primary)]" : ""
            }`}
          >
            <span className="text-xs text-text-muted whitespace-nowrap">
              {t("EXPECTED", "Expected")} {areaLevelLabel}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text">{stats.activeDistricts}</span>
              <span className="text-sm text-text-muted">/ {stats.total}</span>
            </div>
            {selectedStatus === "" && (
              <span className="label-tag tone-pill--success self-end !text-[10px] !px-1.5 !py-0">
                {t("ACTIVE", "Active")}
              </span>
            )}
          </div>
          <div className="card flex flex-col gap-1 px-4 py-3 min-w-[140px] flex-1">
            <span className="text-xs text-text-muted whitespace-nowrap">{t("TOTAL_DATASETS", "Total Datasets")}</span>
            <span className="text-3xl font-bold text-text">{stats.totalDatasets}</span>
          </div>
          <StatusTile
            label={t("SUBMITTED_DATASET", "Submitted Dataset")}
            count={stats.submitted}
            total={stats.totalDatasets}
            valueClass="text-primary"
            value="submitted"
            selected={selectedStatus === "submitted"}
            onToggle={toggleStatus}
            minWidthClass="min-w-[140px]"
            activeLabel={t("ACTIVE", "Active")}
          />
          <StatusTile
            label={t("DRAFT", "Draft")}
            count={stats.notSubmitted}
            total={stats.totalDatasets}
            valueClass="text-error"
            value="not_submitted"
            selected={selectedStatus === "not_submitted"}
            onToggle={toggleStatus}
            minWidthClass="min-w-[140px]"
            activeLabel={t("ACTIVE", "Active")}
          />
          <StatusTile
            label={t("UNDER_REVIEW", "Under review")}
            count={stats.underReview}
            total={stats.totalDatasets}
            valueClass="text-warning"
            value="under_review"
            selected={selectedStatus === "under_review"}
            onToggle={toggleStatus}
            minWidthClass="min-w-[120px]"
            activeLabel={t("ACTIVE", "Active")}
          />
          <StatusTile
            label={t("RETURNED_FOR_REVISION", "Returned for Revision")}
            count={stats.returned}
            total={stats.totalDatasets}
            valueClass="text-warning"
            value="returned"
            selected={selectedStatus === "returned"}
            onToggle={toggleStatus}
            minWidthClass="min-w-[140px]"
            activeLabel={t("ACTIVE", "Active")}
          />
          <StatusTile
            label={t("APPROVED", "Approved")}
            count={stats.approved}
            total={stats.totalDatasets}
            valueClass="text-success"
            value="approved"
            selected={selectedStatus === "approved"}
            onToggle={toggleStatus}
            minWidthClass="min-w-[110px]"
            activeLabel={t("ACTIVE", "Active")}
          />
        </div>

        {/* ── Area reporting status table ──────────────────────────────────── */}
        <div className="card min-w-0 shrink-0">
          <div className="card__header justify-between">
            <span className="text-sm font-semibold text-text">
              {areaLevelLabel} {t("REPORTING_STATUS", "Reporting Status")}
            </span>
            <span className="text-xs text-text-muted">
              {filteredRows.length} {t("OF", "of")} {totalAreas} {t("SHOWN", "shown")}
            </span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: TABLE_MAX_H }}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted sticky top-0 z-10">
                  <th className="th-label w-8" />
                  <th className="th-label text-left">{areaLevelLabel}</th>
                  <th className="th-label text-left">{parentAreaLevelLabel}</th>
                  <th className="th-label text-right whitespace-nowrap">{t("SUBMITTED_DATASET", "Submitted Dataset")}</th>
                  <th className="th-label text-right">{t("APPROVED", "Approved")}</th>
                  <th className="th-label text-right whitespace-nowrap">{t("UNDER_REVIEW", "Under Review")}</th>
                  <th className="th-label text-right whitespace-nowrap">{t("RETURNED_FOR_REVISION", "Returned for Revision")}</th>
                  <th className="th-label text-right">{t("DRAFT", "Draft")}</th>
                  <th className="th-label">{t("COMPLETENESS", "Completeness")}</th>
                  <th className="th-label text-right">{t("UPDATED", "Updated")}</th>
                </tr>
              </thead>
              <tbody>
                {dashboardLoading && (
                  <tr>
                    <td colSpan={AREA_TABLE_COLS} className="py-10">
                      <div className="flex justify-center">
                        <Loader size={48} />
                      </div>
                    </td>
                  </tr>
                )}
                {!dashboardLoading && dashboardError && (
                  <tr>
                    <td colSpan={AREA_TABLE_COLS} className="py-10 text-center text-sm text-error">
                      {dashboardError}
                    </td>
                  </tr>
                )}
                {!dashboardLoading && !dashboardError && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={AREA_TABLE_COLS} className="py-10 text-center text-sm text-text-muted">
                      {t("NO_DATA_AVAILABLE", "No data available")}
                    </td>
                  </tr>
                )}
                {!dashboardLoading && !dashboardError && filteredRows.map((row) => {
                  const isExpanded = expandedRowId === row.area_nid;
                  const canExpand = row.datasets.length > 0;
                  return (
                    <Fragment key={row.area_nid}>
                      <tr
                        className={`border-b border-border transition-colors ${
                          canExpand ? "cursor-pointer hover:bg-primary-subtle" : ""
                        } ${isExpanded ? "bg-primary-subtle" : ""}`}
                        onClick={
                          canExpand
                            ? () => setExpandedRowId(isExpanded ? null : row.area_nid)
                            : undefined
                        }
                      >
                        <td className="px-2 py-2.5 text-center">
                          {canExpand && (
                            <span
                              className={`material-icons !text-base text-text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              aria-hidden
                            >
                              chevron_right
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-text whitespace-nowrap">
                          {row.area_name}{" "}
                          <span className="text-text-muted font-normal">({row.datasets.length})</span>
                        </td>
                        <td className="px-4 py-2.5 text-text-muted whitespace-nowrap text-xs">
                          {row.parent_area_name ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-text">
                          {row.submitted_dataset_count}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-text">
                          {row.approved_count}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-text">
                          {row.under_review_count}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-text">
                          {row.returned_count}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-text">
                          {row.draft_count}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.completeness_pct !== null ? (
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <div className="h-2 flex-1 rounded-full bg-border overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${row.completeness_pct}%`,
                                    backgroundColor: completenessBarColor(row.completeness_pct),
                                  }}
                                />
                              </div>
                              <span className="text-xs font-semibold w-9 text-right shrink-0 text-text">
                                {Math.round(row.completeness_pct)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-text-muted text-xs whitespace-nowrap">
                          {row.last_updated ? formatDateString(row.last_updated) : <span>—</span>}
                        </td>
                      </tr>
                      {isExpanded && canExpand && (
                        <tr key={`${row.area_nid}-expanded`} className="border-b border-border bg-surface-muted">
                          <td colSpan={AREA_TABLE_COLS} className="p-0">
                            {/* Auto height: grow to fit all dataset rows so the inner
                                table never scrolls. */}
                            <div className="flex flex-col bg-surface">
                              <DatasetListTable
                                t={t}
                                workflowSelected
                                isDataReview
                                reviewEnabled
                                showStatusFilter={false}
                                hideSearch
                                hideSelectColumn
                                hideActionsColumn
                                hideFooter
                                embeddedLayout
                                datasets={expandedDatasets}
                                datasetsLoading={false}
                                datasetsError={null}
                                statusFilter=""
                                onOpenDataset={() => {}}
                                onEditDataset={() => {}}
                                scopeArea="SINGLE"
                                scopeTimePeriod="SINGLE"
                                areaNameMap={expandedAreaNameMap}
                                timePeriodNameMap={expandedTimePeriodNameMap}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Completeness charts (side by side, 70% / 30%) ───────────────── */}
        {chartRows.length > 0 && (
          <div className="flex flex-col gap-4 lg:flex-row shrink-0">
            {/* Completeness by area level — click a legend swatch to filter that bucket */}
            <div className="card min-w-0 w-full lg:w-[70%]">
              <div className="card__header">
                <span className="text-sm font-semibold text-text">
                  {t("COMPLETENESS_BY", "Completeness by")} {areaLevelLabel}
                </span>
              </div>
              <div className="px-2 py-2 overflow-y-auto" style={{ maxHeight: CHART_MAX_H }}>
                {filteredChartRows.length === 0 ? (
                  <span className="block py-6 text-center text-xs text-text-muted">
                    {t("NO_DATA_AVAILABLE", "No data available")}
                  </span>
                ) : (
                  <EChart
                    option={districtChartOption}
                    style={{ height: districtChartHeight, width: "100%" }}
                  />
                )}
              </div>
            </div>

            {/* Completeness by parent area level */}
            <div className="card min-w-0 w-full lg:w-[30%]">
              <div className="card__header">
                <span className="text-sm font-semibold text-text">
                  {t("COMPLETENESS_BY", "Completeness by")} {parentAreaLevelLabel}
                </span>
              </div>
              <div className="px-2 py-2 overflow-y-auto" style={{ maxHeight: CHART_MAX_H }}>
                {chartRegions.length === 0 ? (
                  <span className="block py-6 text-center text-xs text-text-muted">
                    {t("NO_DATA_AVAILABLE", "No data available")}
                  </span>
                ) : (
                  <EChart
                    option={regionChartOption}
                    style={{ height: regionChartHeight, width: "100%" }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
