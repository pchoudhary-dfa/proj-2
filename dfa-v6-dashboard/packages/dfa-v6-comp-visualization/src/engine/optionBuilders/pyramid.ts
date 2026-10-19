import type { EChartsOption } from 'echarts';
import type { ChartConfig, PyramidData } from '../types';
import {
  LEGEND_SCROLL_HEIGHT,
  LEGEND_SCROLL_WIDTH,
  LEGEND_EDGE_PADDING,
  buildLegend,
  wrapLegendName,
} from './cartesian';
import { formatLabelValue } from './labelUtils';

/**
 * Build grid for a horizontal diverging bar (population pyramid).
 * Uses containLabel: true because category labels on the Y-axis can be long
 * and vary in width (area names, subgroup names, etc.).
 */
function buildPyramidGrid(config: ChartConfig): Record<string, unknown> {
  const pos = config.legendPosition;
  let top = 20;
  let bottom = config.showXAxis ? 40 : 15;
  let left = 10;
  let right = 10;

  if (config.showLegend) {
    if (pos === 'top') top = LEGEND_SCROLL_HEIGHT + 5;
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

  // Legend — 2 items always (left wing name + right wing name)
  const { legend: legendConfig } = buildLegend(config, 2);

  const showAlways = config.showLabels && config.dataLabelVisibility !== 'onHover';
  const showOnHover = config.showLabels && config.dataLabelVisibility === 'onHover';
  const inside = config.dataLabelPosition === 'inside';

  const labelTypography = {
    fontSize: config.labelFont.size,
    fontFamily: config.labelFont.family,
    fontWeight: config.labelFont.bold ? 'bold' : 'normal',
    fontStyle: config.labelFont.italic ? 'italic' : 'normal',
  };

  // Left wing: values are negative — display Math.abs
  const leftLabelFormatter = (p: unknown) => {
    const v = (p as { value?: number })?.value ?? 0;
    return formatLabelValue(Math.abs(v), format);
  };
  // Right wing: values are positive
  const rightLabelFormatter = (p: unknown) => {
    const v = (p as { value?: number })?.value ?? 0;
    return formatLabelValue(v, format);
  };

  const makeLabel = (formatter: (p: unknown) => string, position: 'insideLeft' | 'right') => ({
    show: showAlways,
    position: inside ? 'inside' : position,
    formatter,
    ...labelTypography,
  });

  const makeEmphasisLabel = (
    formatter: (p: unknown) => string,
    position: 'insideLeft' | 'right'
  ) => ({
    label: showOnHover
      ? { show: true, position: inside ? 'inside' : position, formatter, ...labelTypography }
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
        }>;
        if (!list || list.length === 0) return '';
        const catIdx = list[0]?.dataIndex ?? 0;
        const category = data.categories[catIdx] ?? '';
        const lines = list
          .map((p) => {
            const rawVal = formatLabelValue(Math.abs(p.value ?? 0), format);
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
      splitLine: config.showGrid
        ? { show: true, lineStyle: { type: 'dashed', color: '#e0e0e0', opacity: 0.9 } }
        : { show: false },
      axisLabel: {
        show: config.showXAxis,
        formatter: (v: number) => formatLabelValue(Math.abs(v), format),
        fontSize: config.labelFont.size,
        fontFamily: config.labelFont.family,
      },
    },
    yAxis: {
      type: 'category',
      data: data.categories,
      show: config.showYAxis,
      axisLabel: {
        show: config.showYAxis,
        fontSize: config.labelFont.size,
        fontFamily: config.labelFont.family,
      },
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
        data: data.rightSeries.values,
        itemStyle: { color: rightColor },
        label: makeLabel(rightLabelFormatter, 'right'),
        emphasis: makeEmphasisLabel(rightLabelFormatter, 'right'),
      },
    ],
  } as EChartsOption;
}
