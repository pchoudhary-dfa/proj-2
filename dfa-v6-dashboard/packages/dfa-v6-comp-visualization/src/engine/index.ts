/**
 * Chart engine — framework-agnostic ECharts wrapper.
 * init / update / destroy / getDataURL. No React or Next.js.
 */

import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import type { EChartsOption } from 'echarts';
import type { ChartConfig, ChartData, LineBarAreaData, PieChartData, ScatterXYData, HeatmapData, TreemapData, RadarData, PyramidData } from './types';
import { buildLineOption } from './optionBuilders/line';
import { buildBarOption } from './optionBuilders/bar';
import { buildAreaOption } from './optionBuilders/area';
import { buildPieOption } from './optionBuilders/pie';
import { buildScatterOption } from './optionBuilders/scatter';
import { buildHeatmapOption } from './optionBuilders/heatmap';
import { buildTreemapOption } from './optionBuilders/treemap';
import { buildRadarOption } from './optionBuilders/radar';
import { buildPyramidOption } from './optionBuilders/pyramid';

export type { ChartConfig, ChartData, LineBarAreaData, PieChartData, ScatterXYData, HeatmapData, TreemapData, RadarData, PyramidData };
export { isLineBarAreaData, isPieChartData, isScatterXYData, isHeatmapData, isTreemapData, isRadarData, isPyramidData } from './types';

export type ChartInstance = ECharts;

export interface ChartCallbacks {
  onPointClick?: (params: { seriesName?: string; name?: string; value?: unknown; dataIndex?: number }) => void;
  onLegendClick?: (params: { name: string }) => void;
}

/**
 * Plot area = ECharts grid (data region). Chart area is the host card (React), not option.backgroundColor,
 * so the canvas stays transparent and legend / margin pixels show the parent background.
 * Pie has no grid: plot color fills the chart canvas only.
 */
function applyChartSurfaceColors(config: ChartConfig, option: EChartsOption): EChartsOption {
  const plotBgRaw = config.plotAreaBackgroundColor?.trim() ?? '';
  const hasPlotFill =
    plotBgRaw.length > 0 && !/^transparent$/i.test(plotBgRaw) && plotBgRaw !== 'rgba(0,0,0,0)';

  const result: EChartsOption = {
    ...option,
    backgroundColor: 'transparent',
  };

  const grid = option.grid;
  if (grid && typeof grid === 'object' && !Array.isArray(grid)) {
    // ECharts only draws grid.backgroundColor when grid.show is true (default is false).
    result.grid = {
      ...(grid as Record<string, unknown>),
      show: hasPlotFill,
      backgroundColor: hasPlotFill ? plotBgRaw : 'transparent',
      // Default grid model uses borderWidth: 1; hide border when showing a plot fill.
      ...(hasPlotFill ? { borderWidth: 0 } : {}),
    };
  } else if (hasPlotFill) {
    result.backgroundColor = plotBgRaw;
  }

  return result;
}

function buildOption(data: ChartData, config: ChartConfig): echarts.EChartsOption {
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
    case 'radar':
      base = buildRadarOption(data as RadarData, config);
      break;
    case 'pyramid':
      base = buildPyramidOption(data as PyramidData, config);
      break;
    default:
      base = {};
  }
  return applyChartSurfaceColors(config, base);
}

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

  chart.setOption(option);

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
  });
  resizeObserver.observe(container);
  (chart as ECharts & { _resizeObserver?: ResizeObserver })._resizeObserver = resizeObserver;

  return chart;
}

export function update(instance: ChartInstance, data: ChartData, config: ChartConfig): void {
  const option = buildOption(data, config);
  // Replace axes, legend, grid and visualMap so switching chart types (e.g. heatmap → line) doesn't
  // leave stale heatmap axis properties (splitArea, category type) merged into the new option.
  instance?.setOption?.(option, {
    replaceMerge: ['series', 'legend', 'grid', 'visualMap', 'xAxis', 'yAxis', 'radar'],
  });
}

export function destroy(instance: ChartInstance): void {
  const ro = (instance as ECharts & { _resizeObserver?: ResizeObserver })._resizeObserver;
  if (ro && instance?.getDom?.()) {
    ro.disconnect();
  }
  instance?.dispose?.();
}

export function getDataURL(instance: ChartInstance, type: 'png' | 'svg' = 'png'): string {
  return instance?.getDataURL?.({ type, pixelRatio: 2 }) ?? '';
}
