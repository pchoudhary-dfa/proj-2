'use client';

import { useState, useEffect, useRef } from 'react';
import { Lightbulb, X, AlertCircle } from 'lucide-react';
import { getTooltipHandlers } from '@/components/CustomTooltip';
import { useCore } from '@/contexts/CoreContext';
import { Loader } from '@/components/Loader';
import { fetchInsightsStream } from './insightsApiClient';
import { resolveInsightsUseCase } from './insightsUseCase';
import { InsightsLoader, parseStructuredResponse, renderStructuredContent, markdownToHtml } from './insightsRenderer';
import './insightsMarkdown.css';
import type { VisualizerDataResponse, SelectedComponents, SelectedItem } from '@/lib/visualizer/types';
import type {
  LineBarAreaData,
  HeatmapData,
  RadarData,
  PyramidData,
  PieChartData,
  ScatterXYData,
  TreemapData,
  MapChartData,
} from 'dfa-v6-comp-visualization';

// Stream flag for insights API - always enabled for real-time feedback
const STREAM_ENABLED = true;

export interface InsightsPanelProps {
  onClose?: () => void;
  apiResponse: VisualizerDataResponse | null;
  echartsChartData:
    | LineBarAreaData
    | HeatmapData
    | RadarData
    | PyramidData
    | PieChartData
    | ScatterXYData
    | TreemapData
    | MapChartData
    | null;
  locale: string;
  dataWarehouseId: string | number;
  selectedComponents?: SelectedComponents;
  /** Effective area items including the default area when selectedComponents.area is undefined. */
  effectiveAreas?: SelectedItem[];
}

export function InsightsPanel({ 
  onClose, 
  apiResponse, 
  echartsChartData, 
  locale, 
  dataWarehouseId,
  selectedComponents,
  effectiveAreas,
}: InsightsPanelProps) {
  const { t } = useCore();
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [responseType, setResponseType] = useState<'structured' | 'markdown'>('markdown');
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Don't fetch if we don't have data
    if (!apiResponse || !echartsChartData) {
      setContent('');
      setError(null);
      setLoading(false);
      setResponseType('structured');
      return;
    }

    // Clear previous content and errors
    setContent('');
    setError(null);
    setLoading(true);
    setResponseType('markdown'); // Reset to default

    // Calculate use case based on API response dimensions
    const useCase = resolveInsightsUseCase(apiResponse);

    // Convert dataWarehouseId to number if it's a string
    const dwId: number = typeof dataWarehouseId === 'string' ? parseInt(dataWarehouseId, 10) : dataWarehouseId;

    // Derive effective subgroups: use explicit selection, else fall back to unique values from API rows
    const explicitSubgroups = (selectedComponents?.subgroup ?? []).map((s) => s.label).filter(Boolean);
    const effectiveSubgroups = explicitSubgroups.length > 0
      ? explicitSubgroups
      : [...new Map(
          (apiResponse.rows ?? [])
            .filter((r) => r.subgroupName)
            .map((r) => [r.subgroupId ?? r.subgroupName, r.subgroupName!])
        ).values()];

    // Derive effective time periods: use explicit selection, else fall back to unique values from API rows
    const explicitTimePeriods = (selectedComponents?.timePeriod ?? []).map((tp) => tp.label).filter(Boolean);
    const effectiveTimePeriods = explicitTimePeriods.length > 0
      ? explicitTimePeriods
      : [...new Map(
          (apiResponse.rows ?? [])
            .filter((r) => r.timePeriodName ?? r.timePeriodId)
            .map((r) => [r.timePeriodId ?? r.timePeriodName, r.timePeriodName ?? r.timePeriodId!])
        ).values()];

    // Build selected filter labels from the left panel selections.
    // Use effectiveAreas when provided — it includes the default area even when
    // selectedComponents.area is undefined (i.e. no explicit user selection yet).
    const resolvedAreas: SelectedItem[] =
      effectiveAreas ?? selectedComponents?.area ?? [];

    const selectedFilters = {
      indicators: (selectedComponents?.indicator ?? []).map((i) => i.label).filter(Boolean),
      subgroups: effectiveSubgroups,
      timePeriods: effectiveTimePeriods,
      areas: resolvedAreas.map((a) => a.label).filter(Boolean),
    };

    // Start streaming insights
    const cleanup = fetchInsightsStream(
      {
        data: echartsChartData,
        langCode: locale,
        useCase,
        stream: STREAM_ENABLED,
        dwId,
        selectedFilters,
      },
      {
        onChunk: (text) => {
          setContent((prev) => prev + text);
        },
        onMeta: (meta) => {
          // Support both snake_case (backend) and camelCase keys
          const type = meta?.response_type ?? meta?.responseType;
          if (type === 'markdown' || type === 'structured') {
            setResponseType(type);
          }
        },
        onComplete: () => {
          setLoading(false);
        },
        onError: (err) => {
          setError(err);
          setLoading(false);
        },
      }
    );

    // Store cleanup function
    cleanupRef.current = cleanup;

    // Cleanup on unmount or when dependencies change
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [apiResponse, echartsChartData, locale, dataWarehouseId, selectedComponents, effectiveAreas]);

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden flex flex-col h-full min-h-0">
      <div className="px-4 py-3 bg-surface-muted border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-text flex items-center gap-2">
            <Lightbulb className="w-4 h-4" aria-hidden />
            {t("INSIGHTS")}
          </h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("INSIGHTS_CLOSE")}
              className="p-1 text-text-muted hover:text-text hover:bg-surface rounded transition-colors"
              {...getTooltipHandlers(t("INSIGHTS_CLOSE"))}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {loading && (!content || responseType === 'structured') && (
          <InsightsLoader analyzingLabel={t("ANALYZING_DATA")} />
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 bg-error/10 border border-error rounded-lg">
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-error mb-1">
                {t("INSIGHTS_ERROR_TITLE")}
              </h4>
              <p className="text-sm text-text">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && !content && !apiResponse && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <Lightbulb className="w-12 h-12 text-text-muted opacity-50" />
            <p className="text-sm text-text-muted">
              {t("INSIGHTS_NO_DATA")}
            </p>
          </div>
        )}

        {!loading && !error && !content && apiResponse && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <Lightbulb className="w-12 h-12 text-text-muted opacity-50" />
            <p className="text-sm text-text-muted">
              {t("INSIGHTS_EMPTY")}
            </p>
          </div>
        )}

        {(content && (!loading || responseType === 'markdown')) && (() => {
          if (responseType === 'markdown' || (loading && responseType === 'structured')) {
            return (
              <div className="insights-markdown">
                <div dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
                {loading && (
                  <div className="insights-markdown-cursor">
                    <div className="insights-markdown-cursor__dot" />
                    <span>{t("STREAMING")}</span>
                  </div>
                )}
              </div>
            );
          }

          // Structured response that has finished loading
          const parsed = parseStructuredResponse(content);
          if (parsed) {
            return (
              <div className="flex flex-col gap-0 pb-4">
                {renderStructuredContent(parsed, t)}
              </div>
            );
          }

          // Fallback if parsing failed
          return (
            <div className="insights-markdown">
              <div dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
