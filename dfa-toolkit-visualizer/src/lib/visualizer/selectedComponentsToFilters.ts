/**
 * Derives FilterValues from sidebar SelectedComponents for chart defaults and Data API param building.
 * Shared by the visualizer page and embed/share payload hydration.
 */

import type { FilterValues, SelectedComponents, SelectedItem } from "@/lib/visualizer/types";

/** Parses a year from a time chip (label may be "2020", id may be the numeric nid). */
export function yearFromTimePeriodItem(item: SelectedItem): number | null {
  const fromLabel = parseInt(String(item.label).trim(), 10);
  if (!Number.isNaN(fromLabel) && fromLabel >= 1000 && fromLabel <= 9999) return fromLabel;
  const fromId = parseInt(String(item.id).trim(), 10);
  if (!Number.isNaN(fromId) && fromId >= 1000 && fromId <= 9999) return fromId;
  return null;
}

/**
 * Derives FilterValues from sidebar `SelectedComponents` for chart defaults and display.
 * Data API params use `selectedComponents` directly via `buildDataApiParams` (ids / nids).
 */
export function selectedComponentsToFilters(selected: SelectedComponents): FilterValues {
  const indicatorIds =
    selected.indicator?.map((item) => String(item.id)).filter(Boolean) ?? [];
  const areaNames = selected.area?.map((item) => item.label) ?? [];
  const subgroupNames = selected.subgroup?.map((item) => item.label) ?? [];
  const selectedYears =
    selected.timePeriod
      ?.map((item) => yearFromTimePeriodItem(item))
      .filter((y): y is number => y != null) ?? [];
  const timeStart = selectedYears.length > 0 ? Math.min(...selectedYears) : 2020;
  const timeEnd = selectedYears.length > 0 ? Math.max(...selectedYears) : 2024;

  return {
    dimension: null,
    dimensionValue: null,
    indicator: indicatorIds,
    timeStart,
    timeEnd,
    selectedYears: selectedYears.length > 0 ? selectedYears : undefined,
    area: areaNames.length > 0 ? areaNames : [],
    subgroup: subgroupNames.length > 0 ? subgroupNames : ["Total"],
  };
}
