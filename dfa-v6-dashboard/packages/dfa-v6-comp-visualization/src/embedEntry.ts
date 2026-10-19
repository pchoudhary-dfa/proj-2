/**
 * IIFE entry for the standalone embed bundle (dist/embed/dfa-viz-embed.min.js).
 * Bundles the chart engine + ECharts and exposes createDfaChart on window.DfaVizEmbed.
 */

import { createDfaChart } from './engine/standalone';

declare global {
  interface Window {
    DfaVizEmbed?: { createDfaChart: typeof createDfaChart };
  }
}

if (typeof window !== 'undefined') {
  window.DfaVizEmbed = { createDfaChart };
}
