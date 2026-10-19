import type { EChartsOption } from 'echarts';
import type { ChartConfig, TreemapData } from '../types';
import { formatLabelValue } from './labelUtils';

/**
 * Builds ECharts treemap option from TreemapData and ChartConfig.
 *
 * Config mapping:
 *  - palette           → per-node colors (one color per top-level node, cycling)
 *  - showLabels        → node text labels
 *  - dataLabelVisibility → always | onHover
 *  - dataLabelNumberFormat → value formatting in labels and tooltip
 *  - labelFont / legendFont → typography
 *  - showLegend        → not directly applicable (treemap has no native legend);
 *                         kept as a no-op so toggling the switch doesn't break
 *  - plotAreaBackgroundColor → handled by applyChartSurfaceColors in engine/index.ts
 */
export function buildTreemapOption(data: TreemapData, config: ChartConfig): EChartsOption {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const palette = config.palette.length > 0 ? config.palette : [config.primaryColor];

  const coloredNodes = data.nodes.map((node, i) => ({
    ...node,
    itemStyle: { color: palette[i % palette.length] },
    ...(node.children?.length ? {
      children: node.children.map(child => ({ ...child })),
    } : {}),
  }));

  const labelTypography = {
    fontSize: config.labelFont.size,
    fontFamily: config.labelFont.family,
    fontWeight: config.labelFont.bold ? ('bold' as const) : ('normal' as const),
    fontStyle: config.labelFont.italic ? ('italic' as const) : ('normal' as const),
  };

  const showAlways = config.showLabels && config.dataLabelVisibility !== 'onHover';
  const showOnHover = config.showLabels && config.dataLabelVisibility === 'onHover';

  const nodeFormatter = (params: { name?: string; value?: number }) => {
    const val = formatLabelValue(Number(params?.value ?? 0), format);
    return `${params?.name ?? ''}\n${val}`;
  };

  const tooltipFormatter = (params: unknown) => {
    const p = params as { name?: string; value?: number; treePathInfo?: { name: string }[] };
    const path = p?.treePathInfo?.map(n => n.name).filter(Boolean).join(' → ') ?? p?.name ?? '';
    const val = formatLabelValue(Number(p?.value ?? 0), format);
    return `<strong>${path}</strong><br/>Value: <strong>${val}</strong>`;
  };

  return {
    series: [
      {
        type: 'treemap',
        data: coloredNodes,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        levels: [
          {
            itemStyle: {
              borderColor: '#fff',
              borderWidth: 2,
              gapWidth: 2,
            },
            upperLabel: { show: false },
          },
          {
            itemStyle: {
              borderColor: 'rgba(255,255,255,0.6)',
              borderWidth: 1,
              gapWidth: 1,
            },
            colorSaturation: [0.35, 0.5],
          },
        ],
        label: showAlways
          ? { show: true, formatter: nodeFormatter, ...labelTypography }
          : { show: false },
        upperLabel: showAlways
          ? {
              show: true,
              height: 24,
              formatter: (params: { name?: string }) => params?.name ?? '',
              ...labelTypography,
            }
          : { show: false },
        emphasis: {
          label: showOnHover
            ? { show: true, formatter: nodeFormatter, ...labelTypography }
            : { show: false },
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 1,
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
