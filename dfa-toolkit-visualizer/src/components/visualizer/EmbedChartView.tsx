"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { VisualizerDataResponse, VisualizationConfig } from "@/lib/visualizer/types";
import { getDefaultVisualizationConfig } from "@/lib/visualizer/types";
import { getDefaultChartConfig } from "@/lib/visualizer/defaultChartConfig";
import { COLOR_THEMES, EMBED_DEFAULT_THEME } from "@/lib/visualizer/colorThemes";
import {
  toLineBarAreaDataFromRows,
  toPieDataFromRows,
  toScatterXYDataFromRows,
  toHeatmapDataFromRows,
  toTreemapDataFromRows,
  extractDimensionValues,
  getDefaultScatterMapping,
  toRadarDataFromRows,
  toPyramidDataFromRows,
  mapVizConfigToChartConfig,
  type AxisSeriesMapping,
  type ChartTransformSortOptions,
} from "@/lib/visualizer/chartTransform";
import { validateMappingStructure } from "@/lib/visualizer/axisMapping";
import { useCore } from "@/contexts/CoreContext";
import { Loader } from "@/components/Loader";

function LoaderChartPlaceholder() {
  const { t } = useCore();
  return (
    <div className="flex w-full h-full min-h-[200px] items-center justify-center bg-surface-muted">
      <Loader showStatusText={false} ariaLabel={t("COMMON_LOADING")} />
    </div>
  );
}

const ChartRendererWrapper = dynamic(
  () =>
    import("dfa-v6-comp-visualization").then((m) => ({ default: m.ChartRendererWrapper })),
  { ssr: false, loading: () => <LoaderChartPlaceholder /> }
);

const DEFAULT_SUBTITLE_FONT: VisualizationConfig["subtitleFont"] = {
  size: 12,
  family: "system-ui",
  bold: false,
  italic: false,
  underline: false,
};

function getFontStyle(font: VisualizationConfig["titleFont"]) {
  return {
    fontSize: `${font.size}px`,
    fontFamily: `${font.family}, system-ui, -apple-system, sans-serif`,
    fontWeight: font.bold ? "bold" as const : "normal" as const,
    fontStyle: font.italic ? "italic" as const : "normal" as const,
    textDecoration: font.underline ? "underline" : "none",
  };
}

export interface EmbedChartViewProps {
  apiResponse: VisualizerDataResponse | null;
  initialChartConfig?: VisualizationConfig | null;
  /** Display title above the chart (e.g. "Indicator, Area"). When omitted, indicatorName is used. */
  chartTitle?: string;
  indicatorName?: string;
}

/**
 * Renders the chart with optional title and description for the embed route.
 */
export function EmbedChartView({
  apiResponse,
  initialChartConfig = null,
  chartTitle,
  indicatorName = "Chart",
}: EmbedChartViewProps) {
  const displayTitle = chartTitle ?? indicatorName;
  const { chartData, chartConfig, vizConfig } = useMemo(() => {
    if (!apiResponse?.rows?.length) {
      return { chartData: null, chartConfig: null, vizConfig: null };
    }
    const defaultConfig = getDefaultChartConfig(apiResponse);
    const defaultMapping: AxisSeriesMapping = {
      xDimension: defaultConfig.xDimension,
      seriesDimension: defaultConfig.seriesDimension,
      seriesDimension2: defaultConfig.seriesDimension2 ?? undefined,
    };
    const embedTheme = EMBED_DEFAULT_THEME;
    const embedPalette = COLOR_THEMES[embedTheme] ?? COLOR_THEMES["Default"];
    const primaryColor =
      (typeof document !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim()
        : "") || embedPalette[0] || "#3B82F6";
    const baseViz = getDefaultVisualizationConfig({
      title: displayTitle,
      primaryColor,
      theme: embedTheme,
    });
    const mergedViz: VisualizationConfig = initialChartConfig
      ? {
          ...baseViz,
          ...initialChartConfig,
          mapping: initialChartConfig.mapping ?? defaultMapping,
          // Preserve base subtitle font when decoded config has subtitle but no subtitleFont (e.g. old share URLs).
          ...(initialChartConfig.subtitle?.trim() && !initialChartConfig.subtitleFont
            ? { subtitleFont: baseViz.subtitleFont }
            : {}),
        }
      : { ...baseViz, mapping: defaultMapping };

    const usePie =
      mergedViz.chartType === "pie" && mergedViz.chartVariant !== "waffle";
    const isAdvancedScatter =
      mergedViz.chartType === "advanced" && mergedViz.chartVariant === "scatter";
    const isHeatmapActive =
      mergedViz.chartType === "advanced" && mergedViz.chartVariant === "heatmap";
    const isTreemapActive =
      mergedViz.chartType === "advanced" && mergedViz.chartVariant === "treemap";
    const isSpiderActive =
      mergedViz.chartType === "advanced" && mergedViz.chartVariant === "spider";
    const isPyramidActive =
      mergedViz.chartType === "advanced" && mergedViz.chartVariant === "pyramid";
    const isMapActive =
      mergedViz.chartType === "advanced" && mergedViz.chartVariant === "map";
    const useEcharts =
      mergedViz.chartType === "line" ||
      mergedViz.chartType === "bar" ||
      mergedViz.chartType === "area" ||
      isAdvancedScatter ||
      usePie ||
      isHeatmapActive ||
      isTreemapActive ||
      isSpiderActive ||
      isPyramidActive ||
      isMapActive;

    if (!useEcharts) {
      return { chartData: null, chartConfig: null, vizConfig: mergedViz };
    }

    const candidateMapping = mergedViz.mapping ?? defaultMapping;
    const mapping =
      candidateMapping && validateMappingStructure(candidateMapping)
        ? candidateMapping
        : defaultMapping;

    const byGid = apiResponse.meta?.subgroupOrderByGid;
    const chartSortOptions: ChartTransformSortOptions | undefined =
      byGid && Object.keys(byGid).length > 0 ? { subgroupOrderByGid: byGid } : undefined;

    let data;
    if (isAdvancedScatter) {
      const scatterMapping = mergedViz.scatterMapping
        ?? getDefaultScatterMapping(extractDimensionValues(apiResponse.rows, chartSortOptions));
      data = scatterMapping
        ? toScatterXYDataFromRows(apiResponse.rows, scatterMapping)
        : null;
    } else if (usePie) {
      data = toPieDataFromRows(apiResponse.rows, mapping, chartSortOptions);
    } else if (isHeatmapActive) {
      data = toHeatmapDataFromRows(apiResponse.rows, mapping, indicatorName, chartSortOptions);
    } else if (isTreemapActive) {
      data = toTreemapDataFromRows(apiResponse.rows, mapping, chartSortOptions);
    } else if (isSpiderActive) {
      data = toRadarDataFromRows(apiResponse.rows, mapping, indicatorName, chartSortOptions);
    } else if (isPyramidActive) {
      data = toPyramidDataFromRows(apiResponse.rows, mapping, chartSortOptions);
    } else {
      const cartesianType: "line" | "bar" | "area" =
        mergedViz.chartType === "line" || mergedViz.chartType === "bar" || mergedViz.chartType === "area"
          ? mergedViz.chartType
          : "line";
      data = toLineBarAreaDataFromRows(apiResponse.rows, mapping, cartesianType, indicatorName, chartSortOptions);
    }

    // null means heatmap/radar can't be built from the current rows/mapping
    if (data === null) {
      return { chartData: null, chartConfig: null, vizConfig: mergedViz };
    }

    const config = mapVizConfigToChartConfig(mergedViz);
    return { chartData: data, chartConfig: config, vizConfig: mergedViz };
  }, [apiResponse, initialChartConfig, displayTitle, indicatorName]);

  if (!apiResponse?.rows?.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
        No data to display.
      </div>
    );
  }

  if (!chartData || !chartConfig) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
        Chart type not supported in embed.
      </div>
    );
  }

  const showDescription =
    vizConfig?.showDescription && vizConfig?.description?.trim();
  const descriptionAbove =
    showDescription && vizConfig?.descriptionPosition === "above";
  const descriptionBelow =
    showDescription && vizConfig?.descriptionPosition === "below";

  const chartAreaBg = vizConfig?.chartAreaBackgroundColor?.trim() ?? '';

  return (
    <div
      className="w-full h-full flex flex-col min-h-0 p-4"
      style={chartAreaBg ? { backgroundColor: chartAreaBg } : undefined}
    >
      {vizConfig?.title != null && vizConfig.title.trim() !== "" && (
        <h2
          className="text-text shrink-0 mb-2"
          style={vizConfig.titleFont ? getFontStyle(vizConfig.titleFont) : undefined}
        >
          {vizConfig.title}
        </h2>
      )}
      {vizConfig?.subtitle != null && vizConfig.subtitle.trim() !== "" && (
        <p
          className="text-text shrink-0 mb-2"
          style={getFontStyle(vizConfig.subtitleFont ?? DEFAULT_SUBTITLE_FONT)}
        >
          {vizConfig.subtitle}
        </p>
      )}
      {descriptionAbove && vizConfig?.descriptionFont && (
        <p
          className="text-text-muted shrink-0 mb-3"
          style={getFontStyle(vizConfig.descriptionFont)}
        >
          {vizConfig.description}
        </p>
      )}
      <div className="flex-1 min-h-0 w-full">
        <ChartRendererWrapper data={chartData} config={chartConfig} />
      </div>
      {descriptionBelow && vizConfig?.descriptionFont && (
        <p
          className="text-text-muted shrink-0 mt-3"
          style={getFontStyle(vizConfig.descriptionFont)}
        >
          {vizConfig.description}
        </p>
      )}
    </div>
  );
}
