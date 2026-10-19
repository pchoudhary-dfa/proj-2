/**
 * Standalone entry for the framework-agnostic chart component bundle.
 * Exposes createDfaChart(container, options) for use via script tag or module.
 * Uses the same init/update/destroy/getDataURL from the chart engine.
 */

import { init, update, destroy, getDataURL, type ChartInstance } from './index';
import type { ChartConfig, ChartData } from './types';

export interface DfaChartOptions {
  data: ChartData;
  config: ChartConfig;
  onPointClick?: (params: { seriesName?: string; name?: string; value?: unknown; dataIndex?: number }) => void;
  onLegendClick?: (params: { name: string }) => void;
}

export interface DfaChartInstance {
  update(data: ChartData, config: ChartConfig): void;
  destroy(): void;
  getDataURL(type: 'png' | 'svg'): string;
}

function resolveContainer(container: HTMLElement | string): HTMLElement {
  if (container && typeof (container as HTMLElement).nodeType === 'number' && (container as HTMLElement).nodeType === 1) {
    return container as HTMLElement;
  }
  if (typeof container === 'string') {
    const el = document.querySelector(container);
    if (!el) throw new Error(`createDfaChart: mount element not found for selector "${container}"`);
    return el as HTMLElement;
  }
  throw new Error('createDfaChart: container must be an HTMLElement or a CSS selector string');
}

/**
 * Create a DFA chart in the given container. Returns an instance with update, destroy, getDataURL.
 */
export function createDfaChart(container: HTMLElement | string, options: DfaChartOptions): DfaChartInstance {
  const el = resolveContainer(container);
  const { data, config, onPointClick, onLegendClick } = options;

  let instance: ChartInstance | null = init(el, data, config, {
    onPointClick,
    onLegendClick,
  });

  return {
    update(newData: ChartData, newConfig: ChartConfig) {
      if (instance) update(instance, newData, newConfig);
    },
    destroy() {
      if (instance) {
        destroy(instance);
        instance = null;
      }
    },
    getDataURL(type: 'png' | 'svg' = 'png') {
      return instance ? getDataURL(instance, type) : '';
    },
  };
}

if (typeof window !== 'undefined') {
  (window as unknown as { createDfaChart: typeof createDfaChart }).createDfaChart = createDfaChart;
}
try {
  if (typeof module !== 'undefined' && module.exports) {
    (module.exports as Record<string, unknown>).createDfaChart = createDfaChart;
  }
} catch {
  // no module in environment
}
