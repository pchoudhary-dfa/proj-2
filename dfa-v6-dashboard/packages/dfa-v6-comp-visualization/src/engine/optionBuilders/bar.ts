import type { EChartsOption } from 'echarts';
import type { ChartConfig, LineBarAreaData } from '../types';
import {
  buildGrid,
  buildXAxisCategory,
  buildYAxisValue,
  buildXAxisValue,
  buildYAxisCategory,
  buildLegend,
  buildTooltipAxis,
} from './cartesian';
import { buildDataLabelConfig } from './labelUtils';

export function buildBarOption(data: LineBarAreaData, config: ChartConfig): EChartsOption {
  const isHorizontal =
    config.chartVariant === 'horizontal' || config.chartVariant === 'stacked-horizontal';
  const useStack =
    config.chartVariant === 'stacked-vertical' || config.chartVariant === 'stacked-horizontal';
  const barCategoryGap =
    typeof config.columnSpacing === 'number' ? `${config.columnSpacing}%` : '43%';
  const outsidePosition = isHorizontal ? 'right' : 'top';
  const labelConfig = config.showLabels ? buildDataLabelConfig(config, outsidePosition) : { label: { show: false } };

  const seriesCount = data.series.length;
  const series = data.series.map((s, i) => ({
    name: s.name,
    type: 'bar',
    data: s.values,
    ...(useStack ? { stack: s.stack ?? 'default' } : {}),
    itemStyle: { color: config.palette[i % config.palette.length] ?? config.primaryColor },
    barCategoryGap,
    label: labelConfig.label,
    ...(labelConfig.emphasis ? { emphasis: labelConfig.emphasis } : {}),
  }));

  const xAxis = isHorizontal ? buildXAxisValue(config) : buildXAxisCategory(data, config);
  const yAxis = isHorizontal ? buildYAxisCategory(data, config) : buildYAxisValue(config);

  return {
    ...buildGrid(config, seriesCount),
    ...xAxis,
    ...yAxis,
    series,
    ...buildLegend(config, seriesCount),
    ...buildTooltipAxis(),
  } as EChartsOption;
}
