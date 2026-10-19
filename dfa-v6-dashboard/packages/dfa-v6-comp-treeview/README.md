# dfa-v6-comp-treeview

Hierarchical tree with single or multi select, expand/collapse, lazy children, and imperative **getData** / **clearData** / **expandAll** / **collapseAll** / **selectAll** / **deselectAll**. **Presentational:** pass `roots` and `loadChildren` (or `flatItems` for a flat list). Per-parent **Select All** / **Deselect All** for direct children (tree + multi-select). **ID before label** option for displaying IDs in muted text before labels. Optional **count badges**, **checkbox-less highlighted selection**, and **uniform row icon**. Used by area select. Token-driven CSS when the host loads design tokens.

Toolkit packages are **not published** and are **not installed via Git URL** (auth/deploy). Copy them into the app and depend with **`file:./packages/...`**. Build **`dist/`** before the host app consumes the package.

---

## Build (Vite)

From this package directory:

```bash
npm install
npm run build
```

Output is in **`dist/`**: `dfa-v6-comp-treeview.js` (ES), `dfa-v6-comp-treeview.umd.cjs`, `index.d.ts`, and `styles.css`. The host app uses this built output; it does **not** need to transpile this package.

---

## Integrating into your app

1. **Copy** this folder into your app, e.g. `your-app/packages/dfa-v6-comp-treeview/`.

2. **Add a local dependency** in the app root `package.json`:

```json
"dependencies": {
  "dfa-v6-comp-treeview": "file:./packages/dfa-v6-comp-treeview"
}
```

3. Run **`npm install`** in the app root.

4. **Build** so `dist/` exists:

```bash
cd packages/dfa-v6-comp-treeview
npm install
npm run build
```

Optional root script, e.g. `"build:tree-view": "npm run build --prefix packages/dfa-v6-comp-treeview"`.

---

## Import

```tsx
import { TreeView, type TreeNode, type TreeViewApi } from 'dfa-v6-comp-treeview';
import 'dfa-v6-comp-treeview/styles.css';
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `roots` | `TreeNode[]` | required | Top-level nodes (use `[]` if only `flatItems` is used) |
| `loadChildren` | `(parentId: string) => Promise<TreeNode[]>` | — | Lazy load on expand; results cached |
| `flatItems` | `TreeNode[]` | — | Flat list mode; shows `path` as secondary line when set |
| `multiSelect` | `boolean` | `true` | Checkboxes vs radio |
| `selectedIds` | `(string \| number)[]` | `[]` | Controlled selection |
| `disabledIds` | `(string \| number)[]` | `[]` | IDs rendered as disabled checkboxes/radios; visible but not user-selectable |
| `onSelectionChange` | `(selected: TreeNode[]) => void` | — | After toggle |
| `onReady` | `(api: TreeViewApi) => void` | — | Imperative API |
| `childActionLabels` | `{ selectAll: string; deselectAll: string }` | `"Select All"` / `"Deselect All"` | Labels for per-parent actions under expanded nodes (tree + multi-select only); typically passed the same strings as global actions |
| `showIdAfterLabel` | `boolean` | `false` | When `true`, shows `id` in muted text after the primary `label` when they differ (e.g. area name+(`ar_id`)). If `id` and `label` are the same, only the primary label line is shown. |
| `enableCount` | `boolean` | `false` | When `true`, renders `node.count` as a muted badge on the right of each row. Requires `count` to be populated on `TreeNode` objects. No visual change when `false`. |
| `disableCheckbox` | `boolean` | `false` | When `true`, hides the checkbox/radio entirely. Selected rows are highlighted instead (primary color tint on the content area; chevron highlight is kept independent). Selection behavior and `multiSelect` still apply. |
| `icon` | `React.ReactNode` | — | A single icon element rendered before the label on **every row at every depth level**. Pass any React node (SVG, image, etc.). When omitted, no icon space is allocated. |

**TreeNode:** `{ id: string; label: string; type?: string; hasChildren?: boolean; path?: string; count?: number }`

> `count` is only displayed when `enableCount` is `true` on the `TreeView` component. It does not affect anything when `enableCount` is omitted.

### New opt-in props (`enableCount`, `disableCheckbox`, `icon`)

All three props default to off and are fully backward-compatible — existing usages with none of them set are unaffected.

**`enableCount`**
- Renders `node.count` as a small muted badge on the right edge of each row.
- Supply `count` on the `TreeNode` objects you pass (it is optional on the type; rows without it show nothing).
- Works in both tree mode and flat list mode, with any `multiSelect` value.

**`disableCheckbox`**
- Removes the checkbox (or radio) input from every row.
- When a row is selected it receives a primary-color tint highlight on the content area only — the chevron is excluded so it retains its own independent hover behavior.
- Clicking anywhere on the content area (label, icon, count, type) toggles selection. Clicking the chevron still expands/collapses the node.
- `multiSelect` continues to control single vs multi selection. `disabledIds` continues to prevent toggle on those rows.
- The `selectAll` / `deselectAll` imperative API and per-parent child actions still work normally.

**`icon`**
- Accepts any React node (`<svg>`, `<img>`, a component, etc.).
- Rendered before the label on **every** row at **every** depth — roots, children, grandchildren all receive the same icon.
- No icon placeholder is added when the prop is omitted; the layout is identical to the original.

---

### Selection behavior (tree mode)

- **selectAll()** (imperative API and host-driven equivalents) adds **every currently visible** node to the selection (walks expanded branches only). Selection for nodes under collapsed parents is unchanged.
- **deselectAll()** removes only **currently visible** nodes from the selection; IDs that are not visible remain selected.
- Under each expanded parent with loaded children, **Select All** / **Deselect All** links select or clear **direct children only** for that parent.
- Per-parent actions are not shown in flat list mode or when `multiSelect` is `false`.

### Disabled rows (`disabledIds`)

- Pass `disabledIds` to keep rows visible in tree/flat list but prevent user toggle.
- Disabled rows render disabled checkbox/radio controls and muted row styling.
- `selectAll()`, `deselectAll()`, and per-parent child select/deselect actions skip disabled IDs.

Empty `roots` or `flatItems` shows a short empty state.

---

## TreeViewApi

- **getData()** — selected `TreeNode[]`  
- **clearData()** — clear selection  
- **expandAll()** — loads and expands (tree mode, when `loadChildren` set)  
- **collapseAll()** / **selectAll()** / **deselectAll()**
- **selectChildrenOf(parentId)** — select all loaded direct children of a parent (no-op if children are not cached)
- **deselectChildrenOf(parentId)** — deselect those direct children only

---

## Design tokens (global)

Load **`packages/design-tokens/tokens.css`** before `dfa-v6-comp-treeview/styles.css`. The package adds **local** defaults (chevron sizes, type pill colors, scrollbar, row spacing, etc.).

**From the global theme** (subset of `tokens.css` consumed here):

| Token | Role |
|-------|------|
| `--color-primary` | Row/chevron hover mixes, checkbox accent |
| `--color-surface` | Root background |
| `--color-surface-muted` | Scrollbar track |
| `--color-text`, `--color-text-muted` | Labels, path, type, empty state |
| `--font-body` | Root typography |
| `--spacing-sm` | Row gap / padding |
| `--radius-sm` | Scrollbar thumb |

---

## Requirements

- React 18+
- Node 18+ (build)
