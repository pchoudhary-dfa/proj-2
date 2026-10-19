# DFA v6 Styleguide

Shared design tokens, component CSS, and Tailwind preset for DFA v6 products (Datamanager, Visualizer, etc.).

## Contents

| File | Purpose |
|------|---------|
| `tokens.css` | CSS custom properties on `:root` |
| `globals.css` | Tokens + Tailwind layers + component classes |
| `tailwind.config.ts` | Tailwind theme preset (colors, spacing, typography mapped to tokens) |
| `postcss.config.mjs` | PostCSS pipeline (`tailwindcss` + `autoprefixer`) — reference copy; products use their own at the repo root |
| `package.json` | npm package `@dfa-v6/styleguide` |

## Use in a product

1. Copy this folder into the product repo as `packages/dfa-v6-styleguide/` (same pattern as other `dfa-v6-comp-*` packages).
2. Ensure `"workspaces": ["packages/*"]` in the product root `package.json`.
3. Add `"@dfa-v6/styleguide"` to `transpilePackages` in `next.config.ts`.
4. Import in root `layout.tsx`:

```tsx
import "@dfa-v6/styleguide/globals.css";
```

5. Use the Tailwind preset in the product `tailwind.config.ts`:

```ts
import styleguidePreset from "@dfa-v6/styleguide/tailwind-preset";

export default {
  presets: [styleguidePreset],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  plugins: [],
};
```

Products no longer need `packages/design-tokens/` or a local copy of `globals.css`.

Each product keeps a root `postcss.config.mjs` (same as this repo's file). Next.js uses that when processing `@dfa-v6/styleguide/globals.css` — the package copy is not picked up automatically.

## Product-specific tokens

If a product needs different brand colors or layout sizes, add a small `product-tokens.css` in the app and import it **after** the styleguide:

```tsx
import "@dfa-v6/styleguide/globals.css";
import "./product-tokens.css";
```

```css
:root {
  --color-primary: #FF3366;
  --height-header: 72px;
}
```

Runtime flavor colors (`FLAVOR_COLOR`) continue to override tokens via JavaScript on `<html>`.

## Updating products

When this repo changes, copy the updated folder into each product's `packages/dfa-v6-styleguide/` and run `npm install`.

## Conventions

- Use generic BEM class names — no `dm-` or `viz-` prefixes (e.g. `app-header`, `btn-comp-primary`, `card`).
- Component classes live in `globals.css` under `@layer components`.
- Header variants: `app-header--brand` (Datamanager), `app-header--surface` (Visualizer).
