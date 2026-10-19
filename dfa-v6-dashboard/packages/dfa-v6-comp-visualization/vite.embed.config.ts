import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Builds the standalone embed IIFE (chart engine + ECharts) into dist/embed/dfa-viz-embed.min.js.
 * Run after the main build so dist/ is already populated; this only writes dist/embed/.
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/embedEntry.ts'),
      name: 'DfaVizEmbed',
      formats: ['iife'],
      fileName: () => 'dfa-viz-embed.min.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
      // Bundle all deps (including echarts) so the IIFE is self-contained
      external: () => false,
    },
    minify: 'esbuild',
    sourcemap: true,
    outDir: 'dist/embed',
    emptyOutDir: true,
  },
});
