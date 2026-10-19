"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

type EChartEventHandler = (params: unknown) => void;

type EChartProps = {
  option: EChartsOption;
  className?: string;
  style?: React.CSSProperties;
  /** Map of ECharts event name → handler (e.g. { legendselectchanged: fn }). */
  onEvents?: Record<string, EChartEventHandler>;
};

/**
 * Thin client-side React wrapper around ECharts. Avoids the React 19 peer-dep
 * conflict that echarts-for-react triggers, and keeps echarts out of page
 * components. Re-applies the option (with notMerge) whenever it changes and
 * resizes with its container.
 */
export function EChart({ option, className, style, onEvents }: EChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // Keep the latest handlers without forcing re-binding on every render.
  const onEventsRef = useRef<EChartProps["onEvents"]>(onEvents);
  onEventsRef.current = onEvents;

  // Init once on mount; dispose on unmount.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Re-apply the option whenever it changes.
  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  // (Re)bind event handlers whenever the set of event names changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onEvents) return;
    const names = Object.keys(onEvents);
    for (const name of names) {
      chart.on(name, (params: unknown) => onEventsRef.current?.[name]?.(params));
    }
    return () => {
      for (const name of names) chart.off(name);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEvents ? Object.keys(onEvents).join(",") : ""]);

  return <div ref={containerRef} className={className} style={style} />;
}
