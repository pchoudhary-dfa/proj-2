# DFA SSO Service

Isolated OIDC/SSO authentication package for FastAPI applications.

## Overview

This package provides the complete SSO authentication flow — provider management,
OIDC login, user identity resolution, and IdP session logout — with **zero hard
coupling** to the host application's user model.

The host communicates with the package through two interfaces:

- **`SsoUserProvider`** — abstract callback protocol for user operations (find, create, check active, assign role)
- **`SsoStorage`** — abstract persistence layer (SQLAlchemy implementation included)

## Package-owned tables

All tables use the `iam_sso_` prefix and are self-provisioned at startup via `initialize_tables()`:

| Table | Purpose |
|-------|---------|
| `iam_sso_identity_provider` | Merged IdP catalog + OIDC config (one global row per provider) |
| `iam_sso_user_identity` | Links `user_id` to external IdP identity (`idp_user_id`) |
| `iam_sso_login_code` | One-time bridge codes (callback → exchange) |
| `iam_sso_session` | Active SSO session context for logout |

4 default providers are seeded automatically: `drupal` (active), `google`, `azure_ad`, `facebook` (inactive).

## SSO configuration

`SSO_ENABLED` is stored in the host's `system_configuration` table (per `app_key`), read at runtime with 60s in-process caching. No restart required to toggle SSO.

Frontend callback URLs are **not** in `system_configuration`. The host injects a `callback_url_resolver` on `SsoConfig` that derives `{origin_url}/auth/sso/callback` from `system_application_client` (FED, ACTIVE). Missing `app_key` or `origin_url` returns an error.

## Quick start

```python
# main.py
from dfa_sso_service import SsoService, SsoConfig, initialize_tables
from dfa_sso_service.core.config import get_sso_enabled
from dfa_sso_service.storage.sqlalchemy_storage import SqlAlchemySsoStorage
from dfa_sso_service.adapters.fastapi import (
    create_sso_auth_router,
    create_sso_admin_router,
    get_sso_service as _sso_dep_placeholder,
    is_sso_enabled as _sso_enabled_placeholder,
)

# Self-provision tables + seed at startup
initialize_tables(engine)

_SSO_CALLBACK_PATH = "/auth/sso/callback"

# SSO service factory (per-request)
def _get_sso_service(db=Depends(get_db)) -> SsoService:
    def _resolve_callback_url(app_key: str) -> str:
        # Look up origin_url on system_application_client (FED, ACTIVE)
        # Return f"{origin}{_SSO_CALLBACK_PATH}" or raise SsoConfigError
        ...

    config = SsoConfig(
        encryption_key="...",
        callback_url_resolver=_resolve_callback_url,
        sso_enabled_checker=lambda ak: get_sso_enabled(db, ak),
    )
    return SsoService(
        storage=SqlAlchemySsoStorage(db),
        user_provider=MyUserProvider(db),
        config=config,
    )

# SSO_ENABLED check (per-request, reads from system_configuration)
def _is_sso_enabled(db=Depends(get_db), app_key=Depends(get_app_key)) -> bool:
    return get_sso_enabled(db, app_key)

# Always mount routers; runtime check in handlers
app.dependency_overrides[_sso_dep_placeholder] = _get_sso_service
app.dependency_overrides[_sso_enabled_placeholder] = _is_sso_enabled
app.include_router(create_sso_auth_router(), prefix="")
app.include_router(create_sso_admin_router(), prefix="")
```

## Dependencies

- `authlib` — OIDC client
- `httpx` — OIDC discovery HTTP calls
- `cryptography` — Fernet encryption for secrets and id_token
- `sqlalchemy` — ORM storage backend
- `pydantic` — DTOs and validation
- `starlette` — session middleware (authlib requirement)

## Configuration

| `SsoConfig` field | Required | Description |
|---|---|---|
| `encryption_key` | Yes | Fernet key for id_token / client_secret encryption |
| `callback_url_resolver` | Yes (multi-FED) | `(app_key) -> url` — host resolves from FED `origin_url` |
| `sso_enabled_checker` | No | `(app_key) -> bool` — per-app SSO_ENABLED check |
| `user_table` | No | Parent user table name (documentation) |
| `user_id_column` | No | Parent user PK column (documentation) |

## What the host still owns

- `/exchange` endpoint — JWT minting, permissions, workflow metadata
- `/logout` endpoint — revokes host tokens, delegates IdP logout URL to package
- `SsoUserProvider` implementation — queries host's user model
- `SessionMiddleware` — required by authlib for OIDC state
- `system_configuration` row for `SSO_ENABLED` per app_key
- `system_application_client.origin_url` per FED — callback URL source
