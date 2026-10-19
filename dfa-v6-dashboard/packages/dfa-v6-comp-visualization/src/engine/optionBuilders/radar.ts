import type { EChartsOption } from 'echarts';
import type { ChartConfig, RadarData } from '../types';
import {
  LEGEND_SCROLL_HEIGHT,
  LEGEND_SCROLL_WIDTH,
  LEGEND_EDGE_PADDING,
  wrapLegendName,
} from './cartesian';
import { formatLabelValue } from './labelUtils';

/** Resolve optional yAxisMax / yAxisMin overrides (empty string = not set). */
function radarAxisNum(value: number | '' | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  return Number(value);
}

/**
 * Builds ECharts radar (spider) option from RadarData and ChartConfig.
 */
export function buildRadarOption(data: RadarData, config: ChartConfig): EChartsOption {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const overrideMax = radarAxisNum(config.yAxisMax);
  const palette = config.palette.length > 0 ? config.palette : [config.primaryColor];
  const pos = config.legendPosition;
  const isVertical = pos === 'left' || pos === 'right';

  const legendConfig: Record<string, unknown> = config.showLegend
    ? {
        show: true,
        orient: isVertical ? 'vertical' : 'horizontal',
        textStyle: {
          fontSize: config.legendFont.size,
          fontFamily: config.legendFont.family,
          fontWeight: config.legendFont.bold ? 'bold' : 'normal',
        },
      }
    : { show: false };

  if (config.showLegend) {
    if (pos === 'top') {
      legendConfig.top = 0;
      legendConfig.left = 'center';
    } else if (pos === 'bottom') {
      legendConfig.bottom = 0;
      legendConfig.left = 'center';
    } else if (pos === 'left') {
      legendConfig.left = LEGEND_EDGE_PADDING;
      legendConfig.top = 'center';
    } else {
      legendConfig.right = LEGEND_EDGE_PADDING;
      legendConfig.top = 'center';
    }
    if (isVertical) {
      legendConfig.width = LEGEND_SCROLL_WIDTH;
      legendConfig.formatter = (name: string) => wrapLegendName(name, LEGEND_SCROLL_WIDTH, config.legendFont);
    }
    const seriesCount = data.series.length;
    if (seriesCount > 1) {
      legendConfig.type = 'scroll';
      legendConfig.pageFormatter = '{current}/{total}';
      if (!isVertical) {
        legendConfig.height = LEGEND_SCROLL_HEIGHT;
      }
    }
  }

  const showAlways = config.showLabels && config.dataLabelVisibility !== 'onHover';
  const showOnHover = config.showLabels && config.dataLabelVisibility === 'onHover';

  const labelTypography = {
    fontSize: config.labelFont.size,
    fontFamily: config.labelFont.family,
    fontWeight: config.labelFont.bold ? 'bold' : 'normal',
    fontStyle: config.labelFont.italic ? 'italic' : 'normal',
  };

  const radarSeriesData = data.series.map((s, i) => {
    const color = palette[i % palette.length] ?? config.primaryColor;
    return {
      value: s.values,
      name: s.name,
      lineStyle: { width: config.lineThickness ?? 2, color },
      itemStyle: { color },
      areaStyle: { opacity: 0.12 },
    };
  });

  return {
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: unknown) => {
        const p = params as { data?: { name?: string; value?: number[] }; name?: string } | null;
        const name = p?.data?.name ?? p?.name ?? '';
        const vals = p?.data?.value;
        if (!Array.isArray(vals)) return '';
        const lines = vals
          .map((v, idx) => {
            const indName = data.indicators[idx]?.name ?? String(idx);
            return `${indName}: ${formatLabelValue(Number(v), format)}`;
          })
          .join('<br/>');
        return `<strong>${name}</strong><br/>${lines}`;
      },
    },
    xAxis: { show: false },
    yAxis: { show: false },
    legend: legendConfig,
    radar: {
      indicator: data.indicators.map((ind) => ({
        name: ind.name,
        max: overrideMax !== undefined ? overrideMax : (ind.max > 0 ? ind.max : 1),
      })),
      center: ['50%', '55%'],
      radius: '62%',
      axisName: {
        fontSize: config.labelFont.size,
        fontFamily: config.labelFont.family,
        fontWeight: config.labelFont.bold ? 'bold' : 'normal',
      },
      splitArea: { show: config.showGrid },
      splitLine: { show: config.showGrid },
    },
    series: [
      {
        type: 'radar',
        data: radarSeriesData,
        symbol: 'circle',
        symbolSize: 6,
        label: {
          show: showAlways,
          formatter: (p: unknown) => {
            const v = p as { value?: number };
            return formatLabelValue(Number(v?.value ?? 0), format);
          },
          ...labelTypography,
        },
        emphasis: {
          label: showOnHover
            ? {
                show: true,
                formatter: (p: unknown) => {
                  const v = p as { value?: number };
                  return formatLabelValue(Number(v?.value ?? 0), format);
                },
                ...labelTypography,
              }
            : { show: false },
        },
      },
    ],
  } as EChartsOption;
}
