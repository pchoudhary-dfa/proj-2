import { EChartsOption } from 'echarts';
import { ChartConfig, HundredMinusData } from '../types';
/**
 * Builds ECharts option for a "100 minus" percentage donut.
 *
 * Two segments: the value arc and the remainder (100 − value). A centered
 * numeric label shows the percentage. Legend and segment labels are off.
 */
export declare function buildHundredMinusOption(data: HundredMinusData, config: ChartConfig): EChartsOption;
//# sourceMappingURL=hundredMinus.d.ts.map