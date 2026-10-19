/**
 * Shared cartesian option builders for line, bar, and area charts.
 * Reduces duplication of grid, axes, legend, and tooltip configuration.
 */

import type { ChartConfig, LineBarAreaData } from '../types';
import {
  formatLabelValue,
  resolveFormattedValue,
  formatPercentLabel,
  resolveXAxisTickFont,
  resolveYAxisTickFont,
  resolveSecondaryYAxisTickFont,
  isLocalePrecisionFormat,
  parseLocaleFromFormat,
  localizeCategoryLabel,
} from './labelUtils';
import { buildAxisNameOptions, buildAxisTickLabelWithUnderline, buildUnderlinedTextFields } from '../fontUtils';
import type { RequiredFontStyle } from '../types';
import {
  computeTitleBlockHeight,
  TITLE_LEGEND_GAP,
  GRID_BELOW_TOP_LEGEND_GAP,
  DEFAULT_TOP_LEGEND_INSET,
} from '../titleLayout';

/** Max height for horizontal (top/bottom) scroll legend container. */
export const LEGEND_SCROLL_HEIGHT = 40;
/** Fixed width for vertical (left/right) scroll legend. */
export const LEGEND_SCROLL_WIDTH = 120;
/** Padding when legend is left or right. */
export const LEGEND_EDGE_PADDING = 10;

/** Approximate px per character for proportional fonts (empirically ~0.55 * fontSize). */
const AVG_CHAR_WIDTH_RATIO = 0.55;
/** Reserve space for legend icon + gap so text wrapping uses remaining width. */
const LEGEND_ICON_RESERVE_PX = 22;

/**
 * Wraps a legend name to fit within a given pixel width using word boundaries.
 * Uses font size to estimate average character width (no DOM/canvas).
 * For use when legend is left/right so long names don't overlap the chart.
 */
export function wrapLegendName(
  name: string,
  legendWidthPx: number,
  font: { size: number; family?: string }
): string {
  const textWidthPx = Math.max(20, legendWidthPx - LEGEND_ICON_RESERVE_PX);
  const avgCharWidth = AVG_CHAR_WIDTH_RATIO * font.size;
  const maxCharsPerLine = Math.max(1, Math.floor(textWidthPx / avgCharWidth));

  const words = name.split(/\s+/);
  if (words.length <= 1) {
    if (name.length <= maxCharsPerLine) return name;
    return name.match(new RegExp(`(.{1,${maxCharsPerLine}})`, 'g'))?.join('\n') ?? name;
  }

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = '';
      }
      if (word.length > maxCharsPerLine) {
        const chunks = word.match(new RegExp(`(.{1,${maxCharsPerLine}})`, 'g')) ?? [word];
        for (let i = 0; i < chunks.length - 1; i++) lines.push(chunks[i]);
        current = chunks[chunks.length - 1];
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);

  return lines.join('\n');
}

/** Y-axis range helpers: treat empty string as "auto". */
function yAxisNum(value: number | '' | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  return Number(value);
}

/**
 * Absolute stacked bar/area must start at 0 so segment heights match values.
 * Without this, ECharts `scale: true` raises the baseline and clips the bottom series.
 * 100% stacked variants already pin 0–100 via `withPercentValueAxis`.
 */
export function requiresStackedZeroBaseline(config: ChartConfig): boolean {
  const v = config.chartVariant;
  return (
    v === 'stacked-vertical' ||
    v === 'stacked-horizontal' ||
    v === 'stacked'
  );
}

function useScrollLegend(seriesCount: number | undefined): boolean {
  return seriesCount != null;
}

/** Extra grid margin when an axis title (name) is shown. */
const AXIS_NAME_GAP_X = 28;
const AXIS_NAME_GAP_Y = 28;
/** Tick/label band for a value Y-axis outside the grid. */
const VALUE_AXIS_TICK_BAND = 62;
/** Must match secondary axis `nameGap` in buildSecondaryValueAxis. */
const SECONDARY_AXIS_NAME_GAP = 50;
/** Breathing room between secondary-axis chrome and a right-side legend. */
const RIGHT_LEGEND_SECONDARY_GAP = 16;

/** Floor for a horizontal-bar category label band (keeps the numeric-axis default). */
const CATEGORY_LABEL_MIN_BAND = VALUE_AXIS_TICK_BAND;
/** Cap so long category names don't eat the whole plot; wider labels are ellipsised. */
const CATEGORY_LABEL_MAX_BAND = 220;
/** Space reserved for the axis tick + a little breathing room beside the label text. */
const CATEGORY_LABEL_TICK_GAP = 14;

/**
 * Estimate the left-margin band (px) needed for horizontal-bar category labels so long
 * names aren't clipped by the fixed value-axis band. Approximates text width from the font
 * size (no DOM/canvas), clamped between a floor and a cap. Labels wider than the cap are
 * truncated with an ellipsis by the axis itself (see `buildYAxisCategory`).
 */
export function estimateCategoryAxisBand(
  categories: Array<string | number>,
  font: RequiredFontStyle,
): number {
  if (!categories.length) return CATEGORY_LABEL_MIN_BAND;
  const maxChars = categories.reduce<number>(
    (m, c) => Math.max(m, String(c ?? '').length),
    0,
  );
  const estimated =
    Math.ceil(maxChars * font.size * AVG_CHAR_WIDTH_RATIO) + CATEGORY_LABEL_TICK_GAP;
  return Math.min(Math.max(estimated, CATEGORY_LABEL_MIN_BAND), CATEGORY_LABEL_MAX_BAND);
}

/**
 * Estimate the value-axis tick band when dashboard locale/precision formatting makes
 * labels wider than the default (e.g. `1,239,755.00`). Prevents leading digits from
 * being clipped with `containLabel: false`.
 */
export function estimateValueAxisBand(
  data: LineBarAreaData | undefined,
  config: ChartConfig,
): number {
  const format = config.dataLabelNumberFormat;
  if (!data || !isLocalePrecisionFormat(format)) return VALUE_AXIS_TICK_BAND;

  let maxAbs = 0;
  for (const s of data.series) {
    for (const v of s.values) {
      if (Number.isFinite(v)) maxAbs = Math.max(maxAbs, Math.abs(v));
    }
  }
  const yMax = config.yAxisMax != null ? Math.abs(Number(config.yAxisMax)) : NaN;
  if (Number.isFinite(yMax)) maxAbs = Math.max(maxAbs, yMax);

  const sample = formatLabelValue(maxAbs, format as string);
  const font = resolveYAxisTickFont(config);
  const estimated =
    Math.ceil(sample.length * font.size * AVG_CHAR_WIDTH_RATIO) + CATEGORY_LABEL_TICK_GAP;
  return Math.min(Math.max(estimated, VALUE_AXIS_TICK_BAND), CATEGORY_LABEL_MAX_BAND);
}

/** Width available for category label text within a given band (band minus tick gap). */
export function categoryLabelTextWidth(band: number): number {
  return Math.max(24, band - CATEGORY_LABEL_TICK_GAP);
}

/**
 * Right-side layout when secondary Y + legend(right) are both on:
 *   [plot | secondary ticks/title | gap | legend | edge]
 * Secondary axis stays at the grid edge (no ECharts `offset` — that splits the margin).
 * Legend stays at the container's right edge.
 */
export function secondaryRightBandWidth(
  config: ChartConfig,
  secondaryChrome: boolean
): number {
  if (!secondaryChrome) return 0;
  return (
    VALUE_AXIS_TICK_BAND + (config.secondaryYAxisLabel ? SECONDARY_AXIS_NAME_GAP : 0)
  );
}

function rightMarginWithLegendAndSecondary(
  config: ChartConfig,
  secondaryChrome: boolean
): number {
  return (
    secondaryRightBandWidth(config, secondaryChrome) +
    RIGHT_LEGEND_SECONDARY_GAP +
    LEGEND_SCROLL_WIDTH +
    LEGEND_EDGE_PADDING
  );
}

/**
 * True when secondary Y-axis is gated on and at least one series binds to axis 1.
 * Horizontal bar variants should pass `allowSecondary: false`.
 */
export function usesSecondaryYAxis(
  config: ChartConfig,
  data: LineBarAreaData | undefined,
  allowSecondary = true
): boolean {
  if (!allowSecondary || !config.enableSecondaryYAxis || !data) return false;
  return data.series.some((s) => s.yAxisIndex === 1);
}

/** Whether the right-axis chrome should reserve grid margin / be visible. */
export function showSecondaryYAxisChrome(
  config: ChartConfig,
  data: LineBarAreaData | undefined,
  allowSecondary = true
): boolean {
  return usesSecondaryYAxis(config, data, allowSecondary) && config.showSecondaryYAxis !== false;
}

/** Series yAxisIndex for ECharts when dual axes are active; omit property when inactive. */
export function seriesYAxisIndex(
  config: ChartConfig,
  data: LineBarAreaData,
  series: { yAxisIndex?: 0 | 1 },
  allowSecondary = true
): 0 | 1 | undefined {
  if (!usesSecondaryYAxis(config, data, allowSecondary)) return undefined;
  return series.yAxisIndex === 1 ? 1 : 0;
}

/** Extra vertical space when legend has background/border padding. */
export function legendChromePadding(config: ChartConfig): number {
  if (!config.showLegend) return 0;
  if (config.legendBackground || config.legendBorder) return 12;
  return 0;
}

/** Y offset for top legend / colorbar when canvas titles are present. */
export function topLegendOffsetY(config: ChartConfig): number {
  const titleBlock = computeTitleBlockHeight(config);
  return titleBlock > 0 ? titleBlock + TITLE_LEGEND_GAP : 0;
}

/** Grid top margin when legend is at top (title block + legend row + gap). */
export function gridTopWithTopLegend(config: ChartConfig, legendIcon?: string): number {
  const titleBlock = computeTitleBlockHeight(config);
  if (!config.showLegend || config.legendPosition !== 'top') {
    return 20 + titleBlock;
  }
  const legendRow = horizontalLegendRowHeight(config, legendIcon);
  // Legend starts at legendTop (with title) or DEFAULT_TOP_LEGEND_INSET (without title).
  const legendTop = topLegendOffsetY(config);
  const legendStart = legendTop > 0 ? legendTop : DEFAULT_TOP_LEGEND_INSET;
  return legendStart + legendRow + legendChromePadding(config) + GRID_BELOW_TOP_LEGEND_GAP;
}

/** Legend marker size — matches data-point symbol size when provided. */
export function legendMarkerSize(config: ChartConfig, legendIcon?: string): number {
  if (legendIcon) {
    return config.seriesSymbolSize ?? (config.type === 'scatter' ? 10 : 6);
  }
  return 14;
}

/** Single-row height for horizontal top/bottom legend (text + icon + padding). */
export function horizontalLegendRowHeight(config: ChartConfig, legendIcon?: string): number {
  const marker = legendMarkerSize(config, legendIcon);
  return Math.max(marker, config.legendFont.size) + 8;
}

function axisTickLabel(
  font: RequiredFontStyle,
  extra?: Record<string, unknown>,
  formatTick?: (value: string | number) => string,
): Record<string, unknown> {
  return buildAxisTickLabelWithUnderline(font, font.size, extra, formatTick);
}

/**
 * Format value-axis tick labels with `dataLabelNumberFormat` when it is a
 * dashboard locale/precision bridge string (or converted unit preset).
 * Visualizer preset formats (`1,000[.00]`, `1K`, …) leave ECharts defaults.
 */
function valueAxisNumberTickFormatter(
  config: ChartConfig,
): ((value: string | number) => string) | undefined {
  const format = config.dataLabelNumberFormat;
  if (!format) return undefined;
  const f = format.trim();
  const isLocalePrecision =
    f.startsWith('locale:') || f.startsWith('precision:') || /^\{[^{}]*\}$/.test(f);
  if (!isLocalePrecision) return undefined;
  return (value) => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    return formatLabelValue(n, format);
  };
}

function composeTickFormatters(
  ...fns: Array<((value: string | number) => string) | undefined>
): ((value: string | number) => string) | undefined {
  const active = fns.filter(Boolean) as Array<(value: string | number) => string>;
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  return (value) => active.reduce((acc, fn) => fn(acc), value as string | number) as string;
}

function axisNameBlock(
  label: string | undefined,
  font: ChartConfig['xAxisLabelFont'],
  defaultSize: number,
  nameGap: number,
  align?: 'left' | 'center' | 'right',
): Record<string, unknown> {
  if (!label) return {};
  const nameOpts = buildAxisNameOptions(label, font, defaultSize);
  return {
    name: nameOpts.name,
    nameLocation: 'middle',
    nameGap,
    nameTextStyle: {
      ...nameOpts.nameTextStyle,
      ...(align ? { align } : {}),
    },
  };
}

/** Map host dashStyle strings (Highcharts-style) to ECharts lineStyle.type. */
export function mapDashStyleToEcharts(
  dashStyle: string | undefined
): 'solid' | 'dashed' | 'dotted' {
  const key = (dashStyle ?? '').toUpperCase().replace(/-/g, '_');
  if (key === 'SOLID') return 'solid';
  if (key === 'DOT' || key === 'DOTTED') return 'dotted';
  // SHORT_, DASH, LONG_DASH, and unknowns → dashed (matches prior hardcoded default)
  return 'dashed';
}

type AxisLineCfg = { color?: string; width?: number };
type AxisGridCfg = { show: boolean; color?: string; width?: number; dashStyle?: string };

/** Axis baseline — omit props keeps ECharts default line styling with show:true. */
export function buildAxisLineOption(
  line: AxisLineCfg | undefined,
  showFallback: boolean
): Record<string, unknown> {
  if (!line) {
    return { show: showFallback };
  }
  const width = line.width;
  const show = width === undefined ? showFallback : width > 0;
  if (!show) return { show: false };
  const lineStyle: Record<string, unknown> = {};
  if (line.color) lineStyle.color = line.color;
  if (width !== undefined) lineStyle.width = width;
  return {
    show: true,
    ...(Object.keys(lineStyle).length > 0 ? { lineStyle } : {}),
  };
}

/**
 * splitLine from explicit grid cfg, else legacy `showGrid` + dashed #e0e0e0.
 * Value axes typically own the plot grid; category axes usually leave splitLine off unless configured.
 */
export function buildSplitLineOption(
  grid: AxisGridCfg | undefined,
  legacyShowGrid: boolean,
  /** When true and no explicit grid object, use legacyShowGrid (value axes). */
  useLegacyWhenUnset = true
): Record<string, unknown> {
  if (grid) {
    if (!grid.show) return { show: false };
    const lineStyle: Record<string, unknown> = {
      type: mapDashStyleToEcharts(grid.dashStyle),
      color: grid.color || '#e0e0e0',
      opacity: 0.9,
    };
    if (grid.width !== undefined) lineStyle.width = grid.width;
    return { show: true, lineStyle };
  }
  if (!useLegacyWhenUnset) return { show: false };
  return legacyShowGrid
    ? { show: true, lineStyle: { type: 'dashed', color: '#e0e0e0', opacity: 0.9 } }
    : { show: false };
}

export function buildAxisTickOption(ticksEnabled: boolean | undefined): Record<string, unknown> {
  return { show: ticksEnabled !== false };
}

/** Soft-wrap axis tick labels by estimated character budget (HTML newlines for rich labels). */
export function wrapAxisLabelText(value: string | number, enabled: boolean | undefined): string {
  const text = String(value ?? '');
  if (!enabled || !text) return text;
  // Wider budget so typical area/time labels wrap instead of looking unchanged.
  const maxChars = 16;
  if (text.length <= maxChars) return text;
  const words = text.split(/\s+/);
  if (words.length <= 1) {
    return text.match(new RegExp(`(.{1,${maxChars}})`, 'g'))?.join('\n') ?? text;
  }
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (word.length > maxChars) {
        const chunks = word.match(new RegExp(`(.{1,${maxChars}})`, 'g')) ?? [word];
        for (let i = 0; i < chunks.length - 1; i++) lines.push(chunks[i]);
        current = chunks[chunks.length - 1] ?? '';
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function axisTickLabelsVisible(config: ChartConfig, axis: 'x' | 'y'): boolean {
  if (axis === 'x') {
    if (config.showXAxisTickLabels !== undefined) return config.showXAxisTickLabels;
    return config.showXAxis;
  }
  if (config.showYAxisTickLabels !== undefined) return config.showYAxisTickLabels;
  return config.showYAxis;
}

export function buildGrid(
  config: ChartConfig,
  seriesCount?: number,
  legendIcon?: string,
  data?: LineBarAreaData,
  allowSecondaryYAxis = true,
  /** Left band for a horizontal-bar category axis; falls back to the numeric tick band. */
  categoryLabelBand?: number,
): { grid: Record<string, unknown> } {
  const pos = config.legendPosition;
  const titleBlock = computeTitleBlockHeight(config);
  const secondaryChrome = showSecondaryYAxisChrome(config, data, allowSecondaryYAxis);

  // containLabel: false so grid.backgroundColor only covers the data area (between axis lines),
  // not the axis label zones. Margins are large enough for typical axis labels to render outside.
  // Horizontal bars pass a category band sized to the widest label so names aren't clipped.
  // Vertical charts with locale/precision formatting get a wider value-axis band for big numbers.
  const yAxisBand = categoryLabelBand ?? estimateValueAxisBand(data, config);
  let left = config.showYAxis ? yAxisBand : 15;
  let right = secondaryChrome ? estimateValueAxisBand(data, config) : 15;
  let top = 20 + titleBlock;
  let bottom = config.showXAxis ? 56 : 15;

  if (config.yAxisLabel) {
    left += AXIS_NAME_GAP_Y;
  }
  if (secondaryChrome && config.secondaryYAxisLabel) {
    right += SECONDARY_AXIS_NAME_GAP;
  }
  if (config.xAxisLabel) {
    bottom += AXIS_NAME_GAP_X;
  }

  const legendRow = horizontalLegendRowHeight(config, legendIcon);

  if (config.showLegend && !config.legendFloating) {
    if (pos === 'top') {
      top = gridTopWithTopLegend(config, legendIcon);
    } else if (pos === 'bottom') {
      bottom =
        (config.showXAxis ? 56 : 15) +
        legendRow +
        (config.xAxisLabel ? AXIS_NAME_GAP_X : 0);
    } else if (pos === 'left') {
      left =
        LEGEND_SCROLL_WIDTH +
        (config.showYAxis ? yAxisBand : 15) +
        (config.yAxisLabel ? AXIS_NAME_GAP_Y : 0);
    } else if (pos === 'right') {
      // [plot | secondary | gap | legend | edge]
      right = rightMarginWithLegendAndSecondary(config, secondaryChrome);
    }
  } else if (config.showLegend && config.legendFloating && secondaryChrome && pos === 'right') {
    // Floating legend still needs secondary-axis band; legend overlays plot.
    right = secondaryRightBandWidth(config, secondaryChrome) + 15;
  }

  // Optional grid overrides (e.g. for compact preview)
  if (config.grid) {
    if (config.grid.left !== undefined) left = config.grid.left;
    if (config.grid.right !== undefined) right = config.grid.right;
    if (config.grid.top !== undefined) top = config.grid.top;
    if (config.grid.bottom !== undefined) bottom = config.grid.bottom;
  }

  return {
    grid: {
      left,
      right,
      top,
      bottom,
      containLabel: false,
    },
  };
}

export function buildXAxisCategory(
  data: LineBarAreaData,
  config: ChartConfig
): { xAxis: Record<string, unknown> } {
  if (!config.showXAxis) {
    return { xAxis: { show: false } };
  }
  const rotate =
    config.xAxisLabelRotation !== undefined
      ? config.xAxisLabelRotation
      : config.labelOrientation === 'vertical'
        ? 45
        : 0;
  const wrap = config.xAxisLabelWrap;
  const tickLabelsOn = axisTickLabelsVisible(config, 'x');
  const locale = parseLocaleFromFormat(config.dataLabelNumberFormat);
  return {
    xAxis: {
      show: true,
      type: 'category',
      data: data.categories,
      axisLine: buildAxisLineOption(config.xAxisLine, true),
      axisTick: tickLabelsOn ? buildAxisTickOption(config.xAxisTicks) : { show: false },
      splitLine: buildSplitLineOption(config.xAxisGrid, config.showGrid, false),
      ...(config.xAxisLabel
        ? axisNameBlock(
            config.xAxisLabel,
            config.xAxisLabelFont,
            config.labelFont.size,
            30,
            config.xAxisLabelAlign,
          )
        : {}),
      axisLabel: tickLabelsOn
        ? axisTickLabel(
            resolveXAxisTickFont(config),
            { rotate },
            composeTickFormatters(
              locale ? (v) => localizeCategoryLabel(String(v), locale) : undefined,
              wrap ? (v) => wrapAxisLabelText(v, true) : undefined,
            ),
          )
        : { show: false },
    },
  };
}

function buildPrimaryValueAxis(
  config: ChartConfig,
  show: boolean
): Record<string, unknown> {
  const min = yAxisNum(config.yAxisMin);
  const max = yAxisNum(config.yAxisMax);
  const interval = yAxisNum(config.yAxisInterval);
  const hasExplicitRange = min !== undefined || max !== undefined;
  const zeroBaseline = requiresStackedZeroBaseline(config);

  let rangeProps: Record<string, unknown>;
  if (hasExplicitRange) {
    rangeProps = {
      scale: false,
      // Stacked charts still need min 0 when the user only set a max.
      ...(min !== undefined ? { min } : zeroBaseline ? { min: 0 } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(interval !== undefined ? { interval } : {}),
    };
  } else if (zeroBaseline) {
    rangeProps = { scale: false, min: 0 };
  } else {
    rangeProps = { scale: true };
  }

  return {
    show,
    type: 'value',
    ...rangeProps,
    splitLine: show
      ? buildSplitLineOption(config.yAxisGrid, config.showGrid, true)
      : { show: false },
    axisLine: buildAxisLineOption(config.yAxisLine, show),
    axisTick: show && axisTickLabelsVisible(config, 'y')
      ? buildAxisTickOption(config.yAxisTicks)
      : { show: false },
    ...(show && config.yAxisLabel
      ? axisNameBlock(
          config.yAxisLabel,
          config.yAxisLabelFont,
          config.labelFont.size,
          50,
          config.yAxisLabelAlign,
        )
      : {}),
    axisLabel: show && axisTickLabelsVisible(config, 'y')
      ? axisTickLabel(
          resolveYAxisTickFont(config),
          {
            ...(config.yAxisLabelRotation !== undefined ? { rotate: config.yAxisLabelRotation } : {}),
          },
          composeTickFormatters(
            valueAxisNumberTickFormatter(config),
            config.yAxisLabelWrap ? (v) => wrapAxisLabelText(v, true) : undefined,
          ),
        )
      : { show: false },
  };
}

function buildSecondaryValueAxis(config: ChartConfig, show: boolean): Record<string, unknown> {
  const min = yAxisNum(config.secondaryYAxisMin);
  const max = yAxisNum(config.secondaryYAxisMax);
  const interval = yAxisNum(config.secondaryYAxisInterval);
  const hasExplicitRange = min !== undefined || max !== undefined;
  const zeroBaseline = requiresStackedZeroBaseline(config);

  let rangeProps: Record<string, unknown>;
  if (hasExplicitRange) {
    rangeProps = {
      scale: false,
      ...(min !== undefined ? { min } : zeroBaseline ? { min: 0 } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(interval !== undefined ? { interval } : {}),
    };
  } else if (zeroBaseline) {
    rangeProps = { scale: false, min: 0 };
  } else {
    rangeProps = { scale: true };
  }

  return {
    show,
    type: 'value',
    position: 'right',
    ...rangeProps,
    // Avoid double grid lines; primary axis owns splitLine.
    splitLine: { show: false },
    axisLine: buildAxisLineOption(config.secondaryYAxisLine ?? config.yAxisLine, show),
    axisTick:
      show &&
      (config.secondaryYAxisTicks !== undefined
        ? config.secondaryYAxisTicks
        : config.yAxisTicks !== false)
        ? buildAxisTickOption(
            config.secondaryYAxisTicks !== undefined
              ? config.secondaryYAxisTicks
              : config.yAxisTicks,
          )
        : { show: false },
    ...(show && config.secondaryYAxisLabel
      ? axisNameBlock(
          config.secondaryYAxisLabel,
          config.secondaryYAxisLabelFont,
          config.labelFont.size,
          SECONDARY_AXIS_NAME_GAP
        )
      : {}),
    axisLabel: show
      ? axisTickLabel(
          resolveSecondaryYAxisTickFont(config),
          {
            ...(config.secondaryYAxisLabelRotation !== undefined
              ? { rotate: config.secondaryYAxisLabelRotation }
              : {}),
          },
          valueAxisNumberTickFormatter(config),
        )
      : { show: false },
  };
}

/**
 * Value Y-axis builder for vertical line/bar/area.
 * When secondary Y is inactive: returns a single `yAxis` object (legacy shape).
 * When active: returns `yAxis: [primary, secondary]` with stable indices 0/1.
 */
export function buildYAxisValue(
  config: ChartConfig,
  tickPrimeTexts?: string[],
  data?: LineBarAreaData,
  allowSecondary = true
): { yAxis: Record<string, unknown> | Record<string, unknown>[] } {
  void tickPrimeTexts; // reserved for future per-axis label-width hints

  if (!usesSecondaryYAxis(config, data, allowSecondary) || !data) {
    if (!config.showYAxis) {
      return { yAxis: { show: false } };
    }
    return { yAxis: buildPrimaryValueAxis(config, true) };
  }

  const hasPrimarySeries = data.series.some((s) => s.yAxisIndex !== 1);
  const hasSecondarySeries = data.series.some((s) => s.yAxisIndex === 1);
  // Hide chrome when toggled off or when no series bind to that axis; keep scale props for bound series.
  const showPrimary = config.showYAxis && hasPrimarySeries;
  const showSecondary = config.showSecondaryYAxis !== false && hasSecondarySeries;

  return {
    yAxis: [
      buildPrimaryValueAxis(config, showPrimary),
      buildSecondaryValueAxis(config, showSecondary),
    ],
  };
}

/** Category y-axis (for horizontal bar). */
export function buildYAxisCategory(
  data: LineBarAreaData,
  config: ChartConfig,
  /** Left band reserved for labels; when set, labels wider than it truncate with an ellipsis. */
  labelBand?: number,
): { yAxis: Record<string, unknown> } {
  if (!config.showYAxis) {
    return { yAxis: { show: false } };
  }
  // Constrain label text to the reserved band so overflow ellipsises gracefully
  // instead of being clipped off-canvas. Skipped when labels are rotated (the band
  // assumes horizontal text).
  const constrainLabel = labelBand !== undefined && !config.yAxisLabelRotation;
  const wrap = config.yAxisLabelWrap;
  const tickLabelsOn = axisTickLabelsVisible(config, 'y');
  const locale = parseLocaleFromFormat(config.dataLabelNumberFormat);
  return {
    yAxis: {
      show: true,
      type: 'category',
      data: data.categories,
      axisLine: buildAxisLineOption(config.yAxisLine, true),
      axisTick: tickLabelsOn ? buildAxisTickOption(config.yAxisTicks) : { show: false },
      splitLine: buildSplitLineOption(config.yAxisGrid, config.showGrid, false),
      ...(config.yAxisLabel
        ? axisNameBlock(
            config.yAxisLabel,
            config.yAxisLabelFont,
            config.labelFont.size,
            50,
            config.yAxisLabelAlign,
          )
        : {}),
      axisLabel: tickLabelsOn
        ? axisTickLabel(
            resolveYAxisTickFont(config),
            {
              ...(config.yAxisLabelRotation !== undefined ? { rotate: config.yAxisLabelRotation } : {}),
              ...(constrainLabel && !wrap
                ? { width: categoryLabelTextWidth(labelBand as number), overflow: 'truncate' }
                : {}),
            },
            composeTickFormatters(
              locale ? (v) => localizeCategoryLabel(String(v), locale) : undefined,
              wrap ? (v) => wrapAxisLabelText(v, true) : undefined,
            ),
          )
        : { show: false },
    },
  };
}

/** Value x-axis (for horizontal bar). */
export function buildXAxisValue(config: ChartConfig): { xAxis: Record<string, unknown> } {
  if (!config.showXAxis) {
    return { xAxis: { show: false } };
  }
  const rotate =
    config.xAxisLabelRotation !== undefined
      ? config.xAxisLabelRotation
      : config.labelOrientation === 'vertical'
        ? 45
        : 0;
  // Horizontal / inverted charts use this as the value axis — honor Y scale props.
  const min = yAxisNum(config.yAxisMin);
  const max = yAxisNum(config.yAxisMax);
  const interval = yAxisNum(config.yAxisInterval);
  const hasExplicitRange = min !== undefined || max !== undefined;
  const zeroBaseline = requiresStackedZeroBaseline(config);
  const tickLabelsOn = axisTickLabelsVisible(config, 'x');

  let rangeProps: Record<string, unknown> = {};
  if (hasExplicitRange) {
    rangeProps = {
      scale: false,
      ...(min !== undefined ? { min } : zeroBaseline ? { min: 0 } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(interval !== undefined ? { interval } : {}),
    };
  } else if (zeroBaseline) {
    rangeProps = { scale: false, min: 0 };
  }

  return {
    xAxis: {
      show: true,
      type: 'value',
      ...rangeProps,
      splitLine: buildSplitLineOption(config.xAxisGrid, config.showGrid, true),
      axisLine: buildAxisLineOption(config.xAxisLine, true),
      axisTick: tickLabelsOn ? buildAxisTickOption(config.xAxisTicks) : { show: false },
      ...(config.xAxisLabel
        ? axisNameBlock(
            config.xAxisLabel,
            config.xAxisLabelFont,
            config.labelFont.size,
            30,
            config.xAxisLabelAlign,
          )
        : {}),
      axisLabel: tickLabelsOn
        ? axisTickLabel(
            resolveXAxisTickFont(config),
            rotate !== 0 ? { rotate } : {},
            composeTickFormatters(
              valueAxisNumberTickFormatter(config),
              config.xAxisLabelWrap ? (v) => wrapAxisLabelText(v, true) : undefined,
            ),
          )
        : { show: false },
    },
  };
}

export function buildLegend(
  config: ChartConfig,
  seriesCount?: number,
  legendIcon?: string,
  legendNames?: string[],
  /** Optional per-name marker colors (for hierarchical charts that don't auto-link to series). */
  legendColors?: string[],
  data?: LineBarAreaData,
  allowSecondaryYAxis = true,
): { legend: Record<string, unknown> } {
  if (!config.showLegend) {
    return { legend: { show: false } };
  }
  // Explicit empty name list → hide entirely so border/bg chrome doesn't render alone.
  if (legendNames && legendNames.length === 0) {
    return { legend: { show: false } };
  }
  const pos = config.legendPosition;
  const isVertical = pos === 'left' || pos === 'right';
  const scroll = useScrollLegend(seriesCount);
  const markerSize = legendMarkerSize(config, legendIcon);
  const rowHeight = horizontalLegendRowHeight(config, legendIcon);
  void data;
  void allowSecondaryYAxis;

  // Left-aligned rich underline: a real rule row is drawn under each line (clear of
  // descenders) starting at the text's left edge, so it never shifts right the way a
  // centered fixed-width rich box does.
  // The rule styles are keyed by measured text width, so we must prime every line that
  // can actually render — including the per-line pieces a vertical legend wraps a name
  // into — otherwise the wrapped lines reference an unregistered rule and draw nothing.
  const underlinePrimeTexts = isVertical
    ? (legendNames ?? []).flatMap((n) =>
        wrapLegendName(n, LEGEND_SCROLL_WIDTH, config.legendFont).split('\n')
      )
    : (legendNames ?? []);
  const legendText = buildUnderlinedTextFields(
    config.legendFont,
    config.legendFont.size,
    underlinePrimeTexts,
    'left'
  );

  const legend: Record<string, unknown> = {
    show: true,
    orient: isVertical ? 'vertical' : 'horizontal',
    itemWidth: markerSize,
    itemHeight: markerSize,
    itemGap: 14,
    textStyle: legendText.rich ? { rich: legendText.rich } : { ...legendText.textStyle },
    ...(legendIcon ? { icon: legendIcon } : {}),
    ...(config.legendFloating ? { floating: true } : {}),
    ...(config.legendBackground ? { backgroundColor: config.legendBackground } : {}),
    ...(config.legendBorder?.color ? { borderColor: config.legendBorder.color } : {}),
    ...(config.legendBorder?.width != null ? { borderWidth: config.legendBorder.width } : {}),
    ...(config.legendBorder?.radius != null ? { borderRadius: config.legendBorder.radius } : {}),
    ...(config.legendBackground || config.legendBorder ? { padding: [6, 10] } : {}),
  };

  // Hierarchical charts (treemap / sunburst / custom) don't auto-populate legend from
  // series — without explicit `data`, ECharts still draws border/bg chrome as an empty box.
  if (legendNames && legendNames.length > 0) {
    const hasColors = legendColors && legendColors.length > 0;
    legend.data = hasColors
      ? legendNames.map((name, i) => ({
          name,
          itemStyle: { color: legendColors![i % legendColors!.length] },
        }))
      : legendNames;
    // Display-only when colors are supplied (no matching series to toggle).
    if (hasColors) {
      legend.selectedMode = false;
    }
  }

  if (pos === 'top') {
    legend.top = DEFAULT_TOP_LEGEND_INSET;
    legend.left = 'center';
  } else if (pos === 'bottom') {
    legend.bottom = 0;
    legend.left = 'center';
  } else if (pos === 'left') {
    legend.left = LEGEND_EDGE_PADDING;
    legend.top = 'center';
  } else {
    // Outer edge. Secondary axis uses the inner part of grid.right (see buildGrid).
    legend.right = LEGEND_EDGE_PADDING;
    legend.top = 'center';
  }

  // Strategy 1: when legend is left/right, always set width so it stays within reserved space.
  if (isVertical) {
    legend.width = LEGEND_SCROLL_WIDTH;
  }

  if (isVertical || config.legendFont.underline) {
    legend.formatter = (name: string) => {
      let lines = name;
      if (isVertical) lines = wrapLegendName(name, LEGEND_SCROLL_WIDTH, config.legendFont);
      if (config.legendFont.underline) {
        return lines
          .split('\n')
          .map((line) => legendText.formatText(line))
          .join('\n');
      }
      return lines;
    };
  }

  if (scroll) {
    legend.type = 'scroll';
    legend.pageFormatter = '{current}/{total}';
    if (!isVertical) {
      legend.height = Math.min(LEGEND_SCROLL_HEIGHT, rowHeight);
    }
  }

  return { legend };
}

/** Build the HTML row for a single meta field in the rich item tooltip. */
function metaRow(label: string, value: string | undefined): string {
  if (!value) return '';
  return `<div style="display:flex;gap:6px;margin-top:2px"><span style="opacity:0.65;white-space:nowrap">${label}:</span><span>${value}</span></div>`;
}

/**
 * Build a rich item-trigger tooltip for a single hovered data point.
 * Shows value + whichever dimension fields are enabled in config.tooltipFields.
 * Falls back gracefully when pointMeta is absent.
 */
function buildItemTooltipHtml(
  params: unknown,
  data: LineBarAreaData,
  config: ChartConfig,
  format: string,
  useUnit: boolean,
): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = params as any;
  const si: number = p?.seriesIndex ?? 0;
  const di: number = p?.dataIndex ?? 0;

  const pre = data.series[si]?.formattedValues?.[di];
  const unitCode = data.series[si]?.unitFormatCodes?.[di];
  const val = resolveFormattedValue(Number(p?.value ?? 0), format, useUnit, pre, unitCode);
  const seriesName: string = p?.seriesName ?? data.series[si]?.name ?? '';

  const meta = data.pointMeta?.[si]?.[di];
  const fields = config.tooltipFields ?? {};

  const showIndicator = fields.indicator !== false;
  const showUnit = fields.unit === true;
  const showTimePeriod = fields.timePeriod !== false;
  const showSubgroup = fields.subgroup !== false;
  const showArea = fields.area !== false;
  const showSource = fields.source === true;
  const showFootnote = fields.footnote === true;

  const catLabel: string = Array.isArray(p?.axisValue)
    ? p.axisValue[0] ?? ''
    : (p?.axisValueLabel ?? p?.name ?? '');

  // When series is mapped by indicator, seriesName duplicates indicatorName. Hiding the
  // Indicator field must also suppress that header so the toggle actually removes it.
  const seriesMatchesIndicator =
    !!meta?.indicatorName &&
    seriesName.trim().toLowerCase() === meta.indicatorName.trim().toLowerCase();
  const headerName =
    !showIndicator && seriesMatchesIndicator ? catLabel || '' : seriesName;

  const colorSwatch =
    p?.marker ??
    `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p?.color ?? '#aaa'};margin-right:4px;vertical-align:middle"></span>`;

  let html = headerName
    ? `<div style="font-weight:600;margin-bottom:6px;display:flex;align-items:center">${colorSwatch}${headerName}</div>`
    : `<div style="margin-bottom:6px;display:flex;align-items:center">${colorSwatch}</div>`;
  html += `<div style="font-size:1.05em;font-weight:600;margin-bottom:4px">${val}</div>`;

  if (meta) {
    html += metaRow('Indicator', showIndicator ? meta.indicatorName : undefined);
    html += metaRow('Unit', showUnit ? meta.unitName : undefined);
    html += metaRow('Time Period', showTimePeriod ? meta.timePeriodName : undefined);
    html += metaRow('Subgroup', showSubgroup ? meta.subgroupName : undefined);
    html += metaRow('Area', showArea ? meta.areaName : undefined);
    if (showSource && meta.sourceName) {
      html += metaRow('Source', meta.sourceName);
    }
    if (showFootnote && meta.footnote) {
      html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,0,0,0.1);font-size:0.9em;opacity:0.8">${meta.footnote}</div>`;
    }
  } else if (catLabel && headerName !== catLabel) {
    // No meta available — fall back to showing category label (skip if already used as header)
    html += metaRow('Category', catLabel);
  }

  return `<div style="min-width:160px;max-width:280px;line-height:1.5">${html}</div>`;
}

export function buildTooltipAxis(
  config?: ChartConfig,
  data?: LineBarAreaData,
  percentMode = false,
): { tooltip: Record<string, unknown> } {
  // Tooltip disabled entirely
  if (config?.tooltipEnabled === false) {
    return { tooltip: { show: false } };
  }

  const useUnit = config?.useUnitDefaultFormat ?? false;
  const format = config?.dataLabelNumberFormat ?? '1,000[.00]';

  // ── Percentage-stacked bars: plotted values are already percentages (0–100) ──
  if (percentMode && data) {
    return {
      tooltip: {
        trigger: config?.tooltipTrigger === 'item' ? 'item' : 'axis',
        confine: true,
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params];
          if (list.length === 0) return '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const first = list[0] as any;
          let html = `<div style="font-weight:600;margin-bottom:4px">${first.axisValueLabel ?? first.name ?? ''}</div>`;
          for (const item of list) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = item as any;
            const val = formatPercentLabel(Number(p.value ?? 0));
            html += `<div>${p.marker ?? ''} ${p.seriesName}: <b>${val}</b></div>`;
          }
          return html;
        },
      },
    };
  }

  // ── Item trigger (rich single-point tooltip) ──────────────────────────────
  if (config?.tooltipTrigger === 'item' && data) {
    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params: unknown) =>
          buildItemTooltipHtml(params, data, config, format, useUnit),
      },
    };
  }

  // ── Axis trigger (default: all series at X position) ─────────────────────
  const hasFormatted = useUnit && data?.series.some((s) => s.formattedValues?.some(Boolean) || s.unitFormatCodes?.some(Boolean));

  if (hasFormatted && data) {
    return {
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params];
          if (list.length === 0) return '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const first = list[0] as any;
          let html = `<div style="font-weight:600;margin-bottom:4px">${first.axisValueLabel ?? first.name ?? ''}</div>`;
          for (const item of list) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = item as any;
            const si = p.seriesIndex ?? 0;
            const di = p.dataIndex ?? 0;
            const pre = data.series[si]?.formattedValues?.[di];
            const unitCode = data.series[si]?.unitFormatCodes?.[di];
            const val = resolveFormattedValue(Number(p.value ?? 0), format, useUnit, pre, unitCode);
            html += `<div>${p.marker ?? ''} ${p.seriesName}: <b>${val}</b></div>`;
          }
          return html;
        },
      },
    };
  }

  // Default axis tooltip — apply dataLabelNumberFormat (locale/precision or presets)
  return {
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params];
        if (list.length === 0) return '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const first = list[0] as any;
        let html = `<div style="font-weight:600;margin-bottom:4px">${first.axisValueLabel ?? first.name ?? ''}</div>`;
        for (const item of list) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = item as any;
          const si = p.seriesIndex ?? 0;
          const di = p.dataIndex ?? 0;
          const pre = data?.series[si]?.formattedValues?.[di];
          const unitCode = data?.series[si]?.unitFormatCodes?.[di];
          const val = resolveFormattedValue(Number(p.value ?? 0), format, useUnit, pre, unitCode);
          html += `<div>${p.marker ?? ''} ${p.seriesName}: <b>${val}</b></div>`;
        }
        return html;
      },
    },
  };
}
