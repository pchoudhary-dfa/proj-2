import type {
  ChartConfig,
  LineBarAreaData,
  PieChartData,
  RadarData,
  HeatmapData,
  TreemapData,
  SliceDiceTreemapData,
  StripesTreemapData,
  SunburstData,
  ScatterXYData,
  PyramidData,
  RequiredFontStyle,
} from '../types';
import { buildUnderlinedTextFields, mergeRequiredFont } from '../fontUtils';
import { formatValueByUnitFormatCode } from '../unitFormatDisplay';

const TICK_FONT_BASE: RequiredFontStyle = {
  size: 11,
  family: 'sans-serif',
  bold: false,
  italic: false,
  underline: false,
};

/**
 * Resolved X-axis tick font — fully independent of labelFont.
 * Uses a plain default; only explicit xAxisTickFont overrides change it.
 */
export function resolveXAxisTickFont(config: ChartConfig): RequiredFontStyle {
  return mergeRequiredFont(TICK_FONT_BASE, config.xAxisTickFont);
}

/**
 * Resolved Y-axis tick font — fully independent of labelFont.
 * Uses a plain default; only explicit yAxisTickFont overrides change it.
 */
export function resolveYAxisTickFont(config: ChartConfig): RequiredFontStyle {
  return mergeRequiredFont(TICK_FONT_BASE, config.yAxisTickFont);
}

/**
 * Resolved secondary (right) Y-axis tick font.
 * Falls back to primary yAxisTickFont, then the plain tick default.
 */
export function resolveSecondaryYAxisTickFont(config: ChartConfig): RequiredFontStyle {
  return mergeRequiredFont(
    mergeRequiredFont(TICK_FONT_BASE, config.yAxisTickFont),
    config.secondaryYAxisTickFont
  );
}

/** Resolved data-point label font (dataLabelFont overrides labelFont). */
export function resolveDataLabelFont(config: ChartConfig): RequiredFontStyle {
  return mergeRequiredFont(config.labelFont, config.dataLabelFont);
}

/** Shared label/axis typography + rich underline formatter for inline ECharts labels. */
export function buildLabelTypography(
  config: ChartConfig,
  primeTexts: string[] = [],
  font: ChartConfig['labelFont'] = config.labelFont
): { typography: Record<string, unknown>; formatText: (text: string) => string } {
  const fields = buildUnderlinedTextFields(font, font.size, primeTexts);
  return {
    typography: {
      ...(fields.align ? { align: fields.align } : {}),
      ...(fields.rich ? { rich: fields.rich } : fields.textStyle),
    },
    formatText: fields.formatText,
  };
}

/**
 * Format a numeric value with locale + precision using v5 truncate semantics:
 * truncate (do not round) when precision < existing decimals; pad when greater.
 */
function formatLocalePrecisionValue(
  value: number,
  locale: string,
  precision: number,
): string {
  const prec = Math.max(0, Math.floor(precision));
  if (prec === 0) {
    return Math.round(value).toLocaleString(locale);
  }

  const strNum = String(value);
  const dotIdx = strNum.indexOf('.');
  const existingDecimals = dotIdx === -1 ? 0 : strNum.length - dotIdx - 1;

  if (prec >= existingDecimals) {
    return value.toLocaleString(locale, {
      minimumFractionDigits: prec,
      maximumFractionDigits: prec,
    });
  }

  const factor = Math.pow(10, prec);
  const truncated = Math.trunc(value * factor) / factor;
  return truncated.toLocaleString(locale, {
    minimumFractionDigits: prec,
    maximumFractionDigits: prec,
  });
}

/** Extract precision from Highcharts-style `{y:.2f}` / `{y:,.0f}` / `{value:.1f}`. */
function extractPrecisionFromUnitFormat(format: string): number | undefined {
  const m = format.match(/\.(\d+)f\b/i);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

/** True for dashboard bridge strings (`locale:…;precision:…`) or unit presets (`{y:.2f}`). */
export function isLocalePrecisionFormat(format: string | undefined): boolean {
  if (!format) return false;
  const f = format.trim();
  return f.startsWith('locale:') || f.startsWith('precision:') || /^\{[^{}]*\}$/.test(f);
}

/** Parse BCP-47 locale from a `locale:…;precision:…` format string. */
export function parseLocaleFromFormat(format: string | undefined): string | undefined {
  if (!format) return undefined;
  for (const part of format.split(';')) {
    const [key, val] = part.split(':');
    if (key === 'locale' && val?.trim()) return val.trim();
  }
  return undefined;
}

/**
 * Localize category-axis labels that are pure numbers (e.g. years `2011`) so digit
 * script matches the dashboard number-format locale. Non-numeric labels are unchanged.
 */
export function localizeCategoryLabel(label: string, locale: string): string {
  const trimmed = label.trim();
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed).toLocaleString(locale, { useGrouping: false });
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed).toLocaleString(locale, {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
  }
  return label;
}

/**
 * Format a numeric value for data labels according to the given format string.
 * Matches the formats used in the app (VisualizationSettingsConstants.numberFormats).
 * Also supports dashboard bridge strings (`locale:en-US;precision:2`) and unit
 * presets (`{y:.2f}`).
 */
export function formatLabelValue(value: number, format: string): string {
  const f = format || '1,000[.00]';
  if (f.startsWith('locale:') || f.startsWith('precision:')) {
    const parts = f.split(';');
    let locale = 'en-US';
    let precision = 2;
    for (const part of parts) {
      const [key, val] = part.split(':');
      if (key === 'locale' && val) locale = val;
      if (key === 'precision' && val) precision = parseInt(val, 10);
    }
    if (Number.isNaN(precision)) precision = 2;
    return formatLocalePrecisionValue(value, locale, precision);
  }
  // Safety net for unconverted unit presets from dashboard config
  if (/^\{[^{}]*\}$/.test(f.trim())) {
    const prec = extractPrecisionFromUnitFormat(f);
    return formatLocalePrecisionValue(value, 'en-US', prec ?? 2);
  }
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

/**
 * Format an already-computed percentage (0–100) as a compact label.
 * Rounds to at most one decimal and strips a trailing ".0" — e.g. 45 → "45%", 12.53 → "12.5%".
 */
export function formatPercentLabel(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}%`;
}

/**
 * Resolve display string for a data point.
 * Priority:
 *   1. Dashboard locale/precision override (`locale:…;precision:…`) when set
 *   2. Unit auto-format (`unitFormatCode` / server `preFormatted`) when useUnitDefault
 *   3. Manual format presets (`1,000[.00]`, etc.)
 */
export function resolveFormattedValue(
  value: number,
  format: string,
  useUnitDefault: boolean,
  preFormatted: string | undefined | null,
  unitFormatCode?: string | null,
): string {
  if (isLocalePrecisionFormat(format)) {
    return formatLabelValue(value, format);
  }
  if (useUnitDefault) {
    if (unitFormatCode) {
      return formatValueByUnitFormatCode(value, unitFormatCode);
    }
    if (preFormatted) {
      return preFormatted;
    }
  }
  return formatLabelValue(value, format);
}

/** Collect formatted pie segment values for data-label underline width priming. */
export function collectPieLabelPrimeTexts(data: PieChartData, config: ChartConfig): string[] {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnitDefault = config.useUnitDefaultFormat ?? false;
  return data.segments.map((seg) =>
    resolveFormattedValue(seg.value, format, useUnitDefault, seg.formattedValue, seg.unitFormatCode)
  );
}

/** Collect display strings used on value axes and data labels for underline width priming. */
export function collectSeriesLabelPrimeTexts(data: LineBarAreaData, config: ChartConfig): string[] {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnitDefault = config.useUnitDefaultFormat ?? false;
  const texts: string[] = [];
  for (const s of data.series) {
    s.values.forEach((val, idx) => {
      texts.push(
        resolveFormattedValue(val, format, useUnitDefault, s.formattedValues?.[idx], s.unitFormatCodes?.[idx])
      );
      texts.push(String(val));
    });
  }
  return texts;
}

/** Collect radar spoke labels and formatted point values for underline priming. */
export function collectRadarLabelPrimeTexts(data: RadarData, config: ChartConfig): string[] {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;
  const texts = data.indicators.map((ind) => ind.name);
  for (const s of data.series) {
    s.values.forEach((val, idx) => {
      texts.push(
        resolveFormattedValue(val, format, useUnit, s.formattedValues?.[idx], s.unitFormatCodes?.[idx])
      );
    });
  }
  return texts;
}

/** Collect heatmap axis categories and cell values for underline priming. */
export function collectHeatmapLabelPrimeTexts(data: HeatmapData, config: ChartConfig): string[] {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;
  const texts = [...data.xCategories, ...data.yCategories];
  data.cells.forEach((cell, idx) => {
    texts.push(
      resolveFormattedValue(cell[2], format, useUnit, data.formattedCells?.[idx], data.unitFormatCells?.[idx])
    );
  });
  texts.push(formatLabelValue(data.min, format), formatLabelValue(data.max, format));
  return texts;
}

/** Collect treemap node labels for underline priming. */
export function collectTreemapLabelPrimeTexts(data: TreemapData, config: ChartConfig): string[] {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;
  const texts: string[] = [];
  for (const node of data.nodes) {
    if (node.name) texts.push(node.name);
    texts.push(
      resolveFormattedValue(node.value, format, useUnit, node.formattedValue, node.unitFormatCode)
    );
    for (const child of node.children ?? []) {
      if (child.name) texts.push(child.name);
      texts.push(
        resolveFormattedValue(child.value, format, useUnit, child.formattedValue, child.unitFormatCode)
      );
    }
  }
  return texts;
}

/** Collect sunburst node labels and formatted values for underline priming (same structure as treemap). */
export function collectSunburstLabelPrimeTexts(data: SunburstData, config: ChartConfig): string[] {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;
  const texts: string[] = [];

  function collect(nodes: import('../types').TreemapNode[]): void {
    for (const node of nodes) {
      if (node.name) texts.push(node.name);
      texts.push(
        resolveFormattedValue(node.value, format, useUnit, node.formattedValue, node.unitFormatCode)
      );
      if (node.children && node.children.length > 0) collect(node.children);
    }
  }

  collect(data.nodes);
  return texts;
}

/** Collect slice-and-dice treemap node labels for underline priming (recursive, same structure as sunburst). */
export function collectSliceDiceLabelPrimeTexts(data: SliceDiceTreemapData, config: ChartConfig): string[] {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;
  const texts: string[] = [];

  function collect(nodes: import('../types').TreemapNode[]): void {
    for (const node of nodes) {
      if (node.name) texts.push(node.name);
      texts.push(
        resolveFormattedValue(node.value, format, useUnit, node.formattedValue, node.unitFormatCode)
      );
      if (node.children && node.children.length > 0) collect(node.children);
    }
  }

  collect(data.nodes);
  return texts;
}

/** Collect stripes treemap node labels for underline priming (recursive, same structure as sunburst). */
export function collectStripesLabelPrimeTexts(data: StripesTreemapData, config: ChartConfig): string[] {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;
  const texts: string[] = [];

  function collect(nodes: import('../types').TreemapNode[]): void {
    for (const node of nodes) {
      if (node.name) texts.push(node.name);
      texts.push(
        resolveFormattedValue(node.value, format, useUnit, node.formattedValue, node.unitFormatCode)
      );
      if (node.children && node.children.length > 0) collect(node.children);
    }
  }

  collect(data.nodes);
  return texts;
}

/** Collect scatter point names for underline priming. */
export function collectScatterLabelPrimeTexts(data: ScatterXYData): string[] {
  const texts: string[] = [];
  for (const s of data.series) {
    for (const p of s.points) {
      if (p.label) texts.push(p.label);
    }
    texts.push(s.name);
  }
  return texts;
}

/** Collect pyramid wing labels and formatted bar values for underline priming. */
export function collectPyramidLabelPrimeTexts(data: PyramidData, config: ChartConfig): string[] {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;
  const texts = [...data.categories, data.leftSeries.name, data.rightSeries.name];
  data.leftSeries.values.forEach((val, idx) => {
    texts.push(
      resolveFormattedValue(
        Math.abs(val),
        format,
        useUnit,
        data.leftSeries.formattedValues?.[idx],
        data.leftSeries.unitFormatCodes?.[idx]
      )
    );
  });
  data.rightSeries.values.forEach((val, idx) => {
    texts.push(
      resolveFormattedValue(
        val,
        format,
        useUnit,
        data.rightSeries.formattedValues?.[idx],
        data.rightSeries.unitFormatCodes?.[idx]
      )
    );
  });
  return texts;
}

/** ECharts label position when data labels are "outside" for line/area (top) or bar (top/right). */
type OutsidePosition = 'top' | 'right';

/**
 * Build ECharts series label and emphasis config from ChartConfig.
 * outsidePosition: 'top' for line/area vertical bar, 'right' for horizontal bar.
 * seriesFormattedValues: optional pre-formatted display strings (one per data index in this series).
 * seriesUnitFormatCodes: optional unit format codes (one per data index in this series).
 * seriesValues: numeric series data — used to pre-measure underline widths for each label string.
 * percentMode: when true, values are already percentages (0–100); labels render as "<n>%" and
 *   the formatted-value / unit-code inputs are ignored (used by 100% stacked bar variants).
 */
export function buildDataLabelConfig(
  config: ChartConfig,
  outsidePosition: OutsidePosition = 'top',
  seriesFormattedValues?: (string | undefined)[],
  seriesUnitFormatCodes?: (string | undefined)[],
  seriesValues?: number[],
  percentMode = false,
  /** Optional category axis labels for `dataLabelShowCategory` (preferred over params.name). */
  categoryLabels?: string[],
): { label: Record<string, unknown>; emphasis?: { label: Record<string, unknown> } } {
  // 100% stacked bars only make sense with labels centred inside each segment: an "outside"
  // (top/right) position stacks every series' label at the segment boundary — they overlap and,
  // for horizontal bars, the 100%-edge label spills outside the plot. Force 'inside' here.
  const position = percentMode
    ? 'inside'
    : config.dataLabelPosition === 'inside'
      ? 'inside'
      : outsidePosition;
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnitDefault = config.useUnitDefaultFormat ?? false;

  const font = resolveDataLabelFont(config);
  const primeTexts = (seriesValues ?? []).map((val, idx) => {
    const valueText = percentMode
      ? formatPercentLabel(val)
      : resolveFormattedValue(
          val,
          format,
          useUnitDefault,
          seriesFormattedValues?.[idx],
          seriesUnitFormatCodes?.[idx]
        );
    if (config.dataLabelShowCategory && categoryLabels?.[idx]) {
      return `${categoryLabels[idx]}: ${valueText}`;
    }
    return valueText;
  });
  const textFields = buildUnderlinedTextFields(font, font.size, primeTexts);

  const base = {
    ...(textFields.align ? { align: textFields.align } : {}),
    ...(textFields.rich ? { rich: textFields.rich } : textFields.textStyle),
    ...(config.dataLabelRotation != null && config.dataLabelRotation !== 0
      ? { rotate: config.dataLabelRotation }
      : {}),
    ...(config.dataLabelBackgroundColor?.trim()
      ? {
          backgroundColor: config.dataLabelBackgroundColor.trim(),
          padding: [2, 4] as [number, number],
        }
      : {}),
    ...(config.dataLabelBorderColor?.trim()
      ? {
          borderColor: config.dataLabelBorderColor.trim(),
          borderWidth:
            config.dataLabelBorderWidth != null && config.dataLabelBorderWidth > 0
              ? config.dataLabelBorderWidth
              : 1,
        }
      : {}),
    ...(config.dataLabelBorderRadius != null && config.dataLabelBorderRadius > 0
      ? { borderRadius: config.dataLabelBorderRadius }
      : {}),
    ...((config.dataLabelOffsetX != null && config.dataLabelOffsetX !== 0) ||
    (config.dataLabelOffsetY != null && config.dataLabelOffsetY !== 0)
      ? {
          offset: [
            config.dataLabelOffsetX ?? 0,
            config.dataLabelOffsetY ?? 0,
          ] as [number, number],
        }
      : {}),
    formatter: (params: { value?: number; dataIndex?: number; name?: string }) => {
      const val = Number(params?.value ?? 0);
      if (percentMode) {
        // Empty/negligible segments (values that round to 0%) would render a "0%" label on
        // top of the neighbouring segment's label — hide them.
        if (!Number.isFinite(val) || Math.round(val * 10) / 10 === 0) return '';
        return textFields.formatText(formatPercentLabel(val));
      }
      const idx = params?.dataIndex ?? -1;
      const pre = seriesFormattedValues?.[idx];
      const unitCode = seriesUnitFormatCodes?.[idx];
      let text = resolveFormattedValue(val, format, useUnitDefault, pre, unitCode);
      if (config.dataLabelShowCategory) {
        const cat =
          (idx >= 0 && categoryLabels?.[idx]) ||
          (params?.name != null && String(params.name).length > 0 ? String(params.name) : '');
        if (cat) text = `${cat}: ${text}`;
      }
      return textFields.formatText(text);
    },
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
