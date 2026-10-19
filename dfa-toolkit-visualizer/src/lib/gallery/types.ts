/**
 * Canonical gallery types. Single source of truth for saved items.
 */

import type { LineBarAreaData, HeatmapData, RadarData, PyramidData } from "dfa-v6-comp-visualization";
import type { SelectedComponents, VisualizationConfig } from "@/lib/visualizer/types";

export const GALLERY_STORAGE_KEY = "gallery";

/** One saved item (visualization or table). */
export interface GalleryItem {
  id: string;
  type: "visualization" | "table";
  /** Indicator (id, name, code). With filters, sufficient to call the Data API for chart/table data. */
  indicator: { id: string; name: string; code: string; [key: string]: unknown };
  /** Filters (area, time range, subgroup). With indicator, sufficient to re-fetch chart/table data. */
  filters: {
    area?: string[];
    timeStart?: number | string | null;
    timeEnd?: number | string | null;
    subgroup?: string[];
    [key: string]: unknown;
  };
  /** Unix ms or ISO string. */
  timestamp: number | string;
  /** For Open-with-config: chart type, colors, axes, etc. */
  vizSettings?: VisualizationConfig | null;
  /** Optional: minimal selection for share/Open URL and Data API params (area/subgroup/time IDs). */
  selectedComponents?: SelectedComponents;
  /** Chart data at save time for gallery card preview (line/bar/area or heatmap). Frozen snapshot; when missing on legacy items, UI may fetch once for preview. */
  previewData?: LineBarAreaData | HeatmapData | RadarData | PyramidData;
  /**
   * Always false for new saves (offline snapshot). Legacy items may still have true; prefer previewData for display.
   */
  isDynamic?: boolean;
  /** Chart type (e.g. "line", "bar", "area") for backend display/filtering. Set when saving a visualization. */
  chartType?: string;
  /** Data warehouse ID at save time. Set when saving so backend can store it. */
  dataWarehouseId?: string;
}

/** Payload to add (id and timestamp are set by the repository). */
export type GalleryItemAddPayload = Omit<GalleryItem, "id" | "timestamp">;

/**
 * Reconstruct SelectedComponents from a gallery item's indicator + filters.
 * Used by the visualizer to hydrate state when opening a gallery item.
 */
export function buildSelectedComponentsFromItem(item: GalleryItem): SelectedComponents {
  const ind = item.indicator;
  const f = item.filters;
  const selected: SelectedComponents = {};

  if (ind?.id) {
    selected.indicator = [
      { id: ind.id, label: ind.name ?? ind.code ?? ind.id },
    ];
  }
  if (f?.area?.length) {
    selected.area = f.area.map((id) => ({ id, label: id }));
  }
  if (f?.subgroup?.length) {
    selected.subgroup = f.subgroup.map((id) => ({ id, label: id }));
  }
  const startRaw = f?.timeStart;
  const endRaw = f?.timeEnd;
  const startNum = startRaw != null ? Number(startRaw) : null;
  const endNum = endRaw != null ? Number(endRaw) : null;
  if (
    startNum != null &&
    endNum != null &&
    !Number.isNaN(startNum) &&
    !Number.isNaN(endNum)
  ) {
    const years: number[] = [];
    for (let y = startNum; y <= endNum; y++) years.push(y);
    selected.timePeriod = years.map((y) => ({
      id: String(y),
      label: String(y),
    }));
  } else if (startRaw != null && endRaw != null) {
    const startStr = String(startRaw);
    const endStr = String(endRaw);
    selected.timePeriod =
      startStr === endStr
        ? [{ id: startStr, label: startStr }]
        : [
            { id: startStr, label: startStr },
            { id: endStr, label: endStr },
          ];
  }

  return selected;
}
