/**
 * Polar line chart — additive extension of the line chart family.
 * Same LineBarAreaData as cartesian line; activated via chartVariant === 'polar_line'.
 * Does not alter buildLineOption's cartesian path.
 */

import type { EChartsOption } from 'echarts';
import type { ChartConfig, LineBarAreaData } from '../types';
import {
  buildLegend,
  buildTooltipAxis,
  horizontalLegendRowHeight,
  buildAxisLineOption,
  buildSplitLineOption,
  buildAxisTickOption,
  wrapAxisLabelText,
} from './cartesian';
import { buildDataLabelConfig } from './labelUtils';
import { buildAxisTickLabelWithUnderline } from '../fontUtils';
import { resolveXAxisTickFont, resolveYAxisTickFont } from './labelUtils';
import { computeTitleBlockHeight } from '../titleLayout';
import {
  applyPointColorsToSeriesData,
  mergeSeriesEmphasis,
  resolveSeriesColor,
  resolveSeriesItemColor,
  resolveSeriesLineDash,
  resolveSeriesLineWidth,
  resolveSeriesSymbol,
} from './resolveSeriesStyle';

/** True when the line chart should render on a polar coordinate system. */
export function isPolarLineVariant(config: ChartConfig): boolean {
  return config.chartVariant === 'polar_line';
}

function polarLayout(config: ChartConfig): { center: [string, string]; radius: string } {
  const titleBlock = computeTitleBlockHeight(config);
  const pos = config.legendPosition;
  const legendRow = config.showLegend ? horizontalLegendRowHeight(config) : 0;
  const topLegend = pos === 'top' && config.showLegend;
  const bottomLegend = pos === 'bottom' && config.showLegend;
  const sideLegend = (pos === 'left' || pos === 'right') && config.showLegend;

  const topChrome = titleBlock + (topLegend ? legendRow + 20 : titleBlock > 0 ? 8 : 0);
  const bottomChrome = bottomLegend ? legendRow + 8 : 0;
  const shiftPct = Math.min(18, topChrome * 0.04 + (topLegend ? 3 : 0));
  const centerY = `${Math.min(58, 50 + shiftPct - bottomChrome * 0.02)}%`;

  const shrink = topChrome > 40 || bottomChrome > 20 || sideLegend;
  const radius = shrink ? '58%' : '68%';

  return { center: ['50%', centerY], radius };
}

/**
 * Builds an ECharts polar line option from LineBarAreaData.
 * Categories map to the angle axis; series values map to the radius axis.
 */
export function buildPolarLineOption(data: LineBarAreaData, config: ChartConfig): EChartsOption {
  const smooth = false;
  const firstSym = resolveSeriesSymbol(data.series[0] ?? {}, config);
  const legendIcon = firstSym.showSymbol ? firstSym.symbol : 'circle';

  const layout = polarLayout(config);
  const seriesCount = data.series.length;
  const angleFont = resolveXAxisTickFont(config);
  const radiusFont = resolveYAxisTickFont(config);

  const series = data.series.map((s, i) => {
    const labelConfig = config.showLabels
      ? buildDataLabelConfig(config, 'top', s.formattedValues, s.unitFormatCodes, s.values, false, data.categories)
      : { label: { show: false } };
    const seriesColor = resolveSeriesColor(s, i, config);
    const itemColor = resolveSeriesItemColor(s, seriesColor);
    const lineWidth = resolveSeriesLineWidth(s, config);
    const dash = resolveSeriesLineDash(s);
    const sym = resolveSeriesSymbol(s, config);
    const emphasis = mergeSeriesEmphasis(
      labelConfig.emphasis as Record<string, unknown> | undefined,
      s.emphasisColor,
    );

    return {
      name: s.name,
      type: 'line' as const,
      coordinateSystem: 'polar' as const,
      data: applyPointColorsToSeriesData(s.values, data.pointColors?.[i], data.categoryColors),
      smooth,
      lineStyle: {
        width: lineWidth,
        color: seriesColor,
        ...(dash ? { type: dash } : {}),
      },
      itemStyle: {
        color: itemColor,
        ...(sym.borderWidth != null ? { borderWidth: sym.borderWidth } : {}),
        ...(sym.borderColor != null ? { borderColor: sym.borderColor } : {}),
      },
      showSymbol: sym.showSymbol,
      symbol: sym.showSymbol ? sym.symbol : 'none',
      symbolSize: sym.symbolSize,
      label: labelConfig.label,
      ...(emphasis ? { emphasis } : {}),
    };
  });

  const radiusMin =
    config.yAxisMin === undefined || config.yAxisMin === '' ? undefined : Number(config.yAxisMin);
  const radiusMax =
    config.yAxisMax === undefined || config.yAxisMax === '' ? undefined : Number(config.yAxisMax);

  return {
    polar: {
      center: layout.center,
      radius: layout.radius,
    },
    angleAxis: {
      type: 'category',
      data: data.categories,
      show: config.showXAxis,
      clockwise: true,
      startAngle: 90,
      axisLabel: {
        show: config.showXAxis,
        ...buildAxisTickLabelWithUnderline(
          angleFont,
          angleFont.size,
          undefined,
          config.xAxisLabelWrap ? (v) => wrapAxisLabelText(v, true) : undefined,
        ),
      },
      axisLine: buildAxisLineOption(config.xAxisLine, config.showXAxis),
      axisTick: buildAxisTickOption(config.xAxisTicks !== undefined ? config.xAxisTicks : config.showXAxis),
      splitLine: buildSplitLineOption(config.xAxisGrid, config.showGrid, true),
    },
    radiusAxis: {
      type: 'value',
      show: config.showYAxis,
      min: radiusMin,
      max: radiusMax,
      name: config.yAxisLabel || undefined,
      nameGap: 12,
      axisLabel: {
        show: config.showYAxis,
        ...buildAxisTickLabelWithUnderline(
          radiusFont,
          radiusFont.size,
          undefined,
          config.yAxisLabelWrap ? (v) => wrapAxisLabelText(v, true) : undefined,
        ),
      },
      axisLine: buildAxisLineOption(config.yAxisLine, config.showYAxis),
      axisTick: buildAxisTickOption(config.yAxisTicks !== undefined ? config.yAxisTicks : config.showYAxis),
      splitLine: buildSplitLineOption(config.yAxisGrid, config.showGrid, true),
    },
    // Hide cartesian axes left over when switching from a cartesian chart.
    xAxis: { show: false },
    yAxis: { show: false },
    series,
    ...buildLegend(config, seriesCount, legendIcon, data.series.map((s) => s.name), undefined, data),
    ...buildTooltipAxis(config, data),
  } as EChartsOption;
}
