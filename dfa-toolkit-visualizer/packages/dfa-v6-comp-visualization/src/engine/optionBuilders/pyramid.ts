import type { EChartsOption } from 'echarts';
import type { ChartConfig, PyramidData } from '../types';
import {
  LEGEND_SCROLL_HEIGHT,
  LEGEND_SCROLL_WIDTH,
  LEGEND_EDGE_PADDING,
  buildLegend,
  gridTopWithTopLegend,
  buildAxisLineOption,
  buildSplitLineOption,
  buildAxisTickOption,
  wrapAxisLabelText,
} from './cartesian';
import {
  formatLabelValue,
  resolveFormattedValue,
  buildLabelTypography,
  collectPyramidLabelPrimeTexts,
  resolveDataLabelFont,
  resolveXAxisTickFont,
  resolveYAxisTickFont,
} from './labelUtils';
import { buildAxisTickLabelWithUnderline } from '../fontUtils';
import { computeTitleBlockHeight } from '../titleLayout';

/**
 * Build grid for a horizontal diverging bar (population pyramid).
 * Uses containLabel: true because category labels on the Y-axis can be long
 * and vary in width (area names, subgroup names, etc.).
 */
function buildPyramidGrid(config: ChartConfig): Record<string, unknown> {
  const pos = config.legendPosition;
  const titleBlock = computeTitleBlockHeight(config);
  let top = 20 + titleBlock;
  let bottom = config.showXAxis ? 40 : 15;
  let left = 10;
  let right = 10;

  if (config.showLegend) {
    if (pos === 'top') top = gridTopWithTopLegend(config);
    else if (pos === 'bottom') bottom = (config.showXAxis ? 40 : 15) + LEGEND_SCROLL_HEIGHT;
    else if (pos === 'left') left = LEGEND_SCROLL_WIDTH + 10;
    else if (pos === 'right') right = LEGEND_SCROLL_WIDTH + 10;
  }

  if (config.grid) {
    if (config.grid.left !== undefined) left = config.grid.left;
    if (config.grid.right !== undefined) right = config.grid.right;
    if (config.grid.top !== undefined) top = config.grid.top;
    if (config.grid.bottom !== undefined) bottom = config.grid.bottom;
  }

  return { left, right, top, bottom, containLabel: true };
}

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
export function buildPyramidOption(data: PyramidData, config: ChartConfig): EChartsOption {
  if (data.categories.length === 0) {
    return {};
  }

  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const palette = config.palette.length > 0 ? config.palette : [config.primaryColor];
  const leftColor = palette[0] ?? config.primaryColor;
  const rightColor = palette[1] ?? palette[0] ?? config.primaryColor;

  // Compute symmetric axis bounds so both wings use the same scale.
  // Honor yAxisMax from config as an explicit override (e.g. to align multiple charts).
  const configMax =
    config.yAxisMax !== undefined && config.yAxisMax !== ''
      ? Number(config.yAxisMax)
      : null;
  const dataMax = Math.max(
    ...data.leftSeries.values.map((v) => Math.abs(v)),
    ...data.rightSeries.values,
    0
  );
  // Add 10 % headroom so bars never press against the axis edge (same feel as ECharts auto-scale
  // for bar charts). The user can override via configMax to pin the symmetric bound exactly.
  const autoMax = dataMax > 0 ? dataMax * 1.1 : 1;
  const axisMax = configMax !== null && configMax > 0 ? configMax : autoMax;

  const grid = buildPyramidGrid(config);
  const primeTexts = collectPyramidLabelPrimeTexts(data, config);
  const xTickFont = resolveXAxisTickFont(config);
  const yTickFont = resolveYAxisTickFont(config);
  const dataFont = resolveDataLabelFont(config);
  const dataLabelStyle = buildLabelTypography(config, primeTexts, dataFont);
  const wingNames = [data.leftSeries.name, data.rightSeries.name];

  const { legend: legendConfig } = buildLegend(config, 2, undefined, wingNames);

  const showAlways = config.showLabels && config.dataLabelVisibility !== 'onHover';
  const showOnHover = config.showLabels && config.dataLabelVisibility === 'onHover';
  const inside = config.dataLabelPosition === 'inside';

  const useUnit = config.useUnitDefaultFormat ?? false;

  const leftLabelFormatter = (p: unknown) => {
    const params = p as { value?: number; dataIndex?: number };
    const v = params?.value ?? 0;
    const idx = params?.dataIndex ?? 0;
    const pre = data.leftSeries.formattedValues?.[idx];
    const unitCode = data.leftSeries.unitFormatCodes?.[idx];
    const text = resolveFormattedValue(Math.abs(v), format, useUnit, pre, unitCode);
    return dataLabelStyle.formatText(text);
  };
  const rightLabelFormatter = (p: unknown) => {
    const params = p as { value?: number; dataIndex?: number };
    const v = params?.value ?? 0;
    const idx = params?.dataIndex ?? 0;
    const pre = data.rightSeries.formattedValues?.[idx];
    const unitCode = data.rightSeries.unitFormatCodes?.[idx];
    const text = resolveFormattedValue(v, format, useUnit, pre, unitCode);
    return dataLabelStyle.formatText(text);
  };

  const makeLabel = (formatter: (p: unknown) => string, position: 'insideLeft' | 'right') => ({
    show: showAlways,
    position: inside ? 'inside' : position,
    formatter,
    ...dataLabelStyle.typography,
  });

  const makeEmphasisLabel = (
    formatter: (p: unknown) => string,
    position: 'insideLeft' | 'right'
  ) => ({
    label: showOnHover
      ? { show: true, position: inside ? 'inside' : position, formatter, ...dataLabelStyle.typography }
      : { show: false },
  });

  return {
    grid,
    legend: legendConfig,
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const list = params as Array<{
          seriesName?: string;
          value?: number;
          marker?: string;
          dataIndex?: number;
          seriesIndex?: number;
        }>;
        if (!list || list.length === 0) return '';
        const catIdx = list[0]?.dataIndex ?? 0;
        const category = data.categories[catIdx] ?? '';
        const lines = list
          .map((p) => {
            const di = p.dataIndex ?? 0;
            const pre = p.seriesIndex === 0
              ? data.leftSeries.formattedValues?.[di]
              : data.rightSeries.formattedValues?.[di];
            const unitCode = p.seriesIndex === 0
              ? data.leftSeries.unitFormatCodes?.[di]
              : data.rightSeries.unitFormatCodes?.[di];
            const rawVal = resolveFormattedValue(Math.abs(p.value ?? 0), format, useUnit, pre, unitCode);
            return `${p.marker ?? ''}${p.seriesName ?? ''}: ${rawVal}`;
          })
          .join('<br/>');
        return `<strong>${category}</strong><br/>${lines}`;
      },
    },
    xAxis: {
      type: 'value',
      min: -axisMax,
      max: axisMax,
      show: config.showXAxis,
      axisLine: buildAxisLineOption(config.xAxisLine, config.showXAxis),
      axisTick: buildAxisTickOption(config.xAxisTicks),
      splitLine: buildSplitLineOption(config.xAxisGrid, config.showGrid, true),
      axisLabel: buildAxisTickLabelWithUnderline(
        xTickFont,
        xTickFont.size,
        { show: config.showXAxis },
        (v) => formatLabelValue(Math.abs(Number(v)), format),
      ),
    },
    yAxis: {
      type: 'category',
      data: data.categories,
      show: config.showYAxis,
      axisLine: buildAxisLineOption(config.yAxisLine, config.showYAxis),
      axisTick: buildAxisTickOption(config.yAxisTicks),
      splitLine: buildSplitLineOption(config.yAxisGrid, config.showGrid, false),
      axisLabel: buildAxisTickLabelWithUnderline(
        yTickFont,
        yTickFont.size,
        { show: config.showYAxis },
        config.yAxisLabelWrap ? (v) => wrapAxisLabelText(v, true) : undefined,
      ),
    },
    series: [
      {
        name: data.leftSeries.name,
        type: 'bar',
        data: data.leftSeries.values,
        itemStyle: { color: leftColor },
        label: makeLabel(leftLabelFormatter, 'insideLeft'),
        emphasis: makeEmphasisLabel(leftLabelFormatter, 'insideLeft'),
      },
      {
        name: data.rightSeries.name,
        type: 'bar',
        barGap: '-100%',
        data: data.rightSeries.values,
        itemStyle: { color: rightColor },
        label: makeLabel(rightLabelFormatter, 'right'),
        emphasis: makeEmphasisLabel(rightLabelFormatter, 'right'),
      },
    ],
  } as EChartsOption;
}
