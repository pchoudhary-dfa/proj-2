import type { EChartsOption } from 'echarts';
import type { ChartConfig, PointMeta, RadarData } from '../types';
import { buildLegend } from './cartesian';
import {
  buildLabelTypography,
  collectRadarLabelPrimeTexts,
  resolveFormattedValue,
  resolveDataLabelFont,
  resolveXAxisTickFont,
} from './labelUtils';
import {
  resolveSeriesColor,
  resolveSeriesItemColor,
  resolveSeriesLineDash,
  resolveSeriesLineWidth,
  resolveSeriesSymbol,
} from './resolveSeriesStyle';

/** Build a meta row for the radar rich tooltip. */
function radarMetaRow(label: string, value: string | undefined): string {
  if (!value) return '';
  return `<div style="display:flex;gap:6px;margin-top:2px"><span style="opacity:0.65;white-space:nowrap">${label}:</span><span>${value}</span></div>`;
}

/**
 * Build rich radar tooltip HTML for a single hovered point (one spoke on one polygon).
 * Shows indicator (spoke name), value, and all dimension fields that are enabled.
 */
function buildRadarItemTooltipHtml(
  params: unknown,
  data: RadarData,
  config: ChartConfig,
  format: string,
  useUnit: boolean,
): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = params as any;
  const seriesIdx: number = p?.seriesIndex ?? p?.dataIndex ?? 0;
  // For radar item trigger, params.data.value is the array of all spoke values.
  // ECharts does not give us the individual spoke index on item trigger for radar.
  // We show all spokes with their dimension metadata, similar to the existing formatter.
  const name: string = p?.data?.name ?? p?.name ?? data.series[seriesIdx]?.name ?? '';
  const vals: number[] | undefined = p?.data?.value;

  if (!Array.isArray(vals)) return '';

  const fields = config.tooltipFields ?? {};
  const showIndicator = fields.indicator !== false;
  const showUnit = fields.unit === true;
  const showTimePeriod = fields.timePeriod !== false;
  const showSubgroup = fields.subgroup !== false;
  const showArea = fields.area !== false;
  const showSource = fields.source === true;
  const showFootnote = fields.footnote === true;

  // Series header often duplicates indicatorName when series is mapped by indicator.
  const firstMeta = data.spokeMeta?.[seriesIdx]?.[0];
  const seriesMatchesIndicator =
    !!firstMeta?.indicatorName &&
    name.trim().toLowerCase() === firstMeta.indicatorName.trim().toLowerCase();
  const headerName = !showIndicator && seriesMatchesIndicator ? '' : name;

  let html = headerName
    ? `<div style="font-weight:600;margin-bottom:6px">${headerName}</div>`
    : '';

  const spokeMetaForSeries: PointMeta[] | undefined = data.spokeMeta?.[seriesIdx];

  const lines = vals.map((v, idx) => {
    const spokeName = data.indicators[idx]?.name ?? String(idx);
    const pre = data.series[seriesIdx]?.formattedValues?.[idx];
    const unitCode = data.series[seriesIdx]?.unitFormatCodes?.[idx];
    const formattedVal = resolveFormattedValue(Number(v), format, useUnit, pre, unitCode);
    const meta = spokeMetaForSeries?.[idx];

    let line = `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,0,0,0.07)">`;
    line += `<div style="font-weight:500">${showIndicator ? spokeName : 'Value'}: <b>${formattedVal}</b></div>`;
    if (meta) {
      if (showUnit && meta.unitName) line += radarMetaRow('Unit', meta.unitName);
      if (showTimePeriod && meta.timePeriodName) line += radarMetaRow('Time Period', meta.timePeriodName);
      if (showSubgroup && meta.subgroupName) line += radarMetaRow('Subgroup', meta.subgroupName);
      if (showArea && meta.areaName) line += radarMetaRow('Area', meta.areaName);
      if (showSource && meta.sourceName) line += radarMetaRow('Source', meta.sourceName);
      if (showFootnote && meta.footnote) {
        line += `<div style="margin-top:3px;font-size:0.9em;opacity:0.8">${meta.footnote}</div>`;
      }
    }
    line += '</div>';
    return line;
  });

  html += lines.join('');
  return `<div style="min-width:160px;max-width:300px;line-height:1.5">${html}</div>`;
}

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
  const primeTexts = collectRadarLabelPrimeTexts(data, config);
  const spokeFont = resolveXAxisTickFont(config);
  const dataFont = resolveDataLabelFont(config);
  const spokeLabel = buildLabelTypography(config, data.indicators.map((i) => i.name), spokeFont);
  const dataLabel = buildLabelTypography(config, primeTexts, dataFont);
  const seriesNames = data.series.map((s) => s.name);

  const showAlways = config.showLabels && config.dataLabelVisibility !== 'onHover';
  const showOnHover = config.showLabels && config.dataLabelVisibility === 'onHover';
  const useUnit = config.useUnitDefaultFormat ?? false;

  const radarSeriesData = data.series.map((s, i) => {
    const color = resolveSeriesColor(s, i, { ...config, palette });
    const marker = resolveSeriesSymbol(s, config);
    const markerColor = resolveSeriesItemColor(s, color);
    const lineDash = resolveSeriesLineDash(s);
    return {
      value: s.values,
      name: s.name,
      symbol: marker.symbol,
      symbolSize: marker.symbolSize,
      lineStyle: {
        width: resolveSeriesLineWidth(s, config),
        color,
        ...(lineDash ? { type: lineDash } : {}),
      },
      itemStyle: {
        color: markerColor,
        ...(marker.borderColor ? { borderColor: marker.borderColor } : {}),
        ...(marker.borderWidth != null ? { borderWidth: marker.borderWidth } : {}),
      },
      areaStyle: { opacity: 0.12, color },
      ...(s.emphasisColor
        ? { emphasis: { itemStyle: { color: s.emphasisColor } } }
        : {}),
    };
  });

  const labelFormatter = (p: unknown) => {
    const v = p as { value?: number; dimensionIndex?: number; dataIndex?: number };
    const di = v?.dataIndex ?? 0;
    const dimIdx = v?.dimensionIndex ?? 0;
    const pre = data.series[di]?.formattedValues?.[dimIdx];
    const unitCode = data.series[di]?.unitFormatCodes?.[dimIdx];
    const text = resolveFormattedValue(Number(v?.value ?? 0), format, useUnit, pre, unitCode);
    return dataLabel.formatText(text);
  };

  // Tooltip disabled entirely
  const tooltipEnabled = config.tooltipEnabled !== false;
  // Radar always uses item trigger; respect explicit 'item' setting (axis doesn't apply to radar).
  // When tooltipTrigger === 'item' and spokeMeta is present, use the rich formatter.
  const useRichTooltip = tooltipEnabled && config.tooltipTrigger === 'item';

  const tooltipOption: Record<string, unknown> = tooltipEnabled
    ? {
        trigger: 'item',
        confine: true,
        formatter: (params: unknown) => {
          if (useRichTooltip) {
            return buildRadarItemTooltipHtml(params, data, config, format, useUnit);
          }
          // Default radar tooltip
          const p = params as { data?: { name?: string; value?: number[] }; name?: string; seriesIndex?: number; dataIndex?: number } | null;
          const name = p?.data?.name ?? p?.name ?? '';
          const vals = p?.data?.value;
          if (!Array.isArray(vals)) return '';
          const di = p?.dataIndex ?? 0;
          const seriesFmt = data.series[di]?.formattedValues;
          const seriesUnitCodes = data.series[di]?.unitFormatCodes;
          const lines = vals
            .map((v, idx) => {
              const indName = data.indicators[idx]?.name ?? String(idx);
              const pre = seriesFmt?.[idx];
              const unitCode = seriesUnitCodes?.[idx];
              return `${indName}: ${resolveFormattedValue(Number(v), format, useUnit, pre, unitCode)}`;
            })
            .join('<br/>');
          return `<strong>${name}</strong><br/>${lines}`;
        },
      }
    : { show: false };

  return {
    tooltip: tooltipOption,
    xAxis: { show: false },
    yAxis: { show: false },
    ...buildLegend(config, data.series.length, undefined, seriesNames),
    radar: {
      indicator: data.indicators.map((ind) => ({
        name: spokeLabel.formatText(ind.name),
        max: overrideMax !== undefined ? overrideMax : (ind.max > 0 ? ind.max : 1),
      })),
      center: ['50%', '55%'],
      radius: '62%',
      axisName: spokeLabel.typography,
      splitArea: { show: config.showGrid },
      splitLine: { show: config.showGrid },
    },
    series: [
      {
        type: 'radar',
        data: radarSeriesData,
        symbol: config.seriesSymbol && config.seriesSymbol !== 'none' ? config.seriesSymbol : 'circle',
        symbolSize: config.seriesSymbolSize ?? 6,
        label: {
          show: showAlways,
          formatter: labelFormatter,
          ...dataLabel.typography,
        },
        emphasis: {
          label: showOnHover
            ? {
                show: true,
                formatter: labelFormatter,
                ...dataLabel.typography,
              }
            : { show: false },
        },
      },
    ],
  } as EChartsOption;
}
