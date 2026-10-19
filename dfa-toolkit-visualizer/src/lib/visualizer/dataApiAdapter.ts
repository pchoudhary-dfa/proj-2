/**
 * Adapter: Data API response → VisualizerDataResponse (DataRow[] + cardinality).
 * Supports legacy (dv, s_gid/s_name) and new (dt_value/dt_text_value, sg_gid/sg_name) API row shapes.
 * Also: LineBarAreaData (gallery previewData) → rows for snapshot display.
 */

import type { DataApiRow, DataApiSubgroupMetaEntry, DataApiSuccessResponse } from "@/lib/api/data";
import type { LineBarAreaData } from "dfa-v6-comp-visualization";
import type {
  DataPoint,
  DataRow,
  DimensionCardinality,
  VisualizerDataResponse,
} from "@/lib/visualizer/types";

/** Parse string value to number for chart/table use; NaN if not numeric. Handles undefined/null. */
function parseDataValue(dv: string | undefined | null): number {
  if (dv == null || typeof dv !== "string") return NaN;
  const trimmed = dv.trim();
  if (trimmed === "" || trimmed === "-" || trimmed.toLowerCase() === "n/a") {
    return NaN;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : NaN;
}

/**
 * Resolve numeric value from a Data API row (new dt_value/dt_text_value or legacy dv).
 */
function rowValue(row: DataApiRow): number {
  if (row.dt_value != null && typeof row.dt_value === "number" && Number.isFinite(row.dt_value)) {
    return row.dt_value;
  }
  if (row.dt_is_textual && row.dt_text_value != null) {
    const parsed = parseDataValue(String(row.dt_text_value));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (row.dt_text_value != null && typeof row.dt_text_value === "string") {
    const parsed = parseDataValue(row.dt_text_value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  const fromDv = parseDataValue(row.dv);
  return Number.isNaN(fromDv) ? 0 : fromDv;
}

/**
 * Subgroup id/name: new API (sg_gid/sg_name) or legacy (s_gid/s_name).
 */
function subgroupFromRow(row: DataApiRow): { id: string; name: string } {
  const id = row.sg_gid ?? row.s_gid ?? "";
  const name = row.sg_name ?? row.s_name ?? id;
  return { id, name };
}

/**
 * Maps one Data API row to the visualizer DataRow shape.
 */
export function dataApiRowToDataRow(row: DataApiRow): DataRow {
  const subgroup = subgroupFromRow(row);
  const result: DataRow = {
    indicatorId: row.i_gid,
    indicatorName: row.i_name,
    subgroupId: subgroup.id,
    subgroupName: subgroup.name,
    areaId: (row.ar_id?.trim() || row.ar_gid) ?? "",
    areaName: row.ar_name,
    timePeriodId: row.tp_timeperiod,
    timePeriodName: row.tp_timeperiod,
    value: rowValue(row),
    unit: row.u_name || undefined,
  };
  const formatted = row.formatted_data_value ?? row.formatted_dt_value;
  if (formatted != null) {
    result.formattedValue = formatted;
  }
  if (row.u_format != null) {
    result.unitFormatCode = row.u_format;
  }
  return result;
}

/**
 * Builds DimensionCardinality from unique values in the data array.
 */
/** Build gid → display order from Data API meta.subgroup (or legacy sv_info). */
export function subgroupOrderByGidFromDataMeta(
  meta: DataApiSuccessResponse["meta"] | undefined
): Record<string, number | null> | undefined {
  if (!meta) return undefined;
  const raw = meta.subgroup ?? meta.sv_info;
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, number | null> = {};
  for (const entry of Object.values(raw) as DataApiSubgroupMetaEntry[]) {
    if (!entry || typeof entry !== "object") continue;
    const gid = entry.sv_gid?.trim();
    if (!gid) continue;
    const o = entry.sv_order;
    out[gid] = typeof o === "number" && Number.isFinite(o) ? o : null;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildCardinality(rows: DataRow[]): DimensionCardinality {
  const indicators = new Set(rows.map((r) => r.indicatorId));
  const subgroups = new Set(rows.map((r) => r.subgroupId));
  const areas = new Set(rows.map((r) => r.areaId));
  const timePeriods = new Set(rows.map((r) => r.timePeriodId));
  return {
    indicators: indicators.size,
    subgroups: subgroups.size,
    areas: areas.size,
    timePeriods: timePeriods.size,
  };
}

/**
 * Converts a successful Data API response to VisualizerDataResponse.
 * Uses data[] only; meta is available on the raw response if needed for labels.
 */
export function dataApiResponseToVisualizerDataResponse(
  response: DataApiSuccessResponse
): VisualizerDataResponse {
  const rows: DataRow[] = response.data.map(dataApiRowToDataRow);
  const cardinality = buildCardinality(rows);
  const subgroupOrderByGid = subgroupOrderByGidFromDataMeta(response.meta);
  return {
    cardinality,
    rows,
    meta: subgroupOrderByGid ? { subgroupOrderByGid } : undefined,
  };
}

export interface TimePeriodYearBounds {
  startYear: number;
  endYear: number;
}

/**
 * Parse year bounds from a time period string.
 * Supports:
 * - 2024
 * - 2023-2024
 * - Q1.2023
 * - Q1.2023-Q4.2024
 * - 2023.01
 * - 2023.01-2024.01
 * - 2023.01.02
 * - 2023.01.02 - 2024.05.03
 */
export function parseTimePeriodYearBounds(s: string): TimePeriodYearBounds {
  const text = String(s ?? "").trim();
  if (!text) {
    return { startYear: 0, endYear: 0 };
  }

  // Fast path for pure year (very common in existing datasets).
  const pureYear = text.match(/^((?:19|20)\d{2})$/);
  if (pureYear) {
    const y = parseInt(pureYear[1], 10);
    return { startYear: y, endYear: y };
  }

  // Generic path: extract all 4-digit years and take first/last as bounds.
  const years = [...text.matchAll(/(?:19|20)\d{2}/g)].map((m) => parseInt(m[0], 10));
  if (years.length === 0) {
    return { startYear: 0, endYear: 0 };
  }
  return {
    startYear: years[0],
    endYear: years[years.length - 1],
  };
}

/**
 * Parse a numeric year from a time period string for sorting/display.
 * Returns start year for range formats.
 */
export function parseYearFromTimePeriod(s: string): number {
  return parseTimePeriodYearBounds(s).startYear;
}

/** DataRow[] → legacy DataPoint[] for DataTableTab and export. */
function rowsToLegacyDataPoints(rows: DataRow[]): DataPoint[] {
  return rows.map((row) => ({
    year: parseYearFromTimePeriod(row.timePeriodId),
    value: row.value,
    area: row.areaName,
    subgroup: row.subgroupName,
    timePeriodId: row.timePeriodId,
    timePeriodName: row.timePeriodName,
  }));
}

/**
 * Converts Data API response data[] to legacy DataPoint[] for DataTableTab and export.
 */
export function dataApiResponseToLegacyDataPoints(
  response: DataApiSuccessResponse
): DataPoint[] {
  const rows = response.data.map(dataApiRowToDataRow);
  return rowsToLegacyDataPoints(rows);
}

/** Mapping shape used when converting LineBarAreaData back to rows (from VisualizationConfig.mapping). */
export interface SnapshotAxisMapping {
  xDimension: "time" | "indicator" | "subgroup" | "area";
  seriesDimension: "indicator" | "subgroup" | "area" | null;
  seriesDimension2?: "indicator" | "subgroup" | "area" | null;
}

/**
 * Converts LineBarAreaData (saved previewData) back to DataRow[] using indicator and axis mapping.
 * Used when displaying a snapshot on the visualizer so the chart and table can render from the same row source.
 */
export function lineBarAreaDataToRows(
  data: LineBarAreaData,
  indicator: { id: string; name: string },
  mapping: SnapshotAxisMapping
): DataRow[] {
  const { categories, series } = data;
  if (categories.length === 0 || series.length === 0) {
    return [];
  }
  const xDim = mapping.xDimension;
  const seriesDim = mapping.seriesDimension;
  const rows: DataRow[] = [];

  for (let catIdx = 0; catIdx < categories.length; catIdx++) {
    const xKey = categories[catIdx];
    const xLabel = xKey;

    for (let seriesIdx = 0; seriesIdx < series.length; seriesIdx++) {
      const s = series[seriesIdx];
      const value = s.values[catIdx] ?? 0;

      const areaId = seriesDim === "area" ? s.id : xDim === "area" ? xKey : "All";
      const areaName = seriesDim === "area" ? s.name : xDim === "area" ? xLabel : "All";
      const subgroupId = seriesDim === "subgroup" ? s.id : xDim === "subgroup" ? xKey : "Total";
      const subgroupName = seriesDim === "subgroup" ? s.name : xDim === "subgroup" ? xLabel : "Total";
      const timePeriodId = xDim === "time" ? xKey : "—";
      const timePeriodName = xDim === "time" ? xLabel : "—";
      const indicatorId = xDim === "indicator" ? xKey : indicator.id;
      const indicatorName = xDim === "indicator" ? xLabel : indicator.name;

      rows.push({
        indicatorId,
        indicatorName,
        subgroupId,
        subgroupName,
        areaId,
        areaName,
        timePeriodId,
        timePeriodName,
        value,
      });
    }
  }

  return rows;
}

/**
 * Converts gallery snapshot previewData to VisualizerDataResponse for the visualizer page.
 */
export function previewDataToVisualizerResponse(
  previewData: LineBarAreaData,
  indicator: { id: string; name: string },
  mapping: SnapshotAxisMapping
): VisualizerDataResponse {
  const rows = lineBarAreaDataToRows(previewData, indicator, mapping);
  const cardinality = buildCardinality(rows);
  return { cardinality, rows, meta: undefined };
}

/**
 * Converts gallery snapshot previewData to legacy DataPoint[] for DataTableTab and export.
 */
export function previewDataToLegacyDataPoints(
  previewData: LineBarAreaData,
  indicator: { id: string; name: string },
  mapping: SnapshotAxisMapping
): DataPoint[] {
  const rows = lineBarAreaDataToRows(previewData, indicator, mapping);
  return rowsToLegacyDataPoints(rows);
}
