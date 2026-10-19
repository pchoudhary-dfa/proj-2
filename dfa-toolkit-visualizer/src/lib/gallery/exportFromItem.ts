/**
 * Export gallery item data using the same pipeline as the visualizer (CSV, XLSX, JSON).
 * Fetches data via Data API from item's indicator + filters, then uses buildExportPayloadFromRows + download*.
 */

import type { DataApiParams } from "@/lib/api/data";
import { fetchDataApi, isDataApiError } from "@/lib/api/data";
import { API_QUERY_DEFAULTS } from "@/lib/constants";
import type { GalleryItem } from "@/lib/gallery/types";
import type { FilterValues } from "@/lib/visualizer/types";
import { buildDataApiParams } from "@/lib/visualizer/dataApiParams";
import { dataApiResponseToVisualizerDataResponse } from "@/lib/visualizer/dataApiAdapter";
import {
  buildExportPayloadFromRows,
  getExportFilename,
  downloadCSV,
  downloadXLSX,
  downloadJSON,
} from "@/lib/visualizer/export";

function itemToFilterValues(item: GalleryItem): FilterValues {
  const f = item.filters;
  const start = f?.timeStart != null ? Number(f.timeStart) : null;
  const end = f?.timeEnd != null ? Number(f.timeEnd) : null;
  const selectedYears =
    start != null && end != null && !Number.isNaN(start) && !Number.isNaN(end)
      ? Array.from({ length: end - start + 1 }, (_, i) => start + i)
      : undefined;
  return {
    dimension: null,
    dimensionValue: null,
    indicator: item.indicator?.id ? [String(item.indicator.id)] : [],
    timeStart: start ?? null,
    timeEnd: end ?? null,
    selectedYears,
    area: Array.isArray(f?.area) ? f.area.map(String) : [],
    subgroup: Array.isArray(f?.subgroup) ? f.subgroup.map(String) : [],
  };
}

/** Whether the item has selectedComponents with at least indicator, so we can use the shared param builder. */
function hasRelevantSelectedComponents(
  selected: GalleryItem["selectedComponents"]
): selected is NonNullable<GalleryItem["selectedComponents"]> & {
  indicator: NonNullable<GalleryItem["selectedComponents"]>["indicator"];
} {
  return (
    selected != null &&
    typeof selected === "object" &&
    Array.isArray(selected.indicator) &&
    selected.indicator.length > 0
  );
}

/** Build Data API params from a gallery item. When item.selectedComponents is present, uses the same
 * buildDataApiParams as the visualizer (nid when available) so the same chart yields the same URL.
 * Otherwise builds from indicator + filters (legacy items). */
export function itemToDataApiParams(item: GalleryItem): DataApiParams {
  if (hasRelevantSelectedComponents(item.selectedComponents)) {
    const f = itemToFilterValues(item);
    return buildDataApiParams(f, item.selectedComponents!);
  }

  const f = item.filters;
  const indicatorId =
    item.indicator?.id != null && String(item.indicator.id).trim() !== ""
      ? String(item.indicator.id)
      : item.indicator?.code != null && String(item.indicator.code).trim() !== ""
        ? String(item.indicator.code)
        : undefined;
  const params: DataApiParams = {
    ...API_QUERY_DEFAULTS.DATA_API,
  };
  if (indicatorId != null) {
    params.i_identifier = String(indicatorId);
  }
  if (f?.area?.length) {
    params.ar_identifier = f.area.map(String).join(",");
  }
  if (f?.subgroup?.length) {
    params.sg_identifier = f.subgroup.map(String).join(",");
  }
  const start = f?.timeStart != null ? Number(f.timeStart) : null;
  const end = f?.timeEnd != null ? Number(f.timeEnd) : null;
  const isDefaultTimeRange = start === 2020 && end === 2024;
  if (
    start != null &&
    end != null &&
    !Number.isNaN(start) &&
    !Number.isNaN(end) &&
    !isDefaultTimeRange
  ) {
    const years: string[] = [];
    for (let y = start; y <= end; y++) years.push(String(y));
    params.tp_timeperiod = years;
  }
  return params;
}

export interface ExportFromItemOptions {
  locale?: string;
  dwId?: string;
}

/**
 * Fetches data for the gallery item and runs the requested data export.
 * Returns true if export succeeded, false if no data or fetch failed.
 */
export async function exportGalleryItemAs(
  item: GalleryItem,
  format: "csv" | "xlsx" | "json",
  options: ExportFromItemOptions = {}
): Promise<boolean> {
  const { locale = "en", dwId } = options;
  const params = itemToDataApiParams(item);
  const hasIndicator =
    params.i_identifier != null && String(params.i_identifier).trim() !== "";
  if (!hasIndicator) return false;

  const res = await fetchDataApi(params, {
    acceptLanguage: locale,
    ...(dwId ? { dwId } : {}),
  });

  if (isDataApiError(res)) return false;

  const vizResponse = dataApiResponseToVisualizerDataResponse(res);
  if (vizResponse.rows.length === 0) return false;

  const filters = itemToFilterValues(item);
  const payload = buildExportPayloadFromRows(vizResponse.rows, filters);
  if (!payload) return false;

  const ext = format === "csv" ? "csv" : format === "xlsx" ? "xlsx" : "json";
  const filename = getExportFilename(
    payload.meta.indicatorCode,
    payload.meta.timeStart,
    payload.meta.timeEnd,
    ext,
  );

  if (format === "csv") downloadCSV(payload, filename);
  else if (format === "xlsx") await downloadXLSX(payload, filename);
  else downloadJSON(payload, filename);

  return true;
}
