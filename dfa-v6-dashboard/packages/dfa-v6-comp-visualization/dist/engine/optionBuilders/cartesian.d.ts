import { ChartConfig, LineBarAreaData } from '../types';
/** Fixed height for horizontal (top/bottom) scroll legend. */
export declare const LEGEND_SCROLL_HEIGHT = 56;
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
export declare function buildGrid(config: ChartConfig, seriesCount?: number): {
    grid: Record<string, unknown>;
};
export declare function buildXAxisCategory(data: LineBarAreaData, config: ChartConfig): {
    xAxis: Record<string, unknown>;
};
export declare function buildYAxisValue(config: ChartConfig): {
    yAxis: Record<string, unknown>;
};
/** Category y-axis (for horizontal bar). */
export declare function buildYAxisCategory(data: LineBarAreaData, config: ChartConfig): {
    yAxis: Record<string, unknown>;
};
/** Value x-axis (for horizontal bar). */
export declare function buildXAxisValue(config: ChartConfig): {
    xAxis: Record<string, unknown>;
};
export declare function buildLegend(config: ChartConfig, seriesCount?: number): {
    legend: Record<string, unknown>;
};
export declare function buildTooltipAxis(): {
    tooltip: Record<string, unknown>;
};
//# sourceMappingURL=cartesian.d.ts.map