/**
 * Shared cartesian option builders for line, bar, and area charts.
 * Reduces duplication of grid, axes, legend, and tooltip configuration.
 */

import type { ChartConfig, LineBarAreaData } from '../types';

/** Fixed height for horizontal (top/bottom) scroll legend. */
export const LEGEND_SCROLL_HEIGHT = 56;
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

function useScrollLegend(seriesCount: number | undefined): boolean {
  return seriesCount != null;
}

export function buildGrid(config: ChartConfig, seriesCount?: number): { grid: Record<string, unknown> } {
  const scroll = config.showLegend && useScrollLegend(seriesCount);
  const pos = config.legendPosition;

  // containLabel: false so grid.backgroundColor only covers the data area (between axis lines),
  // not the axis label zones. Margins are large enough for typical axis labels to render outside.
  let left = config.showYAxis ? 62 : 15;
  let right = 15;
  let top = 20;
  let bottom = config.showXAxis ? 56 : 15;

  if (config.showLegend) {
    if (scroll) {
      // Top scroll legend: data area starts below the legend row
      if (pos === 'top') top = LEGEND_SCROLL_HEIGHT + 5;
      // Bottom scroll legend: data area ends above both x-axis labels and legend
      else if (pos === 'bottom') bottom = (config.showXAxis ? 56 : 15) + LEGEND_SCROLL_HEIGHT;
    }
    // Always reserve space for left/right legend so it never overlaps the chart.
    if (pos === 'left') left = LEGEND_SCROLL_WIDTH + (config.showYAxis ? 62 : 15);
    else if (pos === 'right') right = LEGEND_SCROLL_WIDTH + 15;
    // Non-scroll top legend: single row estimate
    if (!scroll && pos === 'top') top = 45;
    // Non-scroll bottom legend: add space for legend row below x-axis labels
    if (!scroll && pos === 'bottom') bottom = (config.showXAxis ? 56 : 15) + 30;
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
  return {
    xAxis: {
      show: true,
      type: 'category',
      data: data.categories,
      axisLine: { show: true },
      axisTick: { show: true },
      axisLabel: {
        rotate: config.labelOrientation === 'vertical' ? 45 : 0,
        fontSize: config.labelFont.size,
        fontFamily: config.labelFont.family,
      },
    },
  };
}

export function buildYAxisValue(config: ChartConfig): { yAxis: Record<string, unknown> } {
  if (!config.showYAxis) {
    return { yAxis: { show: false } };
  }
  const min = yAxisNum(config.yAxisMin);
  const max = yAxisNum(config.yAxisMax);
  const interval = yAxisNum(config.yAxisInterval);
  const hasExplicitRange = min !== undefined || max !== undefined;

  return {
    yAxis: {
      show: true,
      type: 'value',
      ...(hasExplicitRange
        ? {
            scale: false,
            ...(min !== undefined && { min }),
            ...(max !== undefined && { max }),
            ...(interval !== undefined && { interval }),
          }
        : { scale: true }),
      splitLine: config.showGrid
        ? { show: true, lineStyle: { type: 'dashed', color: '#e0e0e0', opacity: 0.9 } }
        : { show: false },
      axisLine: { show: true },
      axisLabel: {
        fontSize: config.labelFont.size,
        fontFamily: config.labelFont.family,
      },
    },
  };
}

/** Category y-axis (for horizontal bar). */
export function buildYAxisCategory(
  data: LineBarAreaData,
  config: ChartConfig
): { yAxis: Record<string, unknown> } {
  if (!config.showYAxis) {
    return { yAxis: { show: false } };
  }
  return {
    yAxis: {
      show: true,
      type: 'category',
      data: data.categories,
      axisLine: { show: true },
      axisLabel: {
        fontSize: config.labelFont.size,
        fontFamily: config.labelFont.family,
      },
    },
  };
}

/** Value x-axis (for horizontal bar). */
export function buildXAxisValue(config: ChartConfig): { xAxis: Record<string, unknown> } {
  if (!config.showXAxis) {
    return { xAxis: { show: false } };
  }
  return {
    xAxis: {
      show: true,
      type: 'value',
      splitLine: config.showGrid
        ? { show: true, lineStyle: { type: 'dashed', color: '#e0e0e0', opacity: 0.9 } }
        : { show: false },
      axisLabel: {
        fontSize: config.labelFont.size,
        fontFamily: config.labelFont.family,
      },
    },
  };
}

export function buildLegend(config: ChartConfig, seriesCount?: number): { legend: Record<string, unknown> } {
  if (!config.showLegend) {
    return { legend: { show: false } };
  }
  const pos = config.legendPosition;
  const isVertical = pos === 'left' || pos === 'right';
  const scroll = useScrollLegend(seriesCount);

  const legend: Record<string, unknown> = {
    show: true,
    orient: isVertical ? 'vertical' : 'horizontal',
    textStyle: {
      fontSize: config.legendFont.size,
      fontFamily: config.legendFont.family,
      fontWeight: config.legendFont.bold ? 'bold' : 'normal',
    },
  };

  if (pos === 'top') {
    legend.top = 0;
    legend.left = 'center';
  } else if (pos === 'bottom') {
    legend.bottom = 0;
    legend.left = 'center';
  } else if (pos === 'left') {
    legend.left = LEGEND_EDGE_PADDING;
    legend.top = 'center';
  } else {
    legend.right = LEGEND_EDGE_PADDING;
    legend.top = 'center';
  }

  // Strategy 1: when legend is left/right, always set width so it stays within reserved space.
  if (isVertical) {
    legend.width = LEGEND_SCROLL_WIDTH;
    legend.formatter = (name: string) => wrapLegendName(name, LEGEND_SCROLL_WIDTH, config.legendFont);
  }

  if (scroll) {
    legend.type = 'scroll';
    legend.pageFormatter = '{current}/{total}';
    if (!isVertical) {
      legend.height = LEGEND_SCROLL_HEIGHT;
    }
  }

  return { legend };
}

export function buildTooltipAxis(): { tooltip: Record<string, unknown> } {
  return {
    tooltip: {
      trigger: 'axis',
      confine: true,
    },
  };
}
