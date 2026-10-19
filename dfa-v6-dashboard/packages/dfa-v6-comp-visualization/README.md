# dfa-v6-comp-visualization

**ECharts**-based charts for a **Next.js** app via **`ChartRendererWrapper`** (`'use client'`). **Chart types:** `line`, `bar`, `area`, `pie`, `scatter`, `heatmap`, `treemap`, `radar`, `pyramid` — set `config.type` and pass the matching **`ChartData`** shape.

The npm entry also exports **`createDfaChart`** and the **`dfa-v6-comp-visualization/engine`** subpath for non-React hosts; this README documents **Next.js** only.

Toolkit packages are **not published** and are **not installed via Git URL** (auth/deploy). Copy this package into the app and depend with **`file:./packages/...`**. The Next.js app needs **`echarts`**, **`react`**, and **`react-dom`** (peers).

---

## Build (Vite)

From this package directory:

```bash
npm install
npm run build
```

Output is in **`dist/`**: `index.mjs`, `index.d.ts`, `styles.css`, **`engine.mjs`** / **`engine.d.ts`**, plus embed build artifacts. The host app consumes this built output; it does **not** need to transpile this package.

---

## Integrating into your app

1. **Copy** this folder into your app, e.g. `your-app/packages/dfa-v6-comp-visualization/`.

2. **Add local dependencies** in the app root `package.json`:

```json
"dependencies": {
  "dfa-v6-comp-visualization": "file:./packages/dfa-v6-comp-visualization",
  "echarts": "^5.5.0",
  "react": "^18.0.0",
  "react-dom": "^18.0.0"
}
```

(Use versions that satisfy the peers in this package’s `package.json`.)

3. Run **`npm install`** in the app root.

4. **Build** so `dist/` exists before running or building the Next.js app:

```bash
cd packages/dfa-v6-comp-visualization
npm install
npm run build
```

Optional root script, e.g. `"build:charts": "npm run build --prefix packages/dfa-v6-comp-visualization"`.

---

## Architecture (Next.js)

- **`ChartRendererWrapper`** — client-only; pass **`data`** and **`config`**; optional **`chartRef`** for **`getDataURL('png' | 'svg')`**.
- **`dfa-v6-comp-visualization/styles`** — layout for **`.dtk-viz-chart-container`**.
- Types: **`ChartConfig`**, **`ChartData`**, plus **`LineBarAreaData`**, **`PieChartData`**, etc.

---

## Import

```tsx
import {
  ChartRendererWrapper,
  type ChartData,
  type ChartConfig,
  type LineBarAreaData,
  type PieChartData,
  type ChartRendererWrapperRef,
} from 'dfa-v6-comp-visualization';
import 'dfa-v6-comp-visualization/styles';
```

---

## Next.js usage

1. Complete **Integrating into your app** above so the package is built and linked.
2. Import **`dfa-v6-comp-visualization/styles`** once (e.g. in the same client module as the chart, or in your app layout if you globalize chart styles).
3. Render charts only in a **Client Component** (`'use client'`) — the wrapper is not a Server Component.
4. Give the chart a **defined height** (e.g. `className="h-[400px]"` or `style={{ height: 400 }}`) so layout is stable.

**Bar chart with export and click handlers:**

```tsx
'use client';

import { useRef } from 'react';
import 'dfa-v6-comp-visualization/styles';
import { ChartRendererWrapper, type ChartRendererWrapperRef } from 'dfa-v6-comp-visualization';
import type { ChartConfig, LineBarAreaData } from 'dfa-v6-comp-visualization';

const data: LineBarAreaData = {
  categories: ['Jan', 'Feb', 'Mar'],
  series: [{ id: 's1', name: 'Revenue', values: [100, 200, 150] }],
};

const config: ChartConfig = {
  type: 'bar',
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  showLabels: true,
  showLegend: true,
  legendPosition: 'top',
  labelOrientation: 'horizontal',
  primaryColor: '#5470c6',
  palette: ['#5470c6', '#91cc75'],
  labelFont: { size: 12, family: 'sans-serif', bold: false, italic: false, underline: false },
  legendFont: { size: 12, family: 'sans-serif', bold: false, italic: false, underline: false },
};

export default function DashboardChart() {
  const chartRef = useRef<ChartRendererWrapperRef | null>(null);

  const downloadPng = () => {
    const url = chartRef.current?.getDataURL('png');
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chart.png';
    a.click();
  };

  return (
    <div className="w-full" style={{ height: 400 }}>
      <ChartRendererWrapper
        data={data}
        config={config}
        minHeight={300}
        chartRef={chartRef}
        onPointClick={(p) => console.log('point', p)}
        onLegendClick={(p) => console.log('legend', p.name)}
      />
      <button type="button" onClick={downloadPng}>
        Download PNG
      </button>
    </div>
  );
}
```

**Pie chart** — set `showXAxis`, `showYAxis`, and `showGrid` to **`false`**:

```tsx
'use client';

import 'dfa-v6-comp-visualization/styles';
import { ChartRendererWrapper } from 'dfa-v6-comp-visualization';
import type { ChartConfig, PieChartData } from 'dfa-v6-comp-visualization';

const data: PieChartData = {
  segments: [
    { id: 'a', label: 'Product A', value: 35 },
    { id: 'b', label: 'Product B', value: 65 },
  ],
};

const config: ChartConfig = {
  type: 'pie',
  showXAxis: false,
  showYAxis: false,
  showGrid: false,
  showLabels: true,
  showLegend: true,
  legendPosition: 'right',
  labelOrientation: 'horizontal',
  primaryColor: '#5470c6',
  palette: ['#5470c6', '#91cc75'],
  labelFont: { size: 12, family: 'sans-serif', bold: false, italic: false, underline: false },
  legendFont: { size: 12, family: 'sans-serif', bold: false, italic: false, underline: false },
};

export default function PieBlock() {
  return (
    <div className="w-full h-[400px]">
      <ChartRendererWrapper data={data} config={config} />
    </div>
  );
}
```

Updating **`data`** or **`config`** props runs an internal **`update`** on the ECharts instance.

---

## Data and `ChartConfig` (quick reference)

Every chart needs **`data: ChartData`** and **`config: ChartConfig`**. Required **`ChartConfig`** fields (all types):

```ts
const baseConfig: ChartConfig = {
  type: 'line', // 'line' | 'bar' | 'area' | 'pie' | 'scatter' | 'heatmap' | 'treemap' | 'radar' | 'pyramid'
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  showLabels: true,
  showLegend: true,
  legendPosition: 'top', // 'top' | 'bottom' | 'left' | 'right'
  labelOrientation: 'horizontal', // 'horizontal' | 'vertical'
  primaryColor: '#5470c6',
  palette: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de'],
  labelFont: { size: 12, family: 'sans-serif', bold: false, italic: false, underline: false },
  legendFont: { size: 12, family: 'sans-serif', bold: false, italic: false, underline: false },
};
```

Optional **`ChartConfig`** fields include `columnSpacing`, `lineThickness`, `chartVariant` (e.g. `"horizontal"` for bar), `pieDonut`, `pieSemi`, `pieLabelsInside` / `pieLabelsOutside`, `yAxisMin` / `yAxisMax` / `yAxisInterval`, `dataLabelPosition`, `dataLabelVisibility`, `dataLabelNumberFormat`, `grid`, `scatterSymbolSize`, `scatterSymbol`, `plotAreaBackgroundColor`, etc. (see `src/engine/types.ts`).

### Line / bar / area — `LineBarAreaData`

```ts
const lineBarArea: LineBarAreaData = {
  categories: ['Jan', 'Feb', 'Mar'],
  series: [
    { id: 's1', name: 'Sales', values: [100, 200, 150] },
    { id: 's2', name: 'Costs', values: [80, 120, 100], stack: 'total' },
  ],
};
```

Use `config.type: 'line' | 'bar' | 'area'`.

### Pie — `PieChartData`

```ts
const pie: PieChartData = {
  segments: [
    { id: 'a', label: 'A', value: 40 },
    { id: 'b', label: 'B', value: 60 },
  ],
};
```

### Scatter — `ScatterXYData`

```ts
const scatter: ScatterXYData = {
  series: [
    { id: 's1', name: 'Series 1', points: [{ x: 10, y: 20, label: 'A' }, { x: 15, y: 35, label: 'B' }] },
  ],
  xAxisLabel: 'X',
  yAxisLabel: 'Y',
};
```

### Heatmap — `HeatmapData`

```ts
const heatmap: HeatmapData = {
  xCategories: ['Col A', 'Col B'],
  yCategories: ['Row 1', 'Row 2'],
  cells: [
    [0, 0, 5],
    [1, 1, 12],
  ],
  min: 0,
  max: 20,
};
```

### Treemap — `TreemapData`

```ts
const treemap: TreemapData = {
  nodes: [
    {
      name: 'Root',
      value: 100,
      children: [
        { name: 'A', value: 60 },
        { name: 'B', value: 40 },
      ],
    },
  ],
};
```

### Radar — `RadarData`

```ts
const radar: RadarData = {
  indicators: [
    { name: 'Metric A', max: 100 },
    { name: 'Metric B', max: 100 },
  ],
  series: [
    { name: 'Q1', values: [80, 70] },
    { name: 'Q2', values: [60, 90] },
  ],
};
```

### Pyramid — `PyramidData`

Left wing values are **pre-negated** for ECharts (extend left from center).

```ts
const pyramid: PyramidData = {
  kind: 'pyramid',
  categories: ['0–4', '5–9'],
  leftSeries: { name: 'Left', values: [-12, -18] },
  rightSeries: { name: 'Right', values: [10, 22] },
};
```

Use **`isLineBarAreaData`**, **`isPieChartData`**, **`isScatterXYData`**, **`isHeatmapData`**, **`isTreemapData`**, **`isRadarData`**, **`isPyramidData`** when narrowing **`ChartData`**.

---

## `ChartRendererWrapper` props

| Prop | Type | Description |
|------|------|-------------|
| `data` | `ChartData` | Matches `config.type` |
| `config` | `ChartConfig` | Required fields + optional type-specific options |
| `width` / `height` | `number` | Optional fixed size |
| `minHeight` | `number` | Default **384** |
| `onPointClick` / `onLegendClick` | callbacks | ECharts events |
| `chartRef` | `Ref<ChartRendererWrapperRef \| null>` | **`getDataURL('png' \| 'svg')`** |

Mount runs **init** once; prop updates run **`update`**.

---

## ChartData shapes (summary)

| Kind | Fields / discriminator |
|------|-------------------------|
| Line / bar / area | `categories`, `series[]` with `values` |
| Pie | `segments[]` |
| Scatter | `series[].points`, `xAxisLabel`, `yAxisLabel` |
| Heatmap | `xCategories`, `yCategories`, `cells`, `min`, `max` |
| Treemap | `nodes` (tree with `name`, `value`, `children?`) |
| Radar | `indicators[]` (`name`, `max`), `series[]` (`values` aligned to indicators) |
| Pyramid | `kind: 'pyramid'`, `categories`, `leftSeries`, `rightSeries` |

---

## Design tokens (global)

**`ChartRendererWrapper`** error text uses **`var(--color-error, #dc2626)`**. **`styles.css`** only lays out **`.dtk-viz-chart-container`**; series colors come from **`config`** / ECharts.

Load **`packages/design-tokens/tokens.css`** in the Next.js app (or set **`--color-error`**) if you want errors to match the rest of the DFA UI.

---

## Requirements

- **Next.js** (App Router or Pages) with **React 18+**
- **echarts** ≥ 5, **react** / **react-dom** ≥ 18 (peers)
- Node 18+ (build)