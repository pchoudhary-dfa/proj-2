"""Remove IAM resources and APIs not present in current seed definitions.

Revision ID: 128_cleanup_orphan_iam
Revises: 127_hf_user_theme_uq
"""

from alembic import op

revision = "128_cleanup_orphan_iam"
down_revision = "127_hf_user_theme_uq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(_sql("SET SQL_SAFE_UPDATES = 0"))

    # ------------------------------------------------------------------ #
    # Temporary tables: canonical seed sets from seed_iam + seed_dash_iam #
    # ------------------------------------------------------------------ #
    conn.execute(_sql("DROP TEMPORARY TABLE IF EXISTS tmp_seed_resource"))
    conn.execute(_sql("""
CREATE TEMPORARY TABLE tmp_seed_resource (
  app_key VARCHAR(10) NOT NULL,
  resource_code VARCHAR(50) NOT NULL,
  PRIMARY KEY (app_key, resource_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
"""))

    conn.execute(_sql("DROP TEMPORARY TABLE IF EXISTS tmp_seed_api"))
    conn.execute(_sql("""
CREATE TEMPORARY TABLE tmp_seed_api (
  app_key VARCHAR(10) NOT NULL,
  http_method VARCHAR(10) NOT NULL,
  backend_endpoint VARCHAR(500) NOT NULL,
  UNIQUE KEY uq_tmp_seed_api (app_key, http_method, backend_endpoint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
"""))

    # ------------------------------------------------------------------ #
    # tmp_seed_resource rows                                               #
    # ------------------------------------------------------------------ #
    _insert_resources(conn)

    # ------------------------------------------------------------------ #
    # tmp_seed_api rows                                                    #
    # ------------------------------------------------------------------ #
    _insert_apis(conn)

    # ------------------------------------------------------------------ #
    # Orphan cleanup (transactional)                                       #
    # ------------------------------------------------------------------ #
    conn.execute(_sql("START TRANSACTION"))

    # 2a) Role–API grants that reference a non-canonical API triple
    conn.execute(_sql("""
DELETE rra
FROM iam_role_resource_api AS rra
JOIN iam_resource_api AS api ON api.id = rra.resource_api_id
LEFT JOIN tmp_seed_api AS s
  ON s.app_key = api.app_key
 AND s.http_method = api.http_method
 AND s.backend_endpoint = api.backend_endpoint
WHERE s.app_key IS NULL
"""))

    # 2b) API i18n for those orphan APIs (if any rows left)
    conn.execute(_sql("""
DELETE i
FROM iam_resource_api_i18n AS i
JOIN iam_resource_api AS api ON api.id = i.master_id
LEFT JOIN tmp_seed_api AS s
  ON s.app_key = api.app_key
 AND s.http_method = api.http_method
 AND s.backend_endpoint = api.backend_endpoint
WHERE s.app_key IS NULL
"""))

    # 2c) Orphan API rows
    conn.execute(_sql("""
DELETE api
FROM iam_resource_api AS api
LEFT JOIN tmp_seed_api AS s
  ON s.app_key = api.app_key
 AND s.http_method = api.http_method
 AND s.backend_endpoint = api.backend_endpoint
WHERE s.app_key IS NULL
"""))

    # 2c-extra-i) Role grants tied to APIs whose resource_id is orphan (must go first)
    conn.execute(_sql("""
DELETE rra
FROM iam_role_resource_api AS rra
JOIN iam_resource_api AS api ON api.id = rra.resource_api_id
JOIN iam_resource AS r ON r.id = api.resource_id
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL
"""))

    # 2c-extra-i.5) API i18n for APIs whose resource_id is orphan
    conn.execute(_sql("""
DELETE i
FROM iam_resource_api_i18n AS i
JOIN iam_resource_api AS api ON api.id = i.master_id
JOIN iam_resource AS r ON r.id = api.resource_id
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL
"""))

    # 2c-extra-ii) API rows whose resource_id points at an orphan resource
    conn.execute(_sql("""
DELETE api
FROM iam_resource_api AS api
JOIN iam_resource AS r ON r.id = api.resource_id
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL
"""))

    # 2d) Role–API grants pointing at orphan resources (cleanup inconsistent rows)
    conn.execute(_sql("""
DELETE rra
FROM iam_role_resource_api AS rra
JOIN iam_resource AS r ON r.id = rra.resource_id
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL
"""))

    # 2e) Resource i18n for orphan resources
    conn.execute(_sql("""
DELETE ri
FROM iam_resource_i18n AS ri
JOIN iam_resource AS r ON r.id = ri.master_id
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL
"""))

    # 2f) Orphan resources (only those not in tmp_seed_resource)
    conn.execute(_sql("""
DELETE r
FROM iam_resource AS r
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL
"""))

    conn.execute(_sql("COMMIT"))
    conn.execute(_sql("SET SQL_SAFE_UPDATES = 1"))


def downgrade() -> None:
    pass


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

from sqlalchemy import text  # noqa: E402


def _sql(stmt: str):
    return text(stmt.strip())


def _insert_resources(conn) -> None:
    rows = [
        ("DFA_DM", "iam"),
        ("DFA_DM", "iam_auth"),
        ("DFA_DM", "sys_sso"),
        ("DFA_DM", "sys_role_resource"),
        ("DFA_DM", "sys_user_role"),
        ("DFA_DM", "sys_dw_management"),
        ("DFA_DM", "sys_datawarehouse"),
        ("DFA_DM", "sys_admin"),
        ("DFA_DM", "sys_language_management"),
        ("DFA_DM", "sys_translations"),
        ("DFA_DM", "sys_api_client"),
        ("DFA_DM", "sys_email_templates"),
        ("DFA_DM", "sys_email_logs"),
        ("DFA_DM", "sys_error_logs"),
        ("DFA_DM", "sys_help"),
        ("DFA_DM", "sys_help_admin"),
        ("DFA_DM", "sys_settings"),
        ("DFA_DM", "sys_logs"),
        ("DFA_DM", "dm_dw_template_admin"),
        ("DFA_DM", "dm_dw_area"),
        ("DFA_DM", "dm_dw_indicator"),
        ("DFA_DM", "dm_dw_unit"),
        ("DFA_DM", "dm_dw_indicator_classification"),
        ("DFA_DM", "dm_dw_subgroup"),
        ("DFA_DM", "dm_dw_data_entry_admin"),
        ("DFA_DM", "dm_dw_data_source"),
        ("DFA_DM", "dm_dw_data_entry"),
        ("DFA_DM", "dm_dw_reports"),
        ("DFA_DM", "dm_dw_reports_data"),
        ("DFA_DM", "dm_dw_reports_quality"),
        ("DFA_DM", "dm_dw_reports_analytics"),
        ("DFA_DM", "dm_dw_reports_operational"),
        ("DFA_DM", "dm_dw_operational_reports"),
        ("DFA_DM", "dm_dw_timeperiod"),
        ("DFA_DM", "dm_dw_calculate_ius"),
        ("DFA_DM", "dm_dw_administrator"),
        ("DFA_DM", "dm_dw_workflow"),
        ("DFA_DM", "dm_dw_data_review"),
        ("DFA_DM", "dm_dw_languages"),
        ("DFA_DM", "dm_dw_transaction_logs"),
        ("DFA_DM", "dm_dw_data_admin_maintenance"),
        ("DFA_DM", "dm_dw_logs"),
        ("DFA_DM", "publish_data"),
        ("DFA_DM", "mobile_app"),
        ("DFA_VIZ", "viz_ai_insights"),
        ("DFA_VIZ", "viz_gallery"),
        ("DFA_VIZ", "viz_share_link"),
        ("DFA_DASH", "sys_dashboard"),
        ("DFA_DASH", "dash_core"),
        ("DFA_DASH", "dash_admin_ops"),
        ("DFA_DASH", "dash_vis"),
        ("DFA_DASH", "dash_section"),
        ("DFA_DASH", "dash_template"),
        ("DFA_DASH", "dash_user_areas"),
        ("DFA_DASH", "dash_ai_analysis"),
        ("DFA_DASH", "sys_header_footer"),
        ("DFA_DASH", "dash_theme"),
        ("DFA_DASH", "sys_media_files"),
        ("DFA_DASH", "dash_media"),
        ("DFA_DASH", "dash_embed"),
        ("DFA_DASH", "dash_embed_ops"),
    ]
    stmt = text(
        "INSERT IGNORE INTO tmp_seed_resource (app_key, resource_code) VALUES (:ak, :rc)"
    )
    for app_key, resource_code in rows:
        conn.execute(stmt, {"ak": app_key, "rc": resource_code})


def _insert_apis(conn) -> None:
    rows = [
        ("DFA_DM", "GET", "/auth/captcha/challenge"),
        ("DFA_VIZ", "GET", "/auth/captcha/challenge"),
        ("DFA_DM", "POST", "/auth/login"),
        ("DFA_VIZ", "POST", "/auth/login"),
        ("DFA_DM", "POST", "/auth/refresh"),
        ("DFA_VIZ", "POST", "/auth/refresh"),
        ("DFA_DM", "POST", "/auth/password/reset-request"),
        ("DFA_VIZ", "POST", "/auth/password/reset-request"),
        ("DFA_DM", "POST", "/auth/password/reset-confirm"),
        ("DFA_VIZ", "POST", "/auth/password/reset-confirm"),
        ("DFA_DM", "POST", "/auth/register"),
        ("DFA_VIZ", "POST", "/auth/register"),
        ("DFA_DM", "POST", "/auth/resend-registration"),
        ("DFA_VIZ", "POST", "/auth/resend-registration"),
        ("DFA_DM", "POST", "/auth/logout"),
        ("DFA_VIZ", "POST", "/auth/logout"),
        ("DFA_DM", "GET", "/auth/session-status"),
        ("DFA_VIZ", "GET", "/auth/session-status"),
        ("DFA_DM", "POST", "/auth/sso/back-channel-logout"),
        ("DFA_VIZ", "POST", "/auth/sso/back-channel-logout"),
        ("DFA_DM", "GET", "/auth/me/permissions"),
        ("DFA_DM", "GET", "/notifications/unread-count"),
        ("DFA_DM", "GET", "/notifications"),
        ("DFA_DM", "GET", "/auth/sso/providers"),
        ("DFA_VIZ", "GET", "/auth/sso/providers"),
        ("DFA_DM", "GET", "/auth/sso/{provider_code}/redirect"),
        ("DFA_VIZ", "GET", "/auth/sso/{provider_code}/redirect"),
        ("DFA_DM", "GET", "/auth/sso/{provider_code}/callback"),
        ("DFA_VIZ", "GET", "/auth/sso/{provider_code}/callback"),
        ("DFA_DM", "GET", "/sso-providers"),
        ("DFA_DM", "POST", "/sso-providers"),
        ("DFA_DM", "GET", "/sso-providers/{nid}"),
        ("DFA_DM", "PATCH", "/sso-providers/{nid}"),
        ("DFA_DM", "DELETE", "/sso-providers/{nid}"),
        ("DFA_DM", "POST", "/sso-providers/{nid}/discover"),
        ("DFA_DM", "GET", "/iam/roles"),
        ("DFA_DM", "POST", "/iam/roles"),
        ("DFA_DM", "PATCH", "/iam/roles/{role_id}"),
        ("DFA_DM", "DELETE", "/iam/roles/{role_id}"),
        ("DFA_DM", "GET", "/iam/resources"),
        ("DFA_DM", "GET", "/iam/roles/{role_id}/resource-permissions"),
        ("DFA_DM", "PUT", "/iam/roles/{role_id}/resource-permissions"),
        ("DFA_DM", "GET", "/iam/user"),
        ("DFA_DM", "GET", "/iam/users/me"),
        ("DFA_DM", "PATCH", "/iam/users/me"),
        ("DFA_DM", "PATCH", "/iam/users/me/password"),
        ("DFA_DM", "POST", "/iam/users"),
        ("DFA_DM", "PATCH", "/iam/users/{user_id}"),
        ("DFA_DM", "DELETE", "/iam/users/{user_id}"),
        ("DFA_DM", "PUT", "/iam/users/{user_id}/roles"),
        ("DFA_DM", "GET", "/dfa-mailer/templates/"),
        ("DFA_DM", "POST", "/dfa-mailer/templates/"),
        ("DFA_DM", "GET", "/dfa-mailer/templates/{template_id}"),
        ("DFA_DM", "PUT", "/dfa-mailer/templates/{template_id}"),
        ("DFA_DM", "DELETE", "/dfa-mailer/templates/{template_id}"),
        ("DFA_DM", "GET", "/dfa-mailer/templates/key/{template_key}"),
        ("DFA_DM", "GET", "/dfa-mailer/logs/"),
        ("DFA_DM", "GET", "/dfa-mailer/logs/{log_id}"),
        ("DFA_DM", "GET", "/dfa-mailer/logs/recipient/{email}"),
        ("DFA_DM", "GET", "/dfa-mailer/logs/status/{status}"),
        ("DFA_DM", "GET", "/app-config"),
        ("DFA_DM", "PATCH", "/app-config"),
        ("DFA_VIZ", "GET", "/app-config"),
        ("DFA_VIZ", "PATCH", "/app-config"),
        ("DFA_DM", "GET", "/translations"),
        ("DFA_DM", "GET", "/translations/{translation_code}"),
        ("DFA_VIZ", "GET", "/translations"),
        ("DFA_VIZ", "GET", "/translations/{translation_code}"),
        ("DFA_DM", "POST", "/translations/import"),
        ("DFA_DM", "POST", "/translations"),
        ("DFA_DM", "PATCH", "/translations/{translation_code}"),
        ("DFA_DM", "DELETE", "/translations/{translation_code}"),
        ("DFA_DM", "POST", "/translations/multiple-delete"),
        ("DFA_VIZ", "POST", "/dw/{dw_id}/insights"),
        ("DFA_DM", "GET", "/system-language"),
        ("DFA_VIZ", "GET", "/system-language"),
        ("DFA_DM", "GET", "/system-language/{id}"),
        ("DFA_DM", "POST", "/system-language"),
        ("DFA_DM", "PATCH", "/system-language/{id}"),
        ("DFA_DM", "DELETE", "/system-language/{id}"),
        ("DFA_DM", "GET", "/system-api-clients"),
        ("DFA_DM", "POST", "/system-api-clients"),
        ("DFA_DM", "GET", "/system-api-clients/{id}"),
        ("DFA_DM", "PATCH", "/system-api-clients"),
        ("DFA_DM", "DELETE", "/system-api-clients/{id}"),
        ("DFA_DM", "POST", "/system-api-clients/{id}/rotate-api-key"),
        ("DFA_DM", "GET", "/dw"),
        ("DFA_VIZ", "GET", "/dw"),
        ("DFA_DM", "GET", "/dw/{dw_id}"),
        ("DFA_DM", "POST", "/dw/"),
        ("DFA_DM", "POST", "/dw"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/optimize"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dbmetadata"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/dbmetadata"),
        ("DFA_DM", "POST", "/dw/{dw_id}/sql-dump"),
        ("DFA_DM", "GET", "/dw/{dw_id}/sql-dump"),
        ("DFA_DM", "GET", "/dw/{dw_id}/users"),
        ("DFA_VIZ", "GET", "/gallery"),
        ("DFA_VIZ", "GET", "/gallery/{id}"),
        ("DFA_VIZ", "POST", "/gallery"),
        ("DFA_VIZ", "PATCH", "/gallery/{id}"),
        ("DFA_VIZ", "DELETE", "/gallery/{id}"),
        ("DFA_VIZ", "POST", "/share-links"),
        ("DFA_VIZ", "GET", "/share-links/{code}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/area-levels"),
        ("DFA_DM", "GET", "/dw/{dw_id}/area-levels/association-count"),
        ("DFA_DM", "GET", "/dw/{dw_id}/area-levels/{identifier}"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/area-levels"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/area-levels/association-count"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/area-levels/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/area-levels"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/area-levels/{identifier}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/area-levels/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/area-levels/multiple-delete"),
        ("DFA_DM", "GET", "/dw/{dw_id}/areas"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/areas"),
        ("DFA_DM", "GET", "/dw/{dw_id}/areas/association-count"),
        ("DFA_DM", "GET", "/dw/{dw_id}/areas/{identifier}"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/areas/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/areas"),
        ("DFA_DM", "POST", "/dw/{dw_id}/areas/import"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/areas/{identifier}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/areas/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/areas/multiple-delete"),
        ("DFA_DM", "GET", "/dw/{dw_id}/indicators"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/indicators"),
        ("DFA_DM", "GET", "/dw/{dw_id}/indicators/association-count"),
        ("DFA_DM", "GET", "/dw/{dw_id}/indicators/{identifier}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/indicators/{identifier}/subgroups"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/indicators/{identifier}"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/indicators/{identifier}/subgroups"),
        ("DFA_DM", "POST", "/dw/{dw_id}/indicators"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/indicators/{identifier}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/indicators/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/indicators/multiple-delete"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/indicators/{identifier}/metadata"),
        ("DFA_DM", "GET", "/dw/{dw_id}/indicators/validation-rules"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/indicators/{identifier}/validation-rules"),
        ("DFA_DM", "GET", "/dw/{dw_id}/metadata-categories"),
        ("DFA_DM", "GET", "/dw/{dw_id}/metadata-categories/association-count"),
        ("DFA_DM", "GET", "/dw/{dw_id}/metadata-categories/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/metadata-categories"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/metadata-categories/{identifier}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/metadata-categories/{identifier}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/indicator-classifications"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/indicator-classifications"),
        ("DFA_DM", "GET", "/dw/{dw_id}/indicator-classifications/type"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/indicator-classifications/type"),
        ("DFA_DM", "GET", "/dw/{dw_id}/indicator-classifications/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/indicator-classifications"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/indicator-classifications/{identifier}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/indicator-classifications/{identifier}"),
        ("DFA_DM", "PUT", "/dw/{dw_id}/indicator-classifications/ius"),
        ("DFA_DM", "GET", "/dw/{dw_id}/ic/{ic_identifier}/indicators"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/ic/{ic_identifier}/indicators"),
        ("DFA_DM", "POST", "/dw/{dw_id}/ic-ius/export"),
        ("DFA_DM", "POST", "/dw/{dw_id}/ic-ius/import"),
        ("DFA_DM", "GET", "/dw/{dw_id}/ius"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/ius"),
        ("DFA_DM", "POST", "/dw/{dw_id}/ius"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/ius/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/ius/multiple-delete"),
        ("DFA_DM", "POST", "/dw/{dw_id}/ius/mark-default-subgroups"),
        ("DFA_DM", "GET", "/dw/{dw_id}/units"),
        ("DFA_DM", "GET", "/dw/{dw_id}/units/association-count"),
        ("DFA_DM", "GET", "/dw/{dw_id}/units/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/units"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/units/{identifier}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/units/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/units/multiple-delete"),
        ("DFA_DM", "GET", "/dw/{dw_id}/sg-categories"),
        ("DFA_DM", "GET", "/dw/{dw_id}/sg-categories/association-count"),
        ("DFA_DM", "GET", "/dw/{dw_id}/sg-categories/{sg_category_identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/sg-categories"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/sg-categories/{category_identifier}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/sg-categories/{sg_category_identifier}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/sg-categories-values"),
        ("DFA_DM", "GET", "/dw/{dw_id}/sg-categories-values/{value_identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/sg-categories/values"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/sg-categories-values/{value_identifier}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/sg-categories-values/{value_identifier}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/subgroups"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/subgroups"),
        ("DFA_DM", "GET", "/dw/{dw_id}/subgroups/association-count"),
        ("DFA_DM", "GET", "/dw/{dw_id}/subgroups/{identifier}"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/subgroups/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/subgroups"),
        ("DFA_DM", "POST", "/dw/{dw_id}/subgroups/multiple-delete"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/subgroups/{identifier}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/time-periods"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/time-periods"),
        ("DFA_DM", "GET", "/dw/{dw_id}/time-periods/association-count"),
        ("DFA_DM", "GET", "/dw/{dw_id}/time-periods/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/time-periods"),
        ("DFA_DM", "POST", "/dw/{dw_id}/time-periods/import"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/time-periods/{identifier}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/time-periods/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/time-periods/multiple-delete"),
        ("DFA_DM", "GET", "/dw/{dw_id}/sources"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/sources"),
        ("DFA_DM", "GET", "/dw/{dw_id}/sources/breakup"),
        ("DFA_DM", "GET", "/dw/{dw_id}/sources/association-count"),
        ("DFA_DM", "GET", "/dw/{dw_id}/sources/{identifier}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/sources"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/sources/{identifier}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/sources/{identifier}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/data"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/data"),
        ("DFA_DM", "POST", "/dw/{dw_id}/data"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/data"),
        ("DFA_DM", "POST", "/dw/{dw_id}/data/set-mrd"),
        ("DFA_DM", "POST", "/dw/{dw_id}/data/set-ius-data-exist"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dataset"),
        ("DFA_DM", "POST", "/dw/{dw_id}/dataset"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dataset/{dataset_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dataset/{dataset_id}/association-count"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/dataset/{dataset_id}"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/dataset/{dataset_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/data-points"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/data-points"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/data-points"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/data-point/{data_point_id}"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/dataset"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dataset/workflow/{workflow_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dataset/{dataset_id}/comments"),
        ("DFA_DM", "POST", "/dw/{dw_id}/dataset/{dataset_id}/comments"),
        ("DFA_DM", "POST", "/dw/{dw_id}/dataset/{dataset_id}/scope-check"),
        ("DFA_DM", "POST", "/dw/{dw_id}/dataset/{dataset_id}/data-points/import"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dataset/{dataset_id}/data-points/import-logs"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dataset/{dataset_id}/data-points/import-logs/{request_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/search"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/search"),
        ("DFA_VIZ", "POST", "/dw/{dw_id}/search/sync"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/search/sync/status"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/search/sync/active"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/indicators/no-ius"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/indicators/no-ius"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/indicators/no-default-subgroup"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/indicators/no-default-subgroup"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/indicators/no-data"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/indicators/no-data"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/ius/invalid-value-range"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/ius/invalid-value-range"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/ius/no-ic-mapping"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/ius/no-ic-mapping"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/areas/no-data"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/areas/no-data"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/areas/orphan-parent"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/areas/orphan-parent"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/time-periods/unused"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/time-periods/unused"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/subgroups/vals-not-in-ius"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/subgroups/vals-not-in-ius"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/data/values-out-of-range"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/data/values-out-of-range"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/data/missing-mrd"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/data/missing-mrd"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/metadata/missing-mandatory"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/metadata/missing-mandatory"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/sources/unused"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/sources/unused"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/indicator-classifications/no-ius"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/indicator-classifications/no-ius"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/indicator-classifications/leaf-no-ius"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/indicator-classifications/leaf-no-ius"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/ic-ius/orphan-refs"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/ic-ius/orphan-refs"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/ius/orphan-refs"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/ius/orphan-refs"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/data/orphan-ius"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/data/orphan-ius"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/data/orphan-area"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/data/orphan-area"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/data/orphan-timeperiod"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/data/orphan-timeperiod"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/quality/data/orphan-source"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/quality/data/orphan-source"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/analytics/coverage/indicator-by-area"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/analytics/coverage/indicator-by-area"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/analytics/coverage/indicator-by-timeperiod"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/analytics/coverage/indicator-by-timeperiod"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/analytics/coverage/area-completeness"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/analytics/coverage/area-completeness"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/analytics/coverage/indicator-subgroup"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/analytics/coverage/indicator-subgroup"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/analytics/volume/top-indicators"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/analytics/volume/top-indicators"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/analytics/volume/ius-density"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/analytics/volume/ius-density"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/analytics/volume/subgroup-distribution"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/analytics/volume/subgroup-distribution"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/analytics/utilisation/source-usage"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/analytics/utilisation/source-usage"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/analytics/utilisation/ic-coverage"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/analytics/utilisation/ic-coverage"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/data/published/full"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/data/published/full"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/operational-dashboard"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/operational-dashboard"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/area-submission-status"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/area-submission-status"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/review-status"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/review-status"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/data-reporter"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/data-reporter"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/data-reviewer"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/data-reviewer"),
        ("DFA_DM", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/data-completeness"),
        ("DFA_VIZ", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/data-completeness"),
        ("DFA_DM", "GET", "/dw/{dw_id}/languages"),
        ("DFA_DM", "GET", "/dw/{dw_id}/languages/{lang_code}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/languages"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/languages/{lang_code}"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/languages/{lang_code}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/languages/export"),
        ("DFA_DM", "POST", "/dw/{dw_id}/languages/import"),
        ("DFA_DM", "GET", "/dw/{dw_id}/workflow"),
        ("DFA_DM", "POST", "/dw/{dw_id}/workflow"),
        ("DFA_DM", "GET", "/dw/{dw_id}/workflow/{workflow_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/workflow/{workflow_id}/association-count"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/workflow/{workflow_id}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/workflow/{workflow_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/workflow/{workflow_id}/level"),
        ("DFA_DM", "POST", "/dw/{dw_id}/workflow/{workflow_id}/level"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/workflow/{workflow_id}/level/{level_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/workflow/{workflow_id}/dataentry"),
        ("DFA_DM", "PUT", "/dw/{dw_id}/workflow/{workflow_id}/dataentry"),
        ("DFA_DM", "GET", "/dw/{dw_id}/workflow/{workflow_id}/user-assignments"),
        ("DFA_DM", "POST", "/dw/{dw_id}/workflow/{workflow_id}/user-assignments"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/workflow/{workflow_id}/user-assignments/{assignment_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dataset/review"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dataset/{dataset_id}/review"),
        ("DFA_DM", "POST", "/dw/{dw_id}/dataset/{dataset_id}/review"),
        ("DFA_DM", "GET", "/dw/{dw_id}/dataset/review-rejection-reasons"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/formula/total"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/formula/percent"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/formula/minus"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/formula/time"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/formula/area"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/compute/formula/{operation_type}/ius/{ius_gid}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/formula/resolve-ius"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/formula/operation-types"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/formula/ius/{ius_gid}/validate"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/formula/ius/{ius_gid}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/process"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/process"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/process/summary"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/process/eligible-target-ius"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/process/time/{process_time_id}/re-execute"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/process/{process_id}/status"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/process/{process_id}/estimate"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/process/{process_id}/execute"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/process/{process_id}/cancel"),
        ("DFA_DM", "PATCH", "/dw/{dw_id}/compute/process/{process_id}"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/compute/process/{process_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/logs/summary"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/logs/search"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/logs/process/{process_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/logs/time/{process_time_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/logs/{process_time_log_id}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/compute/logs/{process_time_log_id}/sync-progress"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/compute/logs/{process_time_log_id}"),
        ("DFA_DM", "GET", "/dw/{dw_id}/compute/logs/{process_time_log_id}/export"),
        ("DFA_DM", "GET", "/logs/server-errors"),
        ("DFA_DM", "GET", "/logs/transactions"),
        ("DFA_DM", "GET", "/help/api/keydata/{key_id}"),
        ("DFA_VIZ", "GET", "/help/api/keydata/{key_id}"),
        ("DFA_DM", "GET", "/help/api/health"),
        ("DFA_VIZ", "GET", "/help/api/health"),
        ("DFA_DM", "GET", "/help/api/adaptations"),
        ("DFA_DM", "GET", "/help/api/keys/{adaptation_id}"),
        ("DFA_DM", "POST", "/help/api/create"),
        ("DFA_DM", "PUT", "/help/api/update/{key_id}"),
        ("DFA_DM", "DELETE", "/help/api/delete/{key_id}"),
        ("DFA_DM", "POST", "/dw/{dw_id}/publish-mobile/packages"),
        ("DFA_DM", "GET", "/dw/{dw_id}/publish-mobile/packages"),
        ("DFA_DM", "GET", "/dw/{dw_id}/publish-mobile/packages/{package_id}/status"),
        ("DFA_DM", "POST", "/dw/{dw_id}/publish-mobile/packages/{package_id}/publish"),
        ("DFA_DM", "DELETE", "/dw/{dw_id}/publish-mobile/packages/{package_id}"),
        ("DFA_DM", "GET", "/publish_for_mobile/publish/getUpdate"),
        ("DFA_DM", "GET", "/publish_for_mobile/files/{dbid}/data/{version}.zip"),
        ("DFA_DASH", "POST", "/auth/login"),
        ("DFA_DASH", "POST", "/auth/refresh"),
        ("DFA_DASH", "POST", "/auth/password/reset-request"),
        ("DFA_DASH", "POST", "/auth/password/reset-confirm"),
        ("DFA_DASH", "POST", "/auth/register"),
        ("DFA_DASH", "POST", "/auth/logout"),
        ("DFA_DASH", "GET", "/auth/captcha/challenge"),
        ("DFA_DASH", "GET", "/dash"),
        ("DFA_DASH", "GET", "/dash/{dashboard_id}"),
        ("DFA_DASH", "PATCH", "/dash/{dashboard_id}"),
        ("DFA_DASH", "GET", "/dash/viewer-bundle/{dashboard_title}"),
        ("DFA_DASH", "POST", "/dash"),
        ("DFA_DASH", "DELETE", "/dash/{dashboard_id}"),
        ("DFA_DASH", "POST", "/dash/{dashboard_id}/clone"),
        ("DFA_DASH", "POST", "/dash/{dashboard_id}/publish"),
        ("DFA_DASH", "GET", "/dash/{dashboard_id}/sections"),
        ("DFA_DASH", "POST", "/dash/{dashboard_id}/sections"),
        ("DFA_DASH", "PATCH", "/dash/{dashboard_id}/sections/{section_id}"),
        ("DFA_DASH", "DELETE", "/dash/{dashboard_id}/sections/{section_id}"),
        ("DFA_DASH", "PUT", "/dash/{dashboard_id}/sections/bulk"),
        ("DFA_DASH", "GET", "/dash/{dashboard_id}/template"),
        ("DFA_DASH", "PUT", "/dash/{dashboard_id}/template"),
        ("DFA_DASH", "GET", "/dash/{dashboard_id}/vis"),
        ("DFA_DASH", "GET", "/dash/{dashboard_id}/vis/{viz_id}"),
        ("DFA_DASH", "POST", "/dash/{dashboard_id}/vis"),
        ("DFA_DASH", "POST", "/dash/{dashboard_id}/vis/{viz_id}/copy"),
        ("DFA_DASH", "PATCH", "/dash/{dashboard_id}/vis/{viz_id}"),
        ("DFA_DASH", "DELETE", "/dash/{dashboard_id}/vis/{viz_id}"),
        ("DFA_DASH", "GET", "/dash/{dashboard_id}/users"),
        ("DFA_DASH", "DELETE", "/dash/{dashboard_id}/users/{user_id}"),
        ("DFA_DASH", "GET", "/dash/analyses"),
        ("DFA_DASH", "POST", "/dash/{dashboard_id}/vis/{gallery_id}/ai-analyze"),
        ("DFA_DASH", "GET", "/dash/themes"),
        ("DFA_DASH", "POST", "/dash/themes"),
        ("DFA_DASH", "GET", "/dash/themes/{theme_id}"),
        ("DFA_DASH", "POST", "/dash/themes/{theme_id}/copy"),
        ("DFA_DASH", "PATCH", "/dash/themes/{theme_id}"),
        ("DFA_DASH", "DELETE", "/dash/themes/{theme_id}"),
        ("DFA_DASH", "GET", "/dash/media"),
        ("DFA_DASH", "POST", "/dash/media"),
        ("DFA_DASH", "DELETE", "/dash/media/{upload_id}"),
        ("DFA_DASH", "GET", "/dash/media/{upload_id}/content"),
        ("DFA_DASH", "GET", "/dash/embed"),
        ("DFA_DASH", "POST", "/dash/embed"),
        ("DFA_DASH", "GET", "/dash/embed/{embed_id}"),
        ("DFA_DASH", "DELETE", "/dash/embed/{embed_id}"),
        ("DFA_DASH", "POST", "/dash/embed/{embed_id}/track"),
        ("DFA_DASH", "GET", "/dw"),
        ("DFA_DASH", "GET", "/dw/{dw_id}"),
        ("DFA_DASH", "POST", "/dw/"),
        ("DFA_DASH", "POST", "/dw"),
        ("DFA_DASH", "PATCH", "/dw/{dw_id}"),
        ("DFA_DASH", "DELETE", "/dw/{dw_id}"),
        ("DFA_DASH", "POST", "/dw/{dw_id}/optimize"),
        ("DFA_DASH", "GET", "/dw/{dw_id}/dbmetadata"),
        ("DFA_DASH", "PATCH", "/dw/{dw_id}/dbmetadata"),
        ("DFA_DASH", "GET", "/dw/{dw_id}/users"),
        ("DFA_DASH", "GET", "/dw/{dw_id}/areas"),
        ("DFA_DASH", "GET", "/dw/{dw_id}/area-levels"),
        ("DFA_DASH", "GET", "/dw/{dw_id}/indicators"),
        ("DFA_DASH", "GET", "/dw/{dw_id}/subgroups"),
        ("DFA_DASH", "GET", "/dw/{dw_id}/time-periods"),
        ("DFA_DASH", "GET", "/dw/{dw_id}/indicator-classifications"),
        ("DFA_DASH", "GET", "/dw/{dw_id}/indicator-classifications/type"),
        ("DFA_DASH", "GET", "/dw/{dw_id}/reports/data/published/full"),
        ("DFA_DASH", "GET", "/iam/roles"),
        ("DFA_DASH", "POST", "/iam/roles"),
        ("DFA_DASH", "PATCH", "/iam/roles/{role_id}"),
        ("DFA_DASH", "DELETE", "/iam/roles/{role_id}"),
        ("DFA_DASH", "GET", "/iam/resources"),
        ("DFA_DASH", "GET", "/iam/roles/{role_id}/resource-permissions"),
        ("DFA_DASH", "PUT", "/iam/roles/{role_id}/resource-permissions"),
        ("DFA_DASH", "GET", "/iam/user"),
        ("DFA_DASH", "GET", "/iam/users/me"),
        ("DFA_DASH", "PATCH", "/iam/users/me"),
        ("DFA_DASH", "PATCH", "/iam/users/me/password"),
        ("DFA_DASH", "POST", "/iam/users"),
        ("DFA_DASH", "PATCH", "/iam/users/{user_id}"),
        ("DFA_DASH", "DELETE", "/iam/users/{user_id}"),
        ("DFA_DASH", "PUT", "/iam/users/{user_id}/roles"),
        ("DFA_DASH", "GET", "/app-config"),
        ("DFA_DASH", "PATCH", "/app-config"),
        ("DFA_DASH", "GET", "/translations"),
        ("DFA_DASH", "GET", "/translations/{translation_code}"),
        ("DFA_DASH", "POST", "/translations/import"),
        ("DFA_DASH", "POST", "/translations"),
        ("DFA_DASH", "PATCH", "/translations/{translation_code}"),
        ("DFA_DASH", "DELETE", "/translations/{translation_code}"),
        ("DFA_DASH", "POST", "/translations/multiple-delete"),
        ("DFA_DASH", "GET", "/system-language"),
        ("DFA_DASH", "GET", "/system-language/{id}"),
        ("DFA_DASH", "POST", "/system-language"),
        ("DFA_DASH", "PATCH", "/system-language/{id}"),
        ("DFA_DASH", "DELETE", "/system-language/{id}"),
        ("DFA_DASH", "GET", "/logs/server-errors"),
        ("DFA_DASH", "GET", "/logs/transactions"),
    ]
    stmt = text(
        "INSERT IGNORE INTO tmp_seed_api (app_key, http_method, backend_endpoint)"
        " VALUES (:ak, :m, :ep)"
    )
    for app_key, method, endpoint in rows:
        conn.execute(stmt, {"ak": app_key, "m": method, "ep": endpoint})
