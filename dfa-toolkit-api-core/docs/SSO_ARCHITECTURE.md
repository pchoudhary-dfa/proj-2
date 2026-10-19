# SSO Architecture — DataManager as OIDC Hub

## Overview

DataManager plays a **dual role** in the authentication ecosystem:

```
     External Identity Providers
         (Google, Drupal, Azure AD, etc.)
                      ▲
                      │  DataManager acts as OIDC Client
                      ▼
   ┌──────────────────────────────────────────┐
   │               DataManager               │
   │------------------------------------------│
   │  1. Local Login                          │
   │     Username/password stored locally     │
   │                                          │
   │  2. External Login                       │
   │     Login via Google / Drupal / Azure AD │
   │                                          │
   │  3. Identity Provider                    │
   │     Issues OIDC tokens to other apps     │
   └──────────────────▲───────────────────────┘
                      │  DataManager acts as OIDC Provider
                      ▼
         Other Applications (OIDC Clients)
         (DFA Visualizer, DFA Dashboard, etc.)
```

| Role | Direction | Standard |
|---|---|---|
| **OIDC Relying Party (RP)** | DataManager → External IdPs | OAuth2 / OIDC |
| **OIDC Provider (OP) / Authorization Server** | Other Apps → DataManager | OAuth2 / OIDC |

---

## Naming Conventions (existing codebase)

**Table prefixes:**

| Prefix | Domain |
|---|---|
| `system_*` | Platform registry — applications, configuration, language, gallery |
| `iam_*` | Identity & access — users, roles, permissions, tokens |
| `review_*` | Workflow engine |
| `logs_*` | Server/audit logs |

> All SSO tables belong under the `iam_*` prefix — they are identity and auth concerns.

**Column conventions:**

| Pattern | Rule | Examples |
|---|---|---|
| Primary key | `id` INT autoincrement | `id` |
| Boolean flags | `is_` prefix, SMALLINT | `is_active`, `is_used`, `is_pkce_required` |
| Foreign keys | `{entity}_id` suffix | `user_id`, `created_user_id`, `role_id` |
| Audit timestamps | `created`, `modified` (no `_at`) | most tables |
| Expiry / event timestamps | `_at` suffix | `expires_at`, `created_at` in `iam_user_refresh_token` |
| Enum values | UPPER_CASE | `FED`, `ACTIVE`, `SIGNATURE` |

**Migration revision IDs:** `NNN_short_slug`, max **32 characters total**. Next available: `075`.

---

## Mode 1 — Local Login

**What:** Username + password stored and verified inside DataManager.

**Existing tables — no schema change needed:**

| Table | Role |
|---|---|
| `iam_user` | Stores `username`, `email`, `password` (bcrypt hash). `password` is already `nullable` — SSO users have no local password. |
| `iam_user_refresh_token` | Tracks issued refresh tokens (SHA-256 hash + expiry). Already supports rotation. |

**Flow:**
```
POST /auth/login  { username, password }
  → verify iam_user.password
  → issue access_token (JWT, short-lived) + refresh_token
  → store refresh token hash in iam_user_refresh_token
```

---

## Mode 2 — External Login (DataManager as OIDC Client)

**What:** User logs in via Google / Drupal / Azure AD. DataManager redirects to the external IdP, receives an authorization code, exchanges it for tokens, and maps the external identity to an internal `iam_user`.

---

### 2a. IdP Configuration — NEW table `iam_sso_provider`

One row per enabled provider per application. Stores everything DataManager needs to initiate and complete the OAuth2/OIDC handshake with an upstream IdP.

**Reference design:** An existing DFA-adjacent system uses `idp_oauth` with explicit OIDC endpoint columns alongside a nullable `well_known_uri`. That pattern is adopted here — storing individual endpoints handles self-hosted providers (Drupal, custom OIDC) that may not have a `.well-known` discovery URL. The reference stored `client_secret` as `varchar(150)` plaintext — that is a security vulnerability corrected here.

```sql
CREATE TABLE iam_sso_provider (
    id                     INT          PRIMARY KEY AUTO_INCREMENT,
    app_key                VARCHAR(20)  NOT NULL,
    provider_code          VARCHAR(20)  NOT NULL,
    client_id              VARCHAR(255) NOT NULL,
    client_secret          TEXT         NOT NULL,

    well_known_uri         VARCHAR(500) NULL,
    authorization_endpoint VARCHAR(500) NULL,
    token_endpoint         VARCHAR(500) NULL,
    userinfo_endpoint      VARCHAR(500) NULL,
    issuer                 VARCHAR(500) NULL,
    jwks_uri               VARCHAR(500) NULL,
    redirect_uri           VARCHAR(500) NULL,

    idp_entity_id          VARCHAR(500) NULL,
    idp_sso_url            VARCHAR(500) NULL,
    idp_certificate        TEXT         NULL,

    attribute_map          TEXT         NULL,
    is_auto_provision      SMALLINT     NOT NULL DEFAULT 0,
    default_role_id        INT          NULL,
    is_active              SMALLINT     NOT NULL DEFAULT 1,
    created                DATETIME     NULL,
    created_user_id        INT          NOT NULL DEFAULT 0,
    modified               DATETIME     NULL,
    modified_user_id       INT          NOT NULL DEFAULT 0,

    UNIQUE KEY uq_sso_provider_app_code (app_key, provider_code),
    FOREIGN KEY (app_key)         REFERENCES system_application (app_key),
    FOREIGN KEY (default_role_id) REFERENCES iam_role (id)
);
```

#### Column Reference

**Identity columns:**

| Column | Example value | Explanation |
|---|---|---|
| `app_key` | `DFA_DM` | Which DataManager application this provider is configured for. FK to `system_application.app_key`. One app can have multiple providers (Google + Azure both for `DFA_DM`). |
| `provider_code` | `google` | Short code identifying the IdP. Used in route paths like `/auth/sso/google/redirect`. Allowed values: `google`, `azure`, `drupal`, `saml`, `ldap`. |
| `client_id` | `812345678901-abc.apps.googleusercontent.com` | The identifier DataManager presents to the IdP. Google calls it "Client ID", Azure calls it "Application (client) ID", SAML calls it "SP Entity ID". Issued by the IdP when you register an application. |
| `client_secret` | `encrypted:AES256:iv=…:ct=…` | The password DataManager uses to prove its identity to the IdP token endpoint. **Stored encrypted** using `APP_ENCRYPTION_KEY` — decrypted in memory at runtime, never logged or returned via API. For SAML this is unused (SAML uses certificate-based signing instead). |

**OIDC endpoint columns:**

These are used at runtime — no live network call at login time, just a DB read. `well_known_uri` is an admin convenience to auto-populate the others on save.

| Column | Example value (Google) | Example value (Drupal self-hosted) | Explanation |
|---|---|---|---|
| `well_known_uri` | `https://accounts.google.com/.well-known/openid-configuration` | `NULL` | The OIDC discovery document URL. If provided, the admin UI fetches it and auto-fills the endpoint columns below. Nullable — self-hosted providers often skip discovery. |
| `authorization_endpoint` | `https://accounts.google.com/o/oauth2/v2/auth` | `https://drupal.example.org/oauth/authorize` | Where DataManager redirects the user's browser to initiate login. The user sees this URL in their browser. |
| `token_endpoint` | `https://oauth2.googleapis.com/token` | `https://drupal.example.org/oauth/token` | Server-to-server call. DataManager POSTs the authorization code here (with `client_id` + `client_secret`) to receive `access_token` + `id_token`. |
| `userinfo_endpoint` | `https://openidconnect.googleapis.com/v1/userinfo` | `https://drupal.example.org/oauth/userinfo` | DataManager calls this (with the `access_token`) to fetch the user's profile claims: `sub`, `email`, `given_name`, `family_name`. |
| `issuer` | `https://accounts.google.com` | `https://drupal.example.org` | The IdP's identity string. DataManager validates that the `iss` claim inside the received `id_token` matches this value exactly. Mismatch = reject token. |
| `jwks_uri` | `https://www.googleapis.com/oauth2/v3/certs` | `https://drupal.example.org/oauth/jwks` | URL of the IdP's public signing keys. DataManager fetches these to verify the `id_token` JWT signature. Cached; re-fetched only on `kid` miss. |
| `redirect_uri` | `https://dm.example.org/auth/sso/google/callback` | `https://dm.example.org/auth/sso/drupal/callback` | The callback URL DataManager registered with this IdP. Must exactly match what was configured in the IdP's developer console. After the user authenticates, the IdP redirects here with the authorization code. |

**SAML-specific columns (NULL for all OAuth2/OIDC providers):**

| Column | Example value | Explanation |
|---|---|---|
| `idp_entity_id` | `https://sts.windows.net/tenant-id/` | The IdP's unique identifier in the SAML federation. Included in the SAML AuthnRequest as the destination issuer. Azure AD and Okta expose this in their SAML metadata XML. |
| `idp_sso_url` | `https://login.microsoftonline.com/tenant-id/saml2` | The URL DataManager POSTs or redirects the SAML AuthnRequest to. Azure AD provides this as "Login URL" in the SAML setup panel. |
| `idp_certificate` | `-----BEGIN CERTIFICATE-----\nMIIC...` | The IdP's X.509 public certificate (PEM format). DataManager uses this to verify the digital signature on incoming SAML Assertions. Rotated periodically by the IdP — must be updated here when it changes. |

**Provisioning and mapping columns:**

| Column | Example value | Explanation |
|---|---|---|
| `attribute_map` | `{"sub":"external_id","email":"email","given_name":"first_name","family_name":"last_name"}` | JSON object mapping IdP claim names (keys) to `iam_user` column names (values). Different IdPs use different claim names: Google uses `given_name`, Azure uses `givenname`, SAML may use `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname`. This mapping normalises them all. |
| `is_auto_provision` | `1` | If `1`, DataManager automatically creates a new `iam_user` row the first time an unknown external identity logs in. If `0`, login fails with "account not found" — an admin must manually create the user first. |
| `default_role_id` | `5` | The `iam_role.id` assigned to auto-provisioned users. Typically a low-privilege "viewer" role. Only used when `is_auto_provision=1`. NULL means no role is assigned automatically. |

**Sample row — Google configured for DFA DataManager:**

```
id                     = 1
app_key                = DFA_DM
provider_code          = google
client_id              = 812345678901-abc.apps.googleusercontent.com
client_secret          = encrypted:AES256:iv=dGVzdA==:ct=abc123…
well_known_uri         = https://accounts.google.com/.well-known/openid-configuration
authorization_endpoint = https://accounts.google.com/o/oauth2/v2/auth
token_endpoint         = https://oauth2.googleapis.com/token
userinfo_endpoint      = https://openidconnect.googleapis.com/v1/userinfo
issuer                 = https://accounts.google.com
jwks_uri               = https://www.googleapis.com/oauth2/v3/certs
redirect_uri           = https://dm.example.org/auth/sso/google/callback
idp_entity_id          = NULL
idp_sso_url            = NULL
idp_certificate        = NULL
attribute_map          = {"sub":"external_id","email":"email","given_name":"first_name","family_name":"last_name"}
is_auto_provision      = 1
default_role_id        = 5
is_active              = 1
```

**Sample row — Azure AD SAML configured for DFA DataManager:**

```
id                     = 2
app_key                = DFA_DM
provider_code          = saml
client_id              = https://dm.example.org/saml/metadata    ← SP Entity ID
client_secret          = (not used for SAML; store empty encrypted value)
well_known_uri         = NULL
authorization_endpoint = NULL
token_endpoint         = NULL
userinfo_endpoint      = NULL
issuer                 = NULL
jwks_uri               = NULL
redirect_uri           = https://dm.example.org/auth/sso/saml/callback
idp_entity_id          = https://sts.windows.net/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/
idp_sso_url            = https://login.microsoftonline.com/xxxxxxxx/saml2
idp_certificate        = -----BEGIN CERTIFICATE-----\nMIIC8DCCAdigAwIBAgIQ…\n-----END CERTIFICATE-----
attribute_map          = {"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress":"email","http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname":"first_name"}
is_auto_provision      = 0
default_role_id        = NULL
is_active              = 1
```

**Endpoint population strategy:**
- If `well_known_uri` is set → admin UI fetches the discovery document and auto-fills the endpoint columns on save
- Individual endpoint columns can always be set or overridden manually
- At runtime DataManager reads the endpoint columns directly — no live discovery fetch per login request

---

### 2b. User Identity Linking — NEW table `iam_user_sso_identity`

One user can link multiple external IdP accounts (e.g., the same person has both a Google and an Azure AD account). This is a separate table — not columns on `iam_user` — because of the one-to-many relationship.

```sql
CREATE TABLE iam_user_sso_identity (
    id               INT          PRIMARY KEY AUTO_INCREMENT,
    user_id          INT          NOT NULL,
    provider_code    VARCHAR(20)  NOT NULL,
    external_id      VARCHAR(255) NOT NULL,
    email            VARCHAR(255) NULL,
    token_expires_at DATETIME     NULL,
    created          DATETIME     NULL,
    created_user_id  INT          NOT NULL DEFAULT 0,
    modified         DATETIME     NULL,
    modified_user_id INT          NOT NULL DEFAULT 0,

    UNIQUE KEY uq_sso_identity_provider_ext (provider_code, external_id),
    FOREIGN KEY (user_id) REFERENCES iam_user (id) ON DELETE CASCADE
);
```

#### Column Reference

| Column | Example value | Explanation |
|---|---|---|
| `user_id` | `42` | FK to `iam_user.id`. The internal DataManager user this external identity belongs to. Cascade delete — if the user is deleted, all their linked identities are removed. |
| `provider_code` | `google` | Matches `iam_sso_provider.provider_code`. Identifies which IdP issued this identity. |
| `external_id` | `108234567890123456789` | The IdP's immutable, stable subject identifier — the `sub` claim in OIDC tokens, or `NameID` in SAML assertions. This is the **primary lookup key** on login. Never use email for this — emails can change and can be re-assigned by the IdP to a different person. |
| `email` | `john.doe@example.com` | The email reported by the IdP **at the time this identity was linked**. Stored as a snapshot for display/audit only — not used for identity matching. If the user changes their email at Google, this column becomes stale but `external_id` still works. |
| `token_expires_at` | `2026-05-11 14:30:00` | When the IdP's access token (stored externally, not here) expires. Used to know when to refresh or re-authenticate with the IdP for back-channel operations. NULL if not tracking IdP token lifetime. |

**UNIQUE(provider_code, external_id):** One external identity can map to exactly one DataManager user. This prevents account takeover — an attacker cannot create a second account with the same Google `sub`. Email is intentionally excluded from this constraint because emails are mutable.

**Sample rows — user linked to both Google and Azure:**

```
id=1  user_id=42  provider_code=google  external_id=108234567890123456789  email=john@gmail.com
id=2  user_id=42  provider_code=azure   external_id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  email=john@company.com
```

Same `user_id=42` — one DataManager account, two external identities.

---

### 2c. `iam_user` — New columns

| Column | Type | Example value | Explanation |
|---|---|---|---|
| `auth_provider` | `VARCHAR(20) DEFAULT 'LOCAL'` | `google` | The primary auth method for this user. `LOCAL` = username/password. `google`, `azure`, `drupal`, `saml` = first SSO provider they logged in with. Used for display ("Logged in via Google") and routing login attempts. Full multi-provider history is in `iam_user_sso_identity`. |
| `external_id` | `VARCHAR(255) NULL` | `108234567890123456789` | Shortcut to the `sub` of the user's primary linked identity. Populated on first SSO login. NULL for LOCAL users. Avoids a join to `iam_user_sso_identity` for the common single-provider case. |

---

### 2d. OAuth2 State / PKCE — NEW table `iam_oauth2_state`

A temporary record created when DataManager redirects the user to an upstream IdP. Deleted immediately after the callback is processed. Exists solely to prevent two attacks: **CSRF** (via `state`) and **authorization code interception** (via PKCE).

**Preferred:** Redis with 10-minute TTL.
**Fallback (no Redis):** DB table below — a background job purges expired rows.

```sql
CREATE TABLE iam_oauth2_state (
    id            INT          PRIMARY KEY AUTO_INCREMENT,
    state         VARCHAR(128) NOT NULL UNIQUE,
    provider_code VARCHAR(20)  NOT NULL,
    code_verifier VARCHAR(128) NULL,
    redirect_uri  VARCHAR(500) NULL,
    expires_at    DATETIME     NOT NULL,
    created_at    DATETIME     NOT NULL
);
```

#### Column Reference

| Column | Example value | Explanation |
|---|---|---|
| `state` | `f47ac10b-58cc-4372-a567-0e02b2c3d479` | A cryptographically random nonce generated by DataManager before redirecting to the IdP. Sent to the IdP in the redirect URL as `?state=…`. The IdP echoes it back in the callback URL. DataManager verifies the echoed value matches this row before proceeding — a mismatch means the callback was not initiated by DataManager (CSRF attack). |
| `provider_code` | `google` | Which IdP this state token belongs to. Used to load the correct `iam_sso_provider` row during the callback. |
| `code_verifier` | `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` | The PKCE plain-text secret. DataManager generates a random 43–128 character string, SHA-256 hashes it to produce `code_challenge`, and sends the hash to the IdP in the redirect. During the callback, `code_verifier` is sent to the token endpoint — the IdP re-hashes it and verifies it matches the earlier `code_challenge`. This ensures only DataManager (who generated the verifier) can exchange the code, even if an attacker intercepts the authorization code. NULL for IdPs that do not support PKCE. |
| `redirect_uri` | `https://dm.example.org/auth/sso/google/callback` | The redirect URI used in this specific request. Stored here so the callback can use the exact same URI when calling the token endpoint — OAuth2 requires the redirect URI to match exactly in both requests. |
| `expires_at` | `2026-05-11 13:10:00` | 10 minutes from creation. If the user takes longer than this to complete IdP login (or abandons it), the state is invalid and the callback will be rejected. |

---

### 2e. External Login Flow

```
User clicks "Login with Google"
  → GET /auth/sso/google/redirect
      → load iam_sso_provider WHERE app_key='DFA_DM' AND provider_code='google'
      → generate state nonce + PKCE code_verifier / code_challenge
      → store in Redis (or iam_oauth2_state)
      → redirect to iam_sso_provider.authorization_endpoint?
            client_id=…&redirect_uri=…&scope=openid profile email
            &state=…&code_challenge=…&code_challenge_method=S256

Google redirects back
  → GET /auth/sso/google/callback?code=abc123&state=f47ac10b…
      → validate state matches iam_oauth2_state row (CSRF check) → delete row
      → POST to iam_sso_provider.token_endpoint
            { code, client_id, client_secret, redirect_uri, code_verifier }
      → receive { access_token, id_token }
      → verify id_token.iss == iam_sso_provider.issuer
      → GET iam_sso_provider.userinfo_endpoint → { sub, email, given_name, … }
      → apply attribute_map → normalize to iam_user field names
      → lookup iam_user_sso_identity WHERE provider_code='google' AND external_id=sub
          → found: resolve to iam_user, log in
          → not found + is_auto_provision=1:
              → INSERT iam_user (mapped fields)
              → INSERT iam_user_role (default_role_id)
              → INSERT iam_user_sso_identity
      → issue DataManager access_token + refresh_token
      → INSERT iam_user_refresh_token (token_hash, expires_at)
```

---

## Mode 3 — DataManager as OIDC Provider (Authorization Server)

**What:** Other applications (DFA Visualizer, DFA Dashboard) delegate user authentication to DataManager. DataManager issues OIDC `id_token` + `access_token` after the user authenticates (Mode 1 or Mode 2).

---

### 3a. Client Registry — `system_application_client` (extended)

`system_application_client` already holds the OAuth2 client concept (`api_key` = `client_id`, `api_secret_hash` = `client_secret` hash). These columns are added:

```
redirect_uris           TEXT         NULL
allowed_scopes          VARCHAR(500) NULL
is_pkce_required        SMALLINT     NOT NULL DEFAULT 1
access_token_expiry_sec INT          NOT NULL DEFAULT 3600
id_token_expiry_sec     INT          NOT NULL DEFAULT 3600
```

`auth_method` Enum extended with `OIDC` alongside existing `SECRET` and `SIGNATURE`.

#### Column Reference

| Column | Example value | Explanation |
|---|---|---|
| `redirect_uris` | `https://viz.example.org/auth/callback\nhttps://viz.example.org/auth/silent` | Newline-separated list of URIs the authorization server is allowed to redirect to after login. DataManager performs **exact-match** validation — the `redirect_uri` in the authorization request must be one of these exactly. No wildcards. If a client has multiple environments (staging + prod), list both here. |
| `allowed_scopes` | `openid profile email` | Space-separated OIDC scopes this client is permitted to request. `openid` is mandatory for OIDC. `profile` grants access to `name`, `given_name`, `family_name`. `email` grants the email claim. Requesting a scope not in this list returns an error. |
| `is_pkce_required` | `1` | If `1`, the authorization request must include `code_challenge` and the token request must include `code_verifier`. Mandatory for `app_type=FED` (browser SPAs) and `app_type=MOBILE` — these cannot securely store a `client_secret`, so PKCE is the substitute. Server-side clients (`app_type=EXTERNAL`) with a secure `client_secret` may use `0`. |
| `access_token_expiry_sec` | `3600` | How long (seconds) the issued `access_token` is valid. `3600` = 1 hour. Short-lived tokens reduce exposure if stolen. Mobile apps may get longer values (e.g. `86400` = 24 hours) while highly privileged integrations may get shorter values (`300` = 5 min). |
| `id_token_expiry_sec` | `3600` | How long the issued `id_token` JWT is valid. The downstream client caches user identity from the `id_token` — this controls how fresh that information must be. Shorter = more frequent re-validation. |

---

### 3b. Authorization Codes — NEW table `iam_oauth2_authz_code`

Short-lived codes DataManager issues to downstream OIDC clients after the user authenticates. The client exchanges the code for tokens at the token endpoint. Single-use; expires in 2 minutes.

```sql
CREATE TABLE iam_oauth2_authz_code (
    id             INT          PRIMARY KEY AUTO_INCREMENT,
    code_hash      VARCHAR(64)  NOT NULL UNIQUE,
    client_id      VARCHAR(255) NOT NULL,
    user_id        INT          NOT NULL,
    redirect_uri   VARCHAR(500) NOT NULL,
    scopes         VARCHAR(500) NOT NULL,
    code_challenge VARCHAR(128) NULL,
    is_used        SMALLINT     NOT NULL DEFAULT 0,
    expires_at     DATETIME     NOT NULL,
    created_at     DATETIME     NOT NULL,

    FOREIGN KEY (user_id) REFERENCES iam_user (id) ON DELETE CASCADE
);
```

#### Column Reference

| Column | Example value | Explanation |
|---|---|---|
| `code_hash` | `e3b0c44298fc1c149afb4c8996fb92427ae41e4649b934ca495991b7852b855` | SHA-256 of the raw authorization code. DataManager sends the raw code to the client in the redirect URL; only the hash is stored in the DB. If the DB is compromised, the codes cannot be replayed because the raw values are not stored. Lookup: `SHA256(received_code) → find row`. |
| `client_id` | `viz_api_key_abc123` | The `api_key` value from `system_application_client` — identifies which downstream app requested this code. Used to verify the client during the token exchange. |
| `user_id` | `42` | The DataManager user who authenticated. Used to generate the `id_token` and `access_token` claims (sub, email, name, roles). |
| `redirect_uri` | `https://viz.example.org/auth/callback` | The specific redirect URI the client used in the authorization request. OAuth2 requires this exact value be re-sent at the token endpoint — DataManager verifies they match to prevent code injection attacks. |
| `scopes` | `openid profile email` | The scopes the user consented to. These determine which claims appear in the `id_token` and `userinfo` response. |
| `code_challenge` | `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` | The PKCE S256 challenge sent by the client in the authorization request. At token exchange, the client sends `code_verifier`; DataManager hashes it and compares to this stored value. Prevents code interception — even if an attacker captures the code from the redirect URL, they cannot exchange it without knowing the original `code_verifier`. |
| `is_used` | `0` → `1` on first exchange | Set to `1` immediately when the code is successfully exchanged for tokens. Any subsequent attempt to use the same code returns an error. Prevents replay attacks. |
| `expires_at` | `2026-05-11 13:02:00` | 2 minutes from creation. Authorization codes must be short-lived — a stale code sitting in a URL or log is useless after this time. |

---

### 3c. Signing Keys — NEW table `iam_oidc_signing_key`

DataManager signs `id_token` JWTs using a private key stored here. The corresponding public key is exposed at `/auth/oidc/.well-known/jwks.json` — downstream clients fetch it to verify token signatures without calling DataManager on every request.

```sql
CREATE TABLE iam_oidc_signing_key (
    id          INT         PRIMARY KEY AUTO_INCREMENT,
    kid         VARCHAR(64) NOT NULL UNIQUE,
    algorithm   VARCHAR(10) NOT NULL,
    private_key TEXT        NOT NULL,
    public_key  TEXT        NOT NULL,
    is_active   SMALLINT    NOT NULL DEFAULT 1,
    created     DATETIME    NULL,
    rotated_at  DATETIME    NULL
);
```

#### Column Reference

| Column | Example value | Explanation |
|---|---|---|
| `kid` | `2026-05-key-001` | Key ID. A short, unique identifier for this keypair. Included in the `kid` header of every JWT DataManager signs. Downstream clients use it to look up the correct public key from the JWKS response when multiple keys exist during rotation. Can be any unique string — a date-based convention like `YYYY-MM-key-NNN` makes rotation history readable. |
| `algorithm` | `RS256` | The signing algorithm. `RS256` (RSA + SHA-256) is the OIDC default and most widely supported. `ES256` (ECDSA + SHA-256) produces smaller signatures. Start with `RS256`. |
| `private_key` | `-----BEGIN RSA PRIVATE KEY-----\nMIIEo…` | The RSA/EC private key in PEM format. **Encrypted at rest** using `APP_ENCRYPTION_KEY`. Never returned via any API endpoint. Used only by the token endpoint to sign `id_token` JWTs. |
| `public_key` | `-----BEGIN PUBLIC KEY-----\nMIIBI…` | The corresponding public key in PEM format. Served as-is (converted to JWK format) at `/auth/oidc/.well-known/jwks.json`. Any downstream client can use it to verify JWT signatures. No secret — publicly accessible. |
| `is_active` | `1` | Only one key should be `is_active=1` at a time — this is the key used to sign new tokens. During key rotation: insert new key (`is_active=1`), set old key to `is_active=0`. The old key row is kept so tokens signed with it remain verifiable until they expire. |
| `rotated_at` | `2026-08-01 00:00:00` | Timestamp when this key was retired (`is_active` set to `0`). Used to know when it is safe to delete the old key row — keep it until all tokens it signed have expired (`created + max token lifetime < now`). |

**Key rotation procedure:**
```
1. Generate new RSA-2048 keypair
2. INSERT iam_oidc_signing_key (kid='2026-08-key-002', is_active=1, …)
3. UPDATE iam_oidc_signing_key SET is_active=0, rotated_at=NOW() WHERE kid='2026-05-key-001'
4. JWKS endpoint automatically serves both public keys (active + recently rotated)
5. Delete old row after: rotated_at + max(id_token_expiry_sec across all clients) has passed
```

---

### 3d. `iam_user_refresh_token` — New column

| Column | Example value | Explanation |
|---|---|---|
| `sso_session_id` | `g_1234567890abcdef` | The IdP's session identifier, extracted from the `sid` claim in OIDC tokens or the `SessionIndex` in SAML assertions. When the IdP initiates a back-channel logout (telling DataManager "this user's session ended"), it sends this value. DataManager looks up all `iam_user_refresh_token` rows with this `sso_session_id` and revokes them, logging the user out across all DataManager sessions. NULL for LOCAL login users. |

---

### 3e. OIDC Provider Endpoints (new router `/auth/oidc`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/auth/oidc/.well-known/openid-configuration` | GET | Discovery document — tells downstream clients where all endpoints are |
| `/auth/oidc/.well-known/jwks.json` | GET | Public keys — downstream clients verify `id_token` signatures here |
| `/auth/oidc/authorize` | GET | Authorization endpoint — redirect-based login entry point |
| `/auth/oidc/token` | POST | Token endpoint — exchange authorization code for `access_token` + `id_token` |
| `/auth/oidc/userinfo` | GET | UserInfo endpoint — return user claims for a valid `access_token` |
| `/auth/oidc/logout` | GET/POST | RP-initiated logout |

### 3f. OIDC Provider Flow

```
Downstream app (DFA Visualizer) redirects user
  → GET /auth/oidc/authorize
        ?client_id=viz_api_key_abc123
        &redirect_uri=https://viz.example.org/auth/callback
        &scope=openid profile email
        &state=random_nonce
        &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
        &code_challenge_method=S256
      → lookup system_application_client WHERE api_key='viz_api_key_abc123'
      → verify redirect_uri is in client.redirect_uris (exact match)
      → user not logged in → show DataManager login page (local + SSO options)
      → user authenticates (Mode 1 or Mode 2)
      → generate raw code → hash it → INSERT iam_oauth2_authz_code
      → redirect → https://viz.example.org/auth/callback?code=RAW_CODE&state=random_nonce

Client server (DFA Visualizer backend) exchanges code
  → POST /auth/oidc/token
        { grant_type=authorization_code, client_id, client_secret,
          code=RAW_CODE, redirect_uri, code_verifier }
      → verify client_secret hash against system_application_client.api_secret_hash
      → SHA256(RAW_CODE) → find iam_oauth2_authz_code (is_used=0, not expired)
      → verify SHA256(code_verifier) == iam_oauth2_authz_code.code_challenge
      → SET is_used=1
      → build id_token JWT claims: { iss, sub=user_id, email, name, iat, exp, aud }
      → sign JWT using active iam_oidc_signing_key private_key, include kid in header
      → return { access_token, id_token, token_type:"Bearer", expires_in:3600 }

DFA Visualizer verifies id_token without calling DataManager
  → fetch https://dm.example.org/auth/oidc/.well-known/jwks.json (cached)
  → find public key matching JWT header kid
  → verify RS256 signature → trust claims
```

---

## Complete Table Reference

### New tables

| Table | Migration | Purpose |
|---|---|---|
| `iam_sso_provider` | `075_iam_sso_provider` | Per-app IdP config — all credentials and endpoints for each external login provider |
| `iam_user_sso_identity` | `076_iam_user_sso_identity` | Links internal users to external IdP identities (one user, many providers) |
| `iam_oauth2_state` | `077_iam_oauth2_state` | Temporary CSRF state + PKCE store during upstream SSO redirect (DB fallback; prefer Redis) |
| `iam_oauth2_authz_code` | `078_iam_oauth2_authz_code` | Short-lived authorization codes DataManager issues to downstream OIDC clients |
| `iam_oidc_signing_key` | `079_iam_oidc_signing_key` | RS256/ES256 keypairs for signing `id_token` JWTs; source of JWKS public keys |

### Extended tables

| Table | Migration | Changes |
|---|---|---|
| `iam_user` | `080_iam_user_sso_cols` | Add `auth_provider VARCHAR(20) DEFAULT 'LOCAL'`, `external_id VARCHAR(255) NULL` |
| `iam_user_refresh_token` | `081_iam_refresh_sso_session` | Add `sso_session_id VARCHAR(255) NULL` |
| `system_application_client` | `082_sys_app_client_oidc` | Add `redirect_uris TEXT`, `allowed_scopes VARCHAR(500)`, `is_pkce_required SMALLINT DEFAULT 1`, `access_token_expiry_sec INT DEFAULT 3600`, `id_token_expiry_sec INT DEFAULT 3600`; extend `auth_method` Enum with `OIDC` |

> All migration revision IDs are ≤ 32 characters — avoids MySQL DataError 1406 on `alembic_version.version_num`.

### Unchanged tables

| Table | Role in SSO |
|---|---|
| `system_application` | Provides `app_key` FK anchor — no change |
| `iam_role` | `default_role_id` in `iam_sso_provider` references this — no change |

---

## Implementation Phases

### Phase 1 — Prep (no new tables)
- Add `auth_provider` + `external_id` to `iam_user` → migration `080_iam_user_sso_cols`
- Add `sso_session_id` to `iam_user_refresh_token` → migration `081_iam_refresh_sso_session`

### Phase 2 — External Login (DataManager as OIDC Client)
- Create `iam_sso_provider` → migration `075_iam_sso_provider`
- Create `iam_user_sso_identity` → migration `076_iam_user_sso_identity`
- Create `iam_oauth2_state` (if no Redis) → migration `077_iam_oauth2_state`
- Implement `/auth/sso/{provider}/redirect` and `/auth/sso/{provider}/callback`
- Start with Google to validate the full flow before adding Azure / Drupal / SAML

### Phase 3 — DataManager as OIDC Provider
- Create `iam_oauth2_authz_code` → migration `078_iam_oauth2_authz_code`
- Create `iam_oidc_signing_key`, generate initial RS256 keypair → migration `079_iam_oidc_signing_key`
- Extend `system_application_client` → migration `082_sys_app_client_oidc`
- Implement `/auth/oidc/*` router (discovery, authorize, token, userinfo, logout)
- Register DFA Visualizer + DFA Dashboard as downstream OIDC clients

---

## Security Checklist

- [ ] `iam_sso_provider.client_secret` encrypted at rest using `APP_ENCRYPTION_KEY` — never stored or logged as plaintext
- [ ] `iam_oidc_signing_key.private_key` encrypted at rest — public key only exposed via JWKS
- [ ] `iam_user_sso_identity.UNIQUE(provider_code, external_id)` — identity matched on `sub`, not `email`, to prevent account takeover
- [ ] `iam_oauth2_authz_code.is_used=1` set atomically on first exchange — no code replay possible
- [ ] `iam_oauth2_authz_code` TTL = 2 minutes; background job purges expired rows
- [ ] `iam_oauth2_state` TTL = 10 minutes; row deleted immediately after callback
- [ ] PKCE enforced (`is_pkce_required=1`) for all `app_type=FED` and `MOBILE` clients
- [ ] `redirect_uri` exact-match only against `system_application_client.redirect_uris` — no wildcards
- [ ] `state` parameter validated on every upstream IdP callback before any token exchange
- [ ] `id_token.iss` validated against `iam_sso_provider.issuer` on every upstream token receipt
