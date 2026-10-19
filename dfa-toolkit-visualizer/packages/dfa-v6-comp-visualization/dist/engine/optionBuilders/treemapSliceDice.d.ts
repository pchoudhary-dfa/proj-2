import { EChartsOption } from 'echarts';
import { ChartConfig, SliceDiceTreemapData } from '../types';
/**
 * Builds ECharts option for a slice-and-dice treemap via custom series.
 *
 * Depth 1 nodes (top-level) are split horizontally left-to-right.
 * Depth 2 nodes (children) are split vertically top-to-bottom inside each parent.
 * This alternation matches the classic Shneiderman slice-and-dice algorithm.
 */
export declare function buildSliceDiceOption(data: SliceDiceTreemapData, config: ChartConfig): EChartsOption;
//# sourceMappingURL=treemapSliceDice.d.ts.map