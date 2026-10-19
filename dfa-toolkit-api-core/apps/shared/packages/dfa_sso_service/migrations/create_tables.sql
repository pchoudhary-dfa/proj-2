-- =========================================================================
-- DFA SSO Service — standalone DDL for all iam_sso_* tables.
--
-- For greenfield deployments or non-Alembic setups.
-- The package also self-provisions via create_all() at startup.
-- =========================================================================

CREATE TABLE IF NOT EXISTS iam_sso_identity_provider (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    provider_code           VARCHAR(20) NOT NULL,
    name                    VARCHAR(100) NOT NULL,

    client_id               VARCHAR(255) NULL,
    client_secret_enc       TEXT NULL,

    well_known_uri          VARCHAR(500) NULL,
    authorization_endpoint  VARCHAR(500) NULL,
    token_endpoint          VARCHAR(500) NULL,
    userinfo_endpoint       VARCHAR(500) NULL,
    issuer                  VARCHAR(500) NULL,
    jwks_uri                VARCHAR(500) NULL,
    redirect_uri            VARCHAR(500) NULL,
    end_session_endpoint    VARCHAR(500) NULL,
    logout_uri              VARCHAR(500) NULL,

    idp_entity_id           VARCHAR(500) NULL,
    idp_sso_url             VARCHAR(500) NULL,
    idp_certificate         TEXT NULL,

    scopes                  VARCHAR(500) NULL DEFAULT 'openid profile email',
    attribute_map           TEXT NULL,
    auto_provision_users    SMALLINT NOT NULL DEFAULT 0,
    default_role_id         INT NULL,
    is_active               SMALLINT NOT NULL DEFAULT 1,

    created                 DATETIME NULL,
    created_user_id         INT NOT NULL DEFAULT 0,
    modified                DATETIME NULL,
    modified_user_id        INT NOT NULL DEFAULT 0,

    UNIQUE KEY uq_sso_idp_provider_code (provider_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS iam_sso_user_identity (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL COMMENT 'Soft reference to parent user table',
    provider_code   VARCHAR(20) NOT NULL,
    idp_user_id     VARCHAR(255) NOT NULL COMMENT 'User ID at the external identity provider (OIDC sub claim)',
    email           VARCHAR(255) NULL,
    raw_claims      TEXT NULL,

    created         DATETIME NULL,
    created_user_id INT NOT NULL DEFAULT 0,
    modified        DATETIME NULL,
    modified_user_id INT NOT NULL DEFAULT 0,

    UNIQUE KEY uq_sso_identity_provider_idp_uid (provider_code, idp_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS iam_sso_login_code (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    code_hash       VARCHAR(64) NOT NULL,
    user_id         INT NOT NULL COMMENT 'Soft reference to parent user table',
    sso_provider_id INT NULL,
    is_used         SMALLINT NOT NULL DEFAULT 0,
    expires_at      DATETIME NOT NULL,
    created_at      DATETIME NOT NULL,

    UNIQUE KEY uq_sso_login_code_hash (code_hash),
    CONSTRAINT fk_sso_code_provider FOREIGN KEY (sso_provider_id)
        REFERENCES iam_sso_identity_provider(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS iam_sso_session (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT NOT NULL COMMENT 'Soft reference to parent user table',
    sso_provider_id     INT NULL,
    id_token_enc        TEXT NULL COMMENT 'Fernet-encrypted OIDC id_token JWT (id_token_hint at logout)',
    is_active           SMALLINT NOT NULL DEFAULT 1,
    created_at          DATETIME NOT NULL,
    updated_at          DATETIME NOT NULL,

    INDEX ix_sso_session_user_active (user_id, is_active),
    CONSTRAINT fk_sso_session_provider FOREIGN KEY (sso_provider_id)
        REFERENCES iam_sso_identity_provider(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =========================================================================
-- Seed default identity providers
-- =========================================================================

INSERT IGNORE INTO iam_sso_identity_provider
    (provider_code, name, is_active,
     authorization_endpoint, token_endpoint, userinfo_endpoint,
     issuer, jwks_uri, well_known_uri,
     scopes, auto_provision_users, created, modified)
VALUES
    ('drupal', 'Drupal CMS', 1,
     'http://localhost/oauth2/authorize', 'http://localhost/oauth2/token',
     'http://localhost/oauth2/UserInfo', 'http://localhost',
     'http://localhost/oauth2/jwks', NULL,
     'openid profile email', 1, NOW(), NOW()),

    ('google', 'Google', 0,
     NULL, NULL, NULL, NULL, NULL, NULL,
     'openid profile email', 0, NOW(), NOW()),

    ('azure_ad', 'Microsoft Azure AD', 0,
     NULL, NULL, NULL, NULL, NULL, NULL,
     'openid profile email', 0, NOW(), NOW()),

    ('facebook', 'Facebook', 0,
     NULL, NULL, NULL, NULL, NULL, NULL,
     'openid profile email', 0, NOW(), NOW());
