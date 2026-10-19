import { EChartsOption } from 'echarts';
import { ChartConfig, StripesTreemapData } from '../types';
/**
 * Builds ECharts option for a stripes treemap via custom series.
 *
 * All depth levels are split in the same direction:
 *   direction='vertical'   (default) → rows stacked at every level.
 *   direction='horizontal'           → columns side by side at every level.
 *
 * This differs from slice-and-dice in that the split direction never alternates.
 */
export declare function buildStripesOption(data: StripesTreemapData, config: ChartConfig): EChartsOption;
//# sourceMappingURL=treemapStripes.d.ts.map