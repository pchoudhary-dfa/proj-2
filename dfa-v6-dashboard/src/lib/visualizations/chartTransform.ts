import type {
  ChartConfig,
  ChartData,
  LineBarAreaData,
  PieChartData,
} from "dfa-v6-comp-visualization";
import type { VisualizationTypeId } from "@/lib/dashboards/types";
import type {
  GeneralSettings,
  DataSettings,
  DimensionKind,
  AxisSeriesMapping,
} from "./types";
import type { ObservationRow } from "./dataService";

// ─── Default palette used when no color theme is configured ──────────────────

const DEFAULT_PALETTE = [
  "#990000",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#dc2626",
  "#4f46e5",
];

const SUPPORTED_CHART_TYPES = new Set<string>([
  "bar",
  "line",
  "area",
  "pie",
]);

// ─── Dimension → Row field accessors ─────────────────────────────────────────

function getDimensionKey(
  row: ObservationRow,
  dim: DimensionKind,
): string {
  switch (dim) {
    case "time":
      return String(row.tp_timeperiod ?? "");
    case "indicator":
      return String(row.i_nid ?? row.i_name ?? "");
    case "subgroup":
      return String(row.sg_nid ?? row.sg_name ?? "");
    case "area":
      return String(row.ar_nid ?? row.ar_name ?? "");
  }
}

function getDimensionLabel(
  row: ObservationRow,
  dim: DimensionKind,
): string {
  switch (dim) {
    case "time":
      return row.tp_timeperiod ?? "";
    case "indicator": {
      const parts = [row.i_name ?? "Indicator"];
      if (row.u_name) parts.push(row.u_name);
      return parts.join(", ");
    }
    case "subgroup":
      return row.sg_name ?? "";
    case "area":
      return row.ar_name ?? "";
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNumericValue(val: number | string | null | undefined): number {
  if (val == null) return 0;
  const n = typeof val === "string" ? parseFloat(val) : val;
  return Number.isFinite(n) ? n : 0;
}

function parsePalette(colorTheme: string): string[] {
  if (!colorTheme || !colorTheme.trim()) return DEFAULT_PALETTE;
  const colors = colorTheme
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return colors.length > 0 ? colors : DEFAULT_PALETTE;
}

function parseFontSize(raw: string): number {
  if (!raw) return 11;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 11;
}

// ─── Transform API Rows -> ChartData ─────────────────────────────────────────

/**
 * Pivots flat observation rows into chart-ready data.
 *
 * For bar/line/area:
 *   - categories = unique time periods (sorted), falling back to areas
 *   - series = one per indicator+unit (or subgroup when single indicator)
 *
 * For pie:
 *   - segments = one per indicator (or subgroup) with summed values
 */
export function transformToChartData(
  rows: ObservationRow[],
  typeId: VisualizationTypeId | null,
  dataSettings: DataSettings,
): ChartData | null {
  if (!typeId || !SUPPORTED_CHART_TYPES.has(typeId)) return null;
  if (rows.length === 0) return null;

  if (typeId === "pie") {
    return buildPieData(rows, dataSettings);
  }

  return buildLineBarAreaData(rows, dataSettings);
}

function buildLineBarAreaData(
  rows: ObservationRow[],
  dataSettings: DataSettings,
): LineBarAreaData | null {
  const mapping: AxisSeriesMapping = dataSettings.mapping;
  const xDim = mapping.xDimension;
  const seriesDim = mapping.seriesDimension;
  const seriesDim2 = mapping.seriesDimension2 ?? null;

  const categorySet = new Set<string>();
  const seriesMap = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const catKey = getDimensionKey(row, xDim);
    if (!catKey) continue;
    const catLabel = getDimensionLabel(row, xDim);
    categorySet.add(catLabel || catKey);

    let sKey: string;
    if (seriesDim === null) {
      sKey = "Value";
    } else {
      const s1 = getDimensionLabel(row, seriesDim) || getDimensionKey(row, seriesDim);
      if (seriesDim2) {
        const s2 = getDimensionLabel(row, seriesDim2) || getDimensionKey(row, seriesDim2);
        sKey = `${s1} / ${s2}`;
      } else {
        sKey = s1;
      }
    }

    if (!seriesMap.has(sKey)) {
      seriesMap.set(sKey, new Map<string, number>());
    }
    const cat = catLabel || catKey;
    const existing = seriesMap.get(sKey)!.get(cat) ?? 0;
    seriesMap.get(sKey)!.set(cat, existing + parseNumericValue(row.dt_value));
  }

  const categories = Array.from(categorySet).sort();
  if (categories.length === 0) return null;

  const series = Array.from(seriesMap.entries()).map(
    ([name, valMap], idx) => ({
      id: `s${idx}`,
      name,
      values: categories.map((cat) => valMap.get(cat) ?? 0),
    }),
  );

  if (series.length === 0) return null;

  return { categories, series };
}

function buildPieData(
  rows: ObservationRow[],
  dataSettings: DataSettings,
): PieChartData | null {
  const xDim = dataSettings.mapping.xDimension;

  const sums = new Map<string, number>();
  for (const row of rows) {
    const key = getDimensionLabel(row, xDim) || getDimensionKey(row, xDim) || "Value";
    const existing = sums.get(key) ?? 0;
    sums.set(key, existing + parseNumericValue(row.dt_value));
  }

  const segments = Array.from(sums.entries()).map(([label, value], idx) => ({
    id: `seg${idx}`,
    label,
    value,
  }));

  return segments.length > 0 ? { segments } : null;
}

// ─── Map GeneralSettings -> ChartConfig ──────────────────────────────────────

export function mapToChartConfig(
  typeId: VisualizationTypeId | null,
  chartVariant:string,
  general: GeneralSettings,
): ChartConfig {
  const chartType = SUPPORTED_CHART_TYPES.has(typeId ?? "")
    ? (typeId as ChartConfig["type"])
    : "bar";

  const palette = parsePalette(general.colorTheme);
  const fontFamily =
    general.chartArea.fontFamily || "Inter, sans-serif";

  const isPie = chartType === "pie";

  const hasHGridLines =
    general.axisHorizontal.gridLines.width > 0;
  const hasVGridLines =
    general.axisVertical.gridLines.width > 0;

  return {
    type: chartType,
    chartVariant,

    showXAxis: isPie ? false : general.axisHorizontal.labelsEnabled,
    showYAxis: isPie ? false : general.axisVertical.labelsEnabled,
    showGrid: isPie ? false : hasHGridLines || hasVGridLines,
    showLabels: general.dataValueLabels.labelsEnabled,
    showLegend: general.legend.displayLegend,
    legendPosition: general.legend.position,
    labelOrientation:
      general.dataValueLabels.labelRotation === 0
        ? "horizontal"
        : "vertical",

    primaryColor: palette[0] ?? "#990000",
    palette,

    labelFont: {
      size: parseFontSize(general.dataValueLabels.fontStyle.fontSize),
      family: general.dataValueLabels.fontStyle.fontFamily || fontFamily,
      bold: general.dataValueLabels.fontStyle.bold,
      italic: general.dataValueLabels.fontStyle.italic,
      underline: general.dataValueLabels.fontStyle.underline,
    },
    legendFont: {
      size: parseFontSize(general.legend.textStyle.fontSize),
      family: general.legend.textStyle.fontFamily || fontFamily,
      bold: general.legend.textStyle.bold,
      italic: general.legend.textStyle.italic,
      underline: general.legend.textStyle.underline,
    },

    lineThickness: chartType === "line" || chartType === "area" ? 2 : undefined,

    plotAreaBackgroundColor:
      general.plotArea.backgroundColor !== "#ffffff"
        ? general.plotArea.backgroundColor
        : undefined,

    dataLabelNumberFormat: general.dataValueLabels.labelFormat || undefined
  };
}
