# SSO Technical Design — DataManager Platform

> Comprehensive reference for the SSO implementation across the FastAPI backend (BED) and Next.js frontend (FED). Covers architecture, sign-in/sign-out flows for all env configurations, database schema, file inventory, seeders, setup guide, and **Drupal CMS configuration** for testing SSO.

**Implementation:** SSO logic is extracted into a reusable package at `apps/shared/packages/dfa_sso_service/`. The host application (`main.py`, `apps/app_db/`) wires the package via dependency injection and owns only JWT minting, IAM permissions, and refresh token management. See [§15](#15-package-vs-application-code-boundary) for the full boundary breakdown.

**Supersedes:** `SSO_OIDC_CLIENT.md`, `SSO_ARCHITECTURE.md` (safe to delete after review).

---

## 1. Architecture Overview

Three systems participate in SSO:

| Label | System | Role |
|-------|--------|------|
| **CMS** | Drupal (or any OIDC IdP) | Identity Provider — authenticates users, issues id_tokens |
| **BED** | FastAPI (`dfa-toolkit-api-core`) | Backend — OIDC client, token issuer, user management |
| **FED** | Next.js (`dfa-v6-datamanager`) | Frontend — login UI, BFF proxy, token storage in HttpOnly cookies |

### Request Flow Topology

```
Browser ──► FED (Next.js :3000) ──► BED (FastAPI :8000) ──► CMS (Drupal :80)
  │                                        │
  │  BFF routes: /api/auth/*               │  OIDC endpoints
  │  HttpOnly cookie management            │  Token exchange, userinfo
  │                                        │
  └── Direct browser redirect ─────────────┘
       GET /auth/sso/{code}/redirect (BED)
       GET /auth/sso/{code}/callback (BED)
```

**Key design choice:** The browser redirects directly to BED for the OAuth redirect and callback legs (OIDC requires these as browser navigations). All other calls go through FED's BFF proxy layer which handles HttpOnly cookie management and request signing.

---

## 2. Environment Variables & Feature Flags

### Backend (`system_configuration` DB table)

SSO configuration lives in the `system_configuration` table under the platform-wide `app_key = DFA_CORE`, **not** in `.env`. Changes take effect within 60 seconds (in-process TTL cache) — **no restart required**. The `GET /app-config` response for every product merges the `DFA_CORE` SSO key automatically, and `PATCH /app-config` with `SSO_ENABLED` from any product's API client routes the update to `DFA_CORE`.

| Key Code | App Key | Default | Purpose |
|----------|---------|---------|---------|
| `SSO_ENABLED` | `DFA_CORE` | `false` | Platform-wide login-mode toggle (mutually exclusive). `true` = SSO-only (local login/register/reset return 403). `false` = local-only (SSO auth endpoints return error). SSO routers are **always mounted**; the check is at request time. |

Frontend callback URLs are **not** stored in `system_configuration`. They are derived at runtime from `system_application_client.origin_url` (FED, ACTIVE) for the initiating `app_key`, with path `/auth/sso/callback`. Missing `origin_url` or `app_key` returns an error — no fallback.

Seeded by `apps/app_db/data/config.json` under `DFA_CORE`.

### Backend (`.env` — deployment / seeding only)

SSO runtime toggles and callback routing use the **database**, not `.env`. These `.env` values are still required for SSO and auth to work:

| Variable | Required | Purpose |
|----------|----------|---------|
| `SECRET_KEY` | Yes | Signs the Starlette `SessionMiddleware` cookie used by authlib for OIDC `state` and PKCE. **Must stay stable** across API restarts — changing it invalidates in-flight SSO redirects and can break encrypted data derived from it. |
| `JWT_SECRET_KEY` | Yes | HMAC key for signing access JWTs (`POST /auth/login`, refresh) and refresh JWTs. Separate from `SECRET_KEY`; rotate independently only with a planned token invalidation. |
| `PASSWORD_ENCRYPTION_KEY` | Recommended | Fernet key for `client_secret_enc` and `id_token_enc` in SSO tables. When empty, derived from `SECRET_KEY`. Must match the key used when secrets were encrypted (`set_sso_provider_secret`, callback). |
| `DFA_DM_FED_ORIGIN_URL` | For local seed | Used by `seed_application_clients.py` to set `origin_url` on the DM FED row (`http://localhost:3000` default). Not read at SSO callback time. |

Generate random values (run once per environment, store in `.env` or your secrets manager):

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

If `SECRET_KEY` or `JWT_SECRET_KEY` is empty at startup, the API logs a **warning** to the terminal but still starts — set both before any SSO or JWT use in production.

### FED callback URL (`system_application_client`)

| Column | Scope | Purpose |
|--------|-------|---------|
| `origin_url` | Per FED client row (`app_type=FED`, `status=ACTIVE`) | Browser origin of the frontend (no path). API builds `{origin_url}/auth/sso/callback` after IdP login. **Required** — empty `origin_url` causes `SSO_CONFIG_ERROR`. |

Set via `seed_application_clients.py --force`, `PATCH /system-api-clients/{id}`, or SQL. On servers, use the public HTTPS origin (e.g. `https://datamanager.example.com`).

### Frontend (`dfa-v6-datamanager`)

The frontend reads `SSO_ENABLED` at **runtime** from `GET /app-config` (via `AppConfigContext`). No build-time SSO toggle is required.

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:8000` | Browser-direct SSO redirect base (BED `/auth/sso/.../redirect?app_key=...`). |
| BFF signing keys | See `docs/APP_CLIENT_AUTH.md` | `POST /api/auth/login` with `{code}` and `GET /api/auth/sso/providers` require app-client signature. |

### Login Mode Matrix

| `SSO_ENABLED` | Login Page UX | Backend Behavior |
|:-------------:|---------------|------------------|
| `false` | Username/password form only | Local login/register/reset active; SSO auth endpoints return error |
| `true` | **SSO-only** — auto-redirect (1 provider) or provider selector card (N providers) | SSO routes active; local login/register/reset return 403 |

**Exception:** Password reset (`?route=reset-password` or `?token=...`) always shows the local form regardless of mode — a user with a valid reset link can complete it even in SSO-only mode.

---

## 3. Sign-In Flows

### 3a. Local Login (SSO not involved)

```
Browser ──► FED /api/auth/login ──► BED POST /auth/login
                                         │
                                    [validate credentials]
                                    [build JWT payload]
                                    [persist refresh token hash]
                                         │
             ◄── LoginResponse ──────────┘
        [set HttpOnly cookies]
        [store user in localStorage]
        [redirect to /datawarehouse]
```

`LoginResponse` includes `auth_provider: "LOCAL"` (default for local login).

### 3b. SSO Login

```
 Browser                      FED                         BED                         CMS (IdP)
    │                          │                            │                            │
    │  1. GET /api/auth/sso/providers                       │                            │
    │──────────────────────►   │──────────────────────────► │                            │
    │  ◄── providers list ──── │  ◄── { data: [...] } ────  │                            │
    │                          │                            │                            │
    │  2. Click provider link (browser-direct to BED)       │                            │
    │─────────────────────────────────────────────────────► │                            │
    │                          │                   [generate state + PKCE]               │
    │                          │                  [store in session cookie]              │
    │  ◄── 302 to CMS /oauth2/authorize ──────────────────  │                            │
    │                          │                            │                            │
    │  3. Authenticate at CMS                               │                            │
    │──────────────────────────────────────────────────────────────────────────────────► │
    │                          │                            │                    [verify credentials]
    │  ◄── 302 to BED /auth/sso/{code}/callback?code=&state= ◄────────────────────────── │
    │                          │                            │                            │
    │  4. BED processes callback                            │                            │
    │─────────────────────────────────────────────────────► │                            │
    │                          │                   [exchange code for tokens at CMS]     │
    │                          │                   [fetch userinfo from CMS]             │
    │                          │                   [find or create iam_user]             │
    │                          │                   [create one-time login code]          │
    │                          │                   [store id_token + provider on code]   │
    │  ◄── 302 to FED /auth/sso/callback?code=ONE_TIME ──── │                            │
    │                          │                            │                            │
    │  5. FED exchanges code for DM tokens via unified login  │                            │
    │── POST /api/auth/login { code } ─────────────────────────────────────────────────►│
    │                          │                   [consume one-time code]               │
    │                          │                   [build JWT payload]                   │
    │                          │                   [persist refresh + SSO session data]  │
    │  ◄── LoginResponse (access, refresh, user, permissions) ───────────────────────────│
    │                          │                            │                            │
    │  [set HttpOnly cookies, store user in localStorage]   │                            │
    │  [redirect to /datawarehouse]                         │                            │
```

`LoginResponse` includes `auth_provider: "SSO"` (derived from the SSO exchange path, not per-user state).

### One-Time Code Bridge

BED cannot set cookies on the FED domain or expose JWTs in redirect URLs. Instead:

1. BED generates a cryptographic code (`secrets.token_urlsafe(48)`), stores SHA-256 hash in `iam_sso_login_code` with a 60-second TTL.
2. BED redirects browser to FED with `?code=...`.
3. FED exchanges the code via the unified `POST /auth/login` endpoint (with `{ "code": "..." }`) — same response shape as local login.
4. Code is single-use: replaying the URL does nothing.

The login code carries `sso_provider_id` for exchange bookkeeping only. The encrypted `id_token` is stored on `iam_sso_session` at callback time (not on the login code).

### User Resolution (find_or_create_sso_user)

On every SSO callback:

1. Look up `iam_sso_user_identity` by `(provider_code, idp_user_id/sub)`.
2. If found → return linked user, update claims snapshot.
3. If not found and `auto_provision_users = 0` → reject (403 Forbidden).
4. If auto-provision:
   - Match existing user by email (via `SsoUserProvider.find_user_by_email()`), or create new user via `SsoUserProvider.create_user()` with `password=NULL`.
   - Assign `default_role_id` via `SsoUserProvider.assign_default_role()` if configured (role's own `app_key` is used for scoping).
   - Create `iam_sso_user_identity` link row.

### Attribute Mapping

Default claim mapping (overridable via `iam_sso_identity_provider.attribute_map` JSON):

| DM Field | OIDC Claim |
|----------|------------|
| `idp_user_id` | `sub` |
| `email` | `email` |
| `first_name` | `given_name` (falls back to `name` if absent — covers Drupal) |
| `last_name` | `family_name` |
| `username` | `preferred_username` (falls back to `email`) |

---

## 4. Sign-Out Flows

### 4a. Local User Logout

When `SSO_ENABLED` is `false` (or user logged in via local login):

1. FED calls `POST /api/auth/logout` (BFF → BED `POST /auth/logout`).
2. BED revokes all refresh tokens for this user.
3. FED clears HttpOnly cookies and localStorage.
4. FED redirects to `/{locale}` (login page).

### 4b. SSO User Logout (via Unified Endpoint)

The same `POST /auth/logout` endpoint handles both local and SSO logout:

1. FED calls `POST /api/auth/logout` (BFF) — always the same endpoint regardless of login method.
2. BFF forwards to BED `POST /auth/logout` with Bearer token.
3. BED:
   - Revokes all refresh tokens (host-owned).
   - Attempts to look up the user's active `iam_sso_session` row (package-owned table).
   - If an SSO session exists: loads the linked provider, builds the IdP logout URL, deactivates all SSO sessions.
   - Returns `{ "data": { "logout_url": "..." | null } }`.
4. BFF clears HttpOnly cookies, returns `{ ok: true, logout_url }`.
5. FED clears localStorage.
6. If `logout_url` exists → `window.location.href = logout_url` (browser navigates to IdP logout).
7. If `logout_url` is `null` → FED redirects to `/{locale}` (login page).

**After IdP logout:** The user stays on the CMS/IdP site (e.g. Drupal's logged-out page). There is no automatic redirect back to DataManager.

### IdP Logout URL Resolution

BED resolves the logout URL from two columns on `iam_sso_provider`:

| Priority | Column | When to Use | Example |
|:--------:|--------|-------------|---------|
| 1 | `end_session_endpoint` | Standard OIDC IdPs (Google, Azure AD, Facebook) — populated from OIDC discovery | `https://accounts.google.com/o/oauth2/v2/auth/logout?client_id=...&id_token_hint=...` |
| 2 | `logout_uri` | Custom IdPs without OIDC logout (Drupal) — set manually by admin | `http://cms.example.org/user/logout` |

- For **standard OIDC IdPs**: `end_session_endpoint` is auto-populated via the `POST /sso-providers/{nid}/discover` admin endpoint. The logout URL includes `client_id` and `id_token_hint` (the raw `id_token` stored at login time).
- For **Drupal**: `end_session_endpoint` is `NULL` (Drupal's OAuth2 server doesn't support RP-Initiated Logout). `logout_uri` is set to the Drupal logout path. No `destination` or redirect parameters are appended — user stays on CMS.
- If **neither** is set: `logout_url` is `null` and the user stays on the DataManager login page.

### SSO Session Data Storage

SSO session context is stored in a dedicated package-owned table (`iam_sso_session`) rather than on the host's `iam_user_refresh_token`. This decouples SSO logout data from the host's token rotation logic.

| Data | Stored On | Purpose |
|------|-----------|---------|
| `sso_provider_id` | `iam_sso_session` | Identifies which SSO provider to build the logout URL from |
| `id_token_enc` | `iam_sso_session` | The `id_token` JWT (Fernet-encrypted at rest); decrypted and passed as `id_token_hint` for standard OIDC logout |
| `is_active` | `iam_sso_session` | `1` = active session, `0` = deactivated on logout |

At SSO login, `SsoService.handle_oidc_callback()` creates an `iam_sso_session` row. At logout, `SsoService.deactivate_sso_sessions()` sets `is_active=0` for all user sessions. Token rotation (`POST /auth/refresh`) no longer needs to copy SSO context — the session table is independent of refresh tokens.

---

## 5. Database Schema

All SSO tables use the `iam_sso_` prefix and are owned by the `dfa_sso_service` package. The ORM models live in `apps/shared/packages/dfa_sso_service/storage/sqlalchemy_storage.py`. Tables are self-provisioned at startup via `initialize_tables()` (no Alembic migration required).

### Package-Owned Tables

#### `iam_sso_identity_provider`

Merged IdP catalog + OIDC configuration. One global row per identity provider (no `app_key` scoping). Seeded automatically by `initialize_tables()` at startup (4 default rows: drupal active, google/azure_ad/facebook inactive).

| Column | Type | Nullable | Notes |
|--------|------|:--------:|-------|
| `id` | INT PK | | Auto-increment |
| `provider_code` | VARCHAR(20) | NOT NULL | UNIQUE — machine key (e.g. `drupal`, `google`) |
| `name` | VARCHAR(100) | NOT NULL | Display name (e.g. "Drupal CMS", "Google") |
| `client_id` | VARCHAR(255) | NULL | OAuth2 client_id at the IdP (null until configured) |
| `client_secret_enc` | TEXT | NULL | Fernet-encrypted client_secret (null until configured) |
| `well_known_uri` | VARCHAR(500) | NULL | OIDC discovery URL |
| `authorization_endpoint` | VARCHAR(500) | NULL | |
| `token_endpoint` | VARCHAR(500) | NULL | |
| `userinfo_endpoint` | VARCHAR(500) | NULL | |
| `issuer` | VARCHAR(500) | NULL | Expected `iss` claim |
| `jwks_uri` | VARCHAR(500) | NULL | |
| `redirect_uri` | VARCHAR(500) | NULL | Callback URL registered at IdP |
| `end_session_endpoint` | VARCHAR(500) | NULL | OIDC RP-Initiated Logout URL (Google, Azure) |
| `logout_uri` | VARCHAR(500) | NULL | Custom IdP logout fallback (Drupal `/user/logout`) |
| `idp_entity_id` | VARCHAR(500) | NULL | SAML (future) |
| `idp_sso_url` | VARCHAR(500) | NULL | SAML (future) |
| `idp_certificate` | TEXT | NULL | SAML (future) |
| `scopes` | VARCHAR(500) | NULL | Default: `"openid profile email"` |
| `attribute_map` | TEXT | NULL | JSON: IdP claim → user column mapping |
| `auto_provision_users` | SMALLINT | NOT NULL | 1 = create/link user on first SSO login |
| `default_role_id` | INT | NULL | FK → `iam_role.id` — role for auto-provisioned users |
| `is_active` | SMALLINT | NOT NULL | 1 = active, 0 = disabled |
| `created`, `created_user_id`, `modified`, `modified_user_id` | | | Audit columns |

UNIQUE: `provider_code`.

#### `iam_sso_user_identity`

Links an internal user to an external IdP identity via immutable `sub` claim. One user can have multiple linked identities. Uses a soft `user_id` reference (plain INT, no hard FK) for package portability.

| Column | Type | Nullable | Notes |
|--------|------|:--------:|-------|
| `id` | INT PK | | |
| `user_id` | INT | NOT NULL | Soft reference → host user table |
| `provider_code` | VARCHAR(20) | NOT NULL | Matches `iam_sso_identity_provider.provider_code` |
| `idp_user_id` | VARCHAR(255) | NOT NULL | User's ID at the external identity provider (OIDC `sub` claim) |
| `email` | VARCHAR(255) | NULL | Email snapshot at link time (audit) |
| `raw_claims` | TEXT | NULL | Full IdP claims JSON |
| `created`, `created_user_id`, `modified`, `modified_user_id` | | | Audit |

UNIQUE: `(provider_code, idp_user_id)`.

#### `iam_sso_login_code`

Short-lived single-use codes bridging BED callback → FED exchange.

| Column | Type | Nullable | Notes |
|--------|------|:--------:|-------|
| `id` | INT PK | | |
| `code_hash` | VARCHAR(64) | NOT NULL | UNIQUE — SHA-256 of raw code |
| `user_id` | INT | NOT NULL | Soft reference → host user table |
| `sso_provider_id` | INT | NULL | FK → `iam_sso_identity_provider.id` SET NULL |
| `is_used` | SMALLINT | NOT NULL | 1 after exchange |
| `expires_at` | DATETIME | NOT NULL | 60 seconds from creation |
| `created_at` | DATETIME | NOT NULL | |

#### `iam_sso_session`

Tracks active SSO login context for IdP logout. Replaces the `sso_provider_id` and `id_token_raw` columns that previously lived on `iam_user_refresh_token`.

| Column | Type | Nullable | Notes |
|--------|------|:--------:|-------|
| `id` | INT PK | | Auto-increment |
| `user_id` | INT | NOT NULL | Soft reference → host user table |
| `sso_provider_id` | INT | NULL | FK → `iam_sso_identity_provider.id` SET NULL |
| `id_token_enc` | TEXT | NULL | Fernet-encrypted `id_token` JWT for `id_token_hint` at logout |
| `is_active` | SMALLINT | NOT NULL | Default `1`; set to `0` on logout |
| `created_at` | DATETIME | NOT NULL | |
| `updated_at` | DATETIME | NOT NULL | |

INDEX: `(user_id, is_active)`.

### Host Tables

#### `iam_user`

No SSO-specific columns. `auth_provider` and `external_id` have been **removed** — SSO vs local login is determined by the global `SSO_ENABLED` config flag, not per-user state.

#### `iam_user_refresh_token`

SSO context columns (`sso_provider_id`, `id_token_raw`) have been **removed** from this table. SSO logout data now lives in `iam_sso_session`. Refresh token rotation no longer needs to copy SSO fields.

### Table Provisioning

SSO tables are **self-provisioned** by the package at application startup via `initialize_tables(engine)`, which calls `Base.metadata.create_all()` and seeds 4 default identity providers if the table is empty. No Alembic migration is needed for the SSO tables.

For existing installs migrating from the previous two-table schema (`iam_sso_identity_provider` catalog + `iam_sso_provider` per-app config), run the one-time migration script: `apps/shared/packages/dfa_sso_service/migrations/migrate_from_v1.sql`.

---

## 6. API Endpoints

### Unified Login & Logout

| Method | Path | Access Level | Purpose |
|--------|------|:------------:|---------|
| POST | `/auth/login` | APP_CLIENT | **Unified login** — accepts `{username, password}` for local login **or** `{code}` for SSO code exchange. Returns `LoginResponse` in both cases. Local path blocked when `SSO_ENABLED=true`; SSO path blocked when `SSO_ENABLED=false`. |
| POST | `/auth/logout` | AUTHENTICATED | **Unified logout** — revokes refresh tokens. If user has an active SSO session, also deactivates it and returns `data.logout_url` (IdP end-session URL or null). |

### SSO OIDC Flow (Package-Owned)

| Method | Path | Access Level | Purpose |
|--------|------|:------------:|---------|
| GET | `/auth/sso/providers` | APP_CLIENT | List active providers for the login page (code + display name) |
| GET | `/auth/sso/{provider_code}/redirect` | PUBLIC | Generate state + PKCE, redirect browser to IdP |
| GET | `/auth/sso/{provider_code}/callback` | PUBLIC | Handle IdP callback, exchange code, map user, issue one-time code |

### SSO Admin CRUD

| Method | Path | Access Level | Purpose |
|--------|------|:------------:|---------|
| GET | `/sso-providers` | PERMISSION | List all providers (admin) |
| POST | `/sso-providers` | PERMISSION | Create provider configuration |
| GET | `/sso-providers/{nid}` | PERMISSION | Get provider detail (secret excluded) |
| PATCH | `/sso-providers/{nid}` | PERMISSION | Update provider configuration |
| DELETE | `/sso-providers/{nid}` | PERMISSION | Delete provider |
| POST | `/sso-providers/{nid}/discover` | PERMISSION | Fetch `.well-known` and auto-fill endpoints |

### Affected Non-SSO Endpoints

| Method | Path | Change |
|--------|------|--------|
| POST | `/auth/register` | Returns 403 when `SSO_ENABLED=true` |
| POST | `/auth/password/reset-request` | Returns 403 when `SSO_ENABLED=true` |

### FED BFF Routes (Next.js `/api/auth/*`)

| Method | FED Path | Upstream | Purpose |
|--------|----------|----------|---------|
| POST | `/api/auth/login` | `POST /auth/login` | Proxy; strips tokens from JSON, sets HttpOnly cookies. Handles both local (`{username, password}`) and SSO (`{code}`) payloads. |
| POST | `/api/auth/logout` | `POST /auth/logout` | Proxy; clears cookies, returns `logout_url` (for SSO IdP redirect) or null |
| GET | `/api/auth/sso/providers` | `GET /auth/sso/providers` | Proxy with app client signing |

---

## 7. File Inventory

### SSO Package — `apps/shared/packages/dfa_sso_service/`

| File | Purpose |
|------|---------|
| `__init__.py` | Public API: exports `SsoConfig`, `SsoService`, `SsoUserProfile`, `SsoExchangeResult`, `SsoUserProvider`, `initialize_tables()`, `get_sso_enabled`, `invalidate_sso_config_cache`. Seed data for 4 default identity providers. |
| `core/config.py` | `SsoConfig` dataclass + cached DB reader: `get_sso_enabled()`, `invalidate_sso_config_cache()` (60s TTL). Callback URLs resolved via host-injected `callback_url_resolver`. |
| `core/service.py` | `SsoService` — main orchestrator: provider queries, OIDC callback handling, user resolution, login codes, logout URL, admin CRUD |
| `core/models.py` | Pydantic DTOs: `SsoUserProfile`, `SsoExchangeResult`, `SsoProviderListItem`, `SsoProviderCreate/Update/Detail`, `SsoExchangeRequest`, `SsoDiscoverResponse` |
| `core/discovery.py` | `SsoConfigError`, OIDC `.well-known` fetch, authlib `OAuth` client factory |
| `core/claims.py` | `SsoClaimError`, `apply_attribute_map()`, `normalize_issuer()`, default claim mapping (maps `idp_user_id` ← `sub`) |
| `core/crypto.py` | Fernet encrypt/decrypt with injected key (no dependency on host settings) |
| `core/logout.py` | `build_idp_logout_url()` — standard OIDC RP-Initiated Logout or custom `logout_uri` fallback |
| `providers/base.py` | `SsoUserProvider` ABC — abstract interface for user operations (find, create, check active, assign role) |
| `storage/base.py` | `SsoStorage` ABC — abstract persistence interface for all `iam_sso_*` tables |
| `storage/sqlalchemy_storage.py` | `SqlAlchemySsoStorage` concrete implementation + ORM models (`SsoIdentityProviderModel`, `SsoUserIdentityModel`, `SsoLoginCodeModel`, `SsoSessionModel`) |
| `adapters/fastapi.py` | `create_sso_auth_router()`, `create_sso_admin_router()` factories + DI placeholders (`get_sso_service`, `get_sso_user_id`, `is_sso_enabled`) |
| `migrations/create_tables.sql` | Standalone DDL for all `iam_sso_*` tables (reference) |
| `migrations/migrate_from_v1.sql` | One-time migration script for existing installs upgrading from two-table schema |
| `README.md` | Package overview, quick-start, configuration reference |

### Host Application — `dfa-toolkit-api-core`

| File | Purpose |
|------|---------|
| `main.py` | **Always** mounts SSO routers (no `if SSO_ENABLED` gate). Creates `SsoConfig`, overrides DI placeholders, registers exception handlers, calls `initialize_tables()` at startup; `SessionMiddleware` for authlib OIDC state |
| `apps/app_db/services/sso_user_provider.py` | `DfaUserProvider` — concrete `SsoUserProvider` for DFA's `IamUser` / `IamUserRole` models |
| `apps/app_db/services/refresh_token_service.py` | `persist_refresh_token_for_user()` — no longer stores SSO context (handled by package's `iam_sso_session`) |
| `apps/app_db/schemas/auth.py` | `LoginRequest` (unified: `username`+`password` or `code`), `LoginResponse` — includes `auth_provider: str` field (set to `"SSO"` for code exchange, defaults to `"LOCAL"` for credentials login) |
| `apps/app_db/router/auth.py` | Unified `POST /auth/login` (local + SSO code exchange), unified `POST /auth/logout` (revoke tokens + SSO session cleanup + IdP logout URL), `_require_local_login()` gate |
| `apps/shared/config/config.py` | `SSO_ENABLED` setting (legacy; runtime reads come from DB) |
| `apps/app_db/data/config.json` | Seed data for `SSO_ENABLED` in `system_configuration` under `DFA_CORE` (platform-wide) |
| `apps/app_db/scripts/seed_iam.py` | Registers all SSO API routes in `iam_resource_api` with access levels |
| `apps/app_db/scripts/seed_dm_iam_roles.py` | Seeds `DFA_DM_AUTHENTICATED` role — default for SSO-provisioned users |
| `apps/app_db/scripts/seed_all.py` | Orchestrates all seeders including SSO-related ones |
| `apps/app_db/scripts/set_sso_provider_secret.py` | CLI to encrypt and store a provider's `client_secret` |

### Frontend — `dfa-v6-datamanager`

| File | Purpose |
|------|---------|
| `src/app/[locale]/page.tsx` | Login page — reads `ssoEnabled` from `AppConfigContext` (runtime), SSO provider fetch, auto-redirect logic, mode-based UI rendering |
| `src/app/auth/sso/callback/page.tsx` | SSO callback — receives `?code=`, exchanges via unified `POST /api/auth/login`, stores user, redirects to dashboard |
| `src/app/api/auth/sso/providers/route.ts` | BFF: proxies `GET /auth/sso/providers` with app client signing |
| `src/app/api/auth/login/route.ts` | BFF: unified login (local + SSO code); strips tokens, sets HttpOnly cookies, builds permissions summary |
| `src/app/api/auth/logout/route.ts` | BFF: unified logout; clears cookies, returns `logout_url` for IdP redirect |
| `src/components/Header.tsx` | `onLogout()` — always calls `/api/auth/logout`; redirects to IdP `logout_url` if present |
| `src/contexts/AppConfigContext.tsx` | Exposes `ssoEnabled: boolean` derived from `GET /app-config` `SSO_ENABLED` key |
| `src/lib/auth/user.ts` | `StoredAuthUser.auth_provider`, `setStoredAuthUserFromLoginResponse()` |
| `src/lib/auth/ssoProviders.ts` | `fetchSsoProvidersOnce()` — deduplicated provider fetch (handles React Strict Mode) |
| `src/lib/api/core.ts` | `SSO_ENABLED_CONFIG_KEY` — config key constant for runtime SSO toggle |
| `packages/dfa-v6-comp-login/src/Login.tsx` | Shared login component (used in local-only mode) |
| `packages/dfa-v6-comp-login/src/styles.css` | CSS classes: `.dtk-signin-sso-divider`, `.dtk-signin-sso-button`, `.dtk-signin-sso-selector`, `.dtk-signin-sso-spinner`, etc. |
| `src/middleware.ts` | Bypasses auth for `/auth/sso/*` paths; sets `NEXT_LOCALE` cookie used by callback |

---

## 8. Seeders

Run via `python apps/app_db/scripts/seed_all.py` (or individually). Relevant SSO seeders:

| Seeder | What It Seeds | When to Run |
|--------|---------------|-------------|
| `seed_iam.py` | All SSO API routes in `iam_resource_api` + the `sys_sso` resource tree entry | Always (deployment) |
| `seed_dm_iam_roles.py` | `DFA_DM_AUTHENTICATED` role with read-only GET access to `sys_datawarehouse` subtree | Always (deployment) |
| `seed_configuration.py` | `SSO_ENABLED` in `system_configuration` (via `config.json`) | Always (deployment) |
| `seed_application_clients.py` | FED rows in `system_application_client` including `origin_url` (DM from `DFA_DM_FED_ORIGIN_URL`) | Always (deployment); `--force` to refresh `origin_url` |
| `initialize_tables()` *(automatic)* | 4 rows in `iam_sso_identity_provider`: `drupal` (active), `google`, `azure_ad`, `facebook` (inactive) | Automatic at startup (package-owned) |

**Not seeded** (configured via admin API):
- OIDC client credentials on `iam_sso_identity_provider` — update via `PATCH /sso-providers/{nid}` (uses package crypto) or `set_sso_provider_secret.py` CLI

### DFA_DM_AUTHENTICATED Role

Designed as the `default_role_id` for SSO auto-provisioned users.

- **Permissions:** Read-only (GET) on all APIs under the `sys_datawarehouse` resource subtree.
- **i18n:** Name = "Authenticated User", Description = "Default role for SSO-provisioned users — read-only access to datawarehouse data".
- **Wiring:** Set `iam_sso_provider.default_role_id` to this role's `iam_role.id` when configuring a provider.

---

## 9. Security Measures

| Concern | Mechanism | Standard |
|---------|-----------|----------|
| CSRF on SSO redirect | Random `state` parameter stored in signed session cookie, validated on callback | OAuth 2.0 (RFC 6749) |
| Authorization code theft | PKCE with SHA-256 challenge | `code_challenge_method: S256` on all providers (auto-discovery and manual Drupal-style endpoints) | OAuth 2.0 PKCE (RFC 7636) |
| Forged identity tokens | `id_token` signature verified against IdP public keys (JWKS) | OpenID Connect Core |
| Issuer claim validation | Post-exchange check rejects tokens with missing or mismatched `iss` when provider `issuer` is configured | OpenID Connect Core |
| OIDC discovery SSRF | Admin `discover` validates `well_known_uri` (https-only except localhost); blocks private/reserved IPs; no HTTP redirects on fetch | OWASP SSRF |
| Open redirect on callback | Resolved FED callback URL must be `http`/`https` with a valid host before `RedirectResponse` | OWASP |
| Client secret at rest | Fernet encryption in database; decrypted only in memory at runtime | Application-level encryption |
| `id_token` at rest | Fernet-encrypted before storing on `iam_sso_login_code` and `iam_sso_session`; decrypted only when building IdP logout URL | Application-level encryption |
| Token exposure in URLs | One-time exchange code (60s TTL, single-use SHA-256 hash) instead of JWTs in URL | Industry best practice |
| User identity matching | By immutable `sub` claim (e.g. Drupal uid), never by username | OpenID Connect Core |
| SSO session isolation | SSO logout context (`sso_provider_id`, encrypted `id_token`) lives in a dedicated `iam_sso_session` table — independent of refresh token rotation. No SSO data on `iam_user_refresh_token` | Application-level |
| Session cookie for OIDC state | `SessionMiddleware` with `SECRET_KEY`; required by authlib for state/PKCE | Starlette / authlib |
| BFF request signing | Ed25519 signature on every BFF → BED call (`X-Api-Signature`, `X-Api-Timestamp`) | App client auth |
| Token storage | Access/refresh tokens in HttpOnly, SameSite cookies (never in localStorage) | OWASP |
| Mutually exclusive login mode | Single `SSO_ENABLED` flag — `true` = SSO-only, `false` = local-only. No mixed mode. | Operational simplicity |

---

## 10. OIDC Discovery

The admin can auto-populate IdP endpoints via `POST /sso-providers/{nid}/discover`:

1. Fetches the `.well-known/openid-configuration` document from `well_known_uri`.
2. Extracts and stores: `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `issuer`, `jwks_uri`, `end_session_endpoint`.
3. `end_session_endpoint` is used for standard OIDC RP-Initiated Logout (Google, Azure AD, etc.).

Drupal's `.well-known` does **not** include `end_session_endpoint` — it must be configured manually via `logout_uri`.

---

## 11. Setup Guide

Follow the steps below for **local development** or **server deployment**. The same sequence applies; only hostnames and secrets change.

**Drupal IdP:** complete [§12](#12-drupal-cms--configuration-guide) first (OAuth client + anonymous token permission), then configure the matching `iam_sso_identity_provider` row on the API.

**Multiple frontends (DM, Visualizer, …):** see [§16](#16-multi-frontend-callback-routing) for `?app_key=` and per-product `origin_url`.

### Configuration map (what lives where)

| Concern | Where to configure | Local example | Server example |
|---------|-------------------|---------------|----------------|
| SSO on/off | `system_configuration.SSO_ENABLED` under `DFA_CORE` | `true` | `true` (platform-wide) |
| FED callback origin | `system_application_client.origin_url` (FED, ACTIVE) | `http://localhost:3000` | `https://datamanager.example.com` |
| IdP OAuth client | Drupal (or other IdP) admin UI | See §12 | Production CMS URL |
| API ↔ IdP redirect | `iam_sso_identity_provider.redirect_uri` | `http://localhost:8000/auth/sso/drupal/callback` | `https://api.example.com/auth/sso/drupal/callback` |
| IdP client secret | `iam_sso_identity_provider.client_secret_enc` | `set_sso_provider_secret` or `PATCH /sso-providers/{nid}` | Same (use prod secret) |
| Browser → API redirect | FED `NEXT_PUBLIC_API_BASE_URL` + `?app_key=` | `http://127.0.0.1:8000` + `DFA_DM` | Public API URL + product `app_key` |
| Session / crypto | API `.env` | `SECRET_KEY`, `JWT_SECRET_KEY`, `PASSWORD_ENCRYPTION_KEY` | Strong unique values per env; never commit real secrets |

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| MySQL 5.7+ | Core `app_db` database |
| FastAPI (BED) | `SECRET_KEY`, `JWT_SECRET_KEY`, `PASSWORD_ENCRYPTION_KEY`; `SessionMiddleware` in `main.py`; SSO tables via `initialize_tables()` at startup |
| Next.js (FED) | `/api/auth/sso/providers`, `/api/auth/login` (code exchange), page `/auth/sso/callback` |
| FED app client | Row in `system_application_client` with matching `api_key` / signing keys (see `APP_CLIENT_AUTH.md`) |
| Drupal CMS (optional) | `oauth2_server` module, PHP `openssl`, anonymous `POST /oauth2/token` (§12.4), `login_redirect_per_role` "Allow destination" enabled (§12.5) |

---

### 11.1 — Local development

#### Step 1 — API environment (`.env`)

Copy `.env.example` and set at minimum:

```env
# Generate each: python -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY=<stable-random-string>
JWT_SECRET_KEY=<random-string>
PASSWORD_ENCRYPTION_KEY=<fernet-key>   # optional; defaults to derivation from SECRET_KEY
DFA_DM_FED_ORIGIN_URL=http://localhost:3000
DB_HOST=localhost
DB_NAME=dfa_app_db
# ... other DB vars
```

`SECRET_KEY` and `JWT_SECRET_KEY` must be non-empty for production SSO and login. Empty values produce a startup warning in the API logs.

`DFA_DM_FED_ORIGIN_URL` is used when seeding the DM FED client's `origin_url`. It is **not** used at SSO callback runtime (callback uses the DB column).

#### Step 2 — Database and SSO tables

SSO tables are created at API startup (`initialize_tables()`). Upgrades from the old two-table schema:

```bash
mysql -u root -p dfa_app_db < apps/shared/packages/dfa_sso_service/migrations/migrate_from_v1.sql
```

Optional token-column cleanup:

```bash
mysql -u root -p dfa_app_db < apps/shared/packages/dfa_sso_service/migrations/sso_token_columns_cleanup.sql
```

#### Step 3 — Seeders

From the API repo root (with venv activated):

```bash
python apps/app_db/scripts/seed_all.py
```

Minimum for SSO:

```bash
python apps/app_db/scripts/app_db/seed_iam.py
python apps/app_db/scripts/app_db/seed_dm_iam_roles.py
python apps/app_db/scripts/app_db/seed_configuration.py
python apps/app_db/scripts/app_db/seed_application_clients.py --force
```

`seed_application_clients.py --force` sets `origin_url` on the DM FED row from `DFA_DM_FED_ORIGIN_URL`. Verify:

```sql
SELECT api_key, app_key, origin_url
FROM system_application_client
WHERE app_type = 'FED' AND status = 'ACTIVE';
```

Expected for DataManager: `api_key = dfa_dm_fed_app`, `origin_url = http://localhost:3000` (or your `DFA_DM_FED_ORIGIN_URL`).

Identity provider rows (`drupal`, etc.) are seeded at API startup by the SSO package.

#### Step 4 — Enable SSO

```sql
UPDATE system_configuration
SET key_value = 'true'
WHERE app_key = 'DFA_CORE' AND key_code = 'SSO_ENABLED';
```

Or `PATCH /app-config` with any product's app client signature headers (routed to `DFA_CORE` automatically). Effective within ~60 seconds (config cache TTL).

#### Step 5 — Configure IdP and API provider (Drupal)

1. Complete [§12](#12-drupal-cms--configuration-guide) (Drupal OAuth client, scopes, redirect URI, token permission).
2. Store the API-side secret:

```bash
python -m apps.app_db.scripts.set_sso_provider_secret drupal "YOUR_PLAINTEXT_DRUPAL_CLIENT_SECRET"
```

3. Update the `drupal` provider row (endpoints, `redirect_uri`, `default_role_id`). Example:

```bash
curl -X PATCH http://localhost:8000/sso-providers/1 \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "dfa_datamanager_v6",
    "authorization_endpoint": "http://localhost/oauth2/authorize",
    "token_endpoint": "http://localhost/oauth2/token",
    "userinfo_endpoint": "http://localhost/oauth2/UserInfo",
    "issuer": "http://localhost",
    "jwks_uri": "http://localhost/oauth2/jwk",
    "redirect_uri": "http://localhost:8000/auth/sso/drupal/callback",
    "logout_uri": "http://localhost/user/logout",
    "auto_provision_users": 1,
    "default_role_id": <iam_role.id for DFA_DM_AUTHENTICATED>,
    "is_active": 1
  }'
```

Run `python apps/app_db/scripts/app_db/seed_dm_iam_roles.py --force` if you need a fresh `DFA_DM_AUTHENTICATED` role id (also wires Drupal `default_role_id` when applicable).

(Includes `wire_drupal_sso_default_dm_role()` when applicable.)

#### Step 6 — DataManager frontend (`.env`)

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
# BFF app-client signing — see dfa-v6-datamanager .env.example and APP_CLIENT_AUTH.md
```

The login page loads `SSO_ENABLED` from `GET /app-config` and appends `?app_key=DFA_DM` (from `APP_ID` in app-config) to SSO redirect URLs.

#### Step 7 — Local verification checklist

| # | Check | Expected |
|---|--------|----------|
| 1 | `GET /auth/sso/providers` (with DM app-client headers) | `{ success: true, data: [{ provider_code: "drupal", ... }] }` |
| 2 | Browser `GET {API}/auth/sso/drupal/redirect?app_key=DFA_DM` | Redirect to Drupal authorize |
| 3 | After login | Browser lands on `http://localhost:3000/auth/sso/callback?code=...` |
| 4 | FED exchanges code | Dashboard loads; JWT cookies set |
| 5 | DB | `iam_sso_user_identity`, `iam_sso_session` rows for user |
| 6 | `POST /auth/logout` (SSO session) | `logout_url` points at Drupal logout |

**Common local failures:** missing `?app_key=`, empty `origin_url` on FED client, Drupal redirect URI mismatch, `client_secret_enc` not set, anonymous token permission missing on Drupal.

---

### 11.2 — Server / production deployment

Use the same steps as [§11.1](#111--local-development), replacing hostnames and secrets:

| Item | Local | Production |
|------|-------|------------|
| `system_application_client.origin_url` (DM) | `http://localhost:3000` | `https://<dm-public-host>` (no trailing slash) |
| `iam_sso_identity_provider.redirect_uri` | `http://localhost:8000/auth/sso/drupal/callback` | `https://<api-public-host>/auth/sso/drupal/callback` |
| Drupal OAuth redirect URIs | Must match API `redirect_uri` exactly | Same |
| Drupal endpoints / issuer | `http://localhost` | Public CMS base URL (issuer must match token `iss`) |
| `NEXT_PUBLIC_API_BASE_URL` (FED) | Dev API URL | Public API URL |
| `SECRET_KEY` / `JWT_SECRET_KEY` / `PASSWORD_ENCRYPTION_KEY` | Dev values (unique per developer machine) | Unique per environment; inject via secrets manager; never reuse dev keys |
| TLS | Optional locally | Required; cookie `Secure` in production FED |

**Recommended order on a new server:**

1. Deploy API with correct `.env` (`SECRET_KEY`, `JWT_SECRET_KEY`, `PASSWORD_ENCRYPTION_KEY`, DB).
2. Run migrations / `initialize_tables()` (API start).
3. Run seeders (`seed_iam`, `seed_dm_iam_roles`, `seed_configuration`, `seed_application_clients --force` with production `DFA_DM_FED_ORIGIN_URL` in deploy env **or** set `origin_url` via admin API after deploy).
4. Configure Drupal production OAuth client (§12).
5. `set_sso_provider_secret` + `PATCH /sso-providers/{nid}` on production API.
6. Set `SSO_ENABLED=true` under `DFA_CORE` (platform-wide; applies to all products).
7. Deploy FED with production `NEXT_PUBLIC_API_BASE_URL` and BFF signing keys.
8. Run the [verification checklist](#step-7--local-verification-checklist) against production URLs.

**Kubernetes / OCI:** set `DFA_DM_FED_ORIGIN_URL` in the environment ConfigMap used by seed jobs (see `oci_k8s/overlays/*/env-config.yaml`) so `seed_application_clients` writes the correct `origin_url`. Alternatively patch `origin_url` directly in the DB after deploy.

**Multi-product:** each FED needs its own `system_application_client` row with `origin_url` and login links that pass `?app_key=<that app_key>`. `SSO_ENABLED` is platform-wide under `DFA_CORE` — no per-product toggle needed. See [§16](#16-multi-frontend-callback-routing).

---

## 12. Drupal CMS — Configuration Guide

Use this section when the IdP is **Drupal** with the `oauth2_server` module. Configure Drupal **before** creating the `iam_sso_provider` row so Client ID, secret, and redirect URI are known.

### 12.1 — Verify OpenSSL

Go to **Structure → OAuth2 Servers → Edit** your server. If **Use OpenID Connect** is visible, OpenSSL is loaded. If missing, enable the PHP `openssl` extension.

### 12.2 — OAuth2 server settings

**Admin → Structure → OAuth2 Servers → Edit** (or create):

| Setting | Required value |
|---------|----------------|
| **Enabled** | ✓ |
| **Use OpenID Connect** | ✓ (required for `id_token` + UserInfo) |
| **Grant types** | **Authorization code** (minimum) |

**Scopes** tab — ensure these exist (often auto-created when OIDC is enabled):

- `openid`
- `profile`
- `email`

### 12.3 — Create OAuth2 client

**Clients → Add client:**

| Field | Value |
|-------|-------|
| **Label** | DataManager (or any name) |
| **Client ID** | e.g. `dfa_datamanager_v6` (must match `iam_sso_provider.client_id`) |
| **Client secret** | Strong secret — **save plaintext immediately**; Drupal stores only a bcrypt hash |
| **Redirect URIs** | `http://localhost:8000/auth/sso/drupal/callback` (one per line; must match `iam_sso_provider.redirect_uri` **exactly**) |
| **Automatic authorization** | ✓ (skips consent for trusted DFA apps) |

The secret you type here is encrypted into `client_secret_enc` on the API (Fernet), not stored as Drupal’s hash.

### 12.4 — Anonymous permission on token endpoint (required)

`POST /oauth2/token` is called **server-to-server** by BED — no Drupal session cookie. Without anonymous permission, Drupal returns **403** before checking client credentials.

**Admin → People → Permissions → OAuth2 Server:**

- Check **Use OAuth2 Server** for the **Anonymous user** role
- Save permissions

### 12.5 — Login redirect module (`login_redirect_per_role`)

If the CMS uses the **`login_redirect_per_role`** Drupal module (or any module that overrides the `destination` query parameter after login), the OAuth authorization flow will break because the post-login redirect is hijacked before the browser returns to `/oauth2/authorize`.

**Symptom chain:**

1. API redirects browser to CMS `/oauth2/authorize?state=A&code_challenge=X`.
2. CMS sees anonymous user → stores the authorize request in `$_SESSION` → redirects to `/user/login?destination=oauth2/authorize?...`.
3. User logs in, but `login_redirect_per_role` overwrites `destination` with a per-role URL (e.g. `/secure-dashboard` or `/node/1`).
4. Browser goes to the role-based page instead of back to `/oauth2/authorize`. The OAuth flow never completes.
5. When the user later clicks a DM/Visualizer link, a **new** SSO redirect generates `state=B`, but CMS replays the stale `$_SESSION` authorize request (with `state=A`). The API receives `state=A` but only has `state=B` in its session → **`mismatching_state` error**.
6. On the second attempt, the stale `$_SESSION` is cleared and the flow succeeds.

**Fix — CMS admin configuration:**

1. Go to **People → Login and logout redirect per role** (`/admin/people/login-and-logout-redirect-per-role`).
2. For the **Authenticated user** role (matches all logged-in users), check **"Allow destination"**.
3. Save the form.

This makes the module respect the OAuth `destination` query parameter when present, while still redirecting to the configured URL (e.g. `/node/1`) for direct logins without a `destination`.

**Verification:** After enabling, SSO login should redirect the user from CMS back through `/oauth2/authorize` and complete the code exchange without a `mismatching_state` error.

### 12.6 — Drupal OIDC endpoints

Replace `{cms}` with your CMS base URL (e.g. `http://localhost`):

| Purpose | URL | Notes |
|---------|-----|-------|
| Authorization | `{cms}/oauth2/authorize` | Browser redirect; uses Drupal session |
| Token | `{cms}/oauth2/token` | Server-to-server; needs step 12.4 |
| UserInfo | `{cms}/oauth2/UserInfo` | Called with IdP access token |
| JWKS | **`{cms}/oauth2/jwk`** | Correct base64url + `kid` — **use this** |
| Discovery | `{cms}/oauth2/certificates?openid-configuration` | Non-standard; **do not rely on auto-discovery** |

**JWKS warning:** Discovery points to `/oauth2/certificates?jwkUri`, which uses wrong base64 encoding and lacks `kid`. Always set API `jwks_uri` to **`/oauth2/jwk`**, not the discovery URL. Set `well_known_uri` to `NULL` on `iam_sso_provider` for Drupal.

### 12.7 — `sub` claim (Drupal uid)

Default in `oauth2_server.oauth.yml`:

```yaml
user_sub_property: uid
```

`iam_sso_user_identity.idp_user_id` will be `"1"`, `"2"`, … (Drupal uid as string). Use **uid**, not username — uid is immutable.

### 12.8 — API row for Drupal (after CMS client exists)

Do **not** call `POST /sso-providers/{nid}/discover` for Drupal.

The Drupal row is pre-seeded by `initialize_tables()` with `provider_code = 'drupal'` and localhost defaults. Update it via `PATCH /sso-providers/{nid}` with the correct credentials, or directly via SQL:

```sql
UPDATE iam_sso_identity_provider
SET
  client_id = 'dfa_datamanager_v6',
  client_secret_enc = 'PENDING',
  redirect_uri = 'http://localhost:8000/auth/sso/drupal/callback',
  logout_uri = 'http://localhost/user/logout',
  auto_provision_users = 1,
  default_role_id = (SELECT id FROM iam_role WHERE role_code = 'DFA_DM_AUTHENTICATED' AND app_key = 'DFA_DM' LIMIT 1),
  modified = NOW()
WHERE provider_code = 'drupal';
```

Then encrypt the secret:

```bash
python -m apps.app_db.scripts.set_sso_provider_secret drupal "YOUR_PLAINTEXT_DRUPAL_CLIENT_SECRET"
```

Verify Fernet storage:

```sql
SELECT id, provider_code, LEFT(client_secret_enc, 12) AS secret_check
FROM iam_sso_identity_provider
WHERE provider_code = 'drupal';
```

`secret_check` should start with `gAAAAA...`, not `PENDING` or plaintext.

### 12.9 — Redirect URI alignment (Drupal)

These three values must match **exactly** (scheme, host, port, path — no trailing-slash drift):

| Where | Value |
|-------|-------|
| Drupal client **Redirect URIs** | `http://localhost:8000/auth/sso/drupal/callback` |
| `iam_sso_provider.redirect_uri` | Same |
| Browser callback URL | Same (BED redirect target) |

Use `127.0.0.1` vs `localhost` consistently — different origins.

`NEXT_PUBLIC_API_BASE_URL` is only used to build the **initial** redirect link (`/auth/sso/drupal/redirect`); it does not replace `redirect_uri` on the provider row.

### 12.10 — Verification checklist (Drupal)

| # | Check | Expected |
|---|--------|----------|
| 1 | API `/docs` has `/auth/sso` | `SSO_ENABLED=true`, API restarted |
| 2 | `GET /auth/sso/providers` | `{ "data": [{ "provider_code": "drupal", ... }] }` |
| 3 | Browser `{api}/auth/sso/drupal/redirect` | Redirect to Drupal authorize |
| 4 | FED login → SSO → dashboard | User created with `password=NULL`; `iam_sso_user_identity` row links to user |
| 5 | DB after login | `iam_sso_user_identity` for `provider_code = 'drupal'`; `iam_sso_session` with `is_active=1` |
| 6 | Role | `iam_user_role` if `default_role_id` was set |
| 7 | Logout | Browser opens `{cms}/user/logout`; user stays on CMS |

```sql
SELECT u.id, u.username, u.email, ui.provider_code, ui.idp_user_id
FROM iam_user u
JOIN iam_sso_user_identity ui ON u.id = ui.user_id
WHERE ui.provider_code = 'drupal';

SELECT * FROM iam_sso_user_identity WHERE provider_code = 'drupal';

SELECT * FROM iam_sso_session WHERE user_id IN (
  SELECT user_id FROM iam_sso_user_identity WHERE provider_code = 'drupal'
) ORDER BY created_at DESC;
```

### 12.11 — Troubleshooting (Drupal)

| Symptom | Cause | Fix |
|---------|-------|-----|
| No SSO button on FED | API `SSO_ENABLED`, provider `is_active=0`, or BFF `/api/auth/sso/providers` failing | API `.env`, provider row, FED env + signing keys |
| SSO auth endpoints return error | `SSO_ENABLED` is `false` in `system_configuration` | Update `SSO_ENABLED` to `true` via DB or `PATCH /app-config`; no restart needed |
| 403 on `/auth/sso/providers` | IAM not seeded | `python -m apps.app_db.scripts.seed_iam` |
| `redirect_uri_mismatch` | Drupal redirect URI ≠ `iam_sso_provider.redirect_uri` | Byte-for-byte match |
| **403 on `/oauth2/token`** | Anonymous lacks **Use OAuth2 Server** | [§12.4](#124--anonymous-permission-on-token-endpoint-required) |
| `SSO client secret is not configured` | `client_secret_enc` still `PENDING` | `set_sso_provider_secret` |
| `Cannot decrypt SSO client secret` | `SECRET_KEY` changed after encrypt | Re-run script with current `SECRET_KEY` |
| Token OK but **id_token verification fails** | `jwks_uri` points to broken `/oauth2/certificates?jwkUri` | `well_known_uri = NULL`, `jwks_uri = /oauth2/jwk` |
| Login OK, APIs **insufficient permissions** | No `default_role_id` / no role on user | Set `DFA_DM_AUTHENTICATED` on provider; assign `iam_user_role` |
| FED exchange fails | BFF signing misconfigured | `DM_API_SIGNING_PRIVATE_KEY`, `NEXT_PUBLIC_API_KEY` |
| State/PKCE error on callback | Session cookie lost between hosts | Stable `SECRET_KEY`; same-site/cookie policy if cross-domain |
| `mismatching_state` on first SSO attempt after CMS login, works on retry | CMS `login_redirect_per_role` overrides OAuth `destination` after login; stale `$_SESSION['oauth2_server_authorize']` replays old state on next attempt | Enable **"Allow destination"** for **Authenticated user** role in CMS admin ([§12.5](#125--login-redirect-module-login_redirect_per_role)) |

### 12.12 — Known Drupal gotchas

1. **Token endpoint needs Anonymous permission** — authorize uses browser session; token does not.
2. **Two JWKS URLs** — only `/oauth2/jwk` works for signature verification.
3. **Discovery `jwks_uri` is wrong** — never use `well_known_uri` / discover for Drupal on the API.
4. **Client secret is one-way in Drupal** — if lost, set a new secret in Drupal and re-run `set_sso_provider_secret`.
5. **`sub` = uid** — do not switch to `name` in `oauth2_server.oauth.yml`.
6. **Issuer may be `https://` on HTTP hosts** — copy exact `issuer` from discovery into `iam_sso_provider.issuer`.
7. **Logout** — set `logout_uri` to `/user/logout`; no `end_session_endpoint`. User remains on CMS after logout (no DM redirect).
8. **`login_redirect_per_role` breaks OAuth destination** — if this module is installed and configured with a redirect URL for the **Authenticated user** role (or any role the user has), it overrides the OAuth `destination` query parameter after login. The user ends up on the CMS dashboard instead of completing the OAuth flow. Enable **"Allow destination"** for the role in **People → Login and logout redirect per role** (`/admin/people/login-and-logout-redirect-per-role`). See [§12.5](#125--login-redirect-module-login_redirect_per_role).

---

## 13. Translation Keys (Frontend)

| Key | Default Fallback | Used In |
|-----|------------------|---------|
| `LOGIN_WITH_SSO` | "Login with {provider}" | SSO provider button labels |
| `LOADING` | "Loading..." | SSO-only loading state |
| `SSO_SELECT_PROVIDER` | "Select a sign-in provider" | SSO-only, multiple providers |
| `SSO_REDIRECTING` | "Redirecting to" | SSO-only, single provider auto-redirect |
| `SSO_NO_PROVIDERS` | "SSO is enabled but no active providers..." | SSO-only, zero providers |

---

## 14. Known Limitations & Future Work

| Item | Status |
|------|--------|
| **No redirect to DM after IdP logout** — Drupal's confirm logout page does not honor external `destination`. User stays on CMS after logout. | By design |
| **SAML support** — Columns exist (`idp_entity_id`, `idp_sso_url`, `idp_certificate`) but no implementation. | Future |
| **Cross-app logout** — IdP logout triggers DM session kill (OIDC Back-Channel Logout or webhooks). | Future phase |
| **Multi-app callback routing** — SSO redirect/callback routes browser to the correct FED via `?app_key` + session. See [§16](#16-multi-frontend-callback-routing). | Implemented |
| **DataManager as OIDC Provider** — Other DFA products (Visualizer, Dashboard) authenticate against DM. | Future phase |

---

## 15. Package vs Application Code Boundary

> **Temporary reference section.** This explains the rationale behind what lives in the `dfa_sso_service` package versus the host application. Remove once the team is familiar with the split.

### Why a Package?

The SSO logic was originally spread across `apps/app_db/` — models, schemas, services, and router all lived alongside non-SSO application code. Extracting into `apps/shared/packages/dfa_sso_service/` follows the same pattern as `dfa-help-service` and `dfa_mailer_service`:

- **Portability** — the package can be mounted by any FastAPI host (e.g. Visualizer API) with minimal wiring. The host implements `SsoUserProvider` for its own user model and overrides DI placeholders.
- **Isolation** — package-owned tables use the `iam_sso_*` prefix. `user_id` columns are soft references (plain INT) with no hard FK to the host's `iam_user` table.
- **Single responsibility** — OIDC protocol mechanics, claim mapping, encryption, admin CRUD all live in one coherent module. The host only handles what requires its own domain knowledge (JWT minting, IAM roles, permissions).

### What Lives in the Package

| Concern | Package Module | Why It's Here |
|---------|---------------|---------------|
| `SsoService` orchestrator | `core/service.py` | Coordinates all SSO operations — provider lookup, OIDC callback processing, user resolution, login code lifecycle, logout URL building, admin CRUD. Pure business logic with no host imports. |
| `SsoConfig` + DB config readers | `core/config.py` | `SsoConfig` dataclass (encryption key, `callback_url_resolver` and `sso_enabled_checker` callables for multi-app routing — see [§16](#16-multi-frontend-callback-routing)). `get_sso_enabled()` reads from `system_configuration` with 60s in-process cache. |
| Pydantic DTOs | `core/models.py` | Request/response shapes for providers, exchange results, user profiles. Shared between package routers and host endpoints. |
| OIDC discovery + authlib client | `core/discovery.py` | Fetches `.well-known`, builds authlib `OAuth` registries. No host dependency — takes `encryption_key` as a parameter. |
| Attribute mapping + issuer validation | `core/claims.py` | `apply_attribute_map()`, `normalize_issuer()`, `SsoClaimError`. OIDC-specific logic that doesn't depend on the host's user model. |
| Fernet encrypt/decrypt | `core/crypto.py` | Key derivation + Fernet operations for `client_secret_enc` and `id_token_enc`. Takes `encryption_key` as a parameter — no reference to host `settings`. |
| IdP logout URL builder | `core/logout.py` | `build_idp_logout_url()` — standard `end_session_endpoint` with `id_token_hint`, or custom `logout_uri` fallback. |
| `SsoUserProvider` protocol | `providers/base.py` | ABC that the host implements: `find_user_by_email()`, `create_user()`, `is_user_active()`, `assign_default_role()`. The package calls these callbacks during user resolution — it never imports the host's ORM models. |
| `SsoStorage` protocol + SQLAlchemy impl | `storage/base.py`, `storage/sqlalchemy_storage.py` | Abstract persistence interface + concrete ORM models for all `iam_sso_*` tables. The storage shares the host's SQLAlchemy `Session` but uses its own `declarative_base()`. |
| FastAPI routers (auth + admin) | `adapters/fastapi.py` | `create_sso_auth_router()` — `/auth/sso/providers`, `/redirect`, `/callback`. `create_sso_admin_router()` — `/sso-providers` CRUD. Both use DI placeholders that the host overrides. |

### What Lives in the Host Application

| Concern | Host File | Why It's Here |
|---------|-----------|---------------|
| Unified `POST /auth/login` (SSO code path) | `apps/app_db/router/auth.py` | When `{code}` is present: consumes the one-time login code (via package), checks `SSO_ENABLED` from DB, then mints the host's own JWT tokens, queries IAM permissions, builds `LoginResponse` with DFA-specific fields. |
| Unified `POST /auth/logout` (SSO cleanup) | `apps/app_db/router/auth.py` | Revokes host-owned refresh tokens. Delegates IdP logout URL to the package, deactivates SSO sessions. Returns `logout_url` in response. |
| `DfaUserProvider` | `apps/app_db/services/sso_user_provider.py` | Concrete implementation of `SsoUserProvider`. Queries/creates `IamUser` rows, creates `IamUserRole` for auto-provisioned users (derives `app_key` from the role itself). |
| DI wiring + router mounting | `main.py` (SSO block) | **Always** mounts SSO routers (no conditional gate). Creates `SsoConfig` with multi-app resolvers (`callback_url_resolver` → `origin_url` lookup, `sso_enabled_checker` → per-app `SSO_ENABLED`), overrides package DI placeholders (`get_sso_service`, `is_sso_enabled`, `get_sso_user_id`), registers exception handlers, calls `initialize_tables()`. |
| JWT minting + token payload | `apps/app_db/services/auth_token_payload.py`, `apps/shared/config/security.py` | `create_access_token()`, `create_refresh_token()` — host-specific token format, signing keys, expiration. |
| Refresh token persistence | `apps/app_db/services/refresh_token_service.py` | Host-owned `iam_user_refresh_token` table — no SSO columns after migration 107. Token rotation is independent of SSO session. |
| `_require_local_login()` gate | `apps/app_db/router/auth.py` | Reads `SSO_ENABLED` from DB; returns 403 for local login/register/reset when true. Unified login handler uses this for the `{username, password}` path. Host policy decision. |
| IAM seed data | `apps/app_db/scripts/seed_iam.py` | Registers SSO API routes in `iam_resource_api` with access levels. IAM is a host concern. |

### Design Rule: When to Put Code in the Package vs Host

| Put it in the **package** if… | Put it in the **host** if… |
|-------------------------------|----------------------------|
| It involves OIDC protocol mechanics (token exchange, discovery, PKCE, claim mapping) | It involves minting the host's own JWTs or computing IAM permissions |
| It operates only on `iam_sso_*` tables | It operates on the host's user model (`iam_user`, `iam_user_role`, `iam_user_refresh_token`) |
| It could be reused by another DFA application (Visualizer, Dashboard) with only a `SsoUserProvider` implementation change | It is specific to DataManager's domain (workflow metadata, permission summary, DFA-specific `LoginResponse` shape) |
| It needs no imports from `apps/app_db/` or `apps/shared/config/` | It must import host models, host settings, or host services |

### Dependency Direction

```
Host Application (main.py, app_db/)
    │
    │ imports + configures
    ▼
dfa_sso_service (package)
    │
    │ calls back via protocols
    ▼
SsoUserProvider (implemented by host)
SsoStorage (SQLAlchemy impl in package, shares host's DB session)
```

The package **never** imports from `apps/app_db/` or `apps/shared/config/`. All host-specific behavior flows through:

1. **`SsoConfig`** — encryption key, callback URL resolver, SSO enabled checker (set once at startup)
2. **`SsoUserProvider`** — user CRUD callbacks (injected per request)
3. **DI placeholders** — `get_sso_service`, `is_sso_enabled`, `get_sso_user_id` (overridden in `main.py`)
4. **`system_configuration`** — `SSO_ENABLED` read at runtime via cached DB reader
5. **`system_application_client.origin_url`** — FED callback URL source (`{origin}/auth/sso/callback`)

---

## 16. Multi-Frontend Callback Routing

Multiple DFA products (DataManager, Visualizer, Dashboard) share one backend API. SSO login codes and sessions are **app-agnostic** — a user authenticates once via the IdP and each product exchanges its own login code for a JWT scoped to its `app_key`.

### Problem

The SSO redirect (`GET /auth/sso/{provider}/redirect`) and callback (`GET /auth/sso/{provider}/callback`) are **PUBLIC** — no `X-Api-Key` header is sent. Without an app identifier the callback always resolves `DEFAULT_APP_KEY` (`DFA_DM`) and redirects the browser to DM's callback page, even when the flow was initiated by another product.

### Solution — `?app_key` + session

The initiating frontend appends `?app_key=DFA_VIZ` (or whatever its `APP_ID` is) to the redirect URL. The redirect handler stores it in the server-side session (shared with authlib's OIDC state/PKCE). The callback handler reads it back and resolves the correct frontend callback URL.

```
1. FED login page
   → GET /auth/sso/drupal/redirect?app_key=DFA_VIZ

2. Redirect handler
   a. Require `app_key` query param (error if missing)
   b. Validate SSO_ENABLED for app_key via sso_enabled_checker
   c. Verify callback URL can be resolved (origin_url present)
   d. session["sso_app_key"] = app_key
   e. authlib authorize_redirect → IdP

3. IdP authenticates → redirects to callback

4. Callback handler
   a. ctx_app_key = session.pop("sso_app_key") — error if missing
   b. callback_url = sso.resolve_callback_url(ctx_app_key)
      → `{origin_url}/auth/sso/callback` from system_application_client (FED, ACTIVE)
      → Error if origin_url not configured
   c. 302 → callback_url?code=ONE_TIME_CODE

5. FED callback page
   → POST /auth/login { code } via BFF (with its own API key)
```

### Callback URL resolution

Single source: **`origin_url`** on `system_application_client` (FED, ACTIVE) for the initiating `app_key`, plus fixed path `/auth/sso/callback`.

If `app_key` is missing, `origin_url` is empty, or no ACTIVE FED client exists for that app, the API returns **`SsoConfigError`** (HTTP 500 with `SSO_CONFIG_ERROR`). There is no `system_configuration` or `.env` fallback.

### `SsoConfig` callables

The package stays decoupled via callables on `SsoConfig`:

| Callable | Signature | Purpose |
|----------|-----------|---------|
| `callback_url_resolver` | `(app_key: str) -> str` | **Required** for multi-FED routing. Host injects a closure that queries `system_application_client.origin_url`. Must raise or return empty on misconfiguration. |
| `sso_enabled_checker` | `(app_key: str) -> bool` | Checks `SSO_ENABLED` for a specific app. Host injects a closure that reads `system_configuration`. |

### Cross-app SSO experience

When a user logs into DM via SSO and then navigates to Visualizer:

1. Visualizer detects no session (no BFF cookies for its domain).
2. Visualizer redirects to `GET /auth/sso/drupal/redirect?app_key=DFA_VIZ`.
3. Drupal already has an active browser session → auto-approves (no login prompt).
4. API callback resolves VIZ's `origin_url` → redirects to Visualizer's callback page.
5. Visualizer exchanges the login code → gets a VIZ-scoped JWT.

The user sees no login form on the second product.

### Onboarding a new FED to SSO

1. Set `origin_url` on its `system_application_client` row (e.g. `https://viz.example.com`).
2. Set `SSO_ENABLED = true` for its `app_key` in `system_configuration`.
3. Register SSO auth routes for its `app_key` in `seed_iam.py` (or via SQL).
4. Add an `/auth/sso/callback` page to the frontend that exchanges the code via `POST /auth/login`.
5. Append `?app_key={APP_ID}` to SSO redirect links in the login page.

`app_key` is **required** on every SSO redirect. Without it, or without a configured `origin_url`, the API returns an error.
