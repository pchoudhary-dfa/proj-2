import { EChartsOption } from 'echarts';
import { ChartConfig, TreemapData } from '../types';
/**
 * Builds ECharts treemap option from TreemapData and ChartConfig.
 *
 * Config mapping:
 *  - palette           → per-node colors (one color per top-level node, cycling)
 *  - showLabels        → node text labels
 *  - dataLabelVisibility → always | onHover
 *  - dataLabelNumberFormat → value formatting in labels and tooltip
 *  - labelFont / legendFont → typography
 *  - showLegend        → not directly applicable (treemap has no native legend);
 *                         kept as a no-op so toggling the switch doesn't break
 *  - plotAreaBackgroundColor → handled by applyChartSurfaceColors in engine/index.ts
 */
export declare function buildTreemapOption(data: TreemapData, config: ChartConfig): EChartsOption;
//# sourceMappingURL=treemap.d.ts.map