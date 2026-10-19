import { EChartsOption } from 'echarts';
import { ChartConfig, LineBarAreaData } from '../types';
/** True when the line chart should render on a polar coordinate system. */
export declare function isPolarLineVariant(config: ChartConfig): boolean;
/**
 * Builds an ECharts polar line option from LineBarAreaData.
 * Categories map to the angle axis; series values map to the radius axis.
 */
export declare function buildPolarLineOption(data: LineBarAreaData, config: ChartConfig): EChartsOption;
//# sourceMappingURL=polarLine.d.ts.map