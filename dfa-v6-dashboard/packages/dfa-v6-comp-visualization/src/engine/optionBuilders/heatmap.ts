import type { EChartsOption } from 'echarts';
import type { ChartConfig, HeatmapData } from '../types';
import {
  LEGEND_SCROLL_HEIGHT,
  LEGEND_SCROLL_WIDTH,
  LEGEND_EDGE_PADDING,
} from './cartesian';
import { formatLabelValue } from './labelUtils';

/**
 * Parse a CSS hex color (#rgb or #rrggbb) into [r, g, b] in 0–255.
 * Returns null for unrecognized formats.
 */
function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return null;
}

/**
 * WCAG relative luminance of a color (0 = black, 1 = white).
 * Falls back to 0.5 for non-hex values so they sort to the middle.
 */
function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Build a monotonic light-to-dark color scale suitable for a sequential heatmap.
 *
 * Multi-color palettes are designed for categorical (per-series) use, so their
 * colors can jump unpredictably in lightness when used as direct visualMap stops
 * (e.g. dark-blue → light-pink → dark-green → …). Sorting by luminance forces
 * a single direction: lightest stop at min, darkest stop at max.
 *
 * A single-color palette produces a near-white → color ramp.
 */
function buildHeatmapColorScale(colors: string[]): string[] {
  if (colors.length === 0) return ['#f5f5f5', '#4a90d9'];
  if (colors.length === 1) return ['#f5f5f5', colors[0]];
  // Sort lightest → darkest (descending luminance = light first)
  return [...colors].sort((a, b) => luminance(b) - luminance(a));
}

/**
 * Builds ECharts heatmap option from HeatmapData and ChartConfig.
 *
 * Axis / UI mapping:
 *  - showXAxis / showYAxis → category axis visibility
 *  - labelOrientation       → X-axis label rotation
 *  - showLegend             → visualMap colorbar visibility
 *  - legendPosition         → colorbar position (top/bottom = horizontal bar, left/right = vertical bar)
 *  - palette                → gradient color stops for the visualMap color scale
 *  - showLabels             → cell value labels
 *  - dataLabelVisibility    → always | onHover for cell labels
 *  - dataLabelNumberFormat  → number format for cell labels and colorbar ticks
 *  - labelFont / legendFont → typography
 *  - plotAreaBackgroundColor → handled by applyChartSurfaceColors in engine/index.ts
 */
export function buildHeatmapOption(data: HeatmapData, config: ChartConfig): EChartsOption {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const pos = config.legendPosition;
  const isVerticalColorbar = pos === 'left' || pos === 'right';

  // ── Grid margins ────────────────────────────────────────────────────────────
  // containLabel:true is set below so ECharts auto-fits labels into these margins.
  // Keep modest base values – the auto-fitting will expand as needed.
  let gridLeft = config.showYAxis ? 10 : 10;
  let gridRight = 15;
  let gridTop = 20;
  let gridBottom = config.showXAxis ? 40 : 10;

  if (config.showLegend) {
    if (pos === 'top') {
      gridTop = LEGEND_SCROLL_HEIGHT + 5;
    } else if (pos === 'bottom') {
      gridBottom = (config.showXAxis ? 40 : 10) + LEGEND_SCROLL_HEIGHT;
    } else if (pos === 'left') {
      gridLeft = LEGEND_SCROLL_WIDTH + 10;
    } else {
      // right
      gridRight = LEGEND_SCROLL_WIDTH + 15;
    }
  }

  // Allow explicit grid overrides (e.g. for compact preview).
  if (config.grid) {
    if (config.grid.left !== undefined) gridLeft = config.grid.left;
    if (config.grid.right !== undefined) gridRight = config.grid.right;
    if (config.grid.top !== undefined) gridTop = config.grid.top;
    if (config.grid.bottom !== undefined) gridBottom = config.grid.bottom;
  }

  // ── Color scale ─────────────────────────────────────────────────────────────
  const rawPalette = config.palette.length > 0 ? config.palette : [config.primaryColor];
  // Sort by luminance so the gradient always runs light → dark regardless of
  // the order the palette was designed in (palettes are built for categorical use).
  const colorScale = buildHeatmapColorScale(rawPalette);

  // ── VisualMap (colorbar) ────────────────────────────────────────────────────
  const visualMapCfg: Record<string, unknown> = {
    type: 'continuous',
    calculable: true,
    min: data.min,
    max: data.max,
    inRange: { color: colorScale },
    show: config.showLegend,
    text: [
      formatLabelValue(data.max, format),
      formatLabelValue(data.min, format),
    ],
    textStyle: {
      fontSize: config.legendFont.size,
      fontFamily: config.legendFont.family,
      fontWeight: config.legendFont.bold ? 'bold' : 'normal',
    },
    orient: isVerticalColorbar ? 'vertical' : 'horizontal',
  };

  if (pos === 'top') {
    visualMapCfg.top = 0;
    visualMapCfg.left = 'center';
  } else if (pos === 'bottom') {
    visualMapCfg.bottom = 0;
    visualMapCfg.left = 'center';
  } else if (pos === 'left') {
    visualMapCfg.left = LEGEND_EDGE_PADDING;
    visualMapCfg.top = 'center';
  } else {
    // right
    visualMapCfg.right = LEGEND_EDGE_PADDING;
    visualMapCfg.top = 'center';
  }

  // ── Category axes ───────────────────────────────────────────────────────────
  // splitArea draws the cell background grid lines.
  const axisLabelBase = {
    fontSize: config.labelFont.size,
    fontFamily: config.labelFont.family,
    fontWeight: config.labelFont.bold ? 'bold' : 'normal',
  };

  const xAxisCfg: Record<string, unknown> = {
    show: config.showXAxis,
    type: 'category',
    data: data.xCategories,
    splitArea: { show: true },
    axisLabel: {
      ...axisLabelBase,
      rotate: config.labelOrientation === 'vertical' ? 45 : 0,
    },
  };

  const yAxisCfg: Record<string, unknown> = {
    show: config.showYAxis,
    type: 'category',
    data: data.yCategories,
    splitArea: { show: true },
    axisLabel: axisLabelBase,
  };

  // ── Cell labels ──────────────────────────────────────────────────────────────
  const showAlways = config.showLabels && config.dataLabelVisibility !== 'onHover';
  const showOnHover = config.showLabels && config.dataLabelVisibility === 'onHover';

  const labelTypography = {
    fontSize: config.labelFont.size,
    fontFamily: config.labelFont.family,
    fontWeight: config.labelFont.bold ? 'bold' : 'normal',
    fontStyle: config.labelFont.italic ? 'italic' : 'normal',
  };

  // ECharts heatmap series formatter receives params.data = [xIdx, yIdx, value]
  const cellFormatter = (params: { data?: [number, number, number] }) =>
    formatLabelValue(Number(params.data?.[2] ?? 0), format);

  const seriesLabel: Record<string, unknown> = showAlways
    ? { show: true, position: 'inside', formatter: cellFormatter, ...labelTypography }
    : { show: false };

  const emphasisLabel: Record<string, unknown> = showOnHover
    ? { show: true, position: 'inside', formatter: cellFormatter, ...labelTypography }
    : { show: false };

  // ── Tooltip ──────────────────────────────────────────────────────────────────
  const tooltipFormatter = (params: unknown) => {
    const p = params as { data?: [number, number, number] };
    if (!Array.isArray(p?.data) || p.data.length < 3) return '';
    const xLabel = data.xCategories[p.data[0]] ?? String(p.data[0]);
    const yLabel = data.yCategories[p.data[1]] ?? String(p.data[1]);
    const val = formatLabelValue(p.data[2], format);
    return `<strong>${yLabel}</strong><br/>${xLabel}: <strong>${val}</strong>`;
  };

  return {
    grid: {
      left: gridLeft,
      right: gridRight,
      top: gridTop,
      bottom: gridBottom,
      containLabel: true,
    },
    xAxis: xAxisCfg,
    yAxis: yAxisCfg,
    visualMap: [visualMapCfg],
    series: [
      {
        type: 'heatmap',
        data: data.cells,
        label: seriesLabel,
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' },
          label: emphasisLabel,
        },
      },
    ],
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: tooltipFormatter,
    },
  } as EChartsOption;
}
