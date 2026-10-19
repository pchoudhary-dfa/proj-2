import type { ChartConfig, LineBarAreaData } from '../types';

/** Single stack group used to normalise every series into one 100% column/band. */
export const PERCENT_STACK = 'percent';

/** Per-category totals across all series (sum of raw values at each category index). */
export function computeCategoryTotals(data: LineBarAreaData): number[] {
  return data.categories.map((_, c) =>
    data.series.reduce((sum, s) => sum + (Number(s.values[c]) || 0), 0),
  );
}

/** Transform raw series values into per-category percentage shares (0–100). */
export function toPercentValues(values: number[], categoryTotals: number[]): number[] {
  return values.map((v, c) => {
    const total = categoryTotals[c];
    return total ? (Number(v) / total) * 100 : 0;
  });
}

/**
 * Normalise a value axis for a 100% stacked chart: clamp to 0–100 (unless the user
 * set an explicit range) and suffix ticks with "%".
 * Only mutates a plain axis object; hidden axes (`show: false`) keep the scale but skip tick styling.
 */
export function withPercentValueAxis(
  axisObj: Record<string, unknown>,
  hasExplicitRange: boolean,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...axisObj };
  if (!hasExplicitRange) {
    next.min = 0;
    next.max = 100;
  }
  const axisLabel = next.axisLabel;
  if (axisLabel && typeof axisLabel === 'object' && !Array.isArray(axisLabel)) {
    const al = axisLabel as Record<string, unknown>;
    if (al.show !== false) {
      next.axisLabel = { ...al, formatter: '{value}%' };
    }
  }
  return next;
}

/** Whether config.yAxisMin/Max impose an explicit vertical value-axis range. */
export function hasExplicitVerticalRange(config: ChartConfig): boolean {
  return (
    (config.yAxisMin !== undefined && config.yAxisMin !== '') ||
    (config.yAxisMax !== undefined && config.yAxisMax !== '')
  );
}
