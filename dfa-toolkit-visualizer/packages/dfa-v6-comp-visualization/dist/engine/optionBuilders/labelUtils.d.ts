import { ChartConfig, LineBarAreaData, PieChartData, RadarData, HeatmapData, TreemapData, SliceDiceTreemapData, StripesTreemapData, SunburstData, ScatterXYData, PyramidData, RequiredFontStyle } from '../types';
/**
 * Resolved X-axis tick font — fully independent of labelFont.
 * Uses a plain default; only explicit xAxisTickFont overrides change it.
 */
export declare function resolveXAxisTickFont(config: ChartConfig): RequiredFontStyle;
/**
 * Resolved Y-axis tick font — fully independent of labelFont.
 * Uses a plain default; only explicit yAxisTickFont overrides change it.
 */
export declare function resolveYAxisTickFont(config: ChartConfig): RequiredFontStyle;
/**
 * Resolved secondary (right) Y-axis tick font.
 * Falls back to primary yAxisTickFont, then the plain tick default.
 */
export declare function resolveSecondaryYAxisTickFont(config: ChartConfig): RequiredFontStyle;
/** Resolved data-point label font (dataLabelFont overrides labelFont). */
export declare function resolveDataLabelFont(config: ChartConfig): RequiredFontStyle;
/** Shared label/axis typography + rich underline formatter for inline ECharts labels. */
export declare function buildLabelTypography(config: ChartConfig, primeTexts?: string[], font?: ChartConfig['labelFont']): {
    typography: Record<string, unknown>;
    formatText: (text: string) => string;
};
/** True for dashboard bridge strings (`locale:…;precision:…`) or unit presets (`{y:.2f}`). */
export declare function isLocalePrecisionFormat(format: string | undefined): boolean;
/** Parse BCP-47 locale from a `locale:…;precision:…` format string. */
export declare function parseLocaleFromFormat(format: string | undefined): string | undefined;
/**
 * Localize category-axis labels that are pure numbers (e.g. years `2011`) so digit
 * script matches the dashboard number-format locale. Non-numeric labels are unchanged.
 */
export declare function localizeCategoryLabel(label: string, locale: string): string;
/**
 * Format a numeric value for data labels according to the given format string.
 * Matches the formats used in the app (VisualizationSettingsConstants.numberFormats).
 * Also supports dashboard bridge strings (`locale:en-US;precision:2`) and unit
 * presets (`{y:.2f}`).
 */
export declare function formatLabelValue(value: number, format: string): string;
/**
 * Format an already-computed percentage (0–100) as a compact label.
 * Rounds to at most one decimal and strips a trailing ".0" — e.g. 45 → "45%", 12.53 → "12.5%".
 */
export declare function formatPercentLabel(value: number): string;
/**
 * Resolve display string for a data point.
 * Priority:
 *   1. Dashboard locale/precision override (`locale:…;precision:…`) when set
 *   2. Unit auto-format (`unitFormatCode` / server `preFormatted`) when useUnitDefault
 *   3. Manual format presets (`1,000[.00]`, etc.)
 */
export declare function resolveFormattedValue(value: number, format: string, useUnitDefault: boolean, preFormatted: string | undefined | null, unitFormatCode?: string | null): string;
/** Collect formatted pie segment values for data-label underline width priming. */
export declare function collectPieLabelPrimeTexts(data: PieChartData, config: ChartConfig): string[];
/** Collect display strings used on value axes and data labels for underline width priming. */
export declare function collectSeriesLabelPrimeTexts(data: LineBarAreaData, config: ChartConfig): string[];
/** Collect radar spoke labels and formatted point values for underline priming. */
export declare function collectRadarLabelPrimeTexts(data: RadarData, config: ChartConfig): string[];
/** Collect heatmap axis categories and cell values for underline priming. */
export declare function collectHeatmapLabelPrimeTexts(data: HeatmapData, config: ChartConfig): string[];
/** Collect treemap node labels for underline priming. */
export declare function collectTreemapLabelPrimeTexts(data: TreemapData, config: ChartConfig): string[];
/** Collect sunburst node labels and formatted values for underline priming (same structure as treemap). */
export declare function collectSunburstLabelPrimeTexts(data: SunburstData, config: ChartConfig): string[];
/** Collect slice-and-dice treemap node labels for underline priming (recursive, same structure as sunburst). */
export declare function collectSliceDiceLabelPrimeTexts(data: SliceDiceTreemapData, config: ChartConfig): string[];
/** Collect stripes treemap node labels for underline priming (recursive, same structure as sunburst). */
export declare function collectStripesLabelPrimeTexts(data: StripesTreemapData, config: ChartConfig): string[];
/** Collect scatter point names for underline priming. */
export declare function collectScatterLabelPrimeTexts(data: ScatterXYData): string[];
/** Collect pyramid wing labels and formatted bar values for underline priming. */
export declare function collectPyramidLabelPrimeTexts(data: PyramidData, config: ChartConfig): string[];
/** ECharts label position when data labels are "outside" for line/area (top) or bar (top/right). */
type OutsidePosition = 'top' | 'right';
/**
 * Build ECharts series label and emphasis config from ChartConfig.
 * outsidePosition: 'top' for line/area vertical bar, 'right' for horizontal bar.
 * seriesFormattedValues: optional pre-formatted display strings (one per data index in this series).
 * seriesUnitFormatCodes: optional unit format codes (one per data index in this series).
 * seriesValues: numeric series data — used to pre-measure underline widths for each label string.
 * percentMode: when true, values are already percentages (0–100); labels render as "<n>%" and
 *   the formatted-value / unit-code inputs are ignored (used by 100% stacked bar variants).
 */
export declare function buildDataLabelConfig(config: ChartConfig, outsidePosition?: OutsidePosition, seriesFormattedValues?: (string | undefined)[], seriesUnitFormatCodes?: (string | undefined)[], seriesValues?: number[], percentMode?: boolean, 
/** Optional category axis labels for `dataLabelShowCategory` (preferred over params.name). */
categoryLabels?: string[]): {
    label: Record<string, unknown>;
    emphasis?: {
        label: Record<string, unknown>;
    };
};
export {};
//# sourceMappingURL=labelUtils.d.ts.map