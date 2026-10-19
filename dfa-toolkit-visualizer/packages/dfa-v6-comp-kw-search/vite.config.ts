import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      outDir: 'dist',
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'DfaToolkitCompSearch',
      fileName: 'index',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.name && String(assetInfo.name).endsWith('.css')
            ? 'styles.css'
            : assetInfo.name ?? 'assets/[name][extname]',
      },
    },
    sourcemap: true,
    outDir: 'dist',
  },
});
