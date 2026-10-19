# DFA Toolkit Visualizer

Next.js (App Router) + Tailwind app scaffolded with **locale-based routing** (`src/app/[locale]/...`) and a demo integration of a vendor “chip search” widget.

- **Locale-prefixed pages**: `/en/...`, `/hi/...` (with auto-redirect from `/`)
- **Home**: a search entry point that mounts the vendor chip search UI
- **Visualizer (demo)**: shows what the search widget emitted (stored in `sessionStorage`)
- **Gallery / Sign In**: placeholder pages to flesh out later

### Styling (design tokens)

The app uses a **token-driven styling architecture** so themes (primary color, surfaces, text, etc.) are controlled from one place:

- **Design tokens**: [`packages/design-tokens/tokens.css`](packages/design-tokens/tokens.css) defines CSS custom properties (`--color-primary`, `--color-surface`, `--color-text`, etc.). Theme variants (`data-theme="blue"` / `data-theme="red"`) override these when set by `ThemeContext`.
- **Tailwind**: [`tailwind.config.ts`](tailwind.config.ts) maps those vars into the theme (e.g. `primary`, `surface`, `text`, `border`), so you use classes like `bg-primary`, `text-text-muted`, `border-border`.
- **Component classes**: [`src/app/globals.css`](src/app/globals.css) defines semantic components (e.g. `.btn-comp-primary`, `.app-header`) using `@apply` with token-based utilities.

Use token-based classes and globals component classes only; avoid raw Tailwind color names (e.g. `gray-*`, `slate-*`, `indigo-*`) for app chrome so changing a token updates the whole UI. See [STYLING.md](docs/STYLING.md) for details.

## Prerequisites

- **Node.js** 20.x or later (LTS recommended)
- **npm** 9+ (comes with Node)

## Setup (local development)

1. **Clone and enter the repo**
   ```bash
   git clone <repo-url>
   cd dfa-toolkit-visualizer
   ```

2. **Install dependencies** (root + all workspace packages)
   ```bash
   npm install
   ```

3. **Build workspace packages** (required before running the app)
   The app depends on local packages in `packages/` (chart, search, area, list-view, etc.). They are built with Vite and must be compiled once after install (and after changing their code).
   ```bash
   npm run build:packages
   ```

4. **Environment (optional)**
   Copy the example env file and set values if you need the API or app keyword:
   ```bash
   cp .env.example .env
   ```
   (On Windows PowerShell: `copy .env.example .env`.)  
   Edit `.env` and set:
   - `NEXT_PUBLIC_API_BASE_URL`: Core API base URL the browser/server calls.
   - `NEXT_PUBLIC_APP_BASE_ID`: Fixed app “base id” used to fetch the correct visualizer configuration/translations (shared across the DFA Visualizer apps).
   - `NEXT_PUBLIC_APP_ID`: Unique app “id” for a specific adaptation of the DFA Visualizer (used for app-specific behavior like local storage keys).
   - `NEXT_PUBLIC_API_KEY`: DFA Visualizer API key (generated when the app is registered with the API).
   - `NEXT_PUBLIC_API_SIGNATURE` + `NEXT_PUBLIC_API_SIGNING_PRIVATE_KEY`: browser signing when **proxy is off** (baked in at Docker build).
   - `API_SIGNING_PRIVATE_KEY`: same private key for **proxy on** (server signs via `/api/proxy`; K8s Secret, not `NEXT_PUBLIC_*`).
   - Backend SIGNATURE verification is independent of proxy — proxy only chooses *who* signs (browser vs Next.js server).

5. **Start the dev server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Getting started

### Local development (quick)

After setup (install + build packages once):

```bash
npm run dev
```

### Docker Container Setup (Quick Start)

**For development with hot-reload (changes reflect automatically):**

```bash
# Start in background - changes will auto-reload
docker-compose up -d

# View logs
docker-compose logs -f

# Access at http://localhost:3000
```

For new build
```bash
docker-compose down
docker-compose build --no-cache app
docker-compose up -d
```

**To stop:**
```bash
docker-compose down
```
**To build with no-cache:**
```bash
docker build --no-cache -t dfa-toolkit-app-visualizer-app .
```

The project uses a **unified Dockerfile** that works for both development and production:
- **Development mode**: Used automatically with `docker-compose` (hot-reload enabled)
- **Production mode**: Build with `docker build` using the `runner` target (optimized, multi-stage)

#### Prerequisites

- Docker installed on your system
- Docker Compose (optional, for easier management)

#### Building for Production

```bash
# Build production image (uses runner stage)
docker build --target runner -t dfa-toolkit-visualizer:prod .

# Run production container
docker run -d -p 3000:3000 --name dfa-visualizer dfa-toolkit-visualizer:prod
```

#### Building for Development (if not using docker-compose)

```bash
# Build development image (uses base stage)
docker build --target base -t dfa-toolkit-visualizer:dev .

# Run with volume mounting for hot-reload
docker run -d -p 3000:3000 \
  -v $(pwd):/app \
  -v /app/node_modules \
  -v /app/.next \
  --name dfa-visualizer-dev \
  dfa-toolkit-visualizer:dev
```

#### Development Mode with Hot-Reload (Recommended)

For development with automatic code reloading when you make changes:

```bash
# Start in background with hot-reload
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

This setup:
- ✅ Runs in the background (`-d` flag)
- ✅ Automatically reflects code changes (hot-reload)
- ✅ Mounts your source code as a volume
- ✅ Uses development mode with fast refresh

#### Production Mode with Docker Compose

For production builds, create a `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: runner  # Use runner stage for production
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

Then run:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

#### Container Management

```bash
# View running containers
docker ps

# View container logs
docker logs dfa-visualizer

# Stop the container
docker stop dfa-visualizer

# Remove the container
docker rm dfa-visualizer

# Remove the image
docker rmi dfa-toolkit-visualizer
```

#### Accessing the Application

Once the container is running, access the application at:
- **Local**: `http://localhost:3000`
- **Network**: `http://<your-ip>:3000`

#### Docker Image Details

**Unified Dockerfile** - Works for both development and production:

**Development Mode** (default with docker-compose):
- **Target Stage**: `base`
- **Base Image**: Node.js 20 Alpine (lightweight)
- **Mode**: Development with hot-reload (`npm run dev`)
- **Volume Mounting**: Source code mounted for live updates
- **Port**: 3000

**Production Mode**:
- **Target Stage**: `runner`
- **Base Image**: Node.js 20 Alpine (lightweight)
- **Build Strategy**: Multi-stage build (optimized for size)
- **Security**: Runs as non-root user (`nextjs`)
- **Port**: 3000 (configurable via `PORT` environment variable)
- **Output Mode**: Standalone (includes only necessary runtime files)
- **Command**: `node server.js` (production server)

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server (run `build:packages` first if packages changed). |
| `npm run build` | Build all workspace packages, then build the Next.js app for production. |
| `npm run build:packages` | Build all packages in `packages/` (Vite). Run after `npm install` and after editing any package. |
| `npm run start` | Start the production server (run `npm run build` first). |
| `npm run lint` | Run ESLint. |

To build a single package: `npm run build --prefix packages/<package-name>` (e.g. `packages/dfa-v6-comp-visualization`).

## Release metadata

- **Current version**: `VERSION.txt`
- **Release notes**: `CHANGELOG.md`

## Project structure

- **Root**: Next.js app (App Router), Tailwind, locale routing in `src/app/[locale]/`.
- **`packages/`**: npm workspaces; each package is built with Vite.
  - `dfa-v6-comp-visualization` – ECharts-based chart (React + engine API)
  - `dfa-v6-comp-kw-search` – keyword chip search utilities
  - `dfa-v6-comp-area`, `dfa-v6-comp-treeview`, `dfa-v6-comp-list-view`, etc. – UI components
  - `dfa-v6-comp-indicator`, `dfa-v6-comp-subgroup`, `dfa-v6-comp-login` – V6-specific components

The app depends on these packages via `workspace:*` / `file:./packages/...`. After changing any package, run `npm run build:packages` (or build that package) before running or building the app.

## Routes

- **`/`**: redirected to the “best” locale (see `middleware.ts`)
- **`/[locale]`**: home page (vendor chip search mount)
- **`/[locale]/visualizer`**: demo results page (reads `sessionStorage`)
- **`/[locale]/gallery`**: placeholder gallery page
- **`/[locale]/signin`**: placeholder sign-in page

## Locale routing

- **Routes live under** `src/app/[locale]/...` (example: `/en`, `/hi`)
- **Redirect logic**: `middleware.ts` redirects `/` to the best locale and stores it in the `NEXT_LOCALE` cookie
- **Locale config**: `src/lib/i18n/config.ts` defines `locales` + `defaultLocale`

## Search API (demo)

- **Endpoint**: `GET /api/search?q=....`
- **Behavior**:
  - Returns `[]` if `q` is shorter than 3 chars
  - Otherwise returns a filtered list of demo keywords (preserving original order)

## Vendor chip search widget

- **Source**: Search UI is provided by the workspace package `dfa-v6-comp-kw-search`; `VendorChipSearch.tsx` dynamically imports it and its styles (no static assets under `public/`).
- **Integration**: `src/components/VendorChipSearch.tsx` dynamically loads the search module and mounts it into a `div`
- **On search**:
  - Listens for `chipsearch:search`
  - Persists a one-shot handoff to `sessionStorage` key `dfa_viz_search_handoff` (full chip list; see `src/lib/visualizer/sessionAdapter.ts`). Refreshes on `/visualizer` use `dfa_visualizer_selection` instead.
  - Navigates to `/${locale}/visualizer`

## Added test CI/CD