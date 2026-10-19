import { EChartsOption } from 'echarts';
import { ChartConfig, HeatmapData } from '../types';
/**
 * Builds ECharts heatmap option from HeatmapData and ChartConfig.
 *
 * Axis / UI mapping:
 *  - showXAxis / showYAxis → category axis visibility
 *  - labelOrientation       → X-axis label rotation
 *  - showLegend             → visualMap colorbar visibility
 *  - legendPosition         → colorbar position (top/bottom = horizontal bar, left/right = vertical bar)
 *  - palette                → gradient color stops for the visualMap color scale
 *  - showLabels             → cell value labels
 *  - dataLabelVisibility    → always | onHover for cell labels
 *  - dataLabelNumberFormat  → number format for cell labels and colorbar ticks
 *  - labelFont / legendFont → typography
 *  - plotAreaBackgroundColor → handled by applyChartSurfaceColors in engine/index.ts
 */
export declare function buildHeatmapOption(data: HeatmapData, config: ChartConfig): EChartsOption;
//# sourceMappingURL=heatmap.d.ts.map