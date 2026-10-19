import type { ChartData } from './types';

/** True when ChartData has nothing plottable (categories/series/features empty). */
export function isEmptyChartData(data: ChartData): boolean {
  if ('categories' in data && 'series' in data) {
    const d = data as { categories: unknown[]; series: unknown[] };
    return d.categories.length === 0 || d.series.length === 0;
  }
  if ('segments' in data) {
    return (data as { segments: unknown[] }).segments.length === 0;
  }
  if ('series' in data && 'xAxisLabel' in data) {
    return (data as { series: unknown[] }).series.length === 0;
  }
  if ('kind' in data && (data as { kind?: string }).kind === 'map') {
    const features = (data as { features?: unknown[] }).features;
    return !features || features.length === 0;
  }
  return false;
}
