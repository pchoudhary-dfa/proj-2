import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * Builds the embed runtime (chart engine + ECharts) into public/embed/dfa-viz-embed.min.js.
 * Share/embed is an app feature; this keeps the chart package a pure library.
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/embed/embedLoader.ts"),
      name: "DfaVizEmbed",
      formats: ["iife"],
      fileName: () => "dfa-viz-embed.min.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: "esbuild",
    sourcemap: true,
    outDir: "public/embed",
    emptyOutDir: true,
  },
});
