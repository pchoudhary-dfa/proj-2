import type { ChartConfig } from '../types';

/**
 * Format a numeric value for data labels according to the given format string.
 * Matches the formats used in the app (VisualizationSettingsConstants.numberFormats).
 */
export function formatLabelValue(value: number, format: string): string {
  const f = format || '1,000[.00]';
  switch (f) {
    case '1,000[.00]':
      return value % 1 === 0
        ? value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case '1000.00':
      return value.toFixed(2);
    case '1,000.00':
      return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case '1000':
      return Math.round(value).toString();
    case '1,000':
      return Math.round(value).toLocaleString('en-US');
    case '1.00K':
      if (Math.abs(value) >= 1_000_000) {
        return (value / 1_000_000).toFixed(2) + 'M';
      }
      if (Math.abs(value) >= 1000) {
        return (value / 1000).toFixed(2) + 'K';
      }
      return value.toFixed(2);
    case '1K':
      if (Math.abs(value) >= 1_000_000) {
        return Math.round(value / 1_000_000) + 'M';
      }
      if (Math.abs(value) >= 1000) {
        return Math.round(value / 1000) + 'K';
      }
      return Math.round(value).toString();
    default:
      return value.toFixed(2);
  }
}

/** ECharts label position when data labels are "outside" for line/area (top) or bar (top/right). */
type OutsidePosition = 'top' | 'right';

/**
 * Build ECharts series label and emphasis config from ChartConfig.
 * outsidePosition: 'top' for line/area vertical bar, 'right' for horizontal bar.
 */
export function buildDataLabelConfig(
  config: ChartConfig,
  outsidePosition: OutsidePosition = 'top'
): { label: Record<string, unknown>; emphasis?: { label: Record<string, unknown> } } {
  const position =
    config.dataLabelPosition === 'inside' ? 'inside' : outsidePosition;
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const base = {
    fontSize: config.labelFont.size,
    fontFamily: config.labelFont.family,
    fontWeight: config.labelFont.bold ? 'bold' : 'normal',
    fontStyle: config.labelFont.italic ? 'italic' : 'normal',
    formatter: (params: { value?: number }) =>
      formatLabelValue(Number(params?.value ?? 0), format),
  };

  if (config.dataLabelVisibility === 'onHover') {
    return {
      label: { show: false },
      emphasis: {
        label: {
          show: true,
          position,
          ...base,
        },
      },
    };
  }

  return {
    label: {
      show: true,
      position,
      ...base,
    },
  };
}
