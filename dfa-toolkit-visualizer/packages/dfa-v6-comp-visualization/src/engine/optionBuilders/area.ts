import type { EChartsOption } from 'echarts';
import type { ChartConfig, LineBarAreaData } from '../types';
import {
  buildGrid,
  buildXAxisCategory,
  buildYAxisValue,
  buildLegend,
  buildTooltipAxis,
  seriesYAxisIndex,
  usesSecondaryYAxis,
} from './cartesian';
import { buildDataLabelConfig, collectSeriesLabelPrimeTexts } from './labelUtils';
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
  shouldApplyAreaStyle,
} from './resolveSeriesStyle';

export function buildAreaOption(data: LineBarAreaData, config: ChartConfig): EChartsOption {
  // Absolute stacked (`stacked`) and 100% stacked (`stacked_percent`) — dashboard IDs.
  // Interpolation variants (`curved` / `stepped`) stay mutually exclusive with stacking IDs.
  const isPercent = config.chartVariant === 'stacked_percent';
  const isStacked = config.chartVariant === 'stacked' || isPercent;
  const smooth = config.chartVariant === 'curved';
  const step = config.chartVariant === 'stepped' ? 'end' : false;

  const firstSym = resolveSeriesSymbol(data.series[0] ?? {}, config);
  const legendIcon = firstSym.showSymbol ? firstSym.symbol : 'circle';

  // Percent stacked area uses a single value Y-axis; absolute stacked still allows secondary Y.
  const allowSecondary = !isPercent;
  const dualY = usesSecondaryYAxis(config, data, allowSecondary);

  const categoryTotals = isPercent ? computeCategoryTotals(data) : [];

  const seriesCount = data.series.length;
  const series = data.series.map((s, i) => {
    const displayValues = isPercent ? toPercentValues(s.values, categoryTotals) : s.values;
    const labelConfig = config.showLabels
      ? isPercent
        ? buildDataLabelConfig(config, 'top', undefined, undefined, displayValues, true, data.categories)
        : buildDataLabelConfig(config, 'top', s.formattedValues, s.unitFormatCodes, s.values, false, data.categories)
      : { label: { show: false } };
    const color = resolveSeriesColor(s, i, config);
    const itemColor = resolveSeriesItemColor(s, color);
    const lineWidth = resolveSeriesLineWidth(s, config);
    const dash = resolveSeriesLineDash(s);
    const sym = resolveSeriesSymbol(s, config);
    const yAxisIndex = seriesYAxisIndex(config, data, s, allowSecondary);
    // Keep stacks isolated per value axis so dual-axis series never share a stack group.
    const stackBase = s.stack ?? 'default';
    const stack = isPercent
      ? PERCENT_STACK
      : isStacked && dualY
        ? `${stackBase}__y${yAxisIndex ?? 0}`
        : isStacked
          ? stackBase
          : undefined;
    const echartsType = resolveSeriesEChartsType(s.seriesType, 'line');
    const useArea = shouldApplyAreaStyle(s.seriesType) && echartsType === 'line';
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
      smooth: echartsType === 'line' ? !!smooth : undefined,
      step: echartsType === 'line' ? step : undefined,
      ...(stack !== undefined && (echartsType === 'line' || echartsType === 'bar') ? { stack } : {}),
      lineStyle: {
        width: lineWidth,
        color,
        ...(dash ? { type: dash } : {}),
      },
      itemStyle: {
        color: itemColor,
        ...(sym.borderWidth != null && sym.showSymbol ? { borderWidth: sym.borderWidth } : {}),
        ...(sym.borderColor != null && sym.showSymbol ? { borderColor: sym.borderColor } : {}),
        ...(s.borderColor && echartsType === 'bar' ? { borderColor: s.borderColor } : {}),
      },
      ...(useArea ? { areaStyle: { color, opacity: 0.3 } } : {}),
      ...(echartsType === 'line' || echartsType === 'scatter'
        ? {
            showSymbol: sym.showSymbol,
            symbol: sym.showSymbol ? sym.symbol : 'none',
            symbolSize: sym.symbolSize,
          }
        : {}),
      ...(echartsType === 'bar' ? { barCategoryGap: typeof config.columnSpacing === 'number' ? `${config.columnSpacing}%` : '43%' } : {}),
      label: labelConfig.label,
      ...(emphasis ? { emphasis } : {}),
      ...(yAxisIndex !== undefined ? { yAxisIndex } : {}),
    };
  });

  let yAxis = buildYAxisValue(config, collectSeriesLabelPrimeTexts(data, config), data, allowSecondary);

  if (isPercent) {
    const primary = yAxis.yAxis;
    if (!Array.isArray(primary)) {
      yAxis = {
        yAxis: withPercentValueAxis(primary as Record<string, unknown>, hasExplicitVerticalRange(config)),
      };
    }
  }

  return {
    ...buildGrid(config, seriesCount, legendIcon, data, allowSecondary),
    ...buildXAxisCategory(data, config),
    ...yAxis,
    series,
    ...buildLegend(config, seriesCount, legendIcon, data.series.map((s) => s.name), undefined, data, allowSecondary),
    ...buildTooltipAxis(config, data, isPercent),
  } as EChartsOption;
}
