import type { EChartsOption } from 'echarts';
import type { ChartConfig, DotMatrixData } from '../types';
import { computeTitleBlockHeight } from '../titleLayout';
import { resolveFormattedValue } from './labelUtils';

const GRID_SIZE = 10;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const MUTED_FALLBACK = 'rgba(180, 180, 180, 0.45)';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Builds ECharts option for a percentage dot-matrix chart via custom series.
 *
 * Fixed 10×10 circle grid: each filled circle = 1%. The last active circle may
 * be partially filled (left fraction) for decimal percentages.
 * Bottom labels are not rendered — chart title / tooltip carry context.
 */
export function buildDotMatrixOption(data: DotMatrixData, config: ChartConfig): EChartsOption {
  const value = clampPercent(data.value);
  const fullCount = Math.floor(value);
  const fraction = value - fullCount;
  const fillColor = config.palette[0] ?? config.primaryColor;
  const mutedColor = config.palette[1] ?? MUTED_FALLBACK;
  const titleBlock = computeTitleBlockHeight(config);
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;
  const displayValue = resolveFormattedValue(value, format, useUnit, data.formattedValue, undefined);

  const seriesData = Array.from({ length: TOTAL_CELLS }, (_, i) => ({ value: [i] }));

  const tooltipFormatter = () =>
    data.label
      ? `<strong>${data.label}</strong><br/>${displayValue}%`
      : `<strong>${displayValue}%</strong>`;

  const renderItem = (
    params: { dataIndex: number },
    api: {
      getWidth: () => number;
      getHeight: () => number;
    },
  ) => {
    const idx = params.dataIndex;
    const canvasW = api.getWidth();
    const canvasH = api.getHeight();

    const topPad = titleBlock + 8;
    const bottomPad = 16;
    const usableW = canvasW - 32;
    const usableH = canvasH - topPad - bottomPad;
    const gridSide = Math.max(40, Math.min(usableW, usableH));
    const originX = (canvasW - gridSide) / 2;
    const originY = topPad + Math.max(0, (usableH - gridSide) / 2);

    const cell = gridSide / GRID_SIZE;
    const col = idx % GRID_SIZE;
    const row = Math.floor(idx / GRID_SIZE);
    const cx = originX + col * cell + cell / 2;
    const cy = originY + row * cell + cell / 2;
    const r = cell * 0.36;

    // Full filled
    if (idx < fullCount) {
      return {
        type: 'circle',
        shape: { cx, cy, r },
        style: { fill: fillColor },
      };
    }

    // Partial last cell — vertical split, left fraction filled.
    if (idx === fullCount && fraction > 0.001) {
      return {
        type: 'group',
        children: [
          {
            type: 'circle',
            shape: { cx, cy, r },
            style: { fill: mutedColor },
          },
          {
            type: 'group',
            children: [
              {
                type: 'circle',
                shape: { cx, cy, r },
                style: { fill: fillColor },
              },
            ],
            clipPath: {
              type: 'rect',
              shape: {
                x: cx - r,
                y: cy - r,
                width: Math.max(0.5, 2 * r * fraction),
                height: 2 * r,
              },
            },
          },
        ],
      };
    }

    // Empty / muted
    return {
      type: 'circle',
      shape: { cx, cy, r },
      style: { fill: mutedColor },
    };
  };

  const option: EChartsOption = {
    tooltip: {
      show: config.tooltipEnabled !== false,
      trigger: 'item',
      confine: true,
      formatter: tooltipFormatter,
    },
    legend: { show: false },
    xAxis: { show: false },
    yAxis: { show: false },
    grid: { show: false, left: 0, right: 0, top: 0, bottom: 0 },
    series: [
      {
        type: 'custom',
        coordinateSystem: 'none',
        data: seriesData,
        renderItem: renderItem as never,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ],
  };

  return option;
}
