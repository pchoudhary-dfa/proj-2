"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartConfig, ChartData } from "dfa-v6-comp-visualization";
import type { VisualizationTypeId } from "@/lib/dashboards/types";
import type { VisualizationSettings } from "@/lib/visualizations/types";
import { DEFAULT_GENERAL_SETTINGS } from "@/lib/visualizations/defaults";
import {
  fetchChartData,
  type FetchChartDataResult,
} from "@/lib/visualizations/dataService";
import {
  transformToChartData,
  mapToChartConfig,
} from "@/lib/visualizations/chartTransform";

const DEBOUNCE_MS = 400;

export type UseChartDataResult = {
  chartData: ChartData | null;
  chartConfig: ChartConfig;
  isLoading: boolean;
  error: string | null;
};

/**
 * Stable key for the data selections so we can detect when a re-fetch is needed.
 * Style-only changes (GeneralSettings) do NOT change this key.
 */
function dataSelectionKey(settings: VisualizationSettings): string {
  const d = settings.data;
  const m = d.mapping;
  const parts = [
    d.indicators.map((i) => (i.id as string).split("|")[0]).join("|"),
    d.subgroups.map((s) => String(s.id)).join("|"),
    d.areas.map((a) => a.id).join("|"),
    d.timePeriods.map((t) => t.id).join("|"),
    `${m.xDimension}:${m.seriesDimension ?? ""}:${m.seriesDimension2 ?? ""}`,
  ];
  return parts.join(":");
}

export function useChartData(
  vizSettings: VisualizationSettings | undefined,
  typeId: VisualizationTypeId | null,
  baseUrl: string,
): UseChartDataResult {
  const [fetchResult, setFetchResult] = useState<FetchChartDataResult>({
    rows: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const selectionKey = vizSettings ? dataSelectionKey(vizSettings) : "";

  const doFetch = useCallback(async () => {
    if (!vizSettings || !baseUrl) {
      setFetchResult({ rows: [] });
      setIsLoading(false);
      return;
    }

    if (vizSettings.data.indicators.length === 0) {
      setFetchResult({ rows: [] });
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsLoading(true);

    try {
      const result = await fetchChartData(baseUrl, vizSettings.data);
      if (mountedRef.current) {
        setFetchResult(result);
        setIsLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setFetchResult({ rows: [], error: "Fetch cancelled" });
        setIsLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, baseUrl]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doFetch, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [doFetch]);

  const chartData = useMemo(() => {
    if (!vizSettings || fetchResult.rows.length === 0) return null;
    return transformToChartData(fetchResult.rows, typeId, vizSettings.data);
  }, [fetchResult.rows, typeId, vizSettings]);

  
  console.log(vizSettings)
  const chartVariant = vizSettings?.charts.chartVariant ?? "";
  const chartConfig = useMemo(
    () => {
      console.log(chartVariant)
      return mapToChartConfig(typeId,chartVariant, vizSettings?.general ?? DEFAULT_GENERAL_SETTINGS)
    },
    [typeId, vizSettings?.general,chartVariant],
  );

  return {
    chartData,
    chartConfig,
    isLoading,
    error: fetchResult.error ?? null,
  };
}
