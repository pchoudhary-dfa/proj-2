-- =========================================================================
-- DFA SSO Service — one-time migration from v1 (two-table) schema.
--
-- Run this ONCE on existing installs that had the separate
-- iam_sso_identity_provider (catalog) + iam_sso_provider (per-app OIDC) tables.
--
-- Prerequisites: the v2 merged iam_sso_identity_provider table must already
-- exist (created by initialize_tables / create_all at startup).
-- =========================================================================

-- Step 1: If the old iam_sso_provider table still exists, merge its OIDC
-- config into the new iam_sso_identity_provider rows (matched by provider_code).
UPDATE iam_sso_identity_provider idp
INNER JOIN iam_sso_provider old_p
    ON old_p.identity_provider_id = idp.id
SET
    idp.client_id               = old_p.client_id,
    idp.client_secret_enc       = old_p.client_secret_enc,
    idp.well_known_uri          = COALESCE(old_p.well_known_uri, idp.well_known_uri),
    idp.authorization_endpoint  = COALESCE(old_p.authorization_endpoint, idp.authorization_endpoint),
    idp.token_endpoint          = COALESCE(old_p.token_endpoint, idp.token_endpoint),
    idp.userinfo_endpoint       = COALESCE(old_p.userinfo_endpoint, idp.userinfo_endpoint),
    idp.issuer                  = COALESCE(old_p.issuer, idp.issuer),
    idp.jwks_uri                = COALESCE(old_p.jwks_uri, idp.jwks_uri),
    idp.redirect_uri            = old_p.redirect_uri,
    idp.end_session_endpoint    = old_p.end_session_endpoint,
    idp.logout_uri              = old_p.logout_uri,
    idp.idp_entity_id           = old_p.idp_entity_id,
    idp.idp_sso_url             = old_p.idp_sso_url,
    idp.idp_certificate         = old_p.idp_certificate,
    idp.scopes                  = old_p.scopes,
    idp.attribute_map           = old_p.attribute_map,
    idp.auto_provision_users    = old_p.auto_provision_users,
    idp.default_role_id         = old_p.default_role_id,
    idp.is_active               = old_p.is_active,
    idp.modified                = NOW();

-- Step 2: Rename external_id → idp_user_id in iam_sso_user_identity
-- (only needed if the column still has the old name).
ALTER TABLE iam_sso_user_identity
    CHANGE COLUMN external_id idp_user_id VARCHAR(255) NOT NULL
    COMMENT 'User ID at the external identity provider (OIDC sub claim)';

-- Step 3: Re-point FKs from iam_sso_provider → iam_sso_identity_provider.
-- Login codes:
ALTER TABLE iam_sso_login_code DROP FOREIGN KEY fk_sso_code_provider;
ALTER TABLE iam_sso_login_code
    ADD CONSTRAINT fk_sso_code_provider
    FOREIGN KEY (sso_provider_id) REFERENCES iam_sso_identity_provider(id) ON DELETE SET NULL;

-- Sessions:
ALTER TABLE iam_sso_session DROP FOREIGN KEY fk_sso_session_provider;
ALTER TABLE iam_sso_session
    ADD CONSTRAINT fk_sso_session_provider
    FOREIGN KEY (sso_provider_id) REFERENCES iam_sso_identity_provider(id) ON DELETE SET NULL;

-- Step 4: Drop the old iam_sso_provider table.
DROP TABLE IF EXISTS iam_sso_provider;

-- Step 5: Remove auth_provider and external_id from iam_user (if present).
-- These columns are no longer used; SSO vs local is determined by global config.
ALTER TABLE iam_user DROP COLUMN IF EXISTS auth_provider;
ALTER TABLE iam_user DROP COLUMN IF EXISTS external_id;
