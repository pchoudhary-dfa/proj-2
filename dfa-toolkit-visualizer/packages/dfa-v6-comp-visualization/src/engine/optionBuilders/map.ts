/**
 * ECharts option builder for choropleth map charts.
 */

import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import type { ChartConfig, MapChartData } from '../types';
import { LEGEND_EDGE_PADDING } from './cartesian';
import { buildLabelTypography, resolveDataLabelFont } from './labelUtils';
import { DEFAULT_TOP_LEGEND_INSET } from '../titleLayout';
/**
 * Map region labels must NOT use ECharts rich-text (the `rich` key).
 * Rich-text labels render at fixed screen-space pixels and lose geo-zoom
 * scaling. Plain fontSize / fontFamily / color scale with roam.
 * Underline is NOT applied: rich-text breaks zoom, and combining low-line
 * (U+0332) visually splits/distorts digits. Bold and italic work fine.
 */
function buildMapLabelStyle(config: ChartConfig) {
  const font = resolveDataLabelFont(config);
  const base = {
    fontSize: font.size,
    fontFamily: font.family,
    fontWeight: font.bold ? ('bold' as const) : ('normal' as const),
    fontStyle: font.italic ? ('italic' as const) : ('normal' as const),
    color: font.color ?? '#333',
  };
  return {
    font,
    normal: base,
    emphasis: { ...base, fontSize: font.size + 2 },
  };
}

export function buildMapOption(data: MapChartData, config: ChartConfig): EChartsOption {
  echarts.registerMap(data.mapName, data.geoJSON as Parameters<typeof echarts.registerMap>[1]);

  const { breaks, colors, labels } = data.classification;
  const numBins = colors.length;

  const pieces: Array<{
    min?: number;
    max?: number;
    label: string;
    color: string;
  }> = [];

  for (let i = 0; i < numBins; i++) {
    pieces.push({
      min: breaks[i],
      max: breaks[i + 1],
      label: labels[i] ?? `${breaks[i]}–${breaks[i + 1]}`,
      color: colors[i],
    });
  }

  // ── visualMap position (mirrors heatmap.ts pattern) ─────────────────────
  const pos = config.legendPosition;
  const isVertical = pos === 'left' || pos === 'right';

  const pieceLabels = labels.map((label, i) => label ?? `${breaks[i]}–${breaks[i + 1]}`);
  const legendPrime = [...pieceLabels];
  const legendText = buildLabelTypography(config, legendPrime, config.legendFont);
  const mapLabel = buildMapLabelStyle(config);

  const visualMapCfg: Record<string, unknown> = {
    type: 'piecewise',
    pieces,
    orient: isVertical ? 'vertical' : 'horizontal',
    textStyle: legendText.typography,
    show: config.showLegend !== false,
    formatter: (value: string) => legendText.formatText(String(value)),
  };

  if (pos === 'top') {
    // Small inset so the colorbar isn't flush against the plot-area top edge
    // (chart area is the outer viz-container padding; plot is the ECharts canvas).
    visualMapCfg.top = DEFAULT_TOP_LEGEND_INSET;
    visualMapCfg.left = 'center';
  } else if (pos === 'bottom') {
    visualMapCfg.bottom = 0;
    visualMapCfg.left = 'center';
  } else if (pos === 'left') {
    visualMapCfg.left = LEGEND_EDGE_PADDING;
    visualMapCfg.top = 'center';
  } else {
    visualMapCfg.right = LEGEND_EDGE_PADDING;
    visualMapCfg.top = 'center';
  }

  // ── Map labels ──────────────────────────────────────────────────────────
  const ml = config.mapLabels;
  const hasExplicitToggle = ml && (ml.showAreaName || ml.showDataValue || ml.showAreaId);

  // When no explicit map-label toggle is on but the general label controls say
  // "inside + always", default to showing the data value inside regions.
  const showDataFallback =
    !hasExplicitToggle &&
    config.dataLabelPosition === 'inside' &&
    config.dataLabelVisibility !== 'onHover';

  const anyLabelOn = hasExplicitToggle || showDataFallback;

  const effectiveShowAreaName = ml?.showAreaName ?? false;
  const effectiveShowAreaId = ml?.showAreaId ?? false;
  const effectiveShowDataValue = ml?.showDataValue || showDataFallback;

  const buildLabelFormatter = () => {
    return (params: unknown) => {
      const p = params as { name?: string; value?: number; data?: { areaId?: string } };
      const parts: string[] = [];
      if (effectiveShowAreaName && p.name) parts.push(p.name);
      if (effectiveShowAreaId && p.data?.areaId) {
        parts.push(effectiveShowAreaName ? `(${p.data.areaId})` : p.data.areaId);
      }
      if (effectiveShowDataValue) {
        if (p.value != null && !Number.isNaN(p.value)) {
          parts.push(String(p.value));
        } else {
          parts.push('—');
        }
      }
      return parts.join('\n');
    };
  };

  // ── Series data ─────────────────────────────────────────────────────────
  const seriesData = data.features.map((f) => {
    const base: Record<string, unknown> = {
      name: f.name,
      areaId: f.areaId,
    };

    if (f.value == null) {
      return {
        ...base,
        value: NaN,
        itemStyle: { areaColor: f.selected ? data.nullColor : data.dimColor },
        emphasis: { disabled: !f.selected },
      };
    }
    if (!f.selected) {
      return {
        ...base,
        value: f.value,
        itemStyle: { areaColor: data.dimColor },
        emphasis: { disabled: true },
      };
    }
    return { ...base, value: f.value };
  });

  const hoverOnly = anyLabelOn && config.dataLabelVisibility === 'onHover';

  const labelCfg = anyLabelOn && !hoverOnly
    ? { show: true, formatter: buildLabelFormatter(), ...mapLabel.normal }
    : { show: false };

  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { name?: string; value?: number; data?: { areaId?: string } };
        const header = p.name ?? '';
        const idPart = p.data?.areaId ? ` (${p.data.areaId})` : '';
        if (p.value == null || Number.isNaN(p.value)) {
          return `<strong>${header}${idPart}</strong><br/>No data`;
        }
        return `<strong>${header}${idPart}</strong><br/>${p.value}`;
      },
    },
    visualMap: visualMapCfg,
    series: [
      {
        type: 'map',
        map: data.mapName,
        roam: true,
        data: seriesData,
        nameProperty: 'NAME1_',
        label: labelCfg,
        emphasis: {
          label: anyLabelOn
            ? { show: true, formatter: buildLabelFormatter(), ...mapLabel.emphasis }
            : { show: false },
          ...(data.hoverOverColor?.trim()
            ? { itemStyle: { areaColor: data.hoverOverColor.trim() } }
            : {}),
        },
        select: {
          disabled: true,
        },
        itemStyle: {
          borderColor: data.borderColor?.trim() || '#fff',
          borderWidth: 0.5,
        },
      },
    ],
  };

  return option;
}
