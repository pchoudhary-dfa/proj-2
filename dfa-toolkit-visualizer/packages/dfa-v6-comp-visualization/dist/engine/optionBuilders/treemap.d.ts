import { EChartsOption } from 'echarts';
import { ChartConfig, TreemapData } from '../types';
/**
 * Builds ECharts treemap option from TreemapData and ChartConfig.
 * Treemap legend not applicable — hierarchical nodes cannot bind to ECharts legend items.
 */
export declare function buildTreemapOption(data: TreemapData, config: ChartConfig): EChartsOption;
//# sourceMappingURL=treemap.d.ts.map