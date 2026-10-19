import type { EChartsOption } from 'echarts';
import type { ChartConfig, PieChartData } from '../types';
import {
  LEGEND_SCROLL_HEIGHT,
  LEGEND_SCROLL_WIDTH,
  LEGEND_EDGE_PADDING,
  wrapLegendName,
} from './cartesian';

export function buildPieOption(data: PieChartData, config: ChartConfig): EChartsOption {
  const radius = config.pieDonut ? ['40%', '70%'] : '65%';
  const centerY = config.pieSemi ? '70%' : '50%';
  const startAngle = config.pieSemi ? 180 : 90;
  const endAngle = config.pieSemi ? 0 : 450; // 90 + 360

  const pieData = data.segments.map((seg, i) => ({
    name: seg.label,
    value: seg.value,
    itemStyle: {
      color: config.palette[i % config.palette.length] ?? config.primaryColor,
    },
  }));

  const segmentCount = data.segments.length;
  const useScroll = segmentCount != null;
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
    // Strategy 1: when legend is left/right, always set width so it stays within reserved space.
    if (isVertical) {
      legendConfig.width = LEGEND_SCROLL_WIDTH;
      legendConfig.formatter = (name: string) => wrapLegendName(name, LEGEND_SCROLL_WIDTH, config.legendFont);
    }
    if (useScroll) {
      legendConfig.type = 'scroll';
      legendConfig.pageFormatter = '{current}/{total}';
      if (!isVertical) {
        legendConfig.height = LEGEND_SCROLL_HEIGHT;
      }
    }
  }

  const option: EChartsOption = {
    tooltip: { trigger: 'item', confine: true },
    xAxis: { show: false },
    yAxis: { show: false },
    legend: legendConfig,
    series: [
      {
        type: 'pie',
        radius,
        center: ['50%', centerY],
        startAngle,
        endAngle,
        data: pieData,
        label: {
          show: config.pieLabelsInside || config.pieLabelsOutside,
          position: config.pieLabelsInside ? 'inside' : 'outside',
          fontSize: config.labelFont.size,
          fontFamily: config.labelFont.family,
          fontWeight: config.labelFont.bold ? 'bold' : 'normal',
        },
        labelLine: config.pieLabelsOutside ? { show: true } : { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.2)' },
        },
      },
    ],
  };

  return option;
}
