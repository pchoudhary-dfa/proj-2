/**
 * Chart engine — framework-agnostic ECharts wrapper.
 * init / update / destroy / getDataURL. No React or Next.js.
 */

import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import type { EChartsOption } from 'echarts';
import type { ChartConfig, ChartData, LineBarAreaData, PieChartData, ScatterXYData, HeatmapData, TreemapData, SliceDiceTreemapData, StripesTreemapData, SunburstData, DotMatrixData, HundredMinusData, RadarData, PyramidData, MapChartData } from './types';
import { buildTitleOption, DEFAULT_TOP_LEGEND_INSET } from './titleLayout';
import { topLegendOffsetY } from './optionBuilders/cartesian';
import { isEmptyChartData } from './isEmptyChartData';
import { buildLineOption } from './optionBuilders/line';
import { buildBarOption } from './optionBuilders/bar';
import { buildAreaOption } from './optionBuilders/area';
import { buildPieOption } from './optionBuilders/pie';
import { buildScatterOption } from './optionBuilders/scatter';
import { buildHeatmapOption } from './optionBuilders/heatmap';
import { buildTreemapOption } from './optionBuilders/treemap';
import { buildSliceDiceOption } from './optionBuilders/treemapSliceDice';
import { buildStripesOption } from './optionBuilders/treemapStripes';
import { buildRadarOption } from './optionBuilders/radar';
import { buildPyramidOption } from './optionBuilders/pyramid';
import { buildMapOption } from './optionBuilders/map';
import { buildSunburstOption } from './optionBuilders/sunburst';
import { buildDotMatrixOption } from './optionBuilders/dotMatrix';
import { buildHundredMinusOption } from './optionBuilders/hundredMinus';

export { isEmptyChartData } from './isEmptyChartData';

export type { ChartConfig, ChartData, LineBarAreaData, LineBarAreaSeriesItem, PieChartData, ScatterXYData, ScatterSeriesItem, SeriesStyleOverrides, SeriesChartTypeOverride, HeatmapData, TreemapData, SliceDiceTreemapData, StripesTreemapData, SunburstData, DotMatrixData, HundredMinusData, RadarData, PyramidData, MapChartData, PointMeta, FontStyle, RequiredFontStyle } from './types';
export { ECHARTS_CANVAS_SUPPORTS_TEXT_DECORATION, applyCanvasUnderline, formatCanvasText, measureTextWidth, resolveUnderlineColor, buildRichUnderlinePack, buildAxisNameOptions, buildUnderlinedTextFields, escapeRichText } from './fontUtils';
export { isLineBarAreaData, isPieChartData, isScatterXYData, isHeatmapData, isTreemapData, isSliceDiceTreemapData, isStripesTreemapData, isSunburstData, isDotMatrixData, isHundredMinusData, isRadarData, isPyramidData, isMapChartData } from './types';
export {
  resolveSeriesColor,
  resolveSeriesLineWidth,
  resolveSeriesLineDash,
  resolveSeriesSymbol,
  resolveSeriesEChartsType,
  shouldApplyAreaStyle,
  resolveSeriesItemColor,
  mergeSeriesEmphasis,
  applyCategoryColorsToSeriesData,
  applyPointColorsToSeriesData,
} from './optionBuilders/resolveSeriesStyle';

export type ChartInstance = ECharts;

/** setOption merge flags — keep init and update in sync so title[] / series[] replace cleanly. */
const SET_OPTION_OPTS = {
  // Include polar axes so switching polar_line ↔ cartesian line does not leave stale coords.
  replaceMerge: [
    'series',
    'legend',
    'grid',
    'visualMap',
    'xAxis',
    'yAxis',
    'radar',
    'polar',
    'angleAxis',
    'radiusAxis',
    'title',
    'graphic',
    'tooltip',
  ],
};

export interface ChartCallbacks {
  onPointClick?: (params: { seriesName?: string; name?: string; value?: unknown; dataIndex?: number }) => void;
  onLegendClick?: (params: { name: string }) => void;
}

/**
 * Plot area = ECharts grid (data region). Chart area background is driven by
 * config.chartAreaBackgroundColor (option.backgroundColor); if not set, stays transparent.
 * Plot area fill uses grid.backgroundColor. Plot area border uses grid.borderColor/Width.
 * Background images (when set) stretch to fill their region and override solid colors (v5 parity).
 */
function applyChartSurfaceColors(config: ChartConfig, option: EChartsOption): EChartsOption {
  const plotImg = config.plotAreaBackgroundImageUrl?.trim() ?? '';
  const chartImg = config.chartAreaBackgroundImageUrl?.trim() ?? '';
  const hasPlotImage = plotImg.length > 0;
  const hasChartImage = chartImg.length > 0;

  const plotBgRaw = config.plotAreaBackgroundColor?.trim() ?? '';
  const hasPlotFill =
    !hasPlotImage &&
    plotBgRaw.length > 0 &&
    !/^transparent$/i.test(plotBgRaw) &&
    plotBgRaw !== 'rgba(0,0,0,0)';

  const chartBgRaw = config.chartAreaBackgroundColor?.trim() ?? '';
  const hasChartBg =
    !hasChartImage &&
    chartBgRaw.length > 0 &&
    !/^transparent$/i.test(chartBgRaw) &&
    chartBgRaw !== 'rgba(0,0,0,0)';

  const plotBorder = config.plotAreaBorder;
  const hasPlotBorder = plotBorder && (plotBorder.width ?? 0) > 0;

  const result: EChartsOption = {
    ...option,
    backgroundColor: hasChartBg ? chartBgRaw : 'transparent',
  };

  const grid = option.grid;
  if (grid && typeof grid === 'object' && !Array.isArray(grid)) {
    const needGridShow = hasPlotFill || !!hasPlotBorder || hasPlotImage;
    result.grid = {
      ...(grid as Record<string, unknown>),
      show: needGridShow,
      backgroundColor: hasPlotFill ? plotBgRaw : 'transparent',
      ...(hasPlotBorder
        ? { borderColor: plotBorder!.color ?? '#cccccc', borderWidth: plotBorder!.width ?? 1 }
        : { borderWidth: 0 }),
    };
  } else if (hasPlotFill || hasPlotBorder || hasPlotImage) {
    // Maps / pie / charts without a grid: canvas fill + optional plot border via graphic.
    if (hasPlotFill && !hasChartBg && !hasChartImage) {
      result.backgroundColor = plotBgRaw;
    } else if (hasPlotFill && (hasChartBg || hasChartImage)) {
      result.backgroundColor = plotBgRaw;
    }
    if (hasPlotBorder) {
      const existing = option.graphic;
      const borderGraphic = {
        type: 'rect' as const,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        z: -100,
        silent: true,
        style: {
          fill: hasPlotFill ? plotBgRaw : 'transparent',
          stroke: plotBorder!.color ?? '#cccccc',
          lineWidth: plotBorder!.width ?? 1,
        },
      };
      if (Array.isArray(existing)) {
        result.graphic = [...existing, borderGraphic];
      } else if (existing) {
        result.graphic = [existing as Record<string, unknown>, borderGraphic];
      } else {
        result.graphic = [borderGraphic];
      }
    }
  }

  return result;
}

/** Stretch background images to chart / plot bounds (v5 plotBackgroundImage parity). */
const CHART_BG_IMAGE_ID = 'dfa-chart-bg-image';
const PLOT_BG_IMAGE_ID = 'dfa-plot-bg-image';

function hasBackgroundImages(config: ChartConfig): boolean {
  return !!(
    config.chartAreaBackgroundImageUrl?.trim() ||
    config.plotAreaBackgroundImageUrl?.trim()
  );
}

function parseGridMarginPx(value: unknown, total: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.endsWith('%')) {
      const n = parseFloat(s);
      return Number.isFinite(n) ? (n / 100) * total : 0;
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function resolvePlotRect(
  chart: ECharts,
): { x: number; y: number; width: number; height: number } | null {
  const cw = chart.getWidth();
  const ch = chart.getHeight();
  if (!(cw > 0 && ch > 0)) return null;

  // Prefer the live grid rect when available (private API — accessed via cast).
  try {
    const chartAny = chart as unknown as {
      getModel?: () => {
        getComponent?: (
          name: string,
          index?: number,
        ) =>
          | {
              coordinateSystem?: {
                getRect?: () => { x: number; y: number; width: number; height: number };
              };
            }
          | undefined;
      };
    };
    const rect = chartAny.getModel?.()?.getComponent?.('grid', 0)?.coordinateSystem?.getRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
  } catch {
    // fall through to option margins
  }

  const opt = chart.getOption() as {
    grid?: Array<Record<string, unknown>> | Record<string, unknown>;
  };
  const g = Array.isArray(opt.grid) ? opt.grid[0] : opt.grid;
  if (!g) return null;
  const left = parseGridMarginPx(g.left, cw);
  const right = parseGridMarginPx(g.right, cw);
  const top = parseGridMarginPx(g.top, ch);
  const bottom = parseGridMarginPx(g.bottom, ch);
  return {
    x: left,
    y: top,
    width: Math.max(0, cw - left - right),
    height: Math.max(0, ch - top - bottom),
  };
}

/**
 * ECharts image graphics ignore right/bottom for sizing — they use style.width/height
 * (or natural image size). Sync exact pixel bounds after layout / resize so the image
 * stays inside the plot box (v5 plotBackgroundImage parity).
 */
function syncBackgroundImageSizes(chart: ECharts, config: ChartConfig): void {
  const chartImg = config.chartAreaBackgroundImageUrl?.trim();
  const plotImg = config.plotAreaBackgroundImageUrl?.trim();
  if (!chartImg && !plotImg) return;

  const cw = chart.getWidth();
  const ch = chart.getHeight();
  if (!(cw > 0 && ch > 0)) return;

  const updates: Record<string, unknown>[] = [];

  if (chartImg) {
    updates.push({
      id: CHART_BG_IMAGE_ID,
      type: 'image',
      left: 0,
      top: 0,
      z: -200,
      silent: true,
      style: { image: chartImg, x: 0, y: 0, width: cw, height: ch },
    });
  }

  if (plotImg) {
    const plot = resolvePlotRect(chart) ?? { x: 0, y: 0, width: cw, height: ch };
    updates.push({
      id: PLOT_BG_IMAGE_ID,
      type: 'image',
      left: plot.x,
      top: plot.y,
      z: -100,
      silent: true,
      style: {
        image: plotImg,
        x: 0,
        y: 0,
        width: plot.width,
        height: plot.height,
      },
    });
  }

  // Merge by id — do not use replaceMerge or title/underline graphics get wiped.
  chart.setOption({ graphic: updates });
}

function scheduleBackgroundImageSync(chart: ECharts, config: ChartConfig): void {
  if (!hasBackgroundImages(config)) return;
  requestAnimationFrame(() => {
    try {
      syncBackgroundImageSizes(chart, config);
    } catch {
      // ignore — chart may already be disposed
    }
  });
}

/** Stretch background images to chart / plot bounds (v5 plotBackgroundImage parity). */
function applyChartBackgroundImages(config: ChartConfig, option: EChartsOption): EChartsOption {
  const chartImg = config.chartAreaBackgroundImageUrl?.trim();
  const plotImg = config.plotAreaBackgroundImageUrl?.trim();
  if (!chartImg && !plotImg) return option;

  const images: Record<string, unknown>[] = [];

  if (chartImg) {
    // Placeholder size — syncBackgroundImageSizes sets exact canvas pixels after layout.
    images.push({
      id: CHART_BG_IMAGE_ID,
      type: 'image',
      left: 0,
      top: 0,
      z: -200,
      silent: true,
      style: { image: chartImg, x: 0, y: 0, width: 1, height: 1 },
    });
  }

  if (plotImg) {
    const grid = option.grid;
    if (grid && typeof grid === 'object' && !Array.isArray(grid)) {
      const g = grid as Record<string, unknown>;
      images.push({
        id: PLOT_BG_IMAGE_ID,
        type: 'image',
        left: g.left ?? 0,
        top: g.top ?? 0,
        z: -100,
        silent: true,
        // Exact width/height applied in syncBackgroundImageSizes from grid.getRect().
        style: { image: plotImg, x: 0, y: 0, width: 1, height: 1 },
      });
    } else {
      images.push({
        id: PLOT_BG_IMAGE_ID,
        type: 'image',
        left: 0,
        top: 0,
        z: -100,
        silent: true,
        style: { image: plotImg, x: 0, y: 0, width: 1, height: 1 },
      });
    }
  }

  const existing = option.graphic;
  const existingList = Array.isArray(existing)
    ? existing
    : existing
      ? [existing as Record<string, unknown>]
      : [];

  return {
    ...option,
    ...(chartImg ? { backgroundColor: 'transparent' as const } : {}),
    graphic: [...images, ...existingList],
  };
}

/**
 * Empty / no-data: keep title, subtitle, customLabel (+ chart-area surface colors).
 * Do not build cartesian/pie/map series chrome — bare axes must not appear.
 */
function buildTitleOnlyOption(config: ChartConfig): EChartsOption {
  const surfaceConfig: ChartConfig = {
    ...config,
    showXAxis: false,
    showYAxis: false,
    showXAxisTickLabels: false,
    showYAxisTickLabels: false,
    showGrid: false,
    showLegend: false,
    showLabels: false,
    enableSecondaryYAxis: false,
    plotAreaBorder: undefined,
    plotAreaBackgroundColor: undefined,
  };
  const base: EChartsOption = {
    xAxis: { show: false },
    yAxis: { show: false },
    grid: { show: false, left: 16, right: 16, top: 16, bottom: 16 },
    legend: { show: false },
    series: [],
    tooltip: { show: false },
  };
  const withSurface = applyChartSurfaceColors(surfaceConfig, base);
  const withImages = applyChartBackgroundImages(config, withSurface);
  const titleOpt = buildTitleOption(config);
  const merged: EChartsOption = { ...withImages };
  if (titleOpt.title) merged.title = titleOpt.title;
  const titleGraphics = titleOpt.graphic ?? [];
  if (titleGraphics.length > 0) {
    const baseGraphic = withImages.graphic;
    const baseList = Array.isArray(baseGraphic)
      ? baseGraphic
      : baseGraphic
        ? [baseGraphic]
        : [];
    merged.graphic = [...baseList, ...titleGraphics] as EChartsOption['graphic'];
  }
  return merged;
}

function buildOption(data: ChartData, config: ChartConfig): echarts.EChartsOption {
  if (isEmptyChartData(data)) {
    return buildTitleOnlyOption(config);
  }

  let base: EChartsOption;
  switch (config.type) {
    case 'line':
      base = buildLineOption(data as LineBarAreaData, config);
      break;
    case 'bar':
      base = buildBarOption(data as LineBarAreaData, config);
      break;
    case 'area':
      base = buildAreaOption(data as LineBarAreaData, config);
      break;
    case 'pie':
      base = buildPieOption(data as PieChartData, config);
      break;
    case 'scatter':
      base = buildScatterOption(data as ScatterXYData, config);
      break;
    case 'heatmap':
      base = buildHeatmapOption(data as HeatmapData, config);
      break;
    case 'treemap':
      base = buildTreemapOption(data as TreemapData, config);
      break;
    case 'treemapSliceDice':
      base = buildSliceDiceOption(data as SliceDiceTreemapData, config);
      break;
    case 'treemapStripes':
      base = buildStripesOption(data as StripesTreemapData, config);
      break;
    case 'radar':
      base = buildRadarOption(data as RadarData, config);
      break;
    case 'pyramid':
      base = buildPyramidOption(data as PyramidData, config);
      break;
    case 'map':
      base = buildMapOption(data as MapChartData, config);
      break;
    case 'sunburst':
      base = buildSunburstOption(data as SunburstData, config);
      break;
    case 'dotMatrix':
      base = buildDotMatrixOption(data as DotMatrixData, config);
      break;
    case 'hundredMinus':
      base = buildHundredMinusOption(data as HundredMinusData, config);
      break;
    default:
      base = {};
  }

  // Push top legend / colorbar below canvas title block.
  // Series legend + visualMap: keep a small inset from the plot top when there is no title,
  // so the default top legend isn't flush against the plot-area edge.
  if (config.showLegend && config.legendPosition === 'top') {
    const legendTop = topLegendOffsetY(config);
    const pieExtra = config.type === 'pie' ? 8 : 0;
    const top = (legendTop > 0 ? legendTop : DEFAULT_TOP_LEGEND_INSET) + pieExtra;
    const legend = base.legend;
    if (legend && typeof legend === 'object' && !Array.isArray(legend)) {
      base = { ...base, legend: { ...(legend as Record<string, unknown>), top } };
    }
    const visualMap = base.visualMap;
    if (visualMap) {
      const maps = Array.isArray(visualMap) ? visualMap : [visualMap];
      base = {
        ...base,
        visualMap: maps.map((item) =>
          item && typeof item === 'object' ? { ...(item as Record<string, unknown>), top } : item
        ),
      };
    }
  }

  const withSurface = applyChartSurfaceColors(config, base);
  const withImages = applyChartBackgroundImages(config, withSurface);
  const titleOpt = buildTitleOption(config);
  const merged: EChartsOption = { ...withImages };
  if (titleOpt.title) merged.title = titleOpt.title;
  // Merge title underlines with any graphics from the option builder (e.g. dot-matrix labels).
  const baseGraphic = withImages.graphic;
  const baseList = Array.isArray(baseGraphic)
    ? baseGraphic
    : baseGraphic
      ? [baseGraphic]
      : [];
  const titleGraphics = titleOpt.graphic ?? [];
  if (baseList.length > 0 || titleGraphics.length > 0) {
    merged.graphic = [...baseList, ...titleGraphics] as EChartsOption['graphic'];
  }
  return merged;
}

type ChartWithBgSync = ECharts & {
  _resizeObserver?: ResizeObserver;
  _bgImageConfig?: ChartConfig;
};

export function init(
  container: HTMLElement,
  data: ChartData,
  config: ChartConfig,
  callbacks?: ChartCallbacks
): ChartInstance {
  const initFn = echarts.init;
  if (!initFn) throw new Error('echarts.init is not available');
  const chart = initFn(container, undefined, { renderer: 'canvas' });
  const option = buildOption(data, config);

  chart.setOption(option, SET_OPTION_OPTS);
  (chart as ChartWithBgSync)._bgImageConfig = config;
  scheduleBackgroundImageSync(chart, config);

  if (callbacks?.onPointClick) {
    chart.on('click', (params: { componentType: string; seriesName?: string; name?: string; value?: unknown; dataIndex?: number }) => {
      if (params.componentType === 'series') {
        callbacks.onPointClick?.({
          seriesName: params.seriesName,
          name: params.name,
          value: params.value,
          dataIndex: params.dataIndex,
        });
      }
    });
  }

  if (callbacks?.onLegendClick) {
    chart.on('legendselectchanged', (params: unknown) => {
      const p = params as { name?: string };
      if (p?.name != null) callbacks.onLegendClick?.({ name: p.name });
    });
  }

  const resizeObserver = new ResizeObserver(() => {
    chart?.resize?.();
    const cfg = (chart as ChartWithBgSync)._bgImageConfig;
    if (cfg) scheduleBackgroundImageSync(chart, cfg);
  });
  resizeObserver.observe(container);
  (chart as ChartWithBgSync)._resizeObserver = resizeObserver;

  return chart;
}

export function update(instance: ChartInstance, data: ChartData, config: ChartConfig): void {
  const option = buildOption(data, config);
  // Empty → full replace so previous axes/series cannot linger via merge.
  // Otherwise replaceMerge axes/legend/grid so type switches don't leave stale chrome.
  instance?.setOption?.(
    option,
    isEmptyChartData(data) ? { notMerge: true } : SET_OPTION_OPTS,
  );
  (instance as ChartWithBgSync)._bgImageConfig = config;
  scheduleBackgroundImageSync(instance, config);
}

export function destroy(instance: ChartInstance): void {
  const ro = (instance as ChartWithBgSync)._resizeObserver;
  if (ro && instance?.getDom?.()) {
    ro.disconnect();
  }
  instance?.dispose?.();
}

export function getDataURL(instance: ChartInstance, type: 'png' | 'svg' = 'png'): string {
  return instance?.getDataURL?.({ type, pixelRatio: 2 }) ?? '';
}
