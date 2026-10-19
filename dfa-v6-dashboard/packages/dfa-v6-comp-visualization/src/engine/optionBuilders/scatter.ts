import type { EChartsOption } from 'echarts';
import type { ChartConfig, ScatterXYData } from '../types';
import { buildGrid, buildLegend } from './cartesian';
import { formatLabelValue } from './labelUtils';

export function buildScatterOption(data: ScatterXYData, config: ChartConfig): EChartsOption {
  const symbolSize = config.scatterSymbolSize ?? 10;
  const symbol = config.scatterSymbol ?? 'circle';
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';

  const seriesCount = data.series.length;
  const series = data.series.map((s, i) => ({
    name: s.name,
    type: 'scatter' as const,
    data: s.points.map((p) => ({
      value: [p.x, p.y] as [number, number],
      name: p.label,
    })),
    symbolSize,
    symbol,
    itemStyle: {
      color: config.palette[i % config.palette.length] ?? config.primaryColor,
    },
    label: config.showLabels
      ? {
          show: config.dataLabelVisibility !== 'onHover',
          position: 'top' as const,
          formatter: (params: { name?: string }) => params.name ?? '',
          fontSize: config.labelFont.size,
          fontFamily: config.labelFont.family,
        }
      : { show: false },
    ...(config.showLabels && config.dataLabelVisibility === 'onHover'
      ? { emphasis: { label: { show: true, position: 'top' as const, formatter: (params: { name?: string }) => params.name ?? '', fontSize: config.labelFont.size, fontFamily: config.labelFont.family } } }
      : {}),
  }));

  const xAxisLabel = data.xAxisLabel;
  const yAxisLabel = data.yAxisLabel;

  const xAxis: Record<string, unknown> = config.showXAxis
    ? {
        show: true,
        type: 'value',
        name: xAxisLabel,
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { fontSize: config.labelFont.size, fontFamily: config.labelFont.family },
        axisLine: { show: true },
        splitLine: config.showGrid
          ? { show: true, lineStyle: { type: 'dashed', color: '#e0e0e0', opacity: 0.9 } }
          : { show: false },
        axisLabel: { fontSize: config.labelFont.size, fontFamily: config.labelFont.family },
      }
    : { show: false };

  const yAxis: Record<string, unknown> = config.showYAxis
    ? {
        show: true,
        type: 'value',
        name: yAxisLabel,
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: { fontSize: config.labelFont.size, fontFamily: config.labelFont.family },
        axisLine: { show: true },
        splitLine: config.showGrid
          ? { show: true, lineStyle: { type: 'dashed', color: '#e0e0e0', opacity: 0.9 } }
          : { show: false },
        axisLabel: { fontSize: config.labelFont.size, fontFamily: config.labelFont.family },
      }
    : { show: false };

  return {
    ...buildGrid(config, seriesCount),
    xAxis,
    yAxis,
    series,
    ...buildLegend(config, seriesCount),
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: { name?: string; value?: [number, number]; seriesName?: string }) => {
        const v = params.value;
        if (!v) return '';
        const xFormatted = formatLabelValue(v[0], format);
        const yFormatted = formatLabelValue(v[1], format);
        const label = params.name ? `<strong>${params.name}</strong><br/>` : '';
        const seriesLabel = seriesCount > 1 && params.seriesName ? `${params.seriesName}<br/>` : '';
        return `${seriesLabel}${label}${xAxisLabel}: ${xFormatted}<br/>${yAxisLabel}: ${yFormatted}`;
      },
    },
  } as EChartsOption;
}
