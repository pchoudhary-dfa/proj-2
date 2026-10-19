# dfa-v6-comp-list-view

Scrollable list with single or multi select and imperative **getData** / **clearData**. Presentational: pass `items` and `selectedIds`; no built-in fetching. Used by indicator, subgroup, and time-period. Styles use CSS variables; load app design tokens for full theming.

Toolkit packages are **not published** and are **not installed via Git URL** (auth/deploy). Copy them into the app and depend with **`file:./packages/...`**. Build **`dist/`** before the host app consumes the package.

---

## Build (Vite)

From this package directory:

```bash
npm install
npm run build
```

Output is in **`dist/`**: `dfa-v6-comp-list-view.js` (ES), `dfa-v6-comp-list-view.umd.cjs`, `index.d.ts`, and `styles.css`. The host app uses this built output; it does **not** need to transpile this package.

---

## Integrating into your app

1. **Copy** this folder into your app, e.g. `your-app/packages/dfa-v6-comp-list-view/` (include `package.json`, `src/`, `vite.config.ts`, `tsconfig.json`, etc.).

2. **Add a local dependency** in the app root `package.json`:

```json
"dependencies": {
  "dfa-v6-comp-list-view": "file:./packages/dfa-v6-comp-list-view"
}
```

3. Run **`npm install`** in the app root.

4. **Build** so `dist/` exists before running or building the host app:

```bash
cd packages/dfa-v6-comp-list-view
npm install
npm run build
```

Optional root script, e.g. `"build:list-view": "npm run build --prefix packages/dfa-v6-comp-list-view"`.

---

## Import

```tsx
import { ListView, type ListViewItem, type ListViewApi } from 'dfa-v6-comp-list-view';
import 'dfa-v6-comp-list-view/styles.css';
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `ListViewItem[]` | required | `{ id, label }` rows |
| `multiSelect` | `boolean` | `true` | Checkboxes vs single radio |
| `selectedIds` | `(string \| number)[]` | `[]` | Controlled selection (syncs when the id set changes) |
| `onSelectionChange` | `(selected: ListViewItem[]) => void` | — | After toggle |
| `onReady` | `(api: ListViewApi) => void` | — | Imperative API |

`forwardRef<ListViewApi>` — `ref` matches `onReady` API.

---

## ListViewApi

- **getData()** — `{ id, label }[]` for current selection  
- **clearData()** — clears selection and calls `onSelectionChange?.([])`

---

## Design tokens (global)

Styles use **`var(--…)`** on `:root`. Load **`packages/design-tokens/tokens.css`** in the host app **before** `dfa-v6-comp-list-view/styles.css` (or define the same variables yourself). The package stylesheet adds **local** defaults (scrollbar width, checkbox size, row min-height, list font size, etc.).

**From the global theme** (subset of `tokens.css` consumed here):

| Token | Role |
|-------|------|
| `--color-primary` | Checkbox accent, row hover tint |
| `--color-text` | Row labels |
| `--color-surface-muted` | Scrollbar track |
| `--spacing-xs`, `--spacing-sm` | Row / list padding |
| `--radius-sm` | Row hover, scrollbar thumb |

---

## Example

```tsx
const ref = useRef<ListViewApi>(null);
<ListView
  ref={ref}
  items={[{ id: '1', label: 'A' }, { id: '2', label: 'B' }]}
  multiSelect
  onReady={(api) => { /* optional */ }}
/>
```

---

## Requirements

- React 18+
- Node 18+ (build)
