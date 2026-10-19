import type { EChartsOption } from 'echarts';
import type { ChartConfig, HundredMinusData } from '../types';
import { computeTitleBlockHeight } from '../titleLayout';
import { buildUnderlinedTextFields } from '../fontUtils';
import { resolveDataLabelFont, resolveFormattedValue } from './labelUtils';

const MUTED_FALLBACK = '#2a2a2a';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Builds ECharts option for a "100 minus" percentage donut.
 *
 * Two segments: the value arc and the remainder (100 − value). A centered
 * numeric label shows the percentage. Legend and segment labels are off.
 */
export function buildHundredMinusOption(data: HundredMinusData, config: ChartConfig): EChartsOption {
  const value = clampPercent(data.value);
  const remainder = 100 - value;
  const fillColor = config.palette[0] ?? config.primaryColor;
  const mutedColor = config.palette[1] ?? MUTED_FALLBACK;
  const titleBlock = computeTitleBlockHeight(config);
  const showCenter = config.showLabels !== false;
  const dataFont = resolveDataLabelFont(config);
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;

  // Prefer a clean integer/decimal display for the center; fall back to formattedValue.
  const centerText =
    data.formattedValue ??
    resolveFormattedValue(value, format, useUnit, undefined, undefined);

  const labelFields = buildUnderlinedTextFields(dataFont, dataFont.size, [centerText]);
  const labelTypography = labelFields.rich
    ? { rich: labelFields.rich, ...(labelFields.align ? { align: labelFields.align } : {}) }
    : { ...labelFields.textStyle };

  // Shift center slightly when a title block is present.
  const shiftPct = Math.min(12, titleBlock * 0.04);
  const centerY = `${50 + shiftPct}%`;
  const radius: [string, string] = titleBlock > 40 ? ['38%', '62%'] : ['42%', '68%'];

  const pieData = [
    {
      name: data.label ?? 'Value',
      value,
      itemStyle: { color: fillColor },
      label: { show: false },
    },
    {
      name: 'Remainder',
      value: remainder,
      itemStyle: { color: mutedColor },
      label: { show: false },
      tooltip: { show: false },
    },
  ];

  const tooltipFormatter = (params: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = params as any;
    if (p?.name === 'Remainder') return '';
    const label = data.label ? `${data.label}: ` : '';
    return `${p?.marker ?? ''} ${label}<b>${centerText}%</b>`;
  };

  // Transparent center series used only to place the center label (ECharts pie center label pattern).
  const centerSeries = showCenter
    ? {
        type: 'pie' as const,
        radius,
        center: ['50%', centerY],
        silent: true,
        label: {
          show: true,
          position: 'center' as const,
          formatter: () => labelFields.formatText(centerText),
          ...labelTypography,
        },
        labelLine: { show: false },
        data: [{ value: 1, name: '', itemStyle: { color: 'transparent' }, tooltip: { show: false } }],
        z: 2,
      }
    : null;

  const mainSeries = {
    type: 'pie' as const,
    radius,
    center: ['50%', centerY],
    startAngle: 90,
    data: pieData,
    label: { show: false },
    labelLine: { show: false },
    emphasis: {
      itemStyle: { shadowBlur: 8, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.2)' },
      label: { show: false },
    },
    z: 1,
  };

  const series = centerSeries ? [mainSeries, centerSeries] : [mainSeries];

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
    series: series as unknown as EChartsOption['series'],
  };

  return option;
}
