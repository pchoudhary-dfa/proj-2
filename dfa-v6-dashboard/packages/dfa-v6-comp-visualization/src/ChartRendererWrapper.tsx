'use client';

import { useEffect, useRef, useImperativeHandle, useState } from 'react';
import type { ChartConfig, ChartData } from './engine/types';
import { createDfaChart } from './engine/standalone';

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

  useImperativeHandle(chartRef, () => ({
    getDataURL(type: 'png' | 'svg') {
      const inst = instanceRef.current;
      return inst ? inst.getDataURL(type) : '';
    },
  }), []);

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
  }, []);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.update(data, config);
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
      ref={containerRef}
      className="dtk-viz-chart-container w-full h-full"
      style={{
        minHeight: `${minHeight}px`,
        ...(width != null && height != null ? { width: `${width}px`, height: `${height}px` } : {}),
      }}
    />
  );
}

export function ChartRendererWrapper(props: ChartRendererWrapperProps) {
  return <ChartRendererPackage {...props} />;
}
