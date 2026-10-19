/**
 * Default chart config: VisualizerDataResponse → default chart type and axis/series mapping.
 * Implements the 16-row decision matrix (CHART_RENDERER_SPEC Section 5).
 */

import type { VisualizerDataResponse } from "@/lib/visualizer/types";

export type ChartTypeDefault = "line" | "bar" | "area" | "pie";
export type DimensionKind = "time" | "indicator" | "subgroup" | "area";

export interface DefaultChartConfig {
  chartType: ChartTypeDefault;
  xDimension: DimensionKind;
  seriesDimension: DimensionKind | null;
  /** Second series dimension for composite series (Rows 8, 12, 14, 15, 16). */
  seriesDimension2?: DimensionKind | null;
}

/** Treat 0 as 1 for cardinality (empty selection = single). */
function cap(n: number): number {
  return n <= 0 ? 1 : n;
}

/**
 * Returns default chart type and mapping from response cardinality (and optional meta).
 * Uses meta.defaultAxisSuggestions when the matrix allows multiple valid choices (e.g. row 13).
 */
export function getDefaultChartConfig(response: VisualizerDataResponse): DefaultChartConfig {
  const c = response.cardinality;
  const I = cap(c.indicators);
  const S = cap(c.subgroups);
  const A = cap(c.areas);
  const T = cap(c.timePeriods);

  const suggestion = response.meta?.defaultAxisSuggestions;

  // Row 1: 1,1,1,1 → bar (no KPI in engine)
  if (I === 1 && S === 1 && A === 1 && T === 1) {
    return { chartType: "bar", xDimension: "time", seriesDimension: null };
  }
  // Row 2: 1,1,1,n → line
  if (I === 1 && S === 1 && A === 1 && T > 1) {
    return { chartType: "line", xDimension: "time", seriesDimension: null };
  }
  // Row 3: 1,1,n,1 → bar, x = area
  if (I === 1 && S === 1 && A > 1 && T === 1) {
    return { chartType: "bar", xDimension: "area", seriesDimension: null };
  }
  // Row 4: 1,1,n,n → line, series = area
  if (I === 1 && S === 1 && A > 1 && T > 1) {
    return { chartType: "line", xDimension: "time", seriesDimension: "area" };
  }
  // Row 5: 1,n,1,1 → bar, x = subgroup
  if (I === 1 && S > 1 && A === 1 && T === 1) {
    return { chartType: "bar", xDimension: "subgroup", seriesDimension: null };
  }
  // Row 6: 1,n,1,n → line, series = subgroup
  if (I === 1 && S > 1 && A === 1 && T > 1) {
    return { chartType: "line", xDimension: "time", seriesDimension: "subgroup" };
  }
  // Row 7: 1,n,n,1 → bar, x = area, series = subgroup
  if (I === 1 && S > 1 && A > 1 && T === 1) {
    return { chartType: "bar", xDimension: "area", seriesDimension: "subgroup" };
  }
  // Row 8: 1,n,n,n → line, x = time, series = area + subgroup
  if (I === 1 && S > 1 && A > 1 && T > 1) {
    return { chartType: "line", xDimension: "time", seriesDimension: "area", seriesDimension2: "subgroup" };
  }
  // Row 9: n,1,1,1 → bar, x = indicator
  if (I > 1 && S === 1 && A === 1 && T === 1) {
    return { chartType: "bar", xDimension: "indicator", seriesDimension: null };
  }
  // Row 10: n,1,1,n → line, series = indicator
  if (I > 1 && S === 1 && A === 1 && T > 1) {
    return { chartType: "line", xDimension: "time", seriesDimension: "indicator" };
  }
  // Row 11: n,1,n,1 → bar, x = area, series = indicator
  if (I > 1 && S === 1 && A > 1 && T === 1) {
    return { chartType: "bar", xDimension: "area", seriesDimension: "indicator" };
  }
  // Row 12: n,1,n,n → line, series = indicator + area
  if (I > 1 && S === 1 && A > 1 && T > 1) {
    return { chartType: "line", xDimension: "time", seriesDimension: "indicator", seriesDimension2: "area" };
  }
  // Row 13: n,n,1,1 → bar; X = indicator or subgroup (configurable). Use meta if set.
  if (I > 1 && S > 1 && A === 1 && T === 1) {
    if (suggestion === "indicator_on_x") {
      return { chartType: "bar", xDimension: "indicator", seriesDimension: "subgroup" };
    }
    if (suggestion === "subgroup_on_x") {
      return { chartType: "bar", xDimension: "subgroup", seriesDimension: "indicator" };
    }
    return { chartType: "bar", xDimension: "indicator", seriesDimension: "subgroup" };
  }
  // Row 14: n,n,1,n → line, series = indicator + subgroup
  if (I > 1 && S > 1 && A === 1 && T > 1) {
    return { chartType: "line", xDimension: "time", seriesDimension: "indicator", seriesDimension2: "subgroup" };
  }
  // Row 15: n,n,n,1 → bar, x = area, series = indicator + subgroup
  if (I > 1 && S > 1 && A > 1 && T === 1) {
    return { chartType: "bar", xDimension: "area", seriesDimension: "indicator", seriesDimension2: "subgroup" };
  }
  // Row 16: n,n,n,n → line, x = time, series = indicator + area (simplified per spec)
  return { chartType: "line", xDimension: "time", seriesDimension: "indicator", seriesDimension2: "area" };
}
