import { ChartConfig, LineBarAreaSeriesItem, SeriesChartTypeOverride } from '../types';
/**
 * Resolve fill/stroke color for a series: explicit override → palette[i] → primaryColor.
 * Empty `values` (line path legacy) falls back to primaryColor when no override is set.
 */
export declare function resolveSeriesColor(s: {
    color?: string;
    values?: number[];
}, i: number, config: ChartConfig): string;
/** Line width: per-series override → global lineThickness → 2. */
export declare function resolveSeriesLineWidth(s: {
    lineStyle?: {
        width?: number;
    };
}, config: ChartConfig): number;
/** Dash style type when set on the series (ECharts lineStyle.type). */
export declare function resolveSeriesLineDash(s: {
    lineStyle?: {
        type?: string;
    };
}): string | undefined;
export type ResolvedSeriesSymbol = {
    showSymbol: boolean;
    symbol: string;
    symbolSize: number;
    borderWidth?: number;
    borderColor?: string;
};
/**
 * Marker/symbol resolution: per-series fields override global seriesSymbol* config.
 */
export declare function resolveSeriesSymbol(s: Pick<LineBarAreaSeriesItem, 'symbol' | 'symbolSize' | 'showSymbol' | 'itemStyle' | 'borderColor'>, config: ChartConfig): ResolvedSeriesSymbol;
/**
 * ECharts series `type` for combo overrides.
 * Area charts use `line` + areaStyle when type is area/default (see shouldApplyAreaStyle).
 */
export declare function resolveSeriesEChartsType(seriesType: SeriesChartTypeOverride | undefined, defaultType: 'line' | 'bar' | 'scatter'): 'line' | 'bar' | 'scatter';
/** Whether an area builder should attach areaStyle for this series. */
export declare function shouldApplyAreaStyle(seriesType: SeriesChartTypeOverride | undefined): boolean;
/**
 * Marker/item fill: explicit `itemStyle.color` when set, otherwise series stroke/fill color.
 * Lets markers differ from the line color without changing lineStyle/bar fill.
 */
export declare function resolveSeriesItemColor(s: {
    itemStyle?: {
        color?: string;
    };
}, seriesColor: string): string;
/**
 * Merge optional hover color into an existing series `emphasis` object (e.g. from labels).
 */
export declare function mergeSeriesEmphasis(existing: Record<string, unknown> | undefined, emphasisColor: string | undefined): Record<string, unknown> | undefined;
export type CategoryColoredPoint = number | {
    value: number;
    itemStyle: {
        color: string;
    };
};
/**
 * Apply optional per-point and/or per-category colors onto series values for ECharts.
 * When both color arrays are absent or empty, returns `values` unchanged (byte-identical path).
 * Otherwise emits per-point objects only for indices with a color; bare numbers elsewhere.
 * Precedence at draw time: pointColors[i] → categoryColors[i] → series itemStyle.color → palette.
 */
export declare function applyPointColorsToSeriesData(values: number[], pointRowColors?: (string | undefined)[] | undefined, categoryColors?: (string | undefined)[] | undefined): number[] | CategoryColoredPoint[];
/**
 * Apply optional per-category colors onto series values for ECharts.
 * Thin wrapper over {@link applyPointColorsToSeriesData} (no point colors).
 * When `categoryColors` is absent or has no colors, returns `values` unchanged (byte-identical path).
 * Precedence at draw time: category color (point) → series itemStyle.color → palette.
 */
export declare function applyCategoryColorsToSeriesData(values: number[], categoryColors: (string | undefined)[] | undefined): number[] | CategoryColoredPoint[];
//# sourceMappingURL=resolveSeriesStyle.d.ts.map