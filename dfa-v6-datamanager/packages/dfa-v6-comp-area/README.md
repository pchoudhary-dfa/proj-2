# dfa-v6-comp-area

Area selector: level filter, search, tree (and flat list when filtered). Uses **dfa-v6-comp-treeview** and **dfa-v6-comp-list-view**. Multi-select is the default; pass **`multiSelect={false}`** for a single area (radio-style tree/list, no selected-items panel). Reference mode: with `baseUrl` and no fetch overrides, loads `baseUrl/areas` and `baseUrl/area-levels` (lazy children on expand). Default `baseUrl` is `/api/areas`. Token-driven CSS.

Toolkit packages are **not published** and are **not installed via Git URL** (auth/deploy). Copy them into the app and depend with **`file:./packages/...`**. You need **tree-view**, **list-view**, and **area**.

---

## Build (Vite)

Build **dfa-v6-comp-treeview** and **dfa-v6-comp-list-view** first, then this package.

From `packages/` (monorepo or copied layout):

```bash
cd dfa-v6-comp-treeview
npm install
npm run build
cd ../dfa-v6-comp-list-view
npm install
npm run build
cd ../dfa-v6-comp-area
npm install
npm run build
```

Output is in **`dist/`**: `dfa-v6-comp-area.js` (ES), `dfa-v6-comp-area.umd.cjs`, `index.d.ts`, and `styles.css`. The host app uses this built output; it does **not** need to transpile this package.

---

## Integrating into your app

1. **Copy all three packages** into your app under `packages/`:
   - `dfa-v6-comp-treeview` → `your-app/packages/dfa-v6-comp-treeview/`
   - `dfa-v6-comp-list-view` → `your-app/packages/dfa-v6-comp-list-view/`
   - `dfa-v6-comp-area` → `your-app/packages/dfa-v6-comp-area/`

2. **Add local dependencies** in the app root `package.json`:

```json
"dependencies": {
  "dfa-v6-comp-area": "file:./packages/dfa-v6-comp-area",
  "dfa-v6-comp-treeview": "file:./packages/dfa-v6-comp-treeview",
  "dfa-v6-comp-list-view": "file:./packages/dfa-v6-comp-list-view"
}
```

3. In **`packages/dfa-v6-comp-area/package.json`**, point devDependencies at siblings:

```json
"dfa-v6-comp-treeview": "file:../dfa-v6-comp-treeview",
"dfa-v6-comp-list-view": "file:../dfa-v6-comp-list-view"
```

4. Run **`npm install`** in the app root.

5. **Build in order** (tree-view → list-view → area), e.g. from the app root:

```bash
cd packages/dfa-v6-comp-treeview && npm install && npm run build
cd ../dfa-v6-comp-list-view && npm install && npm run build
cd ../dfa-v6-comp-area && npm install && npm run build
```

---

## Import

```tsx
import {
  AreaSelect,
  type AreaItem,
  type AreaSelectApi,
  type PreloadedAreaItem
} from 'dfa-v6-comp-area';
import 'dfa-v6-comp-area/styles.css';
```

---

## Props

| Prop | Type | Description |
|------|------|-------------|
| `baseUrl` | `string` | Reference API base; default `/api/areas` |
| `multiSelect` | `boolean` | Default `true`. `false` = single selection; tree per-parent select-all links are omitted; selected panel hidden |
| `locale` | `string` | `Accept-Language` for fetches (falls back to `navigator.language`) |
| `headers` | `Record<string, string>` | Extra headers (e.g. auth); do not set `Accept-Language` here — use `locale` |
| `preloadedData` | `PreloadedAreaItem[] \| null` | **Non-empty** array wins first: uses flat list options from it, no `/areas` fetch |
| `allowSelectionAtLevel` | `number` | When > 0, only areas at this `ar_level` are selectable; all other levels' checkboxes are disabled. When 0 or undefined, all areas are selectable (default). Works in reference mode |
| `initialSelectedItems` / `initialSelectedIds` | `AreaItem[]` / ids | Initial selection |
| `onReady` | `(api: AreaSelectApi) => void` | Imperative API |
| `onChange` | `(items: AreaItem[]) => void` | Selection changes |
| `loadingComponent` | `ReactNode` | Replaces default text loading state |
| `fetchRoots` / `loadChildren` / `fetchFlat` | functions | Override reference URLs |
| `levelOptions` | `{ value, label }[]` | Level dropdown; first option `value: ""` = all levels |
| `strings` | object | Optional i18n; see **Translation strings** |

---

### Preloaded data mode

- Pass `preloadedData` when areas are already available in the page context (e.g. workflow-based filtered areas).
- In preloaded mode, UI runs in **flat list mode** (tree expand/collapse actions are hidden), with search + level filter enabled.
- Level labels are resolved from:
  1. `levelOptions` prop (if provided), else
  2. `baseUrl/area-levels` (for localized `al_name` labels), else
  3. fallback labels like `Level {n}`.
- `preloadedData` format:

```ts
type PreloadedAreaItem = {
  ar_nid: number;
  ar_parent_nid: number | null;
  ar_id: string;
  ar_name: string;
  ar_gid?: string;
  ar_level: number;
  ar_short_name?: string | null;
  ar_block_nids?: string;
  ar_map?: string;
  ar_is_global?: boolean;
  ar_has_data?: boolean;
};
```

---

### Level-restricted selection (`allowSelectionAtLevel`)

- Pass `allowSelectionAtLevel={N}` (a positive integer) to restrict selection to areas at `ar_level === N`.
- The tree still renders all levels (expand/collapse works normally), but checkboxes for non-target levels are **disabled** — the user cannot check or uncheck them.
- `Select All` / `Deselect All` actions skip disabled rows.
- When `allowSelectionAtLevel` is `0` or omitted, all areas are selectable (default behaviour).
- This prop works in **reference mode** (when the component loads areas from `baseUrl` without `fetchRoots`/`loadChildren` overrides).

```tsx
<AreaSelect
  baseUrl={baseUrl}
  locale={locale}
  allowSelectionAtLevel={2}   // only level-2 areas are selectable
  onReady={(api) => { apiRef.current = api; }}
/>
```

---

### Tree selection (All Levels)

- When **`multiSelect`** is **`false`**, global and per-parent **Select All** / **Deselect All** are not used; selection is a single row at a time.
- Global **Select All** / **Deselect All** apply only to **currently visible** tree rows (expanded branches). Collapsed subtrees are not affected, so expanding a node after Select All does not auto-select newly revealed children.
- Under each expanded node, the same actions appear once for **direct children only** (same styling as the global links), using the same `strings.selectAll` and `strings.deselectAll` labels (multi-select only).
- In flat list mode (level filter or search), per-parent row actions are not used; global actions apply to the visible flat list rows only.
- Rows show **area id** (`ar_id` / `TreeNode.id`) in muted text **before** the area **name** (`TreeNode.label`) so the name stays visually primary; selection and `getSelected()` still use `id` and `label` as before.

---

## Translation strings (`strings`)

Pass partial objects; omitted keys use the English defaults below. **`summaryMany`** must include `{n}` where the count is inserted.

| Key | Default (EN) |
|-----|----------------|
| `filterByLevel` | Filter by Level |
| `searchPlaceholder` | Search areas... |
| `expandAll` | Expand All |
| `collapseAll` | Collapse All |
| `selectAll` | Select All |
| `deselectAll` | Deselect All |
| `emptyLabel` | No areas to display. |
| `loadingLabel` | Loading... |
| `summaryNone` | No areas selected |
| `summaryOne` | 1 area selected |
| `summaryMany` | `{n} areas selected` |
| `summarySelectedPanelTitle` | Selected areas |
| `close` | Close |

---

## AreaSelectApi

**getSelected** · **clear** · **setSelectedIds** · **expandAll** · **collapseAll** · **selectAll** · **deselectAll**

---

## Reference mode

- **GET** `baseUrl/areas?parent=root|{id}&level=&search=`  
- **GET** `baseUrl/area-levels`  

`Accept-Language` from `locale`. Cached per `baseUrl` / locale for roots.

---

## Design tokens (global)

Load **`packages/design-tokens/tokens.css`** before `dfa-v6-comp-area/styles.css`. The package sets **local** variables (control radii, panel padding, icon sizes, border-input fallback, overlay hover tint, etc.).

**From the global theme** (subset of `tokens.css` consumed here):

| Token | Role |
|-------|------|
| `--color-primary`, `--color-primary-hover` | Focus, links, actions |
| `--color-surface` | Panels, inputs, modals |
| `--color-surface-muted` | Selected-summary highlight |
| `--color-text`, `--color-text-muted` | Copy, placeholders, icons |
| `--color-border` | Dividers |
| `--font-body` | UI typography |
| `--spacing-xs`, `--spacing-sm` | Gaps (where referenced) |

---

## Example

```tsx
const apiRef = useRef<AreaSelectApi | null>(null);
<AreaSelect
  baseUrl={baseUrl}
  locale={locale}
  initialSelectedItems={initialSelectedItems}
  onReady={(api) => { apiRef.current = api; }}
/>
```

---
## Requirements

- React 18+
- **dfa-v6-comp-treeview**, **dfa-v6-comp-list-view** (peers; build before this package)
- Node 18+ (build)
