# dfa-v6-comp-subgroup

Subgroup selector: search, select all / deselect all, list via **dfa-v6-comp-list-view** (multi-select by default). Set **`multiSelect={false}`** for a single subgroup (radio-style list, no selected-items panel). Reference mode: `baseUrl` without `fetchOptions` → **GET** `baseUrl/subgroups`, cached. Token-driven CSS.

Toolkit packages are **not published** and are **not installed via Git URL** (auth/deploy). Copy them into the app and depend with **`file:./packages/...`**. You need **both** this package and **dfa-v6-comp-list-view**.

---

## Build (Vite)

Build **dfa-v6-comp-list-view** first, then this package.

From `packages/`:

```bash
cd dfa-v6-comp-list-view
npm install
npm run build
cd ../dfa-v6-comp-subgroup
npm install
npm run build
```

Output is in **`dist/`**: `dfa-v6-comp-subgroup.js` (ES), `dfa-v6-comp-subgroup.umd.cjs`, `index.d.ts`, and `styles.css`. The host app uses this built output; it does **not** need to transpile this package.

---

## Integrating into your app

1. **Copy both packages** into your app under `packages/`:
   - `dfa-v6-comp-list-view` → `your-app/packages/dfa-v6-comp-list-view/`
   - `dfa-v6-comp-subgroup` → `your-app/packages/dfa-v6-comp-subgroup/`

2. **Add local dependencies** in the app root `package.json`:

```json
"dependencies": {
  "dfa-v6-comp-subgroup": "file:./packages/dfa-v6-comp-subgroup",
  "dfa-v6-comp-list-view": "file:./packages/dfa-v6-comp-list-view"
}
```

3. In **`packages/dfa-v6-comp-subgroup/package.json`**, ensure list-view uses the local path:

```json
"dfa-v6-comp-list-view": "file:../dfa-v6-comp-list-view"
```

4. Run **`npm install`** in the app root.

5. **Build in order** (list-view first, then subgroup), e.g. from the app root:

```bash
cd packages/dfa-v6-comp-list-view && npm install && npm run build
cd ../dfa-v6-comp-subgroup && npm install && npm run build
```

Optional root script, e.g. `"build:subgroup-stack": "npm run build --prefix packages/dfa-v6-comp-list-view && npm run build --prefix packages/dfa-v6-comp-subgroup"`.

---

## Import

```tsx
import { SubgroupSelect, type SubgroupItem, type SubgroupSelectApi } from 'dfa-v6-comp-subgroup';
import 'dfa-v6-comp-subgroup/styles.css';
import 'dfa-v6-comp-list-view/styles.css';
```

---

## Props

| Prop | Type | Description |
|------|------|-------------|
| `baseUrl` | `string` | Reference API base (`/subgroups`) |
| `multiSelect` | `boolean` | Default `true`. `false` = single selection (radio-style list; summary panel for multiple selections hidden) |
| `locale` | `string` | `Accept-Language` |
| `headers` | `Record<string, string>` | Extra headers; use `locale` for language |
| `fetchOptions` | `() => Promise<SubgroupItem[]>` | Highest priority: async load |
| `preloadedSubgroupOptions` | `SubgroupItem[]` | When **defined** (any array, including `[]`), uses it; no reference fetch |
| `options` | `SubgroupItem[]` | Static list when not using `fetchOptions`, `preloadedSubgroupOptions`, or reference mode |
| `initialSelectedItems` / `initialSelectedIds` | | Initial selection |
| `onReady` / `onChange` | | API and selection callback |
| `loadingComponent` | `ReactNode` | Custom loading UI |
| `strings` | object | Optional i18n; see **Translation strings** |

---

## Translation strings (`strings`)

Pass partial objects; omitted keys use the English defaults below. **`summaryMany`** must include `{n}` where the count is inserted.

| Key | Default (EN) |
|-----|----------------|
| `searchPlaceholder` | Search subgroups... |
| `selectAll` | Select All |
| `deselectAll` | Deselect All |
| `loadingLabel` | Loading... |
| `emptyLabel` | No subgroups match your search. |
| `summaryNone` | No subgroups selected |
| `summaryOne` | 1 subgroup selected |
| `summaryMany` | `{n} subgroups selected` |
| `summarySelectedPanelTitle` | Selected subgroups |
| `close` | Close |

---

## SubgroupSelectApi

**getSelected** · **clear** · **setSelectedIds**

---

## Reference mode

**GET** `baseUrl/subgroups` — `Accept-Language` from `locale`. Cached per key.

---

## Design tokens (global)

Load **`packages/design-tokens/tokens.css`** before subgroup (and list-view) styles. The package sets **local** variables (focus ring, control radii, panel padding, icon sizes, etc.).

**From the global theme** (subset of `tokens.css` consumed here):

| Token | Role |
|-------|------|
| `--color-primary`, `--color-primary-hover` | Actions, focus ring |
| `--color-surface` | Root, panels |
| `--color-surface-muted` | Selected-summary highlight |
| `--color-text`, `--color-text-muted` | Copy, placeholders |
| `--color-border` | Dividers |
| `--font-body` | UI typography |
| `--spacing-sm` | Layout gaps where tied to tokens |

---

## Example

```tsx
const apiRef = useRef<SubgroupSelectApi | null>(null);
<SubgroupSelect
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
