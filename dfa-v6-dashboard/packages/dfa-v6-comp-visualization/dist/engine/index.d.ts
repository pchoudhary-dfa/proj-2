import { ECharts } from 'echarts';
import { ChartConfig, ChartData, LineBarAreaData, PieChartData, ScatterXYData, HeatmapData, TreemapData, RadarData, PyramidData } from './types';
export type { ChartConfig, ChartData, LineBarAreaData, PieChartData, ScatterXYData, HeatmapData, TreemapData, RadarData, PyramidData };
export { isLineBarAreaData, isPieChartData, isScatterXYData, isHeatmapData, isTreemapData, isRadarData, isPyramidData } from './types';
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