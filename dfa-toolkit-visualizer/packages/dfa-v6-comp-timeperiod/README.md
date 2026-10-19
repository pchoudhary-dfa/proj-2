# dfa-v6-comp-timeperiod

Time period selector: quick select (recent N), list, summary. Uses **dfa-v6-comp-list-view** (multi-select by default). Set **`multiSelect={false}`** for a single year/period (radio-style list, no selected-items panel). Reference mode: `baseUrl` without `fetchOptions` → **GET** `baseUrl/time-periods`. Token-driven CSS.

Toolkit packages are **not published** and are **not installed via Git URL** (auth/deploy). Copy them into the app and depend with **`file:./packages/...`**. You need **both** this package and **dfa-v6-comp-list-view**.

---

## Build (Vite)

Build **dfa-v6-comp-list-view** first, then this package.

From `packages/`:

```bash
cd dfa-v6-comp-list-view
npm install
npm run build
cd ../dfa-v6-comp-timeperiod
npm install
npm run build
```

Output is in **`dist/`**: `dfa-v6-comp-timeperiod.js` (ES), `dfa-v6-comp-timeperiod.umd.cjs`, `index.d.ts`, and `styles.css`. The host app uses this built output; it does **not** need to transpile this package.

---

## Integrating into your app

1. **Copy both packages** into your app under `packages/`:
   - `dfa-v6-comp-list-view` → `your-app/packages/dfa-v6-comp-list-view/`
   - `dfa-v6-comp-timeperiod` → `your-app/packages/dfa-v6-comp-timeperiod/`

2. **Add local dependencies** in the app root `package.json`:

```json
"dependencies": {
  "dfa-v6-comp-timeperiod": "file:./packages/dfa-v6-comp-timeperiod",
  "dfa-v6-comp-list-view": "file:./packages/dfa-v6-comp-list-view"
}
```

3. In **`packages/dfa-v6-comp-timeperiod/package.json`**, ensure list-view uses the local path:

```json
"dfa-v6-comp-list-view": "file:../dfa-v6-comp-list-view"
```

4. Run **`npm install`** in the app root.

5. **Build in order** (list-view first, then time-period), e.g. from the app root:

```bash
cd packages/dfa-v6-comp-list-view && npm install && npm run build
cd ../dfa-v6-comp-timeperiod && npm install && npm run build
```

Optional root script, e.g. `"build:time-period-stack": "npm run build --prefix packages/dfa-v6-comp-list-view && npm run build --prefix packages/dfa-v6-comp-timeperiod"`.

---

## Import

```tsx
import { TimePeriodSelect, type TimePeriodItem, type TimePeriodSelectApi } from 'dfa-v6-comp-timeperiod';
import 'dfa-v6-comp-timeperiod/styles.css';
import 'dfa-v6-comp-list-view/styles.css';
```

---

## Props

| Prop | Type | Description |
|------|------|-------------|
| `baseUrl` | `string` | Reference API base (`/time-periods`) |
| `multiSelect` | `boolean` | Default `true`. `false` = single selection (radio-style list); quick-select buttons, select-all/deselect-all, and selected-items panel are hidden |
| `locale` | `string` | `Accept-Language` |
| `headers` | `Record<string, string>` | Extra headers; use `locale` for language |
| `preloadedData` | `TimePeriodItem[] \| null` | **Non-empty** array wins first: options from it, no fetch |
| `fetchOptions` | `() => Promise<TimePeriodItem[]>` | Async load (skipped if `preloadedData` non-empty) |
| `options` | `TimePeriodItem[]` | Static list when not using preloaded / fetch / reference |
| `quickSelectCounts` | `number[]` | e.g. `[5, 10, 20]` for quick buttons |
| `initialSelectedItems` / `initialSelectedIds` | | Initial selection |
| `onReady` / `onChange` | | API and selection callback |
| `loadingComponent` | `ReactNode` | Custom loading UI |
| `strings` | object | Optional i18n; see **Translation strings** |

---

## Translation strings (`strings`)

Pass partial objects; omitted keys use the English defaults below. **`summaryMany`** must include `{n}` where the count is inserted.

| Key | Default (EN) |
|-----|----------------|
| `quickSelectLabel` | Quick Select |
| `recent5` | Recent 5 |
| `recent10` | Recent 10 |
| `recent20` | Recent 20 |
| `selectAll` | Select All |
| `deselectAll` | Deselect All |
| `loadingLabel` | Loading... |
| `emptyLabel` | No time periods available. |
| `summaryNone` | No years selected |
| `summaryOne` | 1 year selected |
| `summaryMany` | `{n} years selected` |
| `summarySelectedPanelTitle` | Selected time periods |
| `close` | Close |

Quick-select button labels: counts **5**, **10**, and **20** use `recent5` / `recent10` / `recent20`. Any other value in `quickSelectCounts` is shown as `Recent ${n}` (fixed English prefix; not in `strings`).

---

## TimePeriodSelectApi

**getSelected** · **clear** · **setSelectedIds**

---

## Reference mode

**GET** `baseUrl/time-periods` — `Accept-Language` from `locale`. Cached per `baseUrl` / locale.

---

## Design tokens (global)

Load **`packages/design-tokens/tokens.css`** before time-period (and list-view) styles. The package sets **local** variables (quick-select radii, button padding, panel layout, etc.).

**From the global theme** (subset of `tokens.css` consumed here):

| Token | Role |
|-------|------|
| `--color-primary`, `--color-primary-hover` | Links, active quick-select, focus |
| `--color-on-primary` | Primary quick-select label |
| `--color-surface`, `--color-surface-muted`, `--color-surface-elevated` | Root, inactive / hover quick buttons |
| `--color-text`, `--color-text-muted` | Copy, button labels |
| `--color-border` | Dividers, quick-button borders |
| `--font-body` | UI typography |
| `--spacing-sm`, `--spacing-md` | Sections, shell padding |

---

## Example

```tsx
const apiRef = useRef<TimePeriodSelectApi | null>(null);
<TimePeriodSelect
  baseUrl={baseUrl}
  locale={locale}
  initialSelectedItems={initialSelectedItems}
  onReady={(api) => { apiRef.current = api; }}
/>
```

---

## Requirements

- React 18+
- **dfa-v6-comp-list-view** (peer)
- Node 18+ (build)
