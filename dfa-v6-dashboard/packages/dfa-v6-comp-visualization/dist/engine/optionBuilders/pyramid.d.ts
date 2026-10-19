import { EChartsOption } from 'echarts';
import { ChartConfig, PyramidData } from '../types';
/**
 * Population pyramid (diverging horizontal bar chart).
 *
 * Two `bar` series share a common category Y-axis. The left wing uses
 * pre-negated values so bars extend left of the zero line; the right wing
 * uses positive values. The X-axis labels display Math.abs() of the value
 * so both sides show positive numbers.
 *
 * Works for any dimension combination:
 *   - xDimension → Y-axis categories (age groups, areas, time periods, …)
 *   - leftSeries  → first wing (data already negated by the transform layer)
 *   - rightSeries → second wing (positive values)
 *
 * Edge cases:
 *   - Empty categories → return {} (no crash, ECharts renders blank)
 *   - All-zero data   → symmetric axis still renders; bars are invisible (zero-length)
 *   - Single wing only → impossible: toPyramidDataFromRows returns null if < 2 series values
 *   - Long category labels → containLabel: true handles overflow automatically
 */
export declare function buildPyramidOption(data: PyramidData, config: ChartConfig): EChartsOption;
//# sourceMappingURL=pyramid.d.ts.map