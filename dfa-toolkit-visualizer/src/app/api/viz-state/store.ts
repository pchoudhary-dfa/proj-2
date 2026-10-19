/**
 * In-memory store for viz state (fetchParams + chartConfig).
 * For single-instance dev; replace with Redis/DB for production multi-instance.
 */

import type { MinimalSharePayload } from "@/lib/visualizer/embed/shareUrl";
import type { VisualizationConfig } from "@/lib/visualizer/types";

export interface VizStateEntry {
  fetchParams: MinimalSharePayload;
  chartConfig: VisualizationConfig;
  createdAt: number;
}

const store = new Map<string, VizStateEntry>();

function randomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function createVizState(
  fetchParams: MinimalSharePayload,
  chartConfig: VisualizationConfig
): string {
  const id = randomId();
  store.set(id, {
    fetchParams,
    chartConfig,
    createdAt: Date.now(),
  });
  return id;
}

export function getVizState(id: string): VizStateEntry | null {
  return store.get(id) ?? null;
}
