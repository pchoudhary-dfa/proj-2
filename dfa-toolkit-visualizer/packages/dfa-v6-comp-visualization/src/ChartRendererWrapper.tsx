'use client';

import { useEffect, useRef, useImperativeHandle, useState, useMemo } from 'react';
import type { ChartConfig, ChartData } from './engine/types';
import { createDfaChart } from './engine/standalone';
import { isEmptyChartData } from './engine/isEmptyChartData';
import { computeTitleBlockHeight } from './engine/titleLayout';

export interface ChartRendererWrapperRef {
  getDataURL(type: 'png' | 'svg'): string;
}

export interface ChartRendererWrapperProps {
  data: ChartData;
  config: ChartConfig;
  width?: number;
  height?: number;
  minHeight?: number;
  onPointClick?: (params: { seriesName?: string; name?: string; value?: unknown; dataIndex?: number }) => void;
  onLegendClick?: (params: { name: string }) => void;
  /** Expose getDataURL for export (e.g. PNG/SVG). Parent uses ref.current.getDataURL('png'). */
  chartRef?: React.Ref<ChartRendererWrapperRef | null>;
}

function ChartRendererPackage({
  data,
  config,
  width,
  height,
  minHeight = 384,
  onPointClick,
  onLegendClick,
  chartRef,
}: ChartRendererWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ReturnType<typeof createDfaChart> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEmpty = useMemo(() => isEmptyChartData(data), [data]);
  const showNoDataOverlay = isEmpty && !!config.noDataText;
  const titleBlockPx = useMemo(() => computeTitleBlockHeight(config), [config]);

  // Build container inline styles from chartAreaBorder + chartAreaBackgroundColor
  const containerStyle = useMemo((): React.CSSProperties => {
    const style: React.CSSProperties = {
      minHeight: `${minHeight}px`,
      position: 'relative',
      ...(width != null && height != null ? { width: `${width}px`, height: `${height}px` } : {}),
    };
    if (config.chartAreaBorder) {
      const b = config.chartAreaBorder;
      if (b.width != null) style.borderWidth = `${b.width}px`;
      if (b.color) style.borderColor = b.color;
      if (b.width != null || b.color) style.borderStyle = 'solid';
      if (b.radius != null) style.borderRadius = `${b.radius}px`;
    }
    if (config.chartAreaBackgroundColor && !config.chartAreaBackgroundImageUrl) {
      style.backgroundColor = config.chartAreaBackgroundColor;
    }
    return style;
  }, [
    minHeight,
    width,
    height,
    config.chartAreaBorder,
    config.chartAreaBackgroundColor,
    config.chartAreaBackgroundImageUrl,
  ]);

  useImperativeHandle(chartRef, () => ({
    getDataURL(type: 'png' | 'svg') {
      const inst = instanceRef.current;
      return inst ? inst.getDataURL(type) : '';
    },
  }), []);

  // Always init ECharts so title / subtitle / customLabel still render when data is empty.
  // Engine buildOption skips axes/series when data is empty (titles only).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    try {
      const instance = createDfaChart(container, {
        data,
        config,
        onPointClick,
        onLegendClick,
      });
      if (!cancelled) instanceRef.current = instance;
    } catch (err) {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to init chart');
    }
    return () => {
      cancelled = true;
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    try {
      instance.update(data, config);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update chart');
    }
  }, [data, config]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center w-full h-full min-h-[200px]"
        style={{ color: "var(--color-error, #dc2626)" }}
        role="alert"
      >
        {error}
      </div>
    );
  }

  return (
    <div
      className="dtk-viz-chart-container w-full h-full"
      style={containerStyle}
    >
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: `${minHeight}px` }} />
      {showNoDataOverlay && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm px-4 text-center"
          style={{
            paddingTop: titleBlockPx > 0 ? titleBlockPx : undefined,
            color: 'var(--color-text-muted, #6b7280)',
          }}
          role="status"
          aria-label={config.noDataText}
        >
          {config.noDataText}
        </div>
      )}
    </div>
  );
}

export function ChartRendererWrapper(props: ChartRendererWrapperProps) {
  return <ChartRendererPackage {...props} />;
}
