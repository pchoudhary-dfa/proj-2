import type { ChartConfig, LineBarAreaSeriesItem, SeriesChartTypeOverride } from '../types';

/**
 * Resolve fill/stroke color for a series: explicit override → palette[i] → primaryColor.
 * Empty `values` (line path legacy) falls back to primaryColor when no override is set.
 */
export function resolveSeriesColor(
  s: { color?: string; values?: number[] },
  i: number,
  config: ChartConfig,
): string {
  if (s.color) return s.color;
  if (s.values && s.values.length === 0) return config.primaryColor;
  return config.palette[i % config.palette.length] ?? config.primaryColor;
}

/** Line width: per-series override → global lineThickness → 2. */
export function resolveSeriesLineWidth(
  s: { lineStyle?: { width?: number } },
  config: ChartConfig,
): number {
  return s.lineStyle?.width ?? config.lineThickness ?? 2;
}

/** Dash style type when set on the series (ECharts lineStyle.type). */
export function resolveSeriesLineDash(
  s: { lineStyle?: { type?: string } },
): string | undefined {
  const t = s.lineStyle?.type;
  return t && t.length > 0 ? t : undefined;
}

export type ResolvedSeriesSymbol = {
  showSymbol: boolean;
  symbol: string;
  symbolSize: number;
  borderWidth?: number;
  borderColor?: string;
};

/**
 * Marker/symbol resolution: per-series fields override global seriesSymbol* config.
 */
export function resolveSeriesSymbol(
  s: Pick<
    LineBarAreaSeriesItem,
    'symbol' | 'symbolSize' | 'showSymbol' | 'itemStyle' | 'borderColor'
  >,
  config: ChartConfig,
): ResolvedSeriesSymbol {
  const globalSymbol = config.seriesSymbol ?? 'circle';
  const globalShow = globalSymbol !== 'none';
  const showSymbol = s.showSymbol ?? globalShow;
  const symbol = showSymbol ? (s.symbol ?? (globalShow ? globalSymbol : 'circle')) : 'none';
  const symbolSize = s.symbolSize ?? config.seriesSymbolSize ?? 6;

  const borderWidth =
    s.itemStyle?.borderWidth ?? config.seriesSymbolBorderWidth;
  const borderColor =
    s.itemStyle?.borderColor ?? s.borderColor ?? config.seriesSymbolBorderColor;

  return {
    showSymbol,
    symbol: showSymbol ? symbol : 'none',
    symbolSize,
    ...(borderWidth != null && showSymbol ? { borderWidth } : {}),
    ...(borderColor != null && showSymbol ? { borderColor } : {}),
  };
}

/**
 * ECharts series `type` for combo overrides.
 * Area charts use `line` + areaStyle when type is area/default (see shouldApplyAreaStyle).
 */
export function resolveSeriesEChartsType(
  seriesType: SeriesChartTypeOverride | undefined,
  defaultType: 'line' | 'bar' | 'scatter',
): 'line' | 'bar' | 'scatter' {
  if (!seriesType) return defaultType;
  if (seriesType === 'area') return 'line';
  if (seriesType === 'line' || seriesType === 'bar' || seriesType === 'scatter') {
    return seriesType;
  }
  return defaultType;
}

/** Whether an area builder should attach areaStyle for this series. */
export function shouldApplyAreaStyle(
  seriesType: SeriesChartTypeOverride | undefined,
): boolean {
  return seriesType === undefined || seriesType === 'area';
}

/**
 * Marker/item fill: explicit `itemStyle.color` when set, otherwise series stroke/fill color.
 * Lets markers differ from the line color without changing lineStyle/bar fill.
 */
export function resolveSeriesItemColor(
  s: { itemStyle?: { color?: string } },
  seriesColor: string,
): string {
  return s.itemStyle?.color ?? seriesColor;
}

/**
 * Merge optional hover color into an existing series `emphasis` object (e.g. from labels).
 */
export function mergeSeriesEmphasis(
  existing: Record<string, unknown> | undefined,
  emphasisColor: string | undefined,
): Record<string, unknown> | undefined {
  if (!emphasisColor) return existing;
  const prevItem =
    existing?.itemStyle && typeof existing.itemStyle === 'object'
      ? (existing.itemStyle as Record<string, unknown>)
      : {};
  return {
    ...(existing ?? {}),
    itemStyle: {
      ...prevItem,
      color: emphasisColor,
    },
  };
}

export type CategoryColoredPoint =
  | number
  | {
      value: number;
      itemStyle: { color: string };
    };

/**
 * Apply optional per-point and/or per-category colors onto series values for ECharts.
 * When both color arrays are absent or empty, returns `values` unchanged (byte-identical path).
 * Otherwise emits per-point objects only for indices with a color; bare numbers elsewhere.
 * Precedence at draw time: pointColors[i] → categoryColors[i] → series itemStyle.color → palette.
 */
export function applyPointColorsToSeriesData(
  values: number[],
  pointRowColors?: (string | undefined)[] | undefined,
  categoryColors?: (string | undefined)[] | undefined,
): number[] | CategoryColoredPoint[] {
  const hasPoint = !!pointRowColors?.some((c) => !!c?.trim());
  const hasCategory = !!categoryColors?.some((c) => !!c?.trim());
  if (!hasPoint && !hasCategory) return values;
  return values.map((v, idx) => {
    const point = pointRowColors?.[idx]?.trim();
    if (point) return { value: v, itemStyle: { color: point } };
    const category = categoryColors?.[idx]?.trim();
    if (category) return { value: v, itemStyle: { color: category } };
    return v;
  });
}

/**
 * Apply optional per-category colors onto series values for ECharts.
 * Thin wrapper over {@link applyPointColorsToSeriesData} (no point colors).
 * When `categoryColors` is absent or has no colors, returns `values` unchanged (byte-identical path).
 * Precedence at draw time: category color (point) → series itemStyle.color → palette.
 */
export function applyCategoryColorsToSeriesData(
  values: number[],
  categoryColors: (string | undefined)[] | undefined,
): number[] | CategoryColoredPoint[] {
  return applyPointColorsToSeriesData(values, undefined, categoryColors);
}
