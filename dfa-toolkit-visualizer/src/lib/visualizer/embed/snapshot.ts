/**
 * Offline embed snapshot: freezes the exact chart data at embed time.
 *
 * The snapshot contains only chartData (transformed series/categories/values from the
 * current apiResponse.rows) and chartConfig (visual settings). It does NOT store
 * indicator/area/filters or any fetch params. When the offline HTML or snippet is
 * viewed later, the embed loader renders only this frozen data—no API call, so the
 * chart does not reflect later changes to the dataset (e.g. new time periods, updated
 * default subgroup). Live embedding, by contrast, re-fetches from the API and shows
 * current data.
 */

import type { ChartData, ChartConfig } from "dfa-v6-comp-visualization";
import type { VisualizerDataResponse, VisualizationConfig } from "@/lib/visualizer/types";
import { toLineBarAreaDataFromRows, toPieDataFromRows, mapVizConfigToChartConfig } from "@/lib/visualizer/chartTransform";
import { getDefaultChartConfig } from "@/lib/visualizer/defaultChartConfig";
import type { AxisSeriesMapping } from "@/lib/visualizer/chartTransform";

export const VIZ_SNAPSHOT_VERSION = 1;

export interface VizSnapshotMeta {
  title?: string;
  indicatorName?: string;
}

export interface VizSnapshot {
  version: number;
  chartData: ChartData;
  chartConfig: ChartConfig;
  meta?: VizSnapshotMeta;
}

/**
 * Builds a snapshot from the current apiResponse + vizSettings + indicator.
 * The data in the snapshot is frozen: whatever rows are in apiResponse at this
 * moment (e.g. 6 time periods, default subgroup) are transformed and stored;
 * offline viewers will see exactly that data, not updated data.
 * Returns null if there is no data to snapshot (e.g. empty rows).
 */
export function buildVizSnapshot(
  apiResponse: VisualizerDataResponse | null,
  vizSettings: VisualizationConfig,
  indicator: { name?: string } | null
): VizSnapshot | null {
  if (!apiResponse?.rows?.length) return null;

  const defaultConfig = getDefaultChartConfig(apiResponse);
  const mapping: AxisSeriesMapping =
    vizSettings.mapping ?? {
      xDimension: defaultConfig.xDimension,
      seriesDimension: defaultConfig.seriesDimension,
      seriesDimension2: defaultConfig.seriesDimension2 ?? undefined,
    };

  const chartType = vizSettings.chartType;
  const usePie =
    chartType === "pie" && vizSettings.chartVariant !== "waffle";
  const sortOpts =
    apiResponse.meta?.subgroupOrderByGid && Object.keys(apiResponse.meta.subgroupOrderByGid).length > 0
      ? { subgroupOrderByGid: apiResponse.meta.subgroupOrderByGid }
      : undefined;

  const chartData: ChartData = usePie
    ? toPieDataFromRows(apiResponse.rows, mapping, sortOpts)
    : toLineBarAreaDataFromRows(
        apiResponse.rows,
        mapping,
        (chartType === "line" || chartType === "bar" || chartType === "area"
          ? chartType
          : "line") as "line" | "bar" | "area",
        indicator?.name ?? "Value",
        sortOpts
      );

  const chartConfig = mapVizConfigToChartConfig(vizSettings);

  return {
    version: VIZ_SNAPSHOT_VERSION,
    chartData,
    chartConfig,
    meta: {
      title: vizSettings.title,
      indicatorName: indicator?.name,
    },
  };
}

/**
 * Serialize snapshot to JSON string (for inline script or data attribute).
 */
export function serializeSnapshot(snapshot: VizSnapshot): string {
  return JSON.stringify(snapshot);
}

/**
 * Encode snapshot for use in URL or compact embed (base64). Call from browser only.
 */
export function encodeSnapshotBase64(snapshot: VizSnapshot): string {
  return btoa(unescape(encodeURIComponent(serializeSnapshot(snapshot))));
}

/**
 * Decode a base64-encoded snapshot string back to VizSnapshot. Safe for embed runtime (browser).
 */
export function decodeSnapshotBase64(encoded: string): VizSnapshot {
  const json = decodeURIComponent(escape(atob(encoded)));
  return JSON.parse(json) as VizSnapshot;
}

/**
 * Generates a standalone HTML document that renders the chart from the given snapshot.
 * - If inlineScriptContent is provided, the script is inlined so the file works when opened locally (file://) or offline.
 * - Otherwise embedScriptUrl is used (requires network on first open unless script is cached).
 */
export function buildStandaloneEmbedHtml(options: {
  snapshotBase64: string;
  embedScriptUrl?: string;
  /** Inline script content for offline/standalone use. When set, embedScriptUrl is ignored. */
  inlineScriptContent?: string;
  title?: string;
  width?: number;
  height?: number;
}): string {
  const {
    snapshotBase64,
    embedScriptUrl,
    inlineScriptContent,
    title = "Chart",
    width = 800,
    height = 500,
  } = options;

  const scriptTag =
    inlineScriptContent != null && inlineScriptContent.length > 0
      ? `<script>${escapeScriptContent(inlineScriptContent)}</script>`
      : embedScriptUrl
        ? `<script src="${escapeHtml(embedScriptUrl)}"></script>`
        : "";

  // Fallback: if the chart script fails or container stays empty, show a message (offline / decode error).
  const fallbackScript =
    inlineScriptContent != null && inlineScriptContent.length > 0
      ? `<script>
(function(){
  var el = document.getElementById("data-visualizer");
  if (!el) return;
  setTimeout(function(){
    if (!el.hasChildNodes() || el.children.length === 0) {
      el.style.padding = "1rem";
      el.style.color = "#666";
      el.style.fontFamily = "system-ui, sans-serif";
      el.textContent = "Chart could not load. Re-download from the app while online, or check the console for errors.";
    }
  }, 2500);
})();
</script>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    #data-visualizer { width: ${width}px; height: ${height}px; min-height: ${height}px; }
  </style>
</head>
<body>
  <div id="data-visualizer"></div>
  <script>window.DFA_VIZ_SNAPSHOT = "${snapshotBase64}";</script>
  ${scriptTag}
  ${fallbackScript}
</body>
</html>`;
}

/** Escape for use inside a <script> tag (avoid breaking out of script). */
function escapeScriptContent(s: string): string {
  return s
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
