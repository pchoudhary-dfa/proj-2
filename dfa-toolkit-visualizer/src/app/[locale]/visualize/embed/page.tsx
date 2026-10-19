"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useCore } from "@/contexts/CoreContext";
import { EmbedChartView } from "@/components/visualizer/EmbedChartView";
import { Loader } from "@/components/Loader";
import type { VisualizerDataResponse, VisualizationConfig } from "@/lib/visualizer/types";
import { fetchDataApi, isDataApiError } from "@/lib/api/data";
import { dataApiResponseToVisualizerDataResponse } from "@/lib/visualizer/dataApiAdapter";
import {
  getPayloadFromQuery,
  payloadToDataApiParams,
  decodeShareState,
} from "@/lib/visualizer/embed/shareUrl";
import type { MinimalSharePayload } from "@/lib/visualizer/embed/shareUrl";

/**
 * Chart-only embed route. Renders just the chart (no sidebar, filters, or toolbar).
 * Query: v= (short share link code), s= (encoded state), or p= (minimal share payload JSON).
 * Used as iframe src for "Live embed" so third-party pages show only the chart.
 */
export default function EmbedPage() {
  const searchParams = useSearchParams();
  const { t, dataWarehouseId, getConfig } = useCore();
  const [apiResponse, setApiResponse] = useState<VisualizerDataResponse | null>(null);
  const [chartConfig, setChartConfig] = useState<VisualizationConfig | null>(null);
  const [indicatorName, setIndicatorName] = useState<string>("Chart");
  const [chartTitle, setChartTitle] = useState<string>("Chart");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFromPayload = useCallback(
    async (
      payload: MinimalSharePayload,
      locale: string,
      options?: { skipDerivedTitle?: boolean }
    ) => {
      const params = payloadToDataApiParams(
        payload,
        locale,
        getConfig("DWS_DEFAULT_AREA").trim()
      );
      const res = await fetchDataApi(params, {
        acceptLanguage: locale,
        dwId: dataWarehouseId,
      });
      if (isDataApiError(res)) {
        setError(res.err_message || res.errors?.code || "Data fetch failed");
        setApiResponse(null);
        return;
      }
      const vizResponse = dataApiResponseToVisualizerDataResponse(res);
      setApiResponse(vizResponse);
      const firstRow = vizResponse?.rows?.[0];
      const name = firstRow?.indicatorName ?? "Chart";
      setIndicatorName(name);
      if (!options?.skipDerivedTitle) {
        const derivedTitle =
          payload.area?.length === 1 && firstRow?.areaName
            ? `${name}, ${firstRow.areaName}`
            : name;
        setChartTitle(derivedTitle);
      }
      setError(null);
    },
    [dataWarehouseId, getConfig]
  );

  useEffect(() => {
    const s = searchParams.get("s");
    const v = searchParams.get("v");
    const locale = typeof navigator !== "undefined" ? navigator.language.split("-")[0] : "en";

    if (s) {
      const decoded = decodeShareState(s);
      if (decoded) {
        setLoading(true);
        setError(null);
        setChartConfig(decoded.chartConfig);
        setChartTitle(decoded.chartConfig?.title ?? "Chart");
        // Use title/subtitle from decoded chartConfig; do not overwrite with derived title.
        loadFromPayload(decoded.fetchParams, locale, {
          skipDerivedTitle: true,
        }).finally(() => setLoading(false));
        return;
      }
      setLoading(false);
      setError("Invalid or missing embed state");
      setApiResponse(null);
      setChartConfig(null);
      return;
    }

    if (v) {
      setLoading(true);
      setError(null);
      fetch(`/api/proxy/share-links/${encodeURIComponent(v)}`)
        .then((r) => r.json())
        .then((raw: Record<string, unknown> | null) => {
          const data = (raw?.data ?? raw) as { fetchParams?: MinimalSharePayload; chartConfig?: VisualizationConfig } | null;
          if (!data?.fetchParams) {
            setError("Invalid or missing share link");
            setApiResponse(null);
            setChartConfig(null);
            return;
          }
          setChartConfig(data.chartConfig ?? null);
          if (data.chartConfig?.title) {
            setChartTitle(data.chartConfig.title);
          }
          return loadFromPayload(data.fetchParams, locale, {
            skipDerivedTitle: !!data.chartConfig?.title,
          });
        })
        .catch(() => {
          setError("Failed to load share link");
          setApiResponse(null);
        })
        .finally(() => setLoading(false));
      return;
    }

    const payload = getPayloadFromQuery(searchParams);
    if (!payload?.indicator?.length) {
      setLoading(false);
      setError("Missing or invalid embed params (use s=, p=, or v=)");
      setApiResponse(null);
      return;
    }

    setLoading(true);
    setError(null);
    setChartConfig(null);
    loadFromPayload(payload, locale).finally(() => setLoading(false));
  }, [searchParams, loadFromPayload]);

  if (loading) {
    return (
      <div
        className="fixed inset-0 w-full h-full min-h-[200px] flex items-center justify-center bg-slate-50"
      >
        <Loader loadingLabel={t("COMMON_LOADING")} showStatusText={true} size={30} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 w-full h-full flex items-center justify-center text-red-600 text-sm p-4">
        {error}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 w-full h-full bg-white overflow-hidden"
    >
      <EmbedChartView
        apiResponse={apiResponse}
        initialChartConfig={chartConfig}
        chartTitle={chartTitle}
        indicatorName={indicatorName}
      />
    </div>
  );
}
