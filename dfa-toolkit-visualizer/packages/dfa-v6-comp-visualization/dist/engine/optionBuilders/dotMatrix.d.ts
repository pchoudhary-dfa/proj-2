import { EChartsOption } from 'echarts';
import { ChartConfig, DotMatrixData } from '../types';
/**
 * Builds ECharts option for a percentage dot-matrix chart via custom series.
 *
 * Fixed 10×10 circle grid: each filled circle = 1%. The last active circle may
 * be partially filled (left fraction) for decimal percentages.
 * Bottom labels are not rendered — chart title / tooltip carry context.
 */
export declare function buildDotMatrixOption(data: DotMatrixData, config: ChartConfig): EChartsOption;
//# sourceMappingURL=dotMatrix.d.ts.map