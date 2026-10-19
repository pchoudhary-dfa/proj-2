import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src"],
      outDir: "dist",
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "DfaV6CompTimeperiod",
      fileName: "dfa-v6-comp-timeperiod",
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "dfa-v6-comp-list-view", "dfa-v6-comp-list-view/styles.css"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
          "dfa-v6-comp-list-view": "DfaV6CompListView",
        },
        assetFileNames: (assetInfo) =>
          assetInfo.name && String(assetInfo.name).endsWith(".css") ? "styles.css" : assetInfo.name ?? "assets/[name][extname]",
      },
    },
    sourcemap: true,
    outDir: "dist",
  },
});
