# Engineering & Leadership Brief — Pulkit Choudhary

> **Purpose:** This document is designed for an AI resume builder to extract technical depth, system-design maturity, leadership signals, and production ownership evidence. It covers two interconnected production systems.

---

## Executive Summary

**Role:** Product Lead & Full-Stack Engineer (Backend-heavy)  
**Scope:** Sole product owner of the **DFA Visualizer** (Next.js 15 + React 19 analytics frontend); major contributor to the **DFA Toolkit API Core** (FastAPI multi-tenant analytics backend) — specifically SSO/auth, search engine, and dashboard APIs.  
**Team size influenced:** 8–10 engineers across backend, frontend, and DevOps.  
**Production tenants:** Multi-country deployments (Demo, Datanett, Guinea, Sisomali) on Oracle Cloud with Kubernetes.

---

## 1. Systems Owned & Built

### 1.1 DFA Toolkit Visualizer (Product Lead — Full Ownership)

| Dimension | Detail |
|-----------|--------|
| Stack | Next.js 15 App Router, React 19, ECharts 5.5, Tailwind 3.4, PWA |
| Architecture | npm workspaces monorepo (10 Vite-built packages + Next.js app) |
| Deployments | Multi-adaptation Docker builds → OCI Kubernetes (per-country overlays via Kustomize) |
| Commit count | **240 commits** (2nd highest contributor; #1 on architectural/system-level changes) |
| Lines of influence | ~50k+ LOC across app + 10 workspace packages |

**What I built / own end-to-end:**

- **Visualization engine architecture** — 3-layer separation: framework-agnostic ECharts engine → data transform → React adapter. Supports 12+ chart types (line, bar, area, pie, scatter, heatmap, treemap, radar, pyramid, sunburst, dot-matrix, map choropleth).
- **BFF (Backend-for-Frontend) proxy** — Server-side API signing with Ed25519, httpOnly cookie auth, single catch-all proxy route that hides credentials from the browser.
- **SSO integration** — Full OIDC flow on frontend: provider discovery, code exchange via BFF, session management with httpOnly cookies, session-expired detection, cross-app SLO, auto-redirect prevention logic.
- **Search system (frontend)** — Built the chip-based keyword search widget (vanilla JS package consumed by React via imperative mount), landing-to-visualizer handoff via sessionStorage, in-visualizer header search sync.
- **Ed25519 request signing** — Implemented `window.fetch` global interceptor for direct-mode signing; proxy-mode server-side signing. Dual-mode architecture allows zero-JS-exposure of keys in production.
- **Multi-tenant deployment pipeline** — Dockerfile.oci (3-stage), `build_spec.yaml` for OCI DevOps CI, per-adaptation Kustomize overlays with env baking.
- **State management design** — Layered Context (Core → Auth → SignedFetch → VisualizerState) + sessionStorage persistence with drain-once handoff pattern to prevent re-processing on refresh.
- **Export pipeline** — PNG/SVG (ECharts native), CSV, JSON, XLSX, PDF/JPG metadata export with composite image builders.
- **Accessibility system** — Font scaling (50–180%) that works across lazy-loaded package CSS via token capture/re-injection, high contrast, color invert, RTL support.
- **PWA with runtime caching** — Versioned caches from `VERSION.txt`, stale-while-revalidate for API, cache-first for assets.
- **Embeddable chart bundle** — Standalone IIFE build (`dfa-viz-embed.min.js`) for third-party sites without loading the Next.js app.
- **Shared design system** — Integrated `dfa-v6-styleguide` as workspace package with Tailwind preset, ensuring visual consistency across Visualizer, Datamanager, and Dashboard apps.

### 1.2 DFA Toolkit API Core (Major Contributor — Backend)

| Dimension | Detail |
|-----------|--------|
| Stack | FastAPI 0.104, SQLAlchemy 2.0, MySQL 5.7+, Alembic, Pydantic 2.5, Redis, Celery |
| Architecture | Multi-tenant (per-warehouse isolated MySQL DBs) + shared core DB |
| Commit count | **175 commits** (3rd contributor) |
| Key areas owned | SSO v2 system, Search engine, Dashboard APIs, Deployment fixes |

**What I built / own:**

- **SSO v2 (OIDC) system** — End-to-end: `dfa_sso_service` package (vendored), `SqlAlchemySsoStorage`, `DfaUserProvider` for auto-provisioning, multi-app federated SSO (`SSO_FEDERATED_APPS`), back-channel logout for IdP-initiated session revocation, session status endpoint for cross-app SLO detection.
- **Trigram-based search engine** — Designed and built multi-phase search: Phase 0 (exact canonical) → Phase 1 (trigram overlap with scored ranking) → Phase 2 (synonym expansion). Index builder with batch processing, incremental updater, dialect-aware upserts (MySQL/PostgreSQL). Scoring strategy pattern with safety bounds (MAX_TRIGRAMS=30, MAX_CANDIDATES=500).
- **Search index sync** — Background job integration (`sync_search_index`), conflict detection for concurrent syncs, status polling API, Redis caching on search results.
- **Dashboard visualization APIs** — CRUD for dashboard visualizations, publish/copy workflows, user-area enforcement, role-based list filtering, media file management.
- **Production deployment fixes** — Reduced gunicorn worker count to fix OOM, fixed JWT secret key blocking, httpx timeout fixes, CORS additions for new frontends.

---

## 2. System Design & Architecture Decisions

### 2.1 Multi-Tenant Data Isolation

**Problem:** Analytics platform serving multiple countries, each with their own datasets, languages, and compliance requirements.

**Solution I work within / extend:**
- Per-warehouse MySQL databases (horizontal tenant isolation)
- Connection pool per tenant with credential fingerprinting (SHA-256) — pool invalidated on credential change
- Redis credential cache (300s TTL) for connection metadata
- Locale-aware ORM via metaclass pattern: `Indicator("en")` → dynamic SQLAlchemy class for `ut_indicator_en`

**My contribution:** Dashboard APIs that correctly scope queries across this architecture, SSO that provisions users into the correct warehouse/role matrix.

### 2.2 Authentication Architecture (Designed & Built)

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                       │
├──────────────┬──────────────────────────────────────────┤
│  Proxy Mode  │  Direct Mode                              │
│  (Production)│  (Dev/Testing)                            │
│              │                                           │
│  BFF signs   │  window.fetch interceptor                 │
│  requests    │  applies Ed25519 signature                │
│  server-side │  + Bearer token                           │
└──────┬───────┴────────────┬─────────────────────────────┘
       │                    │
       ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│              API GATEWAY (FastAPI Middleware)             │
├─────────────────────────────────────────────────────────┤
│  1. CORS                                                 │
│  2. AccessControlMiddleware                              │
│     ├─ PUBLIC (pass-through)                             │
│     ├─ APP_CLIENT (signature verification)               │
│     ├─ AUTHENTICATED (+ JWT validation)                  │
│     └─ PERMISSION (+ IAM role check against DB)          │
│  3. RequestContextMiddleware (ContextVars for logging)    │
│  4. SessionMiddleware (OIDC state for SSO)               │
└─────────────────────────────────────────────────────────┘
```

**Production hardening I implemented:**
- Refresh token rotation with server-side storage
- PoW CAPTCHA on auth endpoints (prevents credential stuffing)
- Back-channel logout endpoint for IdP-initiated revocation
- Session status endpoint for cross-app single-logout detection
- Access token lifetime reduced to 10 minutes; refresh via httpOnly cookie
- `returnUrl` validation to prevent open redirect attacks

### 2.3 Search Engine Design (Built from Scratch)

**Problem:** Users need fast, typo-tolerant search across indicators, areas, subgroups, and time periods — across multiple languages — without external infrastructure (no Elasticsearch/vector DB).

**Solution (designed & implemented):**

```
┌── INDEX BUILD (Background Job) ──────────────────────────┐
│                                                           │
│  UT Source Tables → Normalize → Synonyms → Trigrams      │
│  (ut_indicator_en,  (lowercase,  (abbreviations,  (3-char│
│   ut_area_ar, ...)   strip punct)  aliases)        ngrams)│
│                                                           │
│  Stored in: search_keywords, search_keyword_synonym,      │
│             search_keyword_ngram (per-DW database)         │
└───────────────────────────────────────────────────────────┘

┌── QUERY (Real-time) ─────────────────────────────────────┐
│                                                           │
│  User Query → Normalize → Generate Trigrams               │
│                                                           │
│  Phase 0: Exact canonical match (score: 120)              │
│  Phase 1: Trigram IN-clause → GROUP BY → HAVING count≥2  │
│           (score: raw trigram overlap count)               │
│  Phase 2: Synonym expansion (score: 100-110)              │
│                                                           │
│  → Merge + Deduplicate + Sort by score → Top-N results    │
└───────────────────────────────────────────────────────────┘
```

**Engineering decisions:**
- SQLAlchemy Core (not ORM) for read queries — measurable performance gain on trigram joins
- Safety bounds prevent query explosion: max 30 trigrams per query, max 500 candidates
- Dialect-aware upsert writers (MySQL `ON DUPLICATE KEY` vs PostgreSQL `ON CONFLICT`)
- Batch index building (1000 rows/batch) per locale to manage memory
- Redis result caching when available; graceful degradation without Redis

### 2.4 Background Job System

**Problem:** Long-running operations (search index rebuild, compute engine, dataset imports) must not block API responses.

**Architecture (I work within and extend):**
- Dual-mode: `DB` mode (in-process poller with `SELECT ... FOR UPDATE SKIP LOCKED`) or `CELERY` mode
- Atomic claiming prevents race conditions across workers
- Stale lease reclaim for stuck jobs
- Retry with backoff (max 3 attempts)
- Worker identity for distributed tracing

**My usage:** Wired search index sync as a background job with conflict detection (prevents duplicate concurrent syncs), status polling API exposed to frontend.

### 2.5 Frontend Architecture (Designed)

```
┌── Monorepo (npm workspaces) ─────────────────────────────┐
│                                                           │
│  packages/                                                │
│  ├── dfa-v6-comp-visualization (ECharts engine, IIFE)     │
│  ├── dfa-v6-comp-kw-search (vanilla JS chip search)       │
│  ├── dfa-v6-comp-{indicator,area,subgroup,timeperiod}     │
│  ├── dfa-v6-comp-login (auth UI)                          │
│  └── dfa-v6-styleguide (design tokens, globals.css)       │
│                                                           │
│  src/ (Next.js App Router)                                │
│  ├── app/[locale]/ (locale-first routing)                 │
│  ├── app/api/ (BFF: proxy, auth, viz-state, health)       │
│  ├── lib/ (API clients, auth, visualizer logic, i18n)     │
│  ├── contexts/ (Core → Auth → SignedFetch → Visualizer)   │
│  └── components/ (feature-grouped)                        │
└───────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- **Packages are framework-agnostic** — chart engine and search can run outside React (embeds, SSR-safe)
- **Vite for packages, Next.js for app** — fast package builds, optimized app bundling
- **Dynamic imports** prevent ECharts (800KB) from blocking initial page load
- **Session handoff pattern** — search results persisted to sessionStorage with drain-once consumption, preventing re-fetch on page refresh
- **Repository pattern** for gallery — `ApiGalleryRepository` (production) + `LocalGalleryRepository` (offline/testing) behind common interface

---

## 3. Production & Operations Evidence

### 3.1 Deployment Infrastructure I Built/Maintain

| Component | Technology | My Role |
|-----------|-----------|---------|
| CI/CD Pipeline | OCI DevOps `build_spec.yaml` | Designed multi-adaptation build pipeline |
| Container | Dockerfile.oci (3-stage, non-root) | Built and optimized (reduced CPU, caching layers) |
| Orchestration | Kubernetes (base + Kustomize overlays) | Per-country overlay configs |
| Secrets | K8s secrets for signing keys | Architected proxy vs direct key exposure model |
| Monitoring | Structured logging via `log_event()` | Backend integration |

### 3.2 Production Incidents & Fixes (from git history)

| Issue | Root Cause | My Fix | Lesson |
|-------|-----------|--------|--------|
| Deployment crash (OOM) | Gunicorn worker count too high for container memory | Reduced worker count | Right-size process pool to container limits |
| Server blocked on startup | Default JWT secret key string triggered safety check | Fixed config validation order | Fail-fast with clear error messages |
| API signing failures on PWA | `API_ORIGIN` mismatch for service worker requests | Fixed env resolution for PWA context | PWA fetch has different origin semantics |
| SSO redirect loops | Session-expired logout triggered SSO auto-redirect | Added loop detection flag in session state | Stateful redirects need cycle detection |
| Sisomali deployment 404s | API base URL wrong in adaptation config | Fixed env-config.yaml for adaptation | Multi-tenant configs need per-env validation |
| CORS failures | New frontend domain not in allowed origins | Added CORS origin entries | Maintain origin registry with deployment |
| httpx timeouts on SSO | Default timeout too low for IdP token exchange | Increased httpx timeout | External service calls need generous timeouts |
| Docker build cache misses | Dependency install layer invalidated by code changes | Refactored Dockerfile stage ordering | Optimize layer ordering for cache hits |

### 3.3 Performance Optimizations

- **Reduced Docker image size** via standalone Next.js output (no `node_modules` in production image)
- **Trigram query bounds** — capped at 30 trigrams/query, preventing O(n²) join explosion
- **Connection pool fingerprinting** — avoid creating new pools when credentials haven't changed
- **Dynamic imports** for vendor libraries — ECharts, chip search loaded only when needed
- **`replaceMerge`** on ECharts setOption — prevents stale axis state accumulation across chart type switches
- **ProcessPoolExecutor** for parallel XLSX export chunks
- **In-memory reference cache** for subgroup/time period options (avoids redundant API calls)

---

## 4. Leadership & Product Ownership Signals

### 4.1 Product Lead Responsibilities

- **Roadmap ownership** — Define feature priorities for Visualizer across sprints (sprint7, sprint9 visible in git)
- **Cross-team coordination** — Visualizer depends on API Core; I contribute to both, ensuring contract alignment
- **Design system governance** — Integrated shared styleguide (`dfa-v6-styleguide`) across 3 apps, wrote `.cursorrules` for team consistency
- **Multi-country deployment strategy** — Designed the adaptation overlay pattern (one codebase → multiple branded deployments)
- **Documentation standards** — CLAUDE.md, .cursorrules, README.md files for package APIs and architecture context

### 4.2 Technical Leadership Evidence

| Signal | Evidence |
|--------|----------|
| Architecture decisions | Designed 3-layer chart engine, BFF auth pattern, session handoff, dual signing modes |
| Code standards | Authored project-wide `.cursorrules` defining component patterns, CSS conventions, accessibility requirements |
| Mentorship artifacts | Detailed README.md for each workspace package documenting props, usage, and integration patterns |
| Cross-cutting concerns | SSO spans both backend (OIDC provider, user provisioning) and frontend (callback, session, middleware) — I own both ends |
| System evolution | Refactored auth from localStorage-only → httpOnly cookies + BFF proxy (security hardening) |
| Cleanup & debt reduction | Removed deprecated SSO constants, legacy cookie management, unused translation keys |

### 4.3 Ownership Scope Comparison

```
Typical IC: Owns a feature (e.g., "add pie chart type")

What I own:
├── Full product (Visualizer) — architecture, features, deployment, operations
├── Critical backend subsystems (SSO, Search) — design through production
├── Deployment pipeline — CI/CD, Docker, Kubernetes configs
├── Design system integration — shared across 3+ apps
├── Cross-app authentication — backend OIDC + frontend session management
└── Production stability — incident response, performance tuning, monitoring
```

---

## 5. Technical Skills Demonstrated

### Backend Engineering
- **FastAPI** — middleware chains, dependency injection, lifespan events, background tasks
- **SQLAlchemy 2.0** — ORM + Core queries, dynamic model generation via metaclass, multi-DB session management
- **Database design** — Multi-tenant isolation, locale-suffixed tables, trigram indexes, IAM schema
- **Search algorithms** — Trigram-based fuzzy matching, multi-phase scoring with strategy pattern
- **Authentication** — JWT (access + refresh rotation), Ed25519 signatures, OIDC/OAuth2, PKCE, back-channel logout
- **Background processing** — DB-backed job queues with atomic claiming (`FOR UPDATE SKIP LOCKED`), Celery integration
- **Caching** — Redis with TTL, credential fingerprint invalidation, result caching with graceful degradation
- **API design** — RESTful with envelope pattern, pagination, ADAPTATION modes (internal/external field naming)
- **Database migrations** — Alembic (120+ versions managed across team)

### Frontend Engineering
- **Next.js 15** — App Router, middleware, API routes (BFF), standalone output, `transpilePackages`
- **React 19** — Context composition, `useMemo`/`useCallback` optimization, `useRef` for imperative chart control
- **ECharts** — Deep customization (12+ chart types), option builders, responsive resize, data URL export
- **Monorepo** — npm workspaces, Vite library builds, cross-package TypeScript
- **Authentication** — httpOnly cookies, token refresh interceptor, SSO code exchange, session-expired detection
- **PWA** — Service worker caching strategies, versioned cache invalidation, offline capability
- **Accessibility** — Font scaling, high contrast, RTL, ARIA labels, screen reader support
- **Internationalization** — Locale-first routing, RTL/LTR detection, dynamic translation loading

### DevOps & Infrastructure
- **Docker** — Multi-stage builds, layer caching optimization, non-root containers
- **Kubernetes** — Deployments, services, ingress, Kustomize overlays for multi-tenant
- **CI/CD** — OCI DevOps build specs, multi-adaptation parallel builds
- **Environment management** — Build-time vs runtime env handling for Next.js

### System Design Patterns
- Multi-tenant database isolation with per-tenant connection pools
- BFF (Backend-for-Frontend) for credential security
- CQRS-like separation (search index build vs query path)
- Strategy pattern for search scoring
- Repository pattern for data access abstraction
- Event-driven session management (SESSION_EXPIRED_EVENT bus)
- Atomic job claiming for distributed background processing
- Dialect-aware database operations (MySQL vs PostgreSQL)

---

## 6. Quantitative Impact

| Metric | Value |
|--------|-------|
| Total commits across both repos | **415+** |
| Pull requests (Visualizer) | Involved in **216+ PRs** (as author or significant contributor) |
| Pull requests (API Core) | Involved in **649+ PRs** |
| Workspace packages maintained | **10** (shared across org) |
| Chart types supported | **12+** (line, bar, area, pie, scatter, heatmap, treemap, radar, pyramid, sunburst, dot-matrix, map) |
| Production deployments | **4+ country adaptations** running simultaneously |
| Database tables designed/maintained | **30+ core DB** + per-locale analytics tables |
| Background job types | **12+** types in production |
| Alembic migrations managed | **120+ versions** |
| API endpoints | **60+** across auth, IAM, warehouse, search, dashboard |

---

## 7. Evolution & Growth Story (from Git History)

### Phase 1: Foundation (Early 2024)
- Built search engine from scratch (index builder + query service)
- Established API response patterns and error handling
- Set up multi-tenant database architecture

### Phase 2: Security Hardening (Mid 2024)
- Implemented Ed25519 request signing (app-client auth)
- Built SSO v1 → iterated to SSO v2 with back-channel logout
- Migrated from localStorage tokens to httpOnly cookies via BFF
- Added PoW CAPTCHA for credential stuffing prevention

### Phase 3: Scale & Polish (Late 2024 – 2025)
- Optimized analytics reports (multiple `optimize` branches)
- Background job system enhancements (search sync, compute)
- Dataset import optimization (batch upsert)
- Dashboard APIs (CRUD, permissions, publishing)

### Phase 4: Product Maturity (2025 – 2026)
- Refactored chart engine (modular option builders per type)
- Integrated shared design system across 3+ apps
- Multi-country deployment pipeline (Kustomize overlays)
- Added 6+ new chart types (sunburst, dot-matrix, treemap variants, polar line)
- Feedback points, transaction logs, review workflows
- Performance: Docker layer optimization, reduced CPU/memory

---

## 8. Problem-Solving Examples

### Problem: SSO Users Need Roles Across Multiple Apps
**Context:** Platform has separate app_keys (DM, VIZ, Dashboard). SSO users logging in once need correct permissions everywhere.  
**Solution:** Designed `SSO_FEDERATED_APPS` configuration. `DfaUserProvider` auto-provisions role assignments for all federated apps during SSO callback. Single login → full platform access with correct per-app permissions.

### Problem: Search Must Work Across Languages Without External Infrastructure
**Context:** Countries use different languages (English, Arabic, French). Can't deploy Elasticsearch per tenant.  
**Solution:** Built trigram-based search with locale-aware indexing. Each language gets its own index tables (suffix pattern matches the ORM). Synonym expansion handles abbreviations. Scoring strategy allows tuning without code changes.

### Problem: Vendor Packages Can't Use Signed Fetch
**Context:** Chip search widget (vanilla JS) makes API calls but can't access Ed25519 signing logic.  
**Solution:** In proxy mode: BFF signs server-side (widget calls `/api/proxy`). In direct mode: global `window.fetch` interceptor transparently adds signatures. Vendor code needs zero modification.

### Problem: Chart Type Switches Leave Stale Configuration
**Context:** ECharts accumulates option state. Switching bar→pie left zombie axes.  
**Solution:** Used `replaceMerge` on specific component types during setOption. Clean-slate for axes/series while preserving animation state.

### Problem: Multi-Country Deployments Need Different Branding/Config
**Context:** Same codebase serves Demo, Guinea, Sisomali, Datanett — each with different API URLs, logos, SSO providers.  
**Solution:** Designed adaptation overlay system. `build_spec.yaml` builds one Docker image per adaptation with baked `NEXT_PUBLIC_*` env vars. Kustomize overlays inject runtime secrets per cluster.

---

*This document should give an AI resume builder sufficient depth to articulate production-grade backend engineering, system design capability, full-product ownership, and technical leadership that goes far beyond individual feature work.*
