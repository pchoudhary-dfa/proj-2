import { ChartConfig, LineBarAreaData, RequiredFontStyle } from '../types';
/** Max height for horizontal (top/bottom) scroll legend container. */
export declare const LEGEND_SCROLL_HEIGHT = 40;
/** Fixed width for vertical (left/right) scroll legend. */
export declare const LEGEND_SCROLL_WIDTH = 120;
/** Padding when legend is left or right. */
export declare const LEGEND_EDGE_PADDING = 10;
/**
 * Wraps a legend name to fit within a given pixel width using word boundaries.
 * Uses font size to estimate average character width (no DOM/canvas).
 * For use when legend is left/right so long names don't overlap the chart.
 */
export declare function wrapLegendName(name: string, legendWidthPx: number, font: {
    size: number;
    family?: string;
}): string;
/**
 * Absolute stacked bar/area must start at 0 so segment heights match values.
 * Without this, ECharts `scale: true` raises the baseline and clips the bottom series.
 * 100% stacked variants already pin 0–100 via `withPercentValueAxis`.
 */
export declare function requiresStackedZeroBaseline(config: ChartConfig): boolean;
/**
 * Estimate the left-margin band (px) needed for horizontal-bar category labels so long
 * names aren't clipped by the fixed value-axis band. Approximates text width from the font
 * size (no DOM/canvas), clamped between a floor and a cap. Labels wider than the cap are
 * truncated with an ellipsis by the axis itself (see `buildYAxisCategory`).
 */
export declare function estimateCategoryAxisBand(categories: Array<string | number>, font: RequiredFontStyle): number;
/**
 * Estimate the value-axis tick band when dashboard locale/precision formatting makes
 * labels wider than the default (e.g. `1,239,755.00`). Prevents leading digits from
 * being clipped with `containLabel: false`.
 */
export declare function estimateValueAxisBand(data: LineBarAreaData | undefined, config: ChartConfig): number;
/** Width available for category label text within a given band (band minus tick gap). */
export declare function categoryLabelTextWidth(band: number): number;
/**
 * Right-side layout when secondary Y + legend(right) are both on:
 *   [plot | secondary ticks/title | gap | legend | edge]
 * Secondary axis stays at the grid edge (no ECharts `offset` — that splits the margin).
 * Legend stays at the container's right edge.
 */
export declare function secondaryRightBandWidth(config: ChartConfig, secondaryChrome: boolean): number;
/**
 * True when secondary Y-axis is gated on and at least one series binds to axis 1.
 * Horizontal bar variants should pass `allowSecondary: false`.
 */
export declare function usesSecondaryYAxis(config: ChartConfig, data: LineBarAreaData | undefined, allowSecondary?: boolean): boolean;
/** Whether the right-axis chrome should reserve grid margin / be visible. */
export declare function showSecondaryYAxisChrome(config: ChartConfig, data: LineBarAreaData | undefined, allowSecondary?: boolean): boolean;
/** Series yAxisIndex for ECharts when dual axes are active; omit property when inactive. */
export declare function seriesYAxisIndex(config: ChartConfig, data: LineBarAreaData, series: {
    yAxisIndex?: 0 | 1;
}, allowSecondary?: boolean): 0 | 1 | undefined;
/** Extra vertical space when legend has background/border padding. */
export declare function legendChromePadding(config: ChartConfig): number;
/** Y offset for top legend / colorbar when canvas titles are present. */
export declare function topLegendOffsetY(config: ChartConfig): number;
/** Grid top margin when legend is at top (title block + legend row + gap). */
export declare function gridTopWithTopLegend(config: ChartConfig, legendIcon?: string): number;
/** Legend marker size — matches data-point symbol size when provided. */
export declare function legendMarkerSize(config: ChartConfig, legendIcon?: string): number;
/** Single-row height for horizontal top/bottom legend (text + icon + padding). */
export declare function horizontalLegendRowHeight(config: ChartConfig, legendIcon?: string): number;
/** Map host dashStyle strings (Highcharts-style) to ECharts lineStyle.type. */
export declare function mapDashStyleToEcharts(dashStyle: string | undefined): 'solid' | 'dashed' | 'dotted';
type AxisLineCfg = {
    color?: string;
    width?: number;
};
type AxisGridCfg = {
    show: boolean;
    color?: string;
    width?: number;
    dashStyle?: string;
};
/** Axis baseline — omit props keeps ECharts default line styling with show:true. */
export declare function buildAxisLineOption(line: AxisLineCfg | undefined, showFallback: boolean): Record<string, unknown>;
/**
 * splitLine from explicit grid cfg, else legacy `showGrid` + dashed #e0e0e0.
 * Value axes typically own the plot grid; category axes usually leave splitLine off unless configured.
 */
export declare function buildSplitLineOption(grid: AxisGridCfg | undefined, legacyShowGrid: boolean, 
/** When true and no explicit grid object, use legacyShowGrid (value axes). */
useLegacyWhenUnset?: boolean): Record<string, unknown>;
export declare function buildAxisTickOption(ticksEnabled: boolean | undefined): Record<string, unknown>;
/** Soft-wrap axis tick labels by estimated character budget (HTML newlines for rich labels). */
export declare function wrapAxisLabelText(value: string | number, enabled: boolean | undefined): string;
export declare function buildGrid(config: ChartConfig, seriesCount?: number, legendIcon?: string, data?: LineBarAreaData, allowSecondaryYAxis?: boolean, 
/** Left band for a horizontal-bar category axis; falls back to the numeric tick band. */
categoryLabelBand?: number): {
    grid: Record<string, unknown>;
};
export declare function buildXAxisCategory(data: LineBarAreaData, config: ChartConfig): {
    xAxis: Record<string, unknown>;
};
/**
 * Value Y-axis builder for vertical line/bar/area.
 * When secondary Y is inactive: returns a single `yAxis` object (legacy shape).
 * When active: returns `yAxis: [primary, secondary]` with stable indices 0/1.
 */
export declare function buildYAxisValue(config: ChartConfig, tickPrimeTexts?: string[], data?: LineBarAreaData, allowSecondary?: boolean): {
    yAxis: Record<string, unknown> | Record<string, unknown>[];
};
/** Category y-axis (for horizontal bar). */
export declare function buildYAxisCategory(data: LineBarAreaData, config: ChartConfig, 
/** Left band reserved for labels; when set, labels wider than it truncate with an ellipsis. */
labelBand?: number): {
    yAxis: Record<string, unknown>;
};
/** Value x-axis (for horizontal bar). */
export declare function buildXAxisValue(config: ChartConfig): {
    xAxis: Record<string, unknown>;
};
export declare function buildLegend(config: ChartConfig, seriesCount?: number, legendIcon?: string, legendNames?: string[], 
/** Optional per-name marker colors (for hierarchical charts that don't auto-link to series). */
legendColors?: string[], data?: LineBarAreaData, allowSecondaryYAxis?: boolean): {
    legend: Record<string, unknown>;
};
export declare function buildTooltipAxis(config?: ChartConfig, data?: LineBarAreaData, percentMode?: boolean): {
    tooltip: Record<string, unknown>;
};
export {};
//# sourceMappingURL=cartesian.d.ts.map