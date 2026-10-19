# dfa-v6-comp-visualization

**ECharts**-based charts for a **Next.js** app via **`ChartRendererWrapper`** (`'use client'`). **Chart types:** `line`, `bar`, `area`, `pie`, `scatter`, `heatmap`, `treemap`, `treemapSliceDice`, `treemapStripes`, `sunburst`, `dotMatrix`, `hundredMinus`, `radar`, `pyramid`, `map` (choropleth) — set `config.type` and pass the matching **`ChartData`** shape.

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

- **`ChartRendererWrapper`** — client-only; pass **`data`** and **`config`**; optional **`chartRef`** for **`getDataURL('png' | 'svg')`**. Choropleth maps use **`config.type: 'map'`** with **`MapChartData`** (GeoJSON from the host app, e.g. DML — see **`DW_MAPS`** below).
- **`dfa-v6-comp-visualization/styles`** — layout for **`.dtk-viz-chart-container`**.
- Types: **`ChartConfig`**, **`ChartData`**, plus **`LineBarAreaData`**, **`PieChartData`**, etc.

---

## Import

```tsx
import {
  ChartRendererWrapper,
  type ChartData,
  type ChartConfig,
  type FontStyle,
  type RequiredFontStyle,
  type LineBarAreaData,
  type PieChartData,
  type TreemapData,
  type SliceDiceTreemapData,
  type StripesTreemapData,
  type SunburstData,
  type MapChartData,
  type ChartRendererWrapperRef,
  isSliceDiceTreemapData,
  isStripesTreemapData,
  isSunburstData,
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

Every chart needs **`data: ChartData`** and **`config: ChartConfig`**.

### Required fields (all chart types)

```ts
const baseConfig: ChartConfig = {
  type: 'line', // 'line' | 'bar' | 'area' | 'pie' | 'scatter' | 'heatmap' | 'treemap' | 'treemapSliceDice' | 'treemapStripes' | 'sunburst' | 'dotMatrix' | 'hundredMinus' | 'radar' | 'pyramid' | 'map'
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

Hierarchical types (`treemap`, `treemapSliceDice`, `treemapStripes`, `sunburst`) and percentage charts (`dotMatrix`, `hundredMinus`) ignore axes/grid/legend; the engine forces `legend.show: false`. Prefer `showLegend: false` in config.

### Typography types

| Type | Used on | Notes |
|------|---------|--------|
| **`RequiredFontStyle`** | `labelFont`, `legendFont` | `size`, `family`, `bold`, `italic`, `underline` required; optional `color` |
| **`FontStyle`** | All optional font props below | Every field optional; partial overrides merge with fallbacks |

**Underline:** ECharts canvas text does not support CSS `textDecoration`. The engine draws measured underline rules for tick/data/legend labels (`fontUtils`) and graphic lines for canvas titles (`titleLayout`). Set `underline: true` on the relevant font prop.

**Tick vs data labels:** By default, `labelFont` styles axis ticks **and** data-point labels together. To style them independently, set optional **`xAxisTickFont`**, **`yAxisTickFont`**, and **`dataLabelFont`** (each falls back to `labelFont` when omitted).

### Optional `ChartConfig` fields (by group)

#### Canvas headings (included in PNG/SVG export)

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Main title inside the ECharts canvas |
| `subtitle` | `string` | Subtitle below title |
| `customLabel` | `string` | Free-text line below subtitle, above legend |
| `titleFont` | `FontStyle` | Title typography |
| `subtitleFont` | `FontStyle` | Subtitle typography |
| `customLabelFont` | `FontStyle` | Custom label typography |
| `titleAlign` / `subtitleAlign` / `customLabelAlign` | `'left' \| 'center' \| 'right'` | Per-row horizontal alignment; defaults to `center`. Underline rules follow the same alignment |

#### Axis titles and tick typography

| Prop | Type | Description |
|------|------|-------------|
| `xAxisLabel` | `string` | X-axis title (cartesian, scatter, heatmap, pyramid) |
| `yAxisLabel` | `string` | Y-axis title |
| `xAxisLabelFont` | `FontStyle` | X-axis title font |
| `yAxisLabelFont` | `FontStyle` | Y-axis title font |
| `xAxisTickFont` | `FontStyle` | X tick labels; falls back to `labelFont` |
| `yAxisTickFont` | `FontStyle` | Y tick labels; falls back to `labelFont` |
| `xAxisLabelRotation` | `number` | Tick rotation in degrees; overrides `labelOrientation` on X when set |
| `yAxisLabelRotation` | `number` | Tick rotation in degrees on Y |

#### Data labels (series values)

| Prop | Type | Description |
|------|------|-------------|
| `dataLabelFont` | `FontStyle` | Point/bar/slice labels; falls back to `labelFont` |
| `dataLabelPosition` | `'inside' \| 'outside'` | Line / bar / area |
| `dataLabelVisibility` | `'always' \| 'onHover'` | When labels show |
| `dataLabelNumberFormat` | `string` | Client format pattern (e.g. `1,000[.00]`) |
| `useUnitDefaultFormat` | `boolean` | Prefer `formattedValues` / `formattedValue` from `ChartData` |

#### Line / bar / area

| Prop | Type | Description |
|------|------|-------------|
| `columnSpacing` | `number` | Bar category gap (%) |
| `lineThickness` | `number` | Line / area stroke width |
| `chartVariant` | `string` | Bar: `vertical` (default), `horizontal`, `stacked-vertical`, `stacked-horizontal`, `stacked_percent` (100% stacked vertical), `stacked_percent_bar` (100% stacked horizontal). Line: `straight`, `curved`, `stepped`, `polar_line` (polar coordinate system). Area: `straight`, `curved`, `stepped`, `stacked` (absolute stacked), `stacked_percent` (100% stacked) |
| `yAxisMin` / `yAxisMax` / `yAxisInterval` | `number \| ''` | Fixed Y scale |

**100% stacked bars** (`stacked_percent` / `stacked_percent_bar`): each category is normalised to 100% (value ÷ column total); data labels render centred **inside** each segment as `%` (the `inside`/`outside` toggle is ignored) and segments that round to `0%` are hidden. `yAxisMin` / `yAxisMax` still override the default `0–100` value axis.

**Stacked area** (`stacked` on `type: 'area'`): series share an absolute ECharts stack (`line` + `areaStyle`); raw values are unchanged. Labels/tooltips use normal number formatting. Secondary Y-axis remains available (stacks are isolated per axis when dual Y is on).

**100% stacked area** (`stacked_percent` on `type: 'area'`): same normalisation and label/axis/tooltip behaviour as 100% stacked bars; series use ECharts stacked `line` + `areaStyle`. Secondary Y-axis is disabled.

#### Secondary Y-axis (opt-in — vertical line / bar / area only)

Absent or `enableSecondaryYAxis !== true` → single Y-axis (unchanged). Dual axis activates only when at least one series has `yAxisIndex: 1`. Horizontal bar variants ignore this feature.

| Prop | Type | Description |
|------|------|-------------|
| `enableSecondaryYAxis` | `boolean` | Master gate |
| `showSecondaryYAxis` | `boolean` | Right-axis chrome; default `true` when gated on |
| `secondaryYAxisMin` / `Max` / `Interval` | `number \| ''` | Fixed secondary scale |
| `secondaryYAxisLabel` | `string` | Right-axis title |
| `secondaryYAxisLabelFont` / `secondaryYAxisTickFont` | `FontStyle` | Title / tick fonts |
| `secondaryYAxisLabelRotation` | `number` | Tick rotation on secondary Y |

Bind series via **`LineBarAreaData.series[].yAxisIndex`**: `0` or omitted = left; `1` = right.
| `grid` | `{ left?, right?, top?, bottom? }` | Override computed grid margins |
| `seriesSymbol` | `'circle' \| 'rect' \| 'roundRect' \| 'triangle' \| 'diamond' \| 'pin' \| 'arrow' \| 'none'` | Marker shape for line / area / scatter; legend icons mirror it |
| `seriesSymbolSize` | `number` | Marker size in px (defaults: line/area 6, scatter 10) |
| `seriesSymbolBorderWidth` | `number` | Marker border width (px) on line/area; omit for none. No effect on `'none'` markers |
| `seriesSymbolBorderColor` | `string` | Marker border colour; only applies when `seriesSymbolBorderWidth > 0` (else ECharts uses the series colour) |

#### Pie

| Prop | Type | Description |
|------|------|-------------|
| `pieDonut` | `boolean` | Donut hole |
| `pieSemi` | `boolean` | Semi-circle (combine with `pieDonut` for semi-donut) |
| `pieLabelsInside` | `boolean` | Inside slice labels |
| `pieLabelsOutside` | `boolean` | Outside slice labels |

#### Scatter

| Prop | Type | Description |
|------|------|-------------|
| `scatterSymbolSize` | `number` | Point size (legacy; prefer `seriesSymbolSize`) |
| `scatterSymbol` | `string` | Point shape (legacy; prefer `seriesSymbol`) |

#### Map

| Prop | Type | Description |
|------|------|-------------|
| `mapLabels` | `{ showAreaName, showDataValue, showAreaId }` | Choropleth area label toggles |

#### Tooltip

| Prop | Type | Description |
|------|------|-------------|
| `tooltipEnabled` | `boolean` | Defaults `true`; set `false` to disable tooltips entirely |
| `tooltipTrigger` | `'axis' \| 'item'` | `axis` (default) shows all series at the hovered X; `item` shows a rich card for one point. Applies to line/bar/area/radar |
| `tooltipFields` | `{ indicator?, unit?, timePeriod?, subgroup?, area?, source?, footnote? }` | Which dimension rows appear in the `item`-trigger card. Requires per-point metadata on the data (`pointMeta` / `spokeMeta`). `indicator` / `timePeriod` / `subgroup` / `area` default on when omitted; `unit` / `source` / `footnote` are opt-in (`true` to show). When series name equals `indicatorName`, disabling `indicator` also suppresses that series header. |

#### Surfaces and legend chrome

| Prop | Type | Description |
|------|------|-------------|
| `chartAreaBackgroundColor` | `string` | ECharts `backgroundColor` (full canvas) |
| `chartAreaBorder` | `{ color?, width?, radius? }` | CSS border on the wrapper `div` |
| `plotAreaBackgroundColor` | `string` | Grid / plot fill (cartesian); pie canvas when no grid |
| `plotAreaBorder` | `{ color?, width? }` | ECharts grid border (no radius) |
| `legendBackground` | `string` | Legend panel fill (not used for treemap / slice / stripes / sunburst) |
| `legendBorder` | `{ color?, width?, radius? }` | Legend panel border (same — those types force legend off) |

#### Other

| Prop | Type | Description |
|------|------|-------------|
| `noDataText` | `string` | Centred message when `data` is empty |

Host apps that only pass the **required** flat fields (e.g. DFA Visualizer via `mapVizConfigToChartConfig`) keep prior behaviour: optional props are omitted and resolvers use `labelFont` / defaults.

**Source of truth:** `src/engine/types.ts`. In **dfa-toolkit-app-visualizer**, the dev playground at `/[locale]/dev/viz-test` exercises chart types and optional props.

### Example — separate tick and data label fonts

```ts
const config: ChartConfig = {
  ...baseConfig,
  type: 'bar',
  showLabels: true,
  labelFont: { size: 11, family: 'Inter', bold: false, italic: false, underline: false },
  xAxisTickFont: { size: 10, underline: true },
  yAxisTickFont: { size: 10, bold: true },
  dataLabelFont: { size: 12, bold: true, underline: false },
  title: 'Enrollment by district',
  titleFont: { size: 16, bold: true },
  xAxisLabel: 'District',
  yAxisLabel: 'Students',
};
```

### Line / bar / area — `LineBarAreaData`

```ts
const lineBarArea: LineBarAreaData = {
  categories: ['Jan', 'Feb', 'Mar'],
  series: [
    { id: 's1', name: 'Sales', values: [100, 200, 150] },
    { id: 's2', name: 'Costs', values: [80, 120, 100], stack: 'total', formattedValues: ['100', '120', '100'] },
  ],
};
```

Use `config.type: 'line' | 'bar' | 'area'`. Set `useUnitDefaultFormat: true` to display `formattedValues` / `formattedValue` from data instead of `dataLabelNumberFormat`.

**Secondary Y-axis example** (large scale left, small scale right):

```ts
const dualAxisData: LineBarAreaData = {
  categories: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { id: 'revenue', name: 'Revenue', values: [12000, 15000, 14000, 18000], yAxisIndex: 0 },
    { id: 'rate', name: 'Growth %', values: [4.2, 8.1, 6.5, 12.3], yAxisIndex: 1 },
  ],
};

const dualAxisConfig: ChartConfig = {
  ...baseConfig,
  type: 'line',
  enableSecondaryYAxis: true,
  yAxisLabel: 'Revenue',
  secondaryYAxisLabel: 'Growth %',
};
```

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

Squarified layout (ECharts native). Same `TreemapNode` tree as slice/stripes/sunburst below.

```ts
const treemap: TreemapData = {
  nodes: [
    {
      name: '2014-15',
      value: 100,
      children: [
        { name: 'Classrooms', value: 60 },
        { name: 'Schools', value: 40 },
      ],
    },
  ],
};
```

`config.type: 'treemap'`. Narrow with **`isTreemapData`** (excludes `kind: 'sliceDice' | 'stripes' | 'sunburst'`).

### Slice & Dice — `SliceDiceTreemapData`

Alternating H/V splits per depth (custom series; ECharts has no native slice-and-dice).

```ts
const sliceDice: SliceDiceTreemapData = {
  kind: 'sliceDice',
  nodes: treemap.nodes,
};
// config.type: 'treemapSliceDice'
```

Narrow with **`isSliceDiceTreemapData`**. Cell labels use uniform `dataLabelFont` / `labelFont` size.

### Stripes — `StripesTreemapData`

Fixed split direction at every depth (custom series).

```ts
const stripes: StripesTreemapData = {
  kind: 'stripes',
  nodes: treemap.nodes,
  direction: 'vertical', // default: stacked rows; 'horizontal' = side-by-side columns
};
// config.type: 'treemapStripes'
```

Narrow with **`isStripesTreemapData`**.

### Sunburst — `SunburstData`

Radial hierarchy; same `TreemapNode` tree. Rings follow depth; value ring uses `dataLabelFont` / number format props.

```ts
const sunburst: SunburstData = {
  kind: 'sunburst',
  nodes: [
    { name: 'Asia', value: 4500, children: [
      { name: 'China', value: 1400 },
      { name: 'India', value: 1380 },
    ]},
    { name: 'Europe', value: 750, children: [
      { name: 'Germany', value: 83 },
      { name: 'France', value: 67 },
    ]},
  ],
};
```

`config.type: 'sunburst'`. Narrow with **`isSunburstData`**.

### Dot matrix — `DotMatrixData`

Single percentage (0–100) as a 10×10 circle grid (1% per cell).

```ts
const dotMatrix: DotMatrixData = {
  kind: 'dotMatrix',
  value: 67.5,
  label: 'Coverage',
  formattedValue: '67.5%',
};
// config.type: 'dotMatrix'
```

Narrow with **`isDotMatrixData`**.

### 100 Minus — `HundredMinusData`

Single percentage as a two-segment donut: `value` + `(100 − value)`, centered label.

```ts
const hundredMinus: HundredMinusData = {
  kind: 'hundredMinus',
  value: 72,
  label: 'Completion',
  formattedValue: '72%',
};
// config.type: 'hundredMinus'
```

Narrow with **`isHundredMinusData`**.

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

### Map (choropleth) — `MapChartData`

Set **`config.type: 'map'`**. Supply GeoJSON (registered by the engine), per-feature values, and classification bins. Feature IDs must align with your data warehouse area IDs (typically `properties.ID_` in GeoJSON).

```ts
const mapData: MapChartData = {
  kind: 'map',
  geoJSON: featureCollection,
  mapName: 'my-map-unique-name',
  features: [
    { name: 'District A', areaId: 'AMR010001', value: 42, selected: true },
    { name: 'District B', areaId: 'AMR010002', value: null, selected: true },
  ],
  classification: {
    breaks: [0, 10, 20, 30],
    colors: ['#e0f3f8', '#abd9e9', '#74add1', '#2b8cbe'],
    labels: ['0–10', '10–20', '20–30'],
  },
  nullColor: '#d9d9d9',
  dimColor: '#f0f0f0',
};
```

Use **`isMapChartData`** when narrowing **`ChartData`**.

---

## Host app: `DW_MAPS` (DML choropleth basemaps)

Choropleth maps need **GeoJSON** from your DML map library. In the DFA Toolkit Visualizer, the app reads **`DW_MAPS`** from app configuration (e.g. `GET /app-config` with optional `dw_id` to merge per-warehouse **`db_configuration`**) together with **`DFA_DML_URL`** (system configuration). The JSON shape below is what **`parseDfaMaps`** / **`resolveMapUrl`** in the host app expect (`dfa-toolkit-visualizer` → `src/lib/visualizer/mapUtils.ts`). Legacy key **`DFA_MAPS`** may still be used as a fallback. If you embed this package elsewhere, mirror the same contract so map URLs resolve consistently.

### How levels work

`L1`, `L2`, `L3`, … keys must match the **numeric area levels** from your reference area tree (same levels used when enriching selected areas). For a **three-level** hierarchy such as **India → state → district**:

| Key | Typical use | Example basemap |
|-----|-------------|-----------------|
| **`L1`** | Country / root-level areas | India country outline or “national” basemap |
| **`L2`** | State-level selection | India map with **state** boundaries |
| **`L3`** | District-level selection | India map with **district** polygons (country-wide) |

Exact filenames follow your DML convention, e.g. `{AreaID} L{level} {yearFrom}-{yearTo} {description}.json` under the standard map folder layout.

### Nested format (recommended): `_default` + optional scopes

Each level is an object:

- **`_default`**: array of one or more map paths used when no more specific map is configured, or when selection has no scoped entry.
- **`<PARENT_AREA_ID>`** (e.g. `IND028`): optional. When the user selects areas that all share the same **parent** `ar_id` (e.g. all districts under Andhra Pradesh), the resolver prefers this scoped URL, then falls back to `_default`.

**Important:** use valid JSON — **no trailing comma** after the last property in an object or array.

**Example — Amor (AMR) at three levels** (sample warehouse; paths may vary on your DML host):

```json
{
  "L1": {
    "_default": [
      "/getmap//1SPDML%20Standard%20Maps/1SMREG%20Regions/AMR%20Amor/AMR%20l01%202011-3000%20national.json"
    ]
  },
  "L2": {
    "_default": [
      "/getmap//1SPDML%20Standard%20Maps/1SMREG%20Regions/AMR%20Amor/AMR%20l02%202011-3000%20states.json"
    ]
  },
  "L3": {
    "_default": [
      "/getmap//1SPDML%20Standard%20Maps/1SMREG%20Regions/AMR%20Amor/AMR%20l03%202011-3000%20districts.json"
    ],
    "AMR010": [
      "/getmap//1SPDML%20Standard%20Maps/1SMREG%20Regions/AMR%20Amor/AMR010%20Westeros/AMR010%20l03%202011-3000%20district.json"
    ]
  }
}
```

**Example — India at three levels** (paths are illustrative; replace with your real DML `/getmap/...` paths and encoding):

```json
{
  "L1": {
    "_default": [
      "/getmap//1SPDML%20Standard%20Maps/1SMREG%20Regions/IND%20India/IND%20l01%202011-3000%20national.json"
    ]
  },
  "L2": {
    "_default": [
      "/getmap//1SPDML%20Standard%20Maps/1SMREG%20Regions/IND%20India/IND%20l02%202011-3000%20states.json"
    ]
  },
  "L3": {
    "_default": [
      "/getmap//1SPDML%20Standard%20Maps/1SMREG%20Regions/IND%20India/IND%20l03%202011-3000%20districts.json"
    ],
    "IND028": [
      "/getmap//1SPDML%20Standard%20Maps/1SMREG%20Regions/IND%20India/IND028%20Andhra%20Pradesh/IND028%20l03%202011-3000%20district.json"
    ]
  }
}
```

When the user selects districts whose parent state is **`IND028`**, the app uses the Andhra Pradesh scoped map under **`L3["IND028"]`**. If that key were omitted, **`L3._default`** would show the all-India district basemap instead.

### Legacy flat format (still supported)

Older configs used a plain array per level. They are normalized internally to `{ "_default": [ ... ] }`:

```json
{
  "L1": ["/getmap/.../IND%20l01%20...json"],
  "L2": ["/getmap/.../IND%20l02%20...json"],
  "L3": ["/getmap/.../IND%20l03%20...json"]
}
```

### Operational notes

- Store **`DW_MAPS`** as a **single JSON string** in **`system_configuration`** for **DFA_VIZ**; per-warehouse values live in **`db_configuration`** with **`app_key` = `DFA_VIZ`** (seeded on warehouse `configuration_sync` / optimize). If the value is double-encoded JSON, the host parser unwraps one string layer.
- **`DFA_DML_URL`** must be the DML **site origin** (e.g. `https://dfadml.dataforall.org` — typically **without** an `/api` suffix). The client appends each `/getmap/...` path from `DW_MAPS` and normalizes trailing slashes when fetching.
- Scope keys must match **`parentId`** / `ar_id` casing used in your area API (often uppercase).

Use **`isLineBarAreaData`**, **`isPieChartData`**, **`isScatterXYData`**, **`isHeatmapData`**, **`isTreemapData`**, **`isSliceDiceTreemapData`**, **`isStripesTreemapData`**, **`isSunburstData`**, **`isRadarData`**, **`isPyramidData`**, **`isMapChartData`** when narrowing **`ChartData`**.

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
| Line / bar / area | `categories`, `series[]` with `values`; optional `yAxisIndex` for secondary Y |
| Pie | `segments[]` |
| Scatter | `series[].points`, `xAxisLabel`, `yAxisLabel` |
| Heatmap | `xCategories`, `yCategories`, `cells`, `min`, `max` |
| Treemap | `nodes` (`TreemapNode`: `name`, `value`, `children?`) |
| Slice & Dice | `kind: 'sliceDice'`, `nodes` (same tree; `config.type: 'treemapSliceDice'`) |
| Stripes | `kind: 'stripes'`, `nodes`, optional `direction`; `config.type: 'treemapStripes'` |
| Sunburst | `kind: 'sunburst'`, `nodes` |
| Dot matrix | `kind: 'dotMatrix'`, `value` (0–100), optional `label` / `formattedValue` |
| 100 Minus | `kind: 'hundredMinus'`, `value` (0–100), optional `label` / `formattedValue` |
| Radar | `indicators[]` (`name`, `max`), `series[]` (`values` aligned to indicators) |
| Pyramid | `kind: 'pyramid'`, `categories`, `leftSeries`, `rightSeries` |
| Map | `kind: 'map'`, `geoJSON`, `mapName`, `features[]`, `classification`, `nullColor`, `dimColor` |

---

## Design tokens (global)

**`ChartRendererWrapper`** error text uses **`var(--color-error, #dc2626)`**. **`styles.css`** only lays out **`.dtk-viz-chart-container`**; series colors come from **`config`** / ECharts.

Load **`packages/design-tokens/tokens.css`** in the Next.js app (or set **`--color-error`**) if you want errors to match the rest of the DFA UI.

---

## Requirements

- **Next.js** (App Router or Pages) with **React 18+**
- **echarts** ≥ 5, **react** / **react-dom** ≥ 18 (peers)
- Node 18+ (build)