import type { EChartsOption } from 'echarts';
import type { ChartConfig, TreemapData } from '../types';
import {
  buildLabelTypography,
  collectTreemapLabelPrimeTexts,
  resolveFormattedValue,
  resolveDataLabelFont,
} from './labelUtils';

/**
 * Builds ECharts treemap option from TreemapData and ChartConfig.
 * Treemap legend not applicable — hierarchical nodes cannot bind to ECharts legend items.
 */
export function buildTreemapOption(data: TreemapData, config: ChartConfig): EChartsOption {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const palette = config.palette.length > 0 ? config.palette : [config.primaryColor];
  const primeTexts = collectTreemapLabelPrimeTexts(data, config);
  const dataFont = resolveDataLabelFont(config);
  const labelStyle = buildLabelTypography(config, primeTexts, dataFont);

  const coloredNodes = data.nodes.map((node, i) => ({
    ...node,
    itemStyle: { color: palette[i % palette.length] },
    ...(node.children?.length ? {
      children: node.children.map(child => ({ ...child })),
    } : {}),
  }));

  const showAlways = config.showLabels && config.dataLabelVisibility !== 'onHover';
  const showOnHover = config.showLabels && config.dataLabelVisibility === 'onHover';
  const useUnit = config.useUnitDefaultFormat ?? false;

  const findFormattedValue = (name: string | undefined): string | undefined => {
    if (!name) return undefined;
    for (const node of data.nodes) {
      if (node.name === name && node.formattedValue) return node.formattedValue;
      for (const child of node.children ?? []) {
        if (child.name === name && child.formattedValue) return child.formattedValue;
      }
    }
    return undefined;
  };

  const findUnitFormatCode = (name: string | undefined): string | undefined => {
    if (!name) return undefined;
    for (const node of data.nodes) {
      if (node.name === name && node.unitFormatCode) return node.unitFormatCode;
      for (const child of node.children ?? []) {
        if (child.name === name && child.unitFormatCode) return child.unitFormatCode;
      }
    }
    return undefined;
  };

  const nodeFormatter = (params: { name?: string; value?: number }) => {
    const pre = findFormattedValue(params?.name);
    const unitCode = findUnitFormatCode(params?.name);
    const val = resolveFormattedValue(Number(params?.value ?? 0), format, useUnit, pre, unitCode);
    const nameLine = labelStyle.formatText(params?.name ?? '');
    const valLine = labelStyle.formatText(val);
    return `${nameLine}\n${valLine}`;
  };

  const upperLabelFormatter = (params: { name?: string }) =>
    labelStyle.formatText(params?.name ?? '');

  const tooltipFormatter = (params: unknown) => {
    const p = params as { name?: string; value?: number; treePathInfo?: { name: string }[] };
    const path = p?.treePathInfo?.map(n => n.name).filter(Boolean).join(' → ') ?? p?.name ?? '';
    const pre = findFormattedValue(p?.name);
    const unitCode = findUnitFormatCode(p?.name);
    const val = resolveFormattedValue(Number(p?.value ?? 0), format, useUnit, pre, unitCode);
    return `<strong>${path}</strong><br/>Value: <strong>${val}</strong>`;
  };

  return {
    legend: { show: false },
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
          ? { show: true, formatter: nodeFormatter, ...labelStyle.typography }
          : { show: false },
        upperLabel: showAlways
          ? {
              show: true,
              height: 24,
              formatter: upperLabelFormatter,
              ...labelStyle.typography,
            }
          : { show: false },
        emphasis: {
          label: showOnHover
            ? { show: true, formatter: nodeFormatter, ...labelStyle.typography }
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
