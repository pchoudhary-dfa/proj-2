import { EChartsOption } from 'echarts';
import { ChartConfig, SunburstData } from '../types';
/**
 * Builds ECharts sunburst option from SunburstData and ChartConfig.
 *
 * Supports 1, 2, or 3 ring levels automatically based on node tree depth:
 *   Ring 1 (innermost) = xDimension values (e.g. Indicators, Areas)
 *   Ring 2 (middle)    = seriesDimension children (e.g. Subgroups per Indicator)
 *   Ring 3 (outermost) = seriesDimension2 grandchildren (e.g. Time periods per Subgroup)
 *
 * Typography:
 *   labelFont     → inner ring (category names)
 *   labelFont     → middle ring (category names)
 *   dataLabelFont → outermost ring (value labels)
 *
 * All 6 font controls (title/subtitle/description via app shell; labels, data labels, legend via engine) apply.
 */
export declare function buildSunburstOption(data: SunburstData, config: ChartConfig): EChartsOption;
//# sourceMappingURL=sunburst.d.ts.map