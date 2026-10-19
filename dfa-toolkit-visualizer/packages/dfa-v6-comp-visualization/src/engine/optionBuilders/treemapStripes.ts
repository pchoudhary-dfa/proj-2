import type { EChartsOption } from 'echarts';
import type { ChartConfig, StripesTreemapData } from '../types';
import {
  collectStripesLabelPrimeTexts,
  resolveFormattedValue,
  resolveDataLabelFont,
} from './labelUtils';
import { measureTextWidth, resolveUnderlineColor } from '../fontUtils';
import { layoutStripes, buildNodeLookup, buildLeafNameSet, computeTreemapMargins, resolveTreemapDrawArea, type LayoutRect, renderCustomLabel } from './treemapCustomLayout';

/** Reference canvas size for layout computation. renderItem scales to actual canvas. */
const REF_SIZE = 1000;

/**
 * Builds ECharts option for a stripes treemap via custom series.
 *
 * All depth levels are split in the same direction:
 *   direction='vertical'   (default) → rows stacked at every level.
 *   direction='horizontal'           → columns side by side at every level.
 *
 * This differs from slice-and-dice in that the split direction never alternates.
 */
export function buildStripesOption(data: StripesTreemapData, config: ChartConfig): EChartsOption {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;
  const palette = config.palette.length > 0 ? config.palette : [config.primaryColor];
  collectStripesLabelPrimeTexts(data, config); // kept for side-effect consistency
  const dataFont = resolveDataLabelFont(config);
  const direction = data.direction ?? 'vertical';

  const showAlways = config.showLabels && config.dataLabelVisibility !== 'onHover';
  const showOnHover = config.showLabels && config.dataLabelVisibility === 'onHover';

  const fmtLookup = buildNodeLookup(data.nodes, 'formattedValue');
  const unitLookup = buildNodeLookup(data.nodes, 'unitFormatCode');

  // Legend not applicable — do not reserve legend margin space.
  const margins = computeTreemapMargins({ ...config, showLegend: false });

  // Layout in reference space [0, REF_SIZE]. renderItem maps to actual usable area.
  const rects = layoutStripes(
    data.nodes,
    { x: 0, y: 0, width: REF_SIZE, height: REF_SIZE },
    palette,
    direction,
    2,
  );

  const leafNames = buildLeafNameSet(data.nodes);
  // Layout code: 'vertical' = rows stacked (horizontal bars); 'horizontal' = columns side by side.
  const labelLayout = direction === 'vertical' ? 'thinHorizontal' : 'thinVertical';

  const seriesData = rects.map((_r, idx) => ({ value: [idx] }));

  const tooltipFormatter = (params: unknown) => {
    const p = params as { dataIndex?: number };
    const rect: LayoutRect | undefined = rects[p?.dataIndex ?? -1];
    if (!rect) return '';
    const path = rect.parentName ? `${rect.parentName} → ${rect.name}` : rect.name;
    const pre = fmtLookup.get(rect.name);
    const unitCode = unitLookup.get(rect.name);
    const val = resolveFormattedValue(rect.value, format, useUnit, pre, unitCode);
    return `<strong>${path}</strong><br/>Value: <strong>${val}</strong>`;
  };

  const renderItem = (
    params: { dataIndex: number },
    api: {
      getWidth: () => number;
      getHeight: () => number;
    },
  ) => {
    const rect = rects[params.dataIndex];
    if (!rect) return null;

    const canvasW = api.getWidth();
    const canvasH = api.getHeight();

    // Usable drawing area: title/legend margins plus a gutter matching the
    // native ECharts treemap so cells are not painted edge-to-edge.
    const { x: usableX, y: usableY, width: usableW, height: usableH } =
      resolveTreemapDrawArea(canvasW, canvasH, margins);

    // Scale reference coords into usable area.
    const scaleX = usableW / REF_SIZE;
    const scaleY = usableH / REF_SIZE;

    const px = usableX + rect.x * scaleX;
    const py = usableY + rect.y * scaleY;
    const pw = Math.max(rect.width * scaleX - 1, 0);
    const ph = Math.max(rect.height * scaleY - 1, 0);

    const borderColor = rect.depth === 1 ? '#ffffff' : 'rgba(255,255,255,0.6)';
    const borderWidth = rect.depth === 1 ? 2 : 1;

    const group: Record<string, unknown> = {
      type: 'group',
      children: [
        {
          type: 'rect',
          shape: { x: px, y: py, width: pw, height: ph },
          style: {
            fill: rect.color,
            stroke: borderColor,
            lineWidth: borderWidth,
          },
          emphasis: {
            style: {
              fill: rect.color,
              stroke: '#fff',
              lineWidth: 2,
              shadowBlur: 8,
              shadowColor: 'rgba(0,0,0,0.4)',
            },
          },
        },
      ],
    };

    if (showAlways || showOnHover) {
      // Label leaf cells only — parent bands are containers; avoids duplicate/hidden labels.
      if (!leafNames.has(rect.name)) return group;

      const pre = fmtLookup.get(rect.name);
      const unitCode = unitLookup.get(rect.name);
      const val = resolveFormattedValue(rect.value, format, useUnit, pre, unitCode);

      renderCustomLabel({
        group,
        px, py, pw, ph,
        name: rect.name,
        val,
        showValue: true,
        config,
        dataFont,
        layout: labelLayout,
        uniformFontSize: dataFont.size ?? config.labelFont.size ?? 12,
        measureTextWidth,
        resolveUnderlineColor,
      });
    }

    return group;
  };

  return {
    // Stripes legend not applicable — custom series cells cannot bind to ECharts legend items.
    legend: { show: false },
    series: [
      {
        type: 'custom',
        coordinateSystem: 'none' as const,
        emphasis: { focus: 'self' },
        data: seriesData,
        renderItem: renderItem as unknown as EChartsOption['series'] extends Array<infer S> ? S extends { renderItem?: infer R } ? R : never : never,
      },
    ],
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: tooltipFormatter,
    },
  } as EChartsOption;
}
