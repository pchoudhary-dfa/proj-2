## Application Client Authentication

This document describes how **applications (FED, external backends, mobile apps)** integrate with the DFA Toolkit API using signature-based authentication and IAM-controlled access levels.

---

## 1. Concepts

- **App client**: A non-human caller (browser FED, external backend, mobile app) identified by `api_key` in `system_application_client`.
- **User**: A human (or service account) whose identity is carried in a JWT or auto-injected from the client row.
- **Service account**: A `system_user` row with `user_type = SYSTEM`, created solely to represent an external backend or automated process.
- **Auto-inject**: When `requires_user_auth = 0` and no JWT is present, the middleware injects `default_user_id` and uses `default_role_id` for permission checks — no login call needed.

### 1.1 Access levels (`iam_resource_api.access_level`)

| Level | Requires |
|---|---|
| `PUBLIC` | Nothing — login, health check endpoints |
| `APP_CLIENT` | Valid app client (SIGNATURE) only |
| `AUTHENTICATED` | Valid app client + user identity (JWT or auto-inject) |
| `PERMISSION` | Valid app client + user identity + IAM role permission check |

### 1.2 Auth method

All clients use **`auth_method = SIGNATURE`** (Ed25519 or RSA-SHA256). The client holds a private key and signs each request. The API stores only the public key — the private key is never transmitted or persisted on the server.

> **Note:** The `auth_method` column in `system_application_client` retains a `SECRET` enum value from an earlier design. `SECRET` is **not implemented** in the current middleware — any client registered with `auth_method = SECRET` will receive a 401. Only `SIGNATURE` is supported.

### 1.3 Signatures vs. encryption — why we sign, not encrypt

In this design we use **digital signatures** for request authentication and integrity, not general-purpose encryption.

| | Signatures (what we use) | Encryption (what we are NOT doing) |
|---|---|---|
| Client holds | **Private key** — signs each request | Would encrypt data with the public key |
| Server stores | **Public key only** — verifies signatures | Would store a private key to decrypt |
| If public key is stolen | Attacker **cannot** forge signatures | Attacker could impersonate the API |
| Private key exposure | Never — stays on the client | Server-side DB leak would expose it |

The API never decrypts anything. It only **verifies** that the signature on an incoming request matches the stored public key. The private key never leaves the client.

#### 1.3.1 Why encryption with a server public key does not provide client authentication

It is possible to design a flow where the API owns a key pair, stores the private key, and clients encrypt payloads using the public key. This does **not** work for client authentication because:

- Anyone who can read the API documentation (or extract the FED bundle) can obtain the public key.
- With the public key, any party can construct a valid encrypted payload.
- The API, after decrypting, cannot distinguish "our official FED" from "a custom client using the same public key".

Encryption with the server's public key provides **confidentiality**, not proof of sender identity. Signatures with the client's private key provide verifiable proof that the sender holds the key corresponding to the stored public key.

For FED (browser) clients:

- We accept that anything in browser code (including a private key) can be extracted.
- Signatures still provide request integrity and tie requests to a specific frontend build.
- We do **not** treat FED signatures as a hard security boundary. Real authorization decisions rely on user JWTs and IAM permissions, with CORS, origin checks, and rate limiting as additional layers.

### 1.4 User identity: JWT vs auto-inject

Whether user identity comes from a JWT or auto-inject is controlled by `requires_user_auth` on the client row:

| `requires_user_auth` | Behavior |
|---|---|
| `1` (default) | Client **must** provide `Authorization: Bearer <jwt>`. No JWT → 401. |
| `0` | JWT is optional. If no JWT is present, middleware auto-injects `default_user_id` as the effective user and uses `default_role_id` for permission checks. |

There is **no refresh token mechanism**. For `requires_user_auth = 0`, no token is ever needed. For `requires_user_auth = 1`, a client uses its JWT until it expires, then calls `POST /auth/login` again for a fresh token. Re-login is the only renewal path.

---

## 2. `system_application_client` table

Each registered app client has a single row in `system_application_client`.

| Column | Type | Purpose |
|---|---|---|
| `id` | int PK | — |
| `app_key` | varchar | Logical app identifier (`DFA_DM`, `DFA_VIZ`, `DFA_DASH`); links to `iam_resource_api.app_key` for route resolution |
| `app_name` | varchar | Human-readable name |
| `app_type` | enum | `FED`, `EXTERNAL`, `MOBILE` |
| `api_key` | varchar unique | Technical identifier sent as `X-Api-Key` header |
| `auth_method` | enum | `SIGNATURE` (only supported value; `SECRET` exists in the schema but is not implemented) |
| `api_secret_hash` | varchar | Legacy column — unused in current implementation. Was intended for bcrypt-hashed shared secrets. Leave NULL for all new clients. |
| `client_public_key` | text | PEM public key for signature verification; private key is given to the client once and never stored |
| `origin_url` | varchar | Allowed origin(s) for `FED` clients (e.g. `https://dm.example.com`) |
| `allowed_ips` | text | Optional comma-separated IP allowlist for EXTERNAL/MOBILE clients |
| `requires_user_auth` | tinyint | `1` = JWT required; `0` = auto-inject from `default_user_id` |
| `default_user_id` | int FK | Service account user (`system_user.id`); required when `requires_user_auth = 0` |
| `default_role_id` | int FK | Role used for PERMISSION checks when auto-injecting (`iam_role.id`); required when `requires_user_auth = 0` |
| `status` | enum | `ACTIVE`, `INACTIVE`, `SUSPENDED` |
| `description` | text | — |
| `owner_user_id` | int | Admin user who registered this client |
| `created`, `modified` | datetime | — |

**Important:**
- `default_user_id` and `default_role_id` must both be set when `requires_user_auth = 0`. The middleware returns 401 if either is missing.
- `default_user_id` should reference a `system_user` row with `user_type = SYSTEM`.
- FED clients always have `requires_user_auth = 1` and leave `default_user_id` / `default_role_id` NULL.

---

## 3. Request signing (all client types)

Every request must include three headers:

```http
X-Api-Key: <api_key>
X-Api-Timestamp: <unix_timestamp_seconds>
X-Api-Signature: <base64_signature>
```

### 3.1 Building the signature

```
string_to_sign = "<HTTP_METHOD>\n<PATH_WITH_QUERY_STRING>\n<X-Api-Timestamp>"
```

Example for `GET /dw/1/indicators?page=1&page_size=10` at timestamp `1710000000`:

```
string_to_sign = "GET\n/dw/1/indicators?page=1&page_size=10\n1710000000"
```

Sign `string_to_sign` with the **private key** using Ed25519 (recommended) or RSA-SHA256, then Base64-encode the raw signature bytes.

### 3.2 Algorithm reference

**Ed25519 (Python):**
```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import base64

private_key = load_pem_private_key(pem_bytes, password=None)
sig = private_key.sign(string_to_sign.encode())
x_api_signature = base64.b64encode(sig).decode()
```

**Ed25519 (PHP — requires sodium extension):**
```php
$sig = sodium_crypto_sign_detached($stringToSign, $privateKeyBytes);
$xApiSignature = base64_encode($sig);
```

**RSA-SHA256 (PHP — standard openssl):**
```php
openssl_sign($stringToSign, $rawSig, $privateKey, OPENSSL_ALGO_SHA256);
$xApiSignature = base64_encode($rawSig);
```

### 3.3 Timestamp window

The `X-Api-Timestamp` must be within **±5 minutes** of server time. Requests outside this window are rejected with 401 to prevent replay attacks.

---

## 4. Client types and use cases

### 4.1 FED (browser frontend) — `requires_user_auth = 1`

The standard case. Users log in via the browser and every request carries their JWT.

**Registration:**
```sql
INSERT INTO system_application_client (
    app_name, app_key, app_type, api_key, auth_method,
    client_public_key, origin_url, requires_user_auth, status
) VALUES (
    'Data Manager FED', 'DFA_DM', 'FED', 'dfa_dm_fed_app', 'SIGNATURE',
    '<public_key_pem>', 'https://dm.example.com', 1, 'ACTIVE'
);
```

**Runtime headers:**
```http
X-Api-Key: dfa_dm_fed_app
X-Api-Timestamp: 1710000000
X-Api-Signature: <base64_signature>
Authorization: Bearer <user_jwt>
Origin: https://dm.example.com
```

**Middleware behavior:**
- Verifies SIGNATURE headers.
- Validates Origin against `origin_url`.
- For `AUTHENTICATED`/`PERMISSION`: decodes JWT, uses `jwt.sub` as `user_id`.
- `PERMISSION`: checks `iam_user_role` → `iam_role_resource_api`.

**Detailed server-side verification sequence (for FED debugging reference):**

1. Extract `X-Api-Key`. Missing → **401**.
2. Load `system_application_client` by `api_key`. Not found or `status != ACTIVE` → **401**.
3. `auth_method != SIGNATURE` → **401** (misconfigured client).
4. Require `X-Api-Timestamp` and `X-Api-Signature`. Missing → **401**.
5. Validate timestamp window (±5 minutes). Outside → **401**.
6. Rebuild `string_to_sign = "<METHOD>\n<PATH_WITH_QUERY>\n<X-Api-Timestamp>"`.
7. Decode `X-Api-Signature` from base64. Verify against `client_public_key` using the agreed algorithm. Invalid → **401**.
8. If `app_type = FED` and `origin_url` is set: validate `Origin`/`Referer` header against allowed origins. Mismatch → **403**.
9. Resolve `access_level` for `(method, path, app_key)` from IAM. Not registered for this app → **403**.
10. Apply access-level checks (JWT, role) as described in the validation pipeline (Section 5).

---

### 4.2 External service client with auto-inject — `requires_user_auth = 0`

For server-to-server calls where the external backend always acts as a fixed service identity. No login call is ever needed. The client only signs requests.

**Example:** `dfa_mon_api_v2` calling v6 APIs.

**One-time registration (SQL):**

```sql
-- 1. Service account user
INSERT INTO system_user (username, email, user_type, status)
VALUES ('svc.mon_api', 'svc.mon_api@system', 'SYSTEM', 'ACTIVE');

-- 2. Role with permitted endpoints
INSERT INTO iam_role (app_key, role_code, description)
VALUES ('DFA_DM', 'EXTERNAL_CLIENT', 'External backend service role');

-- Grant specific endpoints to this role
INSERT INTO iam_role_resource_api (role_id, resource_api_id)
VALUES (<external_client_role_id>, <resource_api_id>), ...;

-- 3. Register the client (handled by seed_application_clients.py + seed_monitoring_api.py)
INSERT INTO system_application_client (
    app_name, app_key, app_type, api_key, auth_method,
    client_public_key, requires_user_auth,
    default_user_id, default_role_id, status
) VALUES (
    'DFA Monitoring API', 'DFA_DM', 'EXTERNAL', 'dfa_mon_api_app', 'SIGNATURE',
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAqdpK7KoPYFtzRF4kOzq0mydvNi1U7tvC2DAblgSnI3M=\n-----END PUBLIC KEY-----',
    0, <svc_mon_api_user_id>, <external_client_role_id>, 'ACTIVE'
);
```

**Runtime headers (no Authorization header needed):**
```http
X-Api-Key: dfa_mon_api_app
X-Api-Timestamp: 1710000000
X-Api-Signature: <base64_signature>
```

**Middleware behavior:**
- Verifies SIGNATURE headers.
- `requires_user_auth = 0`, no JWT present → auto-inject `default_user_id` as `user_id`.
- `PERMISSION`: checks `default_role_id` directly against `iam_role_resource_api` (no `iam_user_role` join needed).
- All requests are tracked against the service account `user_id` in logs.

**PHP client example:**
```php
$timestamp   = time();
$method      = 'GET';
$path        = '/dw/1/indicators?page=1';
$strToSign   = "$method\n$path\n$timestamp";

openssl_sign($strToSign, $rawSig, $privateKey, OPENSSL_ALGO_SHA256);

$headers = [
    'X-Api-Key: '       . env('DM_V6_API_KEY'),
    'X-Api-Timestamp: ' . $timestamp,
    'X-Api-Signature: ' . base64_encode($rawSig),
    'Content-Type: application/json',
];
```

Store `DM_V6_API_KEY` and the private key (PEM) in `.env`. Never commit to git.

---

### 4.3 External client with per-user authentication — `requires_user_auth = 1`

For external backends that act on behalf of specific human users (e.g. a third-party integration where the end-user logs in through the external app and their identity must flow through to the API).

**Registration:**
```sql
INSERT INTO system_application_client (
    app_name, app_key, app_type, api_key, auth_method,
    client_public_key, requires_user_auth, status
) VALUES (
    'Partner Integration', 'DFA_DM', 'EXTERNAL', 'partner_app_key', 'SIGNATURE',
    '<public_key_pem>', 1, 'ACTIVE'
);
```

`default_user_id` and `default_role_id` are NULL — the client must always supply a user JWT.

**Runtime:** Client calls `POST /auth/login` with the user's credentials to get a JWT, then includes it on every API request alongside the SIGNATURE headers. When the JWT expires, the client calls `/auth/login` again for a fresh token. There is no refresh token — re-login is the mechanism.

```http
X-Api-Key: partner_app_key
X-Api-Timestamp: 1710000000
X-Api-Signature: <base64_signature>
Authorization: Bearer <user_jwt>
```

---

### 4.4 Mobile app — service mode — `requires_user_auth = 0`

Same as 4.2. The mobile app acts as a fixed service identity (e.g. data sync agent). Private key is stored in OS secure storage (iOS Keychain / Android Keystore).

```sql
INSERT INTO system_application_client (
    app_name, app_key, app_type, api_key, auth_method,
    client_public_key, requires_user_auth,
    default_user_id, default_role_id, status
) VALUES (
    'Mobile Sync Agent', 'DFA_DM', 'MOBILE', 'dfa_mobile_sync', 'SIGNATURE',
    '<public_key_pem>', 0,
    <svc_mobile_user_id>, <mobile_sync_role_id>, 'ACTIVE'
);
```

---

### 4.5 Mobile app — user mode — `requires_user_auth = 1`

The end-user logs in on the device. The mobile app calls `POST /auth/login` to get a JWT, stores it locally, and includes it on every request. When expired, the user re-authenticates on the device.

```sql
INSERT INTO system_application_client (
    app_name, app_key, app_type, api_key, auth_method,
    client_public_key, requires_user_auth, status
) VALUES (
    'DFA Mobile App', 'DFA_DM', 'MOBILE', 'dfa_mobile_app', 'SIGNATURE',
    '<public_key_pem>', 1, 'ACTIVE'
);
```

---

## 5. Combined validation pipeline

The middleware processes every non-skipped request in this order:

```
1. Resolve (method, path) → iam_resource_api matches

2. All matches PUBLIC?
      Yes → allow, skip all auth

3. Validate app client (all non-PUBLIC routes)
   a. Extract X-Api-Key → load system_application_client
   b. status != ACTIVE → 401
   c. auth_method != SIGNATURE → 401
   d. allowed_ips set → check caller IP → 403 if mismatch
   e. ENABLE_SIGNATURE_VERIFICATION:
        - Require X-Api-Timestamp and X-Api-Signature → 401 if missing
        - Timestamp outside ±5 min window → 401
        - Rebuild string_to_sign, verify signature against client_public_key → 401 if invalid
   f. FED + origin_url set → validate Origin/Referer header → 403 if mismatch

4. Resolve access_level for this client's app_key
      app_key not registered for this route → 403

5. access_level = APP_CLIENT → allow

6. access_level = AUTHENTICATED / PERMISSION
   │
   ├── requires_user_auth = 1
   │     Authorization: Bearer present + valid?
   │       No  → 401
   │       Yes → user_id = jwt.sub
   │
   └── requires_user_auth = 0
         Authorization: Bearer present + valid?
           Yes → user_id = jwt.sub  (explicit JWT honored)
           No  → default_user_id set?
                   No  → 401 (misconfigured client)
                   Yes → auto-inject: user_id = default_user_id

7. access_level = AUTHENTICATED → allow

8. access_level = PERMISSION
   │
   ├── is_super_admin?  (jwt.super_admin_api_keys contains current app_key)
   │     Yes → skip role check entirely, allow
   │
   ├── user_id from JWT (requires_user_auth=1 or explicit JWT)
   │     → iam_user_role JOIN iam_role_resource_api
   │     → no matching role grant → 403
   │
   └── user_id auto-injected (requires_user_auth=0, no JWT)
         → direct iam_role_resource_api check using default_role_id
         → no matching grant → 403
```

---

## 6. Quick reference

| Client type | `app_type` | `requires_user_auth` | `default_user_id` | Headers needed |
|---|---|---|---|---|
| FED browser | `FED` | `1` | NULL | `X-Api-Key`, `X-Api-Timestamp`, `X-Api-Signature`, `Authorization`, `Origin` |
| External service (auto-inject) | `EXTERNAL` | `0` | system user | `X-Api-Key`, `X-Api-Timestamp`, `X-Api-Signature` |
| External with user auth | `EXTERNAL` | `1` | NULL | `X-Api-Key`, `X-Api-Timestamp`, `X-Api-Signature`, `Authorization` |
| Mobile service mode | `MOBILE` | `0` | system user | `X-Api-Key`, `X-Api-Timestamp`, `X-Api-Signature` |
| Mobile user mode | `MOBILE` | `1` | NULL | `X-Api-Key`, `X-Api-Timestamp`, `X-Api-Signature`, `Authorization` |

### JWT lifecycle

- `requires_user_auth = 0`: JWT is never needed. Auto-inject handles all user context.
- `requires_user_auth = 1`: Client uses its JWT until it expires, then calls `POST /auth/login` for a fresh token. There is no refresh token — re-login is the only mechanism.

---

## 7. `system_user` — service account setup

Service accounts used as `default_user_id` should be created with `user_type = SYSTEM`:

```sql
INSERT INTO system_user (username, email, user_type, status, created, modified)
VALUES ('svc.mon_api', 'svc.mon_api@system', 'SYSTEM', 'ACTIVE', NOW(), NOW());
```

`SYSTEM` users:
- Do not appear in human user management screens.
- Cannot log in via `POST /auth/login` (blocked at auth service level).
- Are only reachable through auto-inject from a registered `system_application_client`.

---

## 8. `EXTERNAL_CLIENT` role — setup

Create a dedicated role for external service clients and grant it only the endpoints it needs:

```sql
-- Create role
INSERT INTO iam_role (app_key, role_code, description, created, modified)
VALUES ('DFA_DM', 'EXTERNAL_CLIENT', 'External backend service role', NOW(), NOW());

-- Grant specific endpoints (repeat per endpoint)
INSERT INTO iam_role_resource_api (role_id, resource_api_id, created)
VALUES (<external_client_role_id>, <resource_api_id>, NOW());
```

This role defines the exact API surface available to all external service clients. To adjust what `mon_api` can access, update `iam_role_resource_api` for this role.

---

## 9. Development setup (local only)

### 9.1 Seeding default clients

```bash
# Core app clients (DFA_DM, DFA_VIZ, dfa_mon_api)
python apps/app_db/scripts/app_db/seed_application_clients.py --force

# Dashboard app client (DFA_DASH)
python apps/app_db/scripts/app_dashboard/seed_dash_app_client.py --force

# Or run everything in one command via seed_all.py
python apps/app_db/scripts/seed_all.py
```

### 9.2 Example development keys

Public keys below are the development values the seed scripts store. Private keys are **never** kept in this repo: obtain them from the team secret store and inject them through environment variables (local `.env`, k8s Secret, or build-pipeline variable). The placeholders below show where each one goes.

**Data Manager FED (`dfa_dm_fed_app`)** — `app_key=DFA_DM`, `app_type=FED`, `requires_user_auth=1`
- Public key (stored in DB):
  ```
  -----BEGIN PUBLIC KEY-----
  MCowBQYDK2VwAyEAZGbEEyR+cyrLjnEIowtpHBc7coJTSTETAWgXHmCfkFM=
  -----END PUBLIC KEY-----
  ```
- Private key (Data Manager BFF: `DM_API_SIGNING_PRIVATE_KEY`; API dev Swagger: `DFA_DM_API_SIGNING_PRIVATE_KEY`; do not commit):
  ```
  -----BEGIN PRIVATE KEY-----
  <base64-pkcs8-private-key>
  -----END PRIVATE KEY-----
  ```

**Visualization FED (`dfa_viz_fed_app`)** — `app_key=DFA_VIZ`, `app_type=FED`, `requires_user_auth=1`
- Public key:
  ```
  -----BEGIN PUBLIC KEY-----
  MCowBQYDK2VwAyEAPPiq4RLpCbafEDnDDe55Ql0XsMnyF8ZWjxaxodSyDYA=
  -----END PUBLIC KEY-----
  ```
- Private key (Visualizer: `API_SIGNING_PRIVATE_KEY` / `NEXT_PUBLIC_API_SIGNING_PRIVATE_KEY`; API dev Swagger: `DFA_VIZ_API_SIGNING_PRIVATE_KEY`; do not commit):
  ```
  -----BEGIN PRIVATE KEY-----
  <base64-pkcs8-private-key>
  -----END PRIVATE KEY-----
  ```

**Dashboard FED (`dfa_dash_fed_app`)** — `app_key=DFA_DASH`, `app_type=FED`, `requires_user_auth=1`

Seeded by `apps/app_db/scripts/app_dashboard/seed_dash_app_client.py`.

- Public key (stored in DB):
  ```
  -----BEGIN PUBLIC KEY-----
  MCowBQYDK2VwAyEA0QkqJ66O/2mMaMhjJKxbG1vVxNVI5sZI2OJQuX0/0TI=
  -----END PUBLIC KEY-----
  ```
- Private key (Dashboard BFF: `DM_API_SIGNING_PRIVATE_KEY`; API dev Swagger: `DFA_DASH_API_SIGNING_PRIVATE_KEY`; do not commit):
  ```
  -----BEGIN PRIVATE KEY-----
  <base64-pkcs8-private-key>
  -----END PRIVATE KEY-----
  ```

Runtime headers (same as all FED clients):
```http
X-Api-Key: dfa_dash_fed_app
X-Api-Timestamp: 1710000000
X-Api-Signature: <base64_ed25519_signature>
Authorization: Bearer <user_jwt>
```

**DFA Monitoring API (`dfa_mon_api_app`)** — `app_key=DFA_DM`, `app_type=EXTERNAL`, `requires_user_auth=0`
- Public key (stored in DB via `seed_application_clients.py`):
  ```
  -----BEGIN PUBLIC KEY-----
  MCowBQYDK2VwAyEAqdpK7KoPYFtzRF4kOzq0mydvNi1U7tvC2DAblgSnI3M=
  -----END PUBLIC KEY-----
  ```
- Private key (store in `dfa_mon_api_v2` `.env` as `DM_V6_PRIVATE_KEY`; do not commit):
  ```
  -----BEGIN PRIVATE KEY-----
  <base64-pkcs8-private-key>
  -----END PRIVATE KEY-----
  ```

**DFA CMS API (`dfa_cms_api_app`)** — `app_key=DFA_DM`, `app_type=EXTERNAL`, `requires_user_auth=0`
- Public key (stored in DB via `seed_application_clients.py`):
  ```
  -----BEGIN PUBLIC KEY-----
  MCowBQYDK2VwAyEAwO5WiO/IVC53J7aBU7fdA1JLvkgEa6oSg6y5/sWw3go=
  -----END PUBLIC KEY-----
  ```
- Private key (store in the CMS service `.env` as `DM_V6_PRIVATE_KEY`; `scripts/app_cms/cms_create_user.php` reads `DFA_PRIVATE_KEY_PEM` or `DFA_PRIVATE_KEY_PATH`; do not commit):
  ```
  -----BEGIN PRIVATE KEY-----
  <base64-pkcs8-private-key>
  -----END PRIVATE KEY-----
  ```
- IAM: service user `svc.cms_api`, role `EXTERNAL_CMS_CLIENT` (PERMISSION grants on `sys_user_role` only). Seeded by `seed_cms_api.py`.

For production: generate new key pairs, update the public keys in the seed scripts, and share private keys only via a secure channel.
