import type { EChartsOption } from 'echarts';
import type { ChartConfig, ScatterXYData } from '../types';
import {
  buildGrid,
  buildLegend,
  buildAxisLineOption,
  buildSplitLineOption,
  buildAxisTickOption,
  wrapAxisLabelText,
} from './cartesian';
import { buildAxisNameOptions, buildAxisTickLabelWithUnderline } from '../fontUtils';
import { buildLabelTypography, collectScatterLabelPrimeTexts, resolveFormattedValue, resolveDataLabelFont, resolveXAxisTickFont, resolveYAxisTickFont } from './labelUtils';

export function buildScatterOption(data: ScatterXYData, config: ChartConfig): EChartsOption {
  const symbolSize = config.seriesSymbolSize ?? config.scatterSymbolSize ?? 10;
  const symbol = (config.seriesSymbol !== 'none' ? config.seriesSymbol : undefined) ?? config.scatterSymbol ?? 'circle';
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const primeTexts = collectScatterLabelPrimeTexts(data);
  const dataFont = resolveDataLabelFont(config);
  const xTickFont = resolveXAxisTickFont(config);
  const yTickFont = resolveYAxisTickFont(config);

  const seriesCount = data.series.length;
  const pointLabel = buildLabelTypography(config, primeTexts, dataFont);

  const pointLabelFormatter = (params: { name?: string }) =>
    pointLabel.formatText(params.name ?? '');

  const series = data.series.map((s, i) => {
    const seriesColor = s.color ?? config.palette[i % config.palette.length] ?? config.primaryColor;
    const itemColor = s.itemStyle?.color ?? seriesColor;
    const labelEmphasis =
      config.showLabels && config.dataLabelVisibility === 'onHover'
        ? {
            label: {
              show: true,
              position: 'top' as const,
              formatter: pointLabelFormatter,
              ...pointLabel.typography,
            },
          }
        : undefined;
    const emphasis = s.emphasisColor
      ? {
          ...(labelEmphasis ?? {}),
          itemStyle: { color: s.emphasisColor },
        }
      : labelEmphasis;
    return {
      name: s.name,
      type: 'scatter' as const,
      data: s.points.map((p) => ({
        value: [p.x, p.y] as [number, number],
        name: p.label,
      })),
      symbolSize: s.symbolSize ?? symbolSize,
      symbol: s.symbol ?? symbol,
      itemStyle: {
        color: itemColor,
        ...(s.borderColor || s.itemStyle?.borderColor
          ? { borderColor: s.itemStyle?.borderColor ?? s.borderColor }
          : {}),
        ...(s.itemStyle?.borderWidth != null ? { borderWidth: s.itemStyle.borderWidth } : {}),
      },
      label: config.showLabels
        ? {
            show: config.dataLabelVisibility !== 'onHover',
            position: 'top' as const,
            formatter: pointLabelFormatter,
            ...pointLabel.typography,
          }
        : { show: false },
      ...(emphasis ? { emphasis } : {}),
    };
  });

  const xAxisLabel = config.xAxisLabel ?? data.xAxisLabel;
  const yAxisLabel = config.yAxisLabel ?? data.yAxisLabel;
  const xName = xAxisLabel
    ? buildAxisNameOptions(xAxisLabel, config.xAxisLabelFont, config.labelFont.size)
    : null;
  const yName = yAxisLabel
    ? buildAxisNameOptions(yAxisLabel, config.yAxisLabelFont, config.labelFont.size)
    : null;

  const xAxis: Record<string, unknown> = config.showXAxis
    ? {
        show: true,
        type: 'value',
        ...(xName
          ? {
              name: xName.name,
              nameLocation: 'middle',
              nameGap: 30,
              nameTextStyle: {
                ...xName.nameTextStyle,
                ...(config.xAxisLabelAlign ? { align: config.xAxisLabelAlign } : {}),
              },
            }
          : {}),
        axisLine: buildAxisLineOption(config.xAxisLine, true),
        axisTick: buildAxisTickOption(config.xAxisTicks),
        splitLine: buildSplitLineOption(config.xAxisGrid, config.showGrid, true),
        axisLabel: buildAxisTickLabelWithUnderline(
          xTickFont,
          xTickFont.size,
          config.xAxisLabelRotation !== undefined ? { rotate: config.xAxisLabelRotation } : undefined,
          config.xAxisLabelWrap ? (v) => wrapAxisLabelText(v, true) : undefined,
        ),
      }
    : { show: false };

  const yAxis: Record<string, unknown> = config.showYAxis
    ? {
        show: true,
        type: 'value',
        ...(yName
          ? {
              name: yName.name,
              nameLocation: 'middle',
              nameGap: 50,
              nameTextStyle: {
                ...yName.nameTextStyle,
                ...(config.yAxisLabelAlign ? { align: config.yAxisLabelAlign } : {}),
              },
            }
          : {}),
        axisLine: buildAxisLineOption(config.yAxisLine, true),
        axisTick: buildAxisTickOption(config.yAxisTicks),
        splitLine: buildSplitLineOption(config.yAxisGrid, config.showGrid, true),
        axisLabel: buildAxisTickLabelWithUnderline(
          yTickFont,
          yTickFont.size,
          config.yAxisLabelRotation !== undefined ? { rotate: config.yAxisLabelRotation } : undefined,
          config.yAxisLabelWrap ? (v) => wrapAxisLabelText(v, true) : undefined,
        ),
      }
    : { show: false };

  const gridConfig: ChartConfig = {
    ...config,
    xAxisLabel: xAxisLabel || config.xAxisLabel,
    yAxisLabel: yAxisLabel || config.yAxisLabel,
  };

  return {
    ...buildGrid(gridConfig, seriesCount, symbol),
    xAxis,
    yAxis,
    series,
    ...buildLegend(config, seriesCount, symbol, data.series.map((s) => s.name)),
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: { name?: string; value?: [number, number]; seriesName?: string; seriesIndex?: number; dataIndex?: number }) => {
        const v = params.value;
        if (!v) return '';
        const useUnit = config.useUnitDefaultFormat ?? false;
        const si = params.seriesIndex ?? 0;
        const di = params.dataIndex ?? 0;
        const pt = data.series[si]?.points[di];
        const xFormatted = resolveFormattedValue(v[0], format, useUnit, pt?.formattedX, pt?.unitFormatCodeX);
        const yFormatted = resolveFormattedValue(v[1], format, useUnit, pt?.formattedY, pt?.unitFormatCodeY);
        const label = params.name ? `<strong>${params.name}</strong><br/>` : '';
        const seriesLabel = seriesCount > 1 && params.seriesName ? `${params.seriesName}<br/>` : '';
        return `${seriesLabel}${label}${xAxisLabel}: ${xFormatted}<br/>${yAxisLabel}: ${yFormatted}`;
      },
    },
  } as EChartsOption;
}
