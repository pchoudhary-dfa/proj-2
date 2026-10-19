import type { EChartsOption } from 'echarts';
import type { ChartConfig, LineBarAreaData } from '../types';
import {
  buildGrid,
  buildXAxisCategory,
  buildXAxisValue,
  buildYAxisCategory,
  buildYAxisValue,
  buildLegend,
  buildTooltipAxis,
  estimateCategoryAxisBand,
  seriesYAxisIndex,
} from './cartesian';
import { buildDataLabelConfig, collectSeriesLabelPrimeTexts, resolveYAxisTickFont } from './labelUtils';
import { buildPolarLineOption, isPolarLineVariant } from './polarLine';
import {
  applyPointColorsToSeriesData,
  mergeSeriesEmphasis,
  resolveSeriesColor,
  resolveSeriesEChartsType,
  resolveSeriesItemColor,
  resolveSeriesLineDash,
  resolveSeriesLineWidth,
  resolveSeriesSymbol,
} from './resolveSeriesStyle';

export function buildLineOption(data: LineBarAreaData, config: ChartConfig): EChartsOption {
  // Additive extension — polar line uses the same data shape; cartesian path below is unchanged.
  if (isPolarLineVariant(config)) {
    return buildPolarLineOption(data, config);
  }

  const smooth = config.chartVariant === 'curved';
  const step = config.chartVariant === 'stepped' ? 'end' : false;
  // v5 lnInverted / Highcharts chart.inverted — categories on Y, values on X.
  const inverted = !!config.inverted;

  // Legend icon from first series (or global) for grid/legend layout.
  const firstSym = resolveSeriesSymbol(data.series[0] ?? {}, config);
  const legendIcon = firstSym.showSymbol ? firstSym.symbol : 'circle';

  const seriesCount = data.series.length;
  const series = data.series.map((s, i) => {
    const labelConfig = config.showLabels
      ? buildDataLabelConfig(
          config,
          inverted ? 'right' : 'top',
          s.formattedValues,
          s.unitFormatCodes,
          s.values,
          false,
          data.categories,
        )
      : { label: { show: false } };
    const seriesColor = resolveSeriesColor(s, i, config);
    const itemColor = resolveSeriesItemColor(s, seriesColor);
    const lineWidth = resolveSeriesLineWidth(s, config);
    const dash = resolveSeriesLineDash(s);
    const sym = resolveSeriesSymbol(s, config);
    const yAxisIndex = inverted ? undefined : seriesYAxisIndex(config, data, s);
    const echartsType = resolveSeriesEChartsType(s.seriesType, 'line');
    const emphasis = mergeSeriesEmphasis(
      labelConfig.emphasis as Record<string, unknown> | undefined,
      s.emphasisColor,
    );
    return {
      name: s.name,
      type: echartsType,
      data: applyPointColorsToSeriesData(s.values, data.pointColors?.[i], data.categoryColors),
      smooth: echartsType === 'line' ? !!smooth : undefined,
      step: echartsType === 'line' ? step : undefined,
      lineStyle: {
        width: lineWidth,
        color: seriesColor,
        ...(dash ? { type: dash } : {}),
      },
      itemStyle: {
        color: itemColor,
        ...(sym.borderWidth != null ? { borderWidth: sym.borderWidth } : {}),
        ...(sym.borderColor != null ? { borderColor: sym.borderColor } : {}),
        ...(s.borderColor && echartsType === 'bar' ? { borderColor: s.borderColor } : {}),
      },
      showSymbol: echartsType === 'line' || echartsType === 'scatter' ? sym.showSymbol : undefined,
      symbol: echartsType === 'line' || echartsType === 'scatter' ? (sym.showSymbol ? sym.symbol : 'none') : undefined,
      symbolSize: echartsType === 'line' || echartsType === 'scatter' ? sym.symbolSize : undefined,
      label: labelConfig.label,
      ...(emphasis ? { emphasis } : {}),
      ...(yAxisIndex !== undefined ? { yAxisIndex } : {}),
    };
  });

  if (inverted) {
    // Category on Y, value on X — secondary Y-axis not applicable in this orientation.
    const categoryBand = config.showYAxis
      ? estimateCategoryAxisBand(data.categories, resolveYAxisTickFont(config))
      : undefined;
    return {
      ...buildGrid(config, seriesCount, legendIcon, data, false, categoryBand),
      ...buildYAxisCategory(data, config, categoryBand),
      ...buildXAxisValue(config),
      series,
      ...buildLegend(config, seriesCount, legendIcon, data.series.map((s) => s.name), undefined, data, false),
      ...buildTooltipAxis(config, data),
    } as EChartsOption;
  }

  return {
    ...buildGrid(config, seriesCount, legendIcon, data),
    ...buildXAxisCategory(data, config),
    ...buildYAxisValue(config, collectSeriesLabelPrimeTexts(data, config), data),
    series,
    ...buildLegend(config, seriesCount, legendIcon, data.series.map((s) => s.name), undefined, data),
    ...buildTooltipAxis(config, data),
  } as EChartsOption;
}
