import { ECharts } from 'echarts';
import { ChartConfig, ChartData } from './types';
export { isEmptyChartData } from './isEmptyChartData';
export type { ChartConfig, ChartData, LineBarAreaData, LineBarAreaSeriesItem, PieChartData, ScatterXYData, ScatterSeriesItem, SeriesStyleOverrides, SeriesChartTypeOverride, HeatmapData, TreemapData, SliceDiceTreemapData, StripesTreemapData, SunburstData, DotMatrixData, HundredMinusData, RadarData, PyramidData, MapChartData, PointMeta, FontStyle, RequiredFontStyle } from './types';
export { ECHARTS_CANVAS_SUPPORTS_TEXT_DECORATION, applyCanvasUnderline, formatCanvasText, measureTextWidth, resolveUnderlineColor, buildRichUnderlinePack, buildAxisNameOptions, buildUnderlinedTextFields, escapeRichText } from './fontUtils';
export { isLineBarAreaData, isPieChartData, isScatterXYData, isHeatmapData, isTreemapData, isSliceDiceTreemapData, isStripesTreemapData, isSunburstData, isDotMatrixData, isHundredMinusData, isRadarData, isPyramidData, isMapChartData } from './types';
export { resolveSeriesColor, resolveSeriesLineWidth, resolveSeriesLineDash, resolveSeriesSymbol, resolveSeriesEChartsType, shouldApplyAreaStyle, resolveSeriesItemColor, mergeSeriesEmphasis, applyCategoryColorsToSeriesData, applyPointColorsToSeriesData, } from './optionBuilders/resolveSeriesStyle';
export type ChartInstance = ECharts;
export interface ChartCallbacks {
    onPointClick?: (params: {
        seriesName?: string;
        name?: string;
        value?: unknown;
        dataIndex?: number;
    }) => void;
    onLegendClick?: (params: {
        name: string;
    }) => void;
}
export declare function init(container: HTMLElement, data: ChartData, config: ChartConfig, callbacks?: ChartCallbacks): ChartInstance;
export declare function update(instance: ChartInstance, data: ChartData, config: ChartConfig): void;
export declare function destroy(instance: ChartInstance): void;
export declare function getDataURL(instance: ChartInstance, type?: 'png' | 'svg'): string;
//# sourceMappingURL=index.d.ts.map