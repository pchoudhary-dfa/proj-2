/**
 * Fetches real chart data for a gallery item via the Data API.
 * Used for gallery card previews when item.previewData is missing (e.g. legacy saves or toolbar save).
 * No dummy data: either we have saved previewData or we fetch from the API.
 */

import type { LineBarAreaData } from "dfa-v6-comp-visualization";
import { fetchDataApi, isDataApiError } from "@/lib/api/data";
import { itemToDataApiParams } from "@/lib/gallery/exportFromItem";
import type { GalleryItem } from "@/lib/gallery/types";
import { getDefaultChartConfig } from "@/lib/visualizer/defaultChartConfig";
import { dataApiResponseToVisualizerDataResponse } from "@/lib/visualizer/dataApiAdapter";
import { toLineBarAreaDataFromRows, type AxisSeriesMapping } from "@/lib/visualizer/chartTransform";
import { validateMappingStructure } from "@/lib/visualizer/axisMapping";

export interface FetchPreviewDataOptions {
  locale?: string;
  dwId?: string;
}

/**
 * Fetches data for the gallery item from the Data API and returns chart data for line/bar/area preview.
 * Returns null if the item is not a visualization, chart type is pie/advanced, API fails, or no rows.==
 */
export async function fetchPreviewDataForItem(
  item: GalleryItem,
  options: FetchPreviewDataOptions = {}
): Promise<LineBarAreaData | null> {
  if (item.type !== "visualization") return null;

  const chartTypeRaw = item.vizSettings?.chartType;
  // Heatmap and pie previews require their own data shape; fetching line data for them
  // would cause a type mismatch when the chart engine tries to render. Return null so
  // the gallery card falls back to the empty state rather than crashing.
  if (chartTypeRaw === "advanced" || chartTypeRaw === "pie") return null;

  const chartType =
    chartTypeRaw === "line" || chartTypeRaw === "bar" || chartTypeRaw === "area"
      ? chartTypeRaw
      : "line";

  const params = itemToDataApiParams(item);
  const hasIndicator =
    params.i_identifier != null && String(params.i_identifier).trim() !== "";
  if (!hasIndicator) return null;

  const res = await fetchDataApi(params, {
    acceptLanguage: options.locale ?? "en",
    ...(options.dwId ? { dwId: options.dwId } : {}),
  });

  if (isDataApiError(res)) return null;

  const response = dataApiResponseToVisualizerDataResponse(res);
  if (!response.rows.length) return null;

  const defaultConfig = getDefaultChartConfig(response);
  const defaultMapping: AxisSeriesMapping = {
    xDimension: defaultConfig.xDimension,
    seriesDimension: defaultConfig.seriesDimension,
    seriesDimension2: defaultConfig.seriesDimension2 ?? undefined,
  };
  const candidateMapping: AxisSeriesMapping =
    item.vizSettings?.mapping ?? defaultMapping ?? {
      xDimension: "time",
      seriesDimension: null,
    };
  const mapping: AxisSeriesMapping =
    validateMappingStructure(candidateMapping)
      ? candidateMapping
      : defaultMapping;

  const sortOpts =
    response.meta?.subgroupOrderByGid && Object.keys(response.meta.subgroupOrderByGid).length > 0
      ? { subgroupOrderByGid: response.meta.subgroupOrderByGid }
      : undefined;

  return toLineBarAreaDataFromRows(
    response.rows,
    mapping,
    chartType,
    (item.indicator?.name as string) ?? "Value",
    sortOpts
  );
}
