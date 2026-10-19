import type { EChartsOption } from 'echarts';
import type { ChartConfig, LineBarAreaData } from '../types';
import {
  buildGrid,
  buildXAxisCategory,
  buildYAxisValue,
  buildLegend,
  buildTooltipAxis,
} from './cartesian';
import { buildDataLabelConfig } from './labelUtils';

export function buildLineOption(data: LineBarAreaData, config: ChartConfig): EChartsOption {
  const smooth = config.chartVariant === 'curved';
  const step = config.chartVariant === 'stepped' ? 'end' : false;
  const lineWidth = config.lineThickness ?? 2;
  const labelConfig = config.showLabels ? buildDataLabelConfig(config, 'top') : { label: { show: false } };

  const seriesCount = data.series.length;
  const series = data.series.map((s, i) => ({
    name: s.name,
    type: 'line',
    data: s.values,
    smooth: !!smooth,
    step: step,
    lineStyle: { width: lineWidth },
    itemStyle: {
      color: s.values.length
        ? (config.palette[i % config.palette.length] ?? config.primaryColor)
        : config.primaryColor,
    },
    showSymbol: true,
    symbol: 'circle',
    symbolSize: 6,
    label: labelConfig.label,
    ...(labelConfig.emphasis ? { emphasis: labelConfig.emphasis } : {}),
  }));

  return {
    ...buildGrid(config, seriesCount),
    ...buildXAxisCategory(data, config),
    ...buildYAxisValue(config),
    series,
    ...buildLegend(config, seriesCount),
    ...buildTooltipAxis(),
  } as EChartsOption;
}
