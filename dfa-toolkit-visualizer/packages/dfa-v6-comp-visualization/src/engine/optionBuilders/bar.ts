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
  seriesYAxisIndex,
  usesSecondaryYAxis,
  estimateCategoryAxisBand,
} from './cartesian';
import { buildDataLabelConfig, collectSeriesLabelPrimeTexts, resolveYAxisTickFont } from './labelUtils';
import {
  PERCENT_STACK,
  computeCategoryTotals,
  toPercentValues,
  withPercentValueAxis,
  hasExplicitVerticalRange,
} from './percentStack';
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

export function buildBarOption(data: LineBarAreaData, config: ChartConfig): EChartsOption {
  // 100% stacked variants (dashboard-only in production; enabled in the visualizer for testing).
  const isPercentVertical = config.chartVariant === 'stacked_percent';
  const isPercentHorizontal = config.chartVariant === 'stacked_percent_bar';
  const isPercent = isPercentVertical || isPercentHorizontal;

  const isHorizontal =
    config.chartVariant === 'horizontal' ||
    config.chartVariant === 'stacked-horizontal' ||
    isPercentHorizontal;
  const useStack =
    config.chartVariant === 'stacked-vertical' ||
    config.chartVariant === 'stacked-horizontal' ||
    isPercent;
  const barCategoryGap =
    typeof config.columnSpacing === 'number' ? `${config.columnSpacing}%` : '43%';
  const outsidePosition = isHorizontal ? 'right' : 'top';
  // Secondary Y-axis is vertical-only; horizontal + percent bars keep a single value axis.
  const allowSecondary = !isHorizontal && !isPercent;
  const dualY = usesSecondaryYAxis(config, data, allowSecondary);

  const categoryTotals = isPercent ? computeCategoryTotals(data) : [];

  const seriesCount = data.series.length;
  const series = data.series.map((s, i) => {
    const displayValues = isPercent ? toPercentValues(s.values, categoryTotals) : s.values;
    const labelConfig = config.showLabels
      ? isPercent
        ? buildDataLabelConfig(config, outsidePosition, undefined, undefined, displayValues, true, data.categories)
        : buildDataLabelConfig(config, outsidePosition, s.formattedValues, s.unitFormatCodes, s.values, false, data.categories)
      : { label: { show: false } };
    const yAxisIndex = seriesYAxisIndex(config, data, s, allowSecondary);
    // Keep stacks isolated per value axis so dual-axis series never share a stack group.
    const stackBase = s.stack ?? 'default';
    const stack = isPercent
      ? PERCENT_STACK
      : useStack && dualY
        ? `${stackBase}__y${yAxisIndex ?? 0}`
        : useStack
          ? stackBase
          : undefined;
    const seriesColor = resolveSeriesColor(s, i, config);
    const itemColor = resolveSeriesItemColor(s, seriesColor);
    const echartsType = resolveSeriesEChartsType(s.seriesType, 'bar');
    const lineWidth = resolveSeriesLineWidth(s, config);
    const dash = resolveSeriesLineDash(s);
    const sym = resolveSeriesSymbol(s, config);
    const emphasis = mergeSeriesEmphasis(
      labelConfig.emphasis as Record<string, unknown> | undefined,
      s.emphasisColor,
    );
    return {
      name: s.name,
      type: echartsType,
      data: applyPointColorsToSeriesData(
        displayValues,
        data.pointColors?.[i],
        data.categoryColors,
      ),
      ...(stack !== undefined && echartsType === 'bar' ? { stack } : {}),
      itemStyle: {
        color: itemColor,
        ...(s.borderColor ? { borderColor: s.borderColor } : {}),
        ...(echartsType === 'bar' && s.itemStyle?.borderWidth != null
          ? { borderWidth: s.itemStyle.borderWidth }
          : {}),
        ...(echartsType !== 'bar'
          ? {
              ...(sym.borderWidth != null ? { borderWidth: sym.borderWidth } : {}),
              ...(sym.borderColor != null ? { borderColor: sym.borderColor } : {}),
            }
          : {}),
      },
      ...(echartsType === 'line' || echartsType === 'scatter'
        ? {
            lineStyle: {
              width: lineWidth,
              color: seriesColor,
              ...(dash ? { type: dash } : {}),
            },
            showSymbol: sym.showSymbol,
            symbol: sym.showSymbol ? sym.symbol : 'none',
            symbolSize: sym.symbolSize,
          }
        : {}),
      ...(echartsType === 'bar' ? { barCategoryGap } : {}),
      label: labelConfig.label,
      ...(emphasis ? { emphasis } : {}),
      ...(yAxisIndex !== undefined ? { yAxisIndex } : {}),
    };
  });

  // Horizontal bars put the category axis on the left; size its band to the widest
  // label so long category names aren't clipped by the fixed numeric-axis band.
  const categoryBand =
    isHorizontal && config.showYAxis
      ? estimateCategoryAxisBand(data.categories, resolveYAxisTickFont(config))
      : undefined;

  let xAxis = isHorizontal ? buildXAxisValue(config) : buildXAxisCategory(data, config);
  let yAxis = isHorizontal
    ? buildYAxisCategory(data, config, categoryBand)
    : buildYAxisValue(config, collectSeriesLabelPrimeTexts(data, config), data, allowSecondary);

  if (isPercent) {
    const explicitVerticalRange = hasExplicitVerticalRange(config);
    if (isPercentHorizontal) {
      xAxis = { xAxis: withPercentValueAxis(xAxis.xAxis as Record<string, unknown>, false) };
    } else {
      const primary = yAxis.yAxis;
      if (!Array.isArray(primary)) {
        yAxis = { yAxis: withPercentValueAxis(primary as Record<string, unknown>, explicitVerticalRange) };
      }
    }
  }

  return {
    ...buildGrid(config, seriesCount, undefined, data, allowSecondary, categoryBand),
    ...xAxis,
    ...yAxis,
    series,
    ...buildLegend(config, seriesCount, undefined, data.series.map((s) => s.name), undefined, data, allowSecondary),
    ...buildTooltipAxis(config, data, isPercent),
  } as EChartsOption;
}
