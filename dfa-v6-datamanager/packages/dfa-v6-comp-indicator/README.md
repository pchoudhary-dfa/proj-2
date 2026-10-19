# dfa-v6-comp-indicator

Indicator selector: sidebar (**All** + warehouse IC types from API), search on the All tab, hierarchical IC classification tree on type tabs, and list/tree content via **dfa-v6-comp-list-view** (multi-select by default). Set **`multiSelect={false}`** for single-indicator (radio-style) selection.

With **`baseUrl`**, sidebar tabs load from `indicator-classifications/type` and each IC tab builds a lazy-loaded hierarchical tree from `indicator-classifications?ic_type=…&hierarchical=true`. Omit `baseUrl` for built-in mock data. Token-driven CSS.

Toolkit packages are **not published** and are **not installed via Git URL** (auth/deploy). Copy them into the app and depend with **`file:./packages/...`**. You need **both** this package and **dfa-v6-comp-list-view**.

---

## Build (Vite)

Build **dfa-v6-comp-list-view** first, then this package.

From the monorepo `packages/` folder (or your app’s `packages/` after copying):

```bash
cd dfa-v6-comp-list-view
npm install
npm run build
cd ../dfa-v6-comp-indicator
npm install
npm run build
```

Output is in **`dist/`**: `dfa-v6-comp-indicator.js` (ES), `dfa-v6-comp-indicator.umd.cjs`, `index.d.ts`, and `styles.css`. The host app consumes this built output; it does **not** need to transpile this package.

---

## Integrating into your app

1. **Copy both packages** into your app (e.g. under `packages/`):
   - `dfa-v6-comp-list-view` → `your-app/packages/dfa-v6-comp-list-view/`
   - `dfa-v6-comp-indicator` → `your-app/packages/dfa-v6-comp-indicator/`

2. **Add local dependencies** in the app root `package.json`:

```json
"dependencies": {
  "dfa-v6-comp-indicator": "file:./packages/dfa-v6-comp-indicator",
  "dfa-v6-comp-list-view": "file:./packages/dfa-v6-comp-list-view"
}
```

3. In **`packages/dfa-v6-comp-indicator/package.json`**, point the list-view devDependency at the sibling folder:

```json
"dfa-v6-comp-list-view": "file:../dfa-v6-comp-list-view"
```

4. Run **`npm install`** in the app root.

5. **Build in order** (list-view first, then indicator), e.g. from the app root:

```bash
cd packages/dfa-v6-comp-list-view && npm install && npm run build
cd ../dfa-v6-comp-indicator && npm install && npm run build
```

You can add a root script, e.g. `"build:indicator-stack": "npm run build --prefix packages/dfa-v6-comp-list-view && npm run build --prefix packages/dfa-v6-comp-indicator"`, or the equivalent for your workspace layout.

6. **Pass translated strings** from your app wrapper (modal or page). At minimum, wire `selectAll` and `deselectAll` for the bulk-selection links:

```tsx
strings={{
  // ...other keys...
  selectAll: t("COMMON_SELECT_ALL"),      // or SELECT_ALL in data manager
  deselectAll: t("COMMON_DESELECT_ALL"),  // or DESELECT_ALL in data manager
}}
```

---

## Import

```tsx
import { IndicatorSelect, type IndicatorItem, type IndicatorSelectApi } from 'dfa-v6-comp-indicator';
import 'dfa-v6-comp-indicator/styles.css';
import 'dfa-v6-comp-list-view/styles.css';
```

**Additional exports for subgroup mode:**
```tsx
import {
  buildIusGid,      // Build composite IUS GID
  parseIusGid,      // Parse composite IUS GID
  IUS_GID_SEP,      // Separator character ("|")
  type IuRowData    // Type for tree row data
} from 'dfa-v6-comp-indicator';
```

---

## Props

| Prop | Type | Description |
|------|------|-------------|
| `baseUrl` | `string` | Reference API; paths below. Ignored if `fetchIndicators` is set |
| `multiSelect` | `boolean` | Default `true`. `false` = single selection (radio-style list, compact summary; no “selected indicators” side panel) |
| `locale` | `string` | `Accept-Language` (falls back to `navigator.language`) |
| `headers` | `Record<string, string>` | e.g. auth; use `locale` for language |
| `initialSelectedItems` / `initialSelectedIds` | `IndicatorItem[]` / ids | Initial selection |
| `onReady` | `(api: IndicatorSelectApi) => void` | Imperative API |
| `onChange` | `(selected: IndicatorItem[]) => void` | Selection changes |
| `loadingComponent` | `ReactNode` | Custom loading UI |
| `fetchIndicators` | `(params) => Promise<IndicatorItem[]>` | Replaces reference indicator fetches; params include `icType`, `icIdentifier` (legacy `sector`/`goal`/`theme` still supported) |
| `fetchIndicatorsCacheKey` | `string` | Cache scope for `fetchIndicators` on the All tab (use when the list is dynamic) |
| `fetchClassificationOptions` | `(icType) => Promise<ClassificationOption[]>` | Override classification options for type code `SC`, `GL`, `TH`, etc. (flat; all treated as leaf nodes) |
| `flatIusList` | `boolean` | Flat IUS rows (`indicator\|unit\|subgroup` GIDs) via ListView instead of indicator/IU rows. Mutually exclusive with `enableSubgroup` |
| `restrictUnitGid` | `string` | When `flatIusList`: only include rows for this unit GID |
| `excludeIusGids` | `string[]` | When `flatIusList`: exclude these IUS GIDs from the list |
| `enableUnit` | `boolean` | Default `true`. Expand indicators to IU rows (one per unit). `false` = show unique indicators only. Forced `true` when `enableSubgroup={true}`. See **Unit Mode** |
| `enableSubgroup` | `boolean` | Default `false`. IU + subgroup tree; returns IUS GIDs. See **Subgroup Mode** |
| `strings` | object | Optional i18n; see **Translation strings** |

---

## UI layout

### All tab
- Search bar at the top (client-side filter on the loaded list).
- When `multiSelect={true}` and items are loaded, **Select All** / **Deselect All** text links appear above the list. They operate on the currently visible (search-filtered) items only.
- List content uses **ListView** (default / `flatIusList`) or **IuTreeView** (`enableSubgroup`).

### IC type tabs
- Sidebar tab per enabled IC type (Sector, Goal, Theme, Framework, etc.).
- Hierarchical classification tree: branch nodes expand/collapse; **leaf** nodes lazy-load indicators on first expand.
- On expanded leaf nodes with `multiSelect={true}`, **Select All** / **Deselect All** links appear above the indicator list. Links are hidden when the leaf is collapsed.
- Selection badge on each IC node shows count of selected items in that subtree.
- Selections are preserved across tabs and across IC groups (group-aware merge in multi-select mode).

### Select All / Deselect All
- Shown only when `multiSelect={true}`.
- **All tab**: selects/deselects all visible items in the current list (respects search filter).
- **IC leaf**: selects/deselects all items in that leaf group only; other groups/tabs keep their selections.
- Hidden in single-select mode (`multiSelect={false}`).

---

## Flat IUS list (`flatIusList={true}`)

Use when the host needs flat **IUS** rows (indicator + unit + subgroup) rather than indicator-only or IU rows.

- Fetches with `subgroup=true&ius=true`.
- Each row `id` is a composite IUS GID: `indicatorGid|unitGid|subgroupGid`.
- Selected items include `unitGid`, `unitName`, `subgroupGid`, `subgroupName`, and `iusNid` when available.
- Pair with `restrictUnitGid` and/or `excludeIusGids` to narrow the list (e.g. compute IUS picker).
- Mutually exclusive with `enableSubgroup` (tree mode).

---

## Unit Mode (`enableUnit`)

Controls whether indicators are expanded to show individual units (IU rows) or displayed as unique indicators only.

### `enableUnit={true}` (default)

- Each indicator with multiple units expands into multiple rows, one per unit.
- Row labels: `"Indicator Name, Unit Name"`.
- Row ID: composite `indicatorGid_unitGid`.
- Selected items include `unitGid` and `unitName`.

### `enableUnit={false}`

- Unique indicators only; row ID is the indicator GID.
- Selected items do not include `unitGid` or `unitName`.

### Interaction with `enableSubgroup`

When `enableSubgroup={true}`, `enableUnit` is **forced to `true`**.

---

## Subgroup Mode (`enableSubgroup={true}`)

Hierarchical tree where users select **IUS (Indicator Unit Subgroup)** combinations.

- All selections tracked as IUS GIDs (`indicatorGid|unitGid|subgroupGid`).
- IU checkbox is an aggregate: checked when all subgroups under that IU are selected; toggling selects/deselects all subgroups for that IU.
- **`multiSelect={true}`**: select across any IUs.
- **`multiSelect={false}`**: multiple subgroups allowed, but only within one IU at a time.

```typescript
import { buildIusGid, parseIusGid, IUS_GID_SEP } from 'dfa-v6-comp-indicator';

const iusGid = buildIusGid("IND_GID", "UNIT_GID", "SUBGROUP_GID");
const [indicatorGid, unitGid, subgroupGid] = parseIusGid(iusGid) ?? [];
```

---

## Translation strings (`strings`)

Pass partial objects; omitted keys use English defaults. **`summaryMany`** uses `{n}` for the count. **`selectClassification`**, **`pleaseSelectClassification`**, and **`chooseClassificationOption`** use `{type}` for the active IC type label.

| Key | Default (EN) |
|-----|----------------|
| `searchPlaceholder` | Search indicators... |
| `allTabLabel` | All |
| `selectClassification` | Select {type} |
| `pleaseSelectClassification` | Please select a {type} from the dropdown above |
| `chooseClassificationOption` | — Choose {type} — |
| `selectSector` | Select Sector |
| `selectTheme` | Select Theme |
| `selectGoal` | Select Goal |
| `pleaseSelectSector` | Please select a sector from the dropdown above |
| `pleaseSelectTheme` | Please select a theme from the dropdown above |
| `pleaseSelectGoal` | Please select a goal from the dropdown above |
| `loadingLabel` | Loading... |
| `emptyLabel` | No indicators available. |
| `summaryNone` | No indicators selected |
| `summaryOne` | 1 indicator selected |
| `summaryMany` | {n} indicators selected |
| `summarySelectedPanelTitle` | Selected indicators |
| `close` | Close |
| `selectAll` | Select All |
| `deselectAll` | Deselect All |

---

## IndicatorSelectApi

| Method | Description |
|--------|-------------|
| `getSelected()` | Returns current `IndicatorItem[]` (respects open selected-panel draft when applicable) |
| `clear()` | Clears all selection |
| `setSelectedIds(ids)` | Sets selection by id list |

---

## Reference mode (`baseUrl`, no `fetchIndicators`)

| Endpoint | Purpose |
|----------|---------|
| `GET baseUrl/indicators` | All-tab list (`?subgroup=true&ius=true` when subgroup/flat IUS modes) |
| `GET baseUrl/indicators?ic_identifier={id}&ic_type={code}` | Indicators for an IC leaf node |
| `GET baseUrl/indicator-classifications/type` | Sidebar IC type tabs (code → label map) |
| `GET baseUrl/indicator-classifications?ic_type={code}&hierarchical=true&include_ic_ius_counts=true` | Hierarchical IC tree for a type tab |

Responses normalized from `{ success, data, meta }`. Results cached per `baseUrl`, locale, mode, and IC node.

---

## Design tokens (global)

Load **`packages/design-tokens/tokens.css`** before `dfa-v6-comp-indicator/styles.css` (and list-view styles).

| Token | Role |
|-------|------|
| `--color-primary` | Active nav, focus, links, select-all links, summary highlight |
| `--color-surface`, `--color-surface-muted` | Root, sidebar, scrollbars |
| `--color-text`, `--color-text-muted` | Labels, inputs, empty state |
| `--color-border` | Dividers |
| `--font-body` | UI typography |
| `--spacing-xs`, `--spacing-xl` | Margins / search padding |

---

## Example

```tsx
const apiRef = useRef<IndicatorSelectApi | null>(null);

<IndicatorSelect
  baseUrl={baseUrl}
  locale={locale}
  headers={headers}
  multiSelect
  flatIusList={false}
  initialSelectedItems={initialSelectedItems}
  onReady={(api) => { apiRef.current = api; }}
  onChange={(items) => { /* track selection */ }}
  strings={{
    searchPlaceholder: t("INDICATOR_SEARCH_PLACEHOLDER"),
    selectAll: t("COMMON_SELECT_ALL"),
    deselectAll: t("COMMON_DESELECT_ALL"),
    close: t("COMMON_CLOSE"),
  }}
/>
```

---

## Requirements

- React 18+
- **dfa-v6-comp-list-view** (peer)
- Node 18+ (build)
