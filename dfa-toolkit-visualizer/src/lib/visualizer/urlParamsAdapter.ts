import type { SelectedComponents, FilterValues } from "@/lib/visualizer/types";
import { parseSharePayloadFromQuery } from "@/lib/visualizer/embed/shareUrl";

/**
 * Builds SelectedComponents from share URL query params.
 * Prefers minimal payload (param `p`) when present; falls back to legacy indicator + filters for old links.
 */
export function urlSearchParamsToSelectedComponents(
  searchParams: URLSearchParams
): SelectedComponents | null {
  const fromMinimal = parseSharePayloadFromQuery(searchParams);
  if (fromMinimal) return fromMinimal;

  const indicatorParam = searchParams.get("indicator");
  const filtersParam = searchParams.get("filters");
  if (!indicatorParam || !filtersParam) return null;

  let filters: FilterValues;
  try {
    filters = JSON.parse(decodeURIComponent(filtersParam)) as FilterValues;
  } catch {
    return null;
  }

  if (!filters || typeof filters !== "object") return null;

  const result: SelectedComponents = {};

  if (indicatorParam) {
    result.indicator = [{ id: indicatorParam, label: indicatorParam }];
  }

  const indicatorIds = filters.indicator?.length ? filters.indicator : indicatorParam ? [indicatorParam] : [];
  if (indicatorIds.length > 0 && !result.indicator) {
    result.indicator = indicatorIds.map((id) => ({ id: String(id), label: String(id) }));
  }

  if (filters.area?.length) {
    result.area = filters.area.map((name) => ({ id: name, label: name }));
  }

  if (filters.subgroup?.length) {
    result.subgroup = filters.subgroup.map((name) => ({ id: name, label: name }));
  }

  const years = filters.selectedYears ?? (filters.timeStart != null && filters.timeEnd != null
    ? (() => {
        const y: number[] = [];
        for (let i = filters.timeStart!; i <= filters.timeEnd!; i++) y.push(i);
        return y;
      })()
    : []);
  if (years.length > 0) {
    result.timePeriod = years.map((y) => ({ id: String(y), label: String(y) }));
  }

  return result;
}
