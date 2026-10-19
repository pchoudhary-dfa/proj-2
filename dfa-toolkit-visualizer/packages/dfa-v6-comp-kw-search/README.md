# dfa-v6-comp-kw-search

Chip search with type-ahead: **createChipSearch(mountEl, options)**. Suggestions from **GET** `baseUrl/search`. Vanilla DOM (no React). `locale` sets `Accept-Language` (merged over optional `headers`). Vite build.

Toolkit packages are **not published** and are **not installed via Git URL** (auth/deploy). Copy this package into the app and depend with **`file:./packages/...`**. Build **`dist/`** before use.

---

## Build (Vite)

From this package directory:

```bash
npm install
npm run build
```

Output is in **`dist/`**: `index.mjs` (ES), `index.umd.js`, `index.d.ts`, and `styles.css`. Styles are also exposed as **`dfa-v6-comp-kw-search/style.css`**. The host app uses this built output; it does **not** need to transpile this package.

---

## Integrating into your app

1. **Copy** this folder into your app, e.g. `your-app/packages/dfa-v6-comp-kw-search/`.

2. **Add a local dependency** in the app root `package.json`:

```json
"dependencies": {
  "dfa-v6-comp-kw-search": "file:./packages/dfa-v6-comp-kw-search"
}
```

3. Run **`npm install`** in the app root.

4. **Build** so `dist/` exists:

```bash
cd packages/dfa-v6-comp-kw-search
npm install
npm run build
```

Optional root script, e.g. `"build:search": "npm run build --prefix packages/dfa-v6-comp-kw-search"`.

---

## Import

```ts
import { createChipSearch } from 'dfa-v6-comp-kw-search';
import type { ChipSearchOptions, ChipSearchStyle, ChipSearchInstance, Keyword } from 'dfa-v6-comp-kw-search';
import 'dfa-v6-comp-kw-search/style.css';
```

---

## Options (ChipSearchOptions)

| Option | Type | Description |
|--------|------|-------------|
| `baseUrl` | `string` | **Required.** Suggestions: `baseUrl/search` |
| `locale` | `string` | `Accept-Language` |
| `headers` | `Record<string, string>` | e.g. auth; use `locale` for language |
| `strings` | `ChipSearchStrings` | Optional UI copy; see **Translation strings** |
| `minChars` | `number` | Default 3 |
| `debounceMs` | `number` | Default 250 |
| `preLoadedData` | `string` | JSON string of initial chips |
| `payloadPreset` | `"dfa"` | Built-in payload shape |
| `searchBtnCallback` / `callback` / `onSearch` / `onChange` | `(detail: { chips, payload }) => void` | Apply / change hooks |
| `requireIndicatorForSearch` | `boolean` | Search button needs an INDICATOR chip |
| `enabledSearchbtn` / `enabledClearAll` | `boolean` | Toggle controls |
| `mapChipsToPayload` / `formatKeywordType` | functions | Custom mapping / labels |
| `fetchOptions` | `RequestInit` | Passed to fetch |
| `style` | `ChipSearchStyle` | `height`, `chipBehavior` (`shrink` \| `scroll`), chip CSS vars |

**ChipSearchStyle** maps `bgColor`, `textColor`, `borderColor`, `crossBgColor` to `--sc-*` variables. **`ChipSearchChipStyle`** is a deprecated alias.

---

## Translation strings (`options.strings`)

Type: **`ChipSearchStrings`**. All keys optional; omitted keys use the package defaults below.

| Key | Default (EN) |
|-----|----------------|
| `placeholder` | Search data e.g. GDP, Population Size, India, total, 2022-2025 etc. |
| `searchBtnLabel` | Search |
| `searchLabel` | — (optional alias: used as button text if `searchBtnLabel` is not set) |
| `clearAllLabel` | Clear All |
| `noRecordLabel` | No results |
| `emptyLabel` | — (optional; used if `noRecordLabel` is unset for the same UI slot) |
| `loadingLabel` | Loading... |
| `searchBtnDisabledTooltip` | Please select at least one indicator |

Button text uses `searchBtnLabel` or, if missing, `searchLabel` or the `searchBtnLabel` default.

---

## ChipSearchInstance

**destroy** · **getState** (`{ chips, currentQuery }`) · **setChips** · **clear** · **focus**

---

## Suggestions API

**GET** `baseUrl/search?q=…` with `Accept-Language`. Body: `{ data }`, `{ results }`, or array → `{ keywordId, keywordType, displayText }`.

---

## Design tokens (global)

Load **`packages/design-tokens/tokens.css`** before `dfa-v6-comp-kw-search/style.css`. The stylesheet defines **component-scoped** `--sc-*` variables (shell, chips, dropdown shadow, etc.); chip colors default through **`--color-primary`** / **`--color-on-primary`**.

**From the global theme** (subset of `tokens.css` consumed here):

| Token | Role |
|-------|------|
| `--color-primary`, `--color-on-primary` | Chips, badges, primary button, focus ring mix |
| `--color-surface` | Dropdown / empty rows (via `--sc-dropdown-bg`) |
| `--color-text`, `--color-text-muted` | Input, suggestions, icons |
| `--color-border` | Shell, dropdowns, secondary buttons |
| `--font-body` | Root typography |
| `--spacing-sm`, `--spacing-md` | Shell padding, dropdown padding |

Optional: override chip look with **`options.style`** (`bgColor`, `textColor`, …) mapping to `--sc-*` on the root.

---

## Example

```ts
const instance = createChipSearch(mountEl, {
  baseUrl: '/api/options',
  locale: 'en',
  strings: { placeholder: 'Search...', searchBtnLabel: 'Search', clearAllLabel: 'Clear all' },
  payloadPreset: 'dfa',
  searchBtnCallback: ({ chips, payload }) => {},
});
instance.destroy();
```

---

## Requirements

- DOM-capable host (no React)
- Node 18+ (build)
