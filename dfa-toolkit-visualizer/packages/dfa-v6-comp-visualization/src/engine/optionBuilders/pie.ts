import type { EChartsOption } from 'echarts';
import type { ChartConfig, PieChartData } from '../types';
import { buildLegend, horizontalLegendRowHeight } from './cartesian';
import { buildUnderlinedTextFields } from '../fontUtils';
import { computeTitleBlockHeight } from '../titleLayout';
import { resolveFormattedValue, collectPieLabelPrimeTexts, resolveDataLabelFont } from './labelUtils';

/** Gap between title block and top legend, and between legend and pie. */
const PIE_TITLE_LEGEND_GAP = 12;
const PIE_LEGEND_CHART_GAP = 16;

function resolvePieLabels(config: ChartConfig): {
  show: boolean;
  position: 'inside' | 'outside';
  showLabelLine: boolean;
  showOnHover: boolean;
} {
  // Leader lines default on for outside labels (v5 EnbConnector default true).
  // Hosts can disable via dataLabelLeaderLineEnabled: false.
  const leaderEnabled = config.dataLabelLeaderLineEnabled !== false;

  // Visualizer path: explicit pie label flags
  if (config.pieLabelsInside || config.pieLabelsOutside) {
    const onHover = config.dataLabelVisibility === 'onHover';
    const outside = !!config.pieLabelsOutside;
    return {
      show: !onHover,
      position: config.pieLabelsInside ? 'inside' : 'outside',
      showLabelLine: outside && leaderEnabled,
      showOnHover: onHover,
    };
  }
  // Dev playground / generic path: showLabels + dataLabelPosition
  if (config.showLabels) {
    const inside = config.dataLabelPosition === 'inside';
    const onHover = config.dataLabelVisibility === 'onHover';
    return {
      show: !onHover,
      position: inside ? 'inside' : 'outside',
      showLabelLine: !inside && leaderEnabled,
      showOnHover: onHover,
    };
  }
  return { show: false, position: 'outside', showLabelLine: false, showOnHover: false };
}

function pieLayout(config: ChartConfig): {
  centerY: string;
  radius: string | string[];
} {
  const titleBlock = computeTitleBlockHeight(config);
  const pos = config.legendPosition;
  const legendRow = config.showLegend ? horizontalLegendRowHeight(config) : 0;
  const topLegend = pos === 'top' && config.showLegend;
  const bottomLegend = pos === 'bottom' && config.showLegend;

  const topChrome =
    titleBlock +
    (topLegend ? PIE_TITLE_LEGEND_GAP + legendRow + PIE_LEGEND_CHART_GAP : titleBlock > 0 ? 8 : 0);
  const bottomChrome = bottomLegend ? legendRow + 8 : 0;

  // Shift center down when headings / top legend consume vertical space.
  const shiftPct = Math.min(24, topChrome * 0.05 + (topLegend ? 4 : 0));
  const baseCenter = config.pieSemi ? 70 : 50;
  const centerY = `${Math.min(88, baseCenter + shiftPct - bottomChrome * 0.02)}%`;

  const shrink = topChrome > 40 || bottomChrome > 20;
  const radius = config.pieDonut
    ? shrink
      ? ['34%', '58%']
      : ['40%', '70%']
    : shrink
      ? '58%'
      : '65%';

  return {
    centerY,
    radius,
  };
}

export function buildPieOption(data: PieChartData, config: ChartConfig): EChartsOption {
  const layout = pieLayout(config);
  const startAngle = config.pieSemi ? 180 : 90;
  const endAngle = config.pieSemi ? 0 : 450;

  const pieData = data.segments.map((seg, i) => ({
    name: seg.label,
    value: seg.value,
    itemStyle: {
      color: seg.color?.trim() || config.palette[i % config.palette.length] || config.primaryColor,
    },
  }));

  const segmentCount = data.segments.length;
  const segmentNames = data.segments.map((seg) => seg.label);
  const labelMode = resolvePieLabels(config);
  const useUnit = config.useUnitDefaultFormat ?? false;
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const labelPrimeTexts = collectPieLabelPrimeTexts(data, config);
  const dataFont = resolveDataLabelFont(config);
  const labelTextFields = buildUnderlinedTextFields(
    dataFont,
    dataFont.size,
    labelPrimeTexts
  );
  const labelTypography = labelTextFields.rich
    ? { rich: labelTextFields.rich, ...(labelTextFields.align ? { align: labelTextFields.align } : {}) }
    : { ...labelTextFields.textStyle };

  const labelFormatter = (params: { value?: unknown; dataIndex?: number }) => {
    const di = params.dataIndex ?? 0;
    const seg = data.segments[di];
    const raw = params.value;
    const num = typeof raw === 'number' ? raw : Number(raw ?? 0);
    const text = resolveFormattedValue(num, format, useUnit, seg?.formattedValue, seg?.unitFormatCode);
    return labelTextFields.formatText(text);
  };

  const tooltipFormatter = (params: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = params as any;
    const di = p.dataIndex ?? 0;
    const pre = data.segments[di]?.formattedValue;
    const unitCode = data.segments[di]?.unitFormatCode;
    const val = resolveFormattedValue(Number(p.value ?? 0), format, useUnit, pre, unitCode);
    return `${p.marker ?? ''} ${p.name}: <b>${val}</b>`;
  };

  const { legend: legendConfig } = buildLegend(config, segmentCount, undefined, segmentNames);

  // The rich-underline typography carries `rich: Record<string, unknown>`, which is
  // structurally looser than ECharts' `Dictionary<TextCommonOption>`. Cast the series
  // through `unknown` so this one known-safe mismatch doesn't fail declaration output.
  const pieSeries = {
    type: 'pie' as const,
    radius: layout.radius,
    center: ['50%', layout.centerY],
    startAngle,
    endAngle,
    data: pieData,
    label: {
      show: labelMode.show,
      position: labelMode.position,
      ...labelTypography,
      formatter: labelFormatter,
    },
    labelLine: { show: labelMode.showLabelLine && labelMode.show },
    emphasis: {
      itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.2)' },
      ...(labelMode.showOnHover
        ? {
            label: {
              show: true,
              position: labelMode.position,
              ...labelTypography,
              formatter: labelFormatter,
            },
            labelLine: { show: labelMode.showLabelLine },
          }
        : {}),
    },
  };

  const option: EChartsOption = {
    tooltip: { trigger: 'item', confine: true, formatter: tooltipFormatter },
    xAxis: { show: false },
    yAxis: { show: false },
    legend: legendConfig,
    series: [pieSeries] as unknown as EChartsOption['series'],
  };

  return option;
}
