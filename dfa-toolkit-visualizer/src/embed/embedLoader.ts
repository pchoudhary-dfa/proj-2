/**
 * Offline embed loader: reads window.DFA_VIZ_SNAPSHOT (base64), decodes, finds container,
 * and renders the chart from the frozen snapshot (chartData + chartConfig). No API calls—
 * the data was captured at embed time and does not update when the snapshot is viewed later.
 * Built as IIFE with ECharts + chart engine bundled for use in third-party pages.
 */

import { createDfaChart } from "dfa-v6-comp-visualization";

const CONTAINER_ID = "data-visualizer";
const CONTAINER_SELECTOR = "[data-dfa-viz-container]";

function decodeSnapshot(encoded: string): { chartData: unknown; chartConfig: unknown } {
  const json = decodeURIComponent(escape(atob(encoded)));
  const parsed = JSON.parse(json) as { chartData?: unknown; chartConfig?: unknown };
  if (!parsed || typeof parsed.chartData === "undefined" || typeof parsed.chartConfig === "undefined") {
    throw new Error("DFA Viz Embed: invalid snapshot (missing chartData or chartConfig)");
  }
  return { chartData: parsed.chartData, chartConfig: parsed.chartConfig };
}

function findContainer(): HTMLElement | null {
  const byId = document.getElementById(CONTAINER_ID);
  if (byId) return byId;
  return document.querySelector(CONTAINER_SELECTOR);
}

function run(): void {
  const raw = (window as unknown as { DFA_VIZ_SNAPSHOT?: string }).DFA_VIZ_SNAPSHOT;
  if (!raw || typeof raw !== "string") return;

  const container = findContainer();
  if (!container) {
    console.warn("DFA Viz Embed: container not found (#" + CONTAINER_ID + " or " + CONTAINER_SELECTOR + ")");
    return;
  }

  try {
    const { chartData, chartConfig } = decodeSnapshot(raw);
    createDfaChart(container, {
      data: chartData as Parameters<typeof createDfaChart>[1]["data"],
      config: chartConfig as Parameters<typeof createDfaChart>[1]["config"],
    });
  } catch (err) {
    console.error("DFA Viz Embed: failed to render", err);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
}
