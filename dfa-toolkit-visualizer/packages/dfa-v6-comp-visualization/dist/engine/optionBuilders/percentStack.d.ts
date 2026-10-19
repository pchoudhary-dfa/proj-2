import { ChartConfig, LineBarAreaData } from '../types';
/** Single stack group used to normalise every series into one 100% column/band. */
export declare const PERCENT_STACK = "percent";
/** Per-category totals across all series (sum of raw values at each category index). */
export declare function computeCategoryTotals(data: LineBarAreaData): number[];
/** Transform raw series values into per-category percentage shares (0–100). */
export declare function toPercentValues(values: number[], categoryTotals: number[]): number[];
/**
 * Normalise a value axis for a 100% stacked chart: clamp to 0–100 (unless the user
 * set an explicit range) and suffix ticks with "%".
 * Only mutates a plain axis object; hidden axes (`show: false`) keep the scale but skip tick styling.
 */
export declare function withPercentValueAxis(axisObj: Record<string, unknown>, hasExplicitRange: boolean): Record<string, unknown>;
/** Whether config.yAxisMin/Max impose an explicit vertical value-axis range. */
export declare function hasExplicitVerticalRange(config: ChartConfig): boolean;
//# sourceMappingURL=percentStack.d.ts.map