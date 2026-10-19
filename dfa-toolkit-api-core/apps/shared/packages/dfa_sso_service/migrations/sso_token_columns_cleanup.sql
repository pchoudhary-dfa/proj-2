-- SSO token column cleanup (local / manual migration)
-- Run against your app_db MySQL database after deploying the package code change.
--
-- 1. Drop unused id_token copy from one-time login codes (session stores it at callback).
-- 2. Rename session column to id_token_enc (Fernet ciphertext, not plaintext).

-- Safe if column already removed (MySQL 8+): check information_schema first, or ignore error.

ALTER TABLE iam_sso_login_code
    DROP COLUMN id_token_raw;

ALTER TABLE iam_sso_session
    CHANGE COLUMN id_token_raw_enc id_token_enc TEXT NULL
    COMMENT 'Fernet-encrypted OIDC id_token JWT (id_token_hint at logout)';

-- Optional: purge stale one-time codes
DELETE FROM iam_sso_login_code
WHERE expires_at < UTC_TIMESTAMP() OR is_used = 1;
