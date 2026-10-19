import type { DataPoint, DataRow, Indicator, FilterValues } from "@/lib/visualizer/types";
import type { ExportPayload, ExportMeta, ExportIndicatorInfo } from "./types";
import { compareTimePeriodIds } from "@/lib/visualizer/timePeriodSort";

const DECIMAL_PLACES = 2;

function formatValue(v: number): number {
  return Number(v.toFixed(DECIMAL_PLACES));
}

// ---------------------------------------------------------------------------
// Time period helpers
// ---------------------------------------------------------------------------

interface TimePeriodEntry {
  id: string;
  name: string;
}

function collectSortedTimePeriods(rows: DataRow[]): TimePeriodEntry[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (!seen.has(r.timePeriodId)) {
      seen.set(r.timePeriodId, r.timePeriodName || r.timePeriodId);
    }
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => compareTimePeriodIds(a.id, b.id));
}

function getTimeRangeFromRows(rows: DataRow[]): { timeStart: number; timeEnd: number } | null {
  if (rows.length === 0) return null;
  const years = rows
    .map((r) => {
      const m = r.timePeriodId.match(/(?:19|20)\d{2}/);
      return m ? parseInt(m[0], 10) : NaN;
    })
    .filter(Number.isFinite);
  if (years.length === 0) return null;
  return { timeStart: Math.min(...years), timeEnd: Math.max(...years) };
}

// ---------------------------------------------------------------------------
// Cardinality detection — uses IUS-aware counting (indicator+unit+subgroup)
// ---------------------------------------------------------------------------

interface Cardinality {
  indicators: number;
  subgroups: number;
  areas: number;
  timePeriods: number;
  /** Unique (indicatorId, unit) pairs — detects same indicator with different units. */
  indicatorUnitPairs: number;
}

function computeCardinality(rows: DataRow[]): Cardinality {
  const iuPairs = new Set(rows.map((r) => `${r.indicatorId}\0${r.unit ?? ""}`));
  return {
    indicators: new Set(rows.map((r) => r.indicatorId)).size,
    subgroups: new Set(rows.map((r) => r.subgroupId)).size,
    areas: new Set(rows.map((r) => r.areaId)).size,
    timePeriods: new Set(rows.map((r) => r.timePeriodId)).size,
    indicatorUnitPairs: iuPairs.size,
  };
}

function isLegacyCase(c: Cardinality): boolean {
  return c.indicatorUnitPairs <= 1 && c.subgroups <= 1 && c.areas <= 1;
}

// ---------------------------------------------------------------------------
// Indicator info extraction — keyed by (indicatorId, unit) to avoid collision
// ---------------------------------------------------------------------------

function collectIndicatorInfo(rows: DataRow[]): ExportIndicatorInfo[] {
  const seen = new Map<string, ExportIndicatorInfo>();
  for (const r of rows) {
    const key = `${r.indicatorId}\0${r.unit ?? ""}`;
    if (!seen.has(key)) {
      seen.set(key, {
        name: r.indicatorName,
        code: r.indicatorId,
        unit: r.unit ?? "",
      });
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Legacy builder (I=1, S=1, A=1, single unit) — same shape as previous export
// ---------------------------------------------------------------------------

function buildLegacyPayload(rows: DataRow[], filters: FilterValues): ExportPayload | null {
  if (rows.length === 0) return null;

  const timePeriods = collectSortedTimePeriods(rows);
  const areas = [...new Set(rows.map((r) => r.areaName).filter(Boolean))].sort();
  const timeRange = getTimeRangeFromRows(rows);
  const indicators = collectIndicatorInfo(rows);
  const first = indicators[0];

  const headers = ["Region", ...timePeriods.map((tp) => tp.name)];

  const valueMap = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!valueMap.has(r.areaName)) valueMap.set(r.areaName, new Map());
    valueMap.get(r.areaName)!.set(r.timePeriodId, r.value);
  }

  const dataRows: (string | number)[][] = areas.map((area) => [
    area,
    ...timePeriods.map((tp) => {
      const v = valueMap.get(area)?.get(tp.id);
      return v !== undefined ? formatValue(v) : "";
    }),
  ]);

  const meta: ExportMeta = {
    mode: "legacy",
    indicators,
    indicatorName: first?.name ?? "Unknown indicator",
    indicatorCode: first?.code ?? "",
    unit: first?.unit ?? "",
    timeStart: timeRange?.timeStart ?? filters.timeStart ?? null,
    timeEnd: timeRange?.timeEnd ?? filters.timeEnd ?? null,
    areas: [...new Set(rows.map((r) => r.areaName))],
    subgroups: [...new Set(rows.map((r) => r.subgroupName))],
    exportedAt: new Date().toISOString(),
  };

  return { meta, headers, rows: dataRows };
}

// ---------------------------------------------------------------------------
// Multi-dimensional builder (any of I,S,A > 1 or multiple units)
// Descriptor columns: Indicator, Unit, Subgroup, Area + time period headers
// One row per unique (indicator, unit, subgroup, area) quad
// ---------------------------------------------------------------------------

interface DescriptorKey {
  indicatorId: string;
  indicatorName: string;
  unit: string;
  subgroupId: string;
  subgroupName: string;
  areaId: string;
  areaName: string;
}

function descriptorKeyStr(k: DescriptorKey): string {
  return `${k.indicatorId}\0${k.unit}\0${k.subgroupId}\0${k.areaId}`;
}

function buildMultiPayload(rows: DataRow[], filters: FilterValues): ExportPayload | null {
  if (rows.length === 0) return null;

  const timePeriods = collectSortedTimePeriods(rows);
  const timeRange = getTimeRangeFromRows(rows);
  const indicators = collectIndicatorInfo(rows);

  // Collect unique (indicator, unit, subgroup, area) quads in stable insertion order
  const quadMap = new Map<string, DescriptorKey>();
  for (const r of rows) {
    const dk: DescriptorKey = {
      indicatorId: r.indicatorId,
      indicatorName: r.indicatorName,
      unit: r.unit ?? "",
      subgroupId: r.subgroupId,
      subgroupName: r.subgroupName,
      areaId: r.areaId,
      areaName: r.areaName,
    };
    const key = descriptorKeyStr(dk);
    if (!quadMap.has(key)) quadMap.set(key, dk);
  }

  // Build value lookup: quadKey -> timePeriodId -> value
  const valueLookup = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = `${r.indicatorId}\0${r.unit ?? ""}\0${r.subgroupId}\0${r.areaId}`;
    if (!valueLookup.has(key)) valueLookup.set(key, new Map());
    valueLookup.get(key)!.set(r.timePeriodId, r.value);
  }

  const headers = ["Indicator", "Unit", "Subgroup", "Area", ...timePeriods.map((tp) => tp.name)];

  const dataRows: (string | number)[][] = [...quadMap.entries()].map(([key, dk]) => [
    dk.indicatorName,
    dk.unit,
    dk.subgroupName,
    dk.areaName,
    ...timePeriods.map((tp) => {
      const v = valueLookup.get(key)?.get(tp.id);
      return v !== undefined ? formatValue(v) : "";
    }),
  ]);

  const meta: ExportMeta = {
    mode: "multi",
    indicators,
    indicatorName: indicators.map((i) => i.name).join("; "),
    indicatorCode: indicators.map((i) => i.code).join("; "),
    unit: [...new Set(indicators.map((i) => i.unit).filter(Boolean))].join("; "),
    timeStart: timeRange?.timeStart ?? filters.timeStart ?? null,
    timeEnd: timeRange?.timeEnd ?? filters.timeEnd ?? null,
    areas: [...new Set(rows.map((r) => r.areaName))],
    subgroups: [...new Set(rows.map((r) => r.subgroupName))],
    exportedAt: new Date().toISOString(),
  };

  return { meta, headers, rows: dataRows };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds export payload from DataRow[] (the same rows the chart and Data tab use).
 * Automatically detects cardinality and picks the right layout:
 *   - Legacy (single IUS, single area): Region + time columns, single-indicator metadata
 *   - Multi (any of I,S,A,U > 1): Indicator, Unit, Subgroup, Area + time columns
 */
export function buildExportPayloadFromRows(
  rows: DataRow[],
  filters: FilterValues,
): ExportPayload | null {
  if (rows.length === 0) return null;
  const c = computeCardinality(rows);
  return isLegacyCase(c)
    ? buildLegacyPayload(rows, filters)
    : buildMultiPayload(rows, filters);
}

// ---------------------------------------------------------------------------
// Legacy compat: old DataPoint[] → DataRow[] bridge then delegate
// ---------------------------------------------------------------------------

function dataPointsToRows(data: DataPoint[], indicator: Indicator | null): DataRow[] {
  return data.map((d) => ({
    indicatorId: indicator?.id ?? "",
    indicatorName: indicator?.name ?? "Unknown indicator",
    subgroupId: d.subgroup ?? "Total",
    subgroupName: d.subgroup ?? "Total",
    areaId: d.area ?? "",
    areaName: d.area ?? "",
    timePeriodId: d.timePeriodId ?? String(d.year),
    timePeriodName: d.timePeriodName ?? d.timePeriodId ?? String(d.year),
    value: d.value,
    unit: indicator?.unit ?? "",
  }));
}

/**
 * @deprecated Use buildExportPayloadFromRows with DataRow[] instead.
 * Kept for backward compatibility with gallery export path.
 */
export function buildExportPayload(
  data: DataPoint[],
  indicator: Indicator | null,
  filters: FilterValues,
): ExportPayload | null {
  if (data.length === 0) return null;
  const rows = dataPointsToRows(data, indicator);
  return buildExportPayloadFromRows(rows, filters);
}

/**
 * Suggested filename for export. Multi-indicator uses "visualizer_data" prefix.
 */
export function getExportFilename(
  indicatorCode: string,
  timeStart: number | null,
  timeEnd: number | null,
  extension: string,
): string {
  const code = indicatorCode || "data";
  const isMulti = code.includes(";");
  const prefix = isMulti ? "visualizer_data" : code;
  const range =
    timeStart != null && timeEnd != null ? `${timeStart}-${timeEnd}` : "export";
  return `${prefix}_data_${range}.${extension}`;
}
