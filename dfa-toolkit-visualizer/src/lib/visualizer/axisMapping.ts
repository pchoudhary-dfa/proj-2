/**
 * Axis / series layout helpers for line, bar, and area charts.
 *
 * The vertical axis is always numeric (measure). Users choose:
 *   - Horizontal axis dimension (categories)
 *   - One or two series dimensions (legend / compare-by)
 *
 * All four dimensions are always available for every slot. Validation is
 * purely structural: no duplicate assignments and series2 requires series1.
 */

import type { AxisSeriesMapping } from '@/lib/visualizer/chartTransform';
import type { DimensionKind } from '@/lib/visualizer/defaultChartConfig';
import type { VisualizationConfig } from '@/lib/visualizer/types';

export const CHART_LAYOUT_DIMENSIONS: DimensionKind[] = [
  'time',
  'indicator',
  'subgroup',
  'area',
];

/** All dimensions except the one currently on X — available for primary series. */
export function availableSeriesOptions(x: DimensionKind): DimensionKind[] {
  return CHART_LAYOUT_DIMENSIONS.filter((d) => d !== x);
}

/** All dimensions except X and primary series — available for secondary series. */
export function availableSeries2Options(
  x: DimensionKind,
  series1: DimensionKind,
): DimensionKind[] {
  return CHART_LAYOUT_DIMENSIONS.filter((d) => d !== x && d !== series1);
}

/**
 * Structural validation only — no cardinality checks.
 * Valid when: all assigned slots are distinct, and series2 implies series1.
 */
export function validateMappingStructure(m: AxisSeriesMapping): boolean {
  if (m.seriesDimension && m.seriesDimension === m.xDimension) return false;

  if (m.seriesDimension2) {
    if (!m.seriesDimension) return false;
    if (m.seriesDimension2 === m.xDimension) return false;
    if (m.seriesDimension2 === m.seriesDimension) return false;
  }

  return true;
}

/**
 * Build a mapping from UI dropdown selections.
 * Returns null only when the combination is structurally invalid
 * (duplicate slots or series2 without series1).
 */
export function buildMappingFromSelections(
  x: DimensionKind,
  series1: DimensionKind | null,
  series2: DimensionKind | null,
): AxisSeriesMapping | null {
  if (series1 && series1 === x) return null;

  if (series2) {
    if (!series1) return null;
    if (series2 === x || series2 === series1) return null;
  }

  return {
    xDimension: x,
    seriesDimension: series1,
    seriesDimension2: series2 ?? undefined,
  };
}

/** Decompose an existing mapping into the dropdown values the UI should display. */
export function decomposeMappingForUi(
  m: AxisSeriesMapping,
): { x: DimensionKind; series1: DimensionKind | null; series2: DimensionKind | null } {
  return {
    x: m.xDimension,
    series1: m.seriesDimension ?? null,
    series2: m.seriesDimension2 ?? null,
  };
}

/** Maps axis layout dimension to existing filter translation codes. */
export const DIMENSION_TRANSLATION_CODE: Record<DimensionKind, string> = {
  time: 'VISUALIZER_FILTER_TIME_PERIOD',
  indicator: 'VISUALIZER_FILTER_INDICATOR',
  subgroup: 'VISUALIZER_FILTER_SUBGROUP',
  area: 'VISUALIZER_FILTER_AREA',
};

export function dimensionKindLabel(
  d: DimensionKind,
  t: (code: string) => string,
): string {
  return t(DIMENSION_TRANSLATION_CODE[d]);
}

// ---------------------------------------------------------------------------
// Checkbox matrix helpers
// ---------------------------------------------------------------------------

export interface MatrixConstraints {
  /** Minimum number of Y-column checkboxes that must be active. */
  yMin: number;
  /** Maximum number of Y-column checkboxes allowed. */
  yMax: number;
}

/**
 * Derive Y-column constraints from the active chart type / variant.
 * Keeps chart-specific rules centralised so the UI stays generic.
 */
export function getMatrixConstraints(
  chartType: VisualizationConfig['chartType'],
  chartVariant: string,
): MatrixConstraints {
  if (chartType === 'advanced') {
    if (chartVariant === 'heatmap' || chartVariant === 'treemap') return { yMin: 1, yMax: 1 };
    if (chartVariant === 'pyramid') return { yMin: 1, yMax: 2 };
    if (chartVariant === 'spider') return { yMin: 0, yMax: 2 };
  }
  // line / bar / area
  return { yMin: 0, yMax: 2 };
}

/**
 * Build an `AxisSeriesMapping` from the checkbox-matrix state.
 *
 * `yDims` can contain 0-2 entries. When two are present the one appearing
 * earlier in `CHART_LAYOUT_DIMENSIONS` becomes `seriesDimension`, the later
 * one becomes `seriesDimension2` — deterministic, no "check-order" tracking.
 */
export function buildMappingFromMatrix(
  xDim: DimensionKind,
  yDims: DimensionKind[],
): AxisSeriesMapping | null {
  const sorted = [...yDims].sort(
    (a, b) => CHART_LAYOUT_DIMENSIONS.indexOf(a) - CHART_LAYOUT_DIMENSIONS.indexOf(b),
  );
  return buildMappingFromSelections(xDim, sorted[0] ?? null, sorted[1] ?? null);
}
