"""Remove orphan IAM resources/APIs not in seed_iam canonical lists.

Builds temp seed tables and deletes IAM rows not in the canonical seed lists.
Must run on one connection so TEMPORARY TABLEs survive through cleanup.

Revision ID: 095_iam_seed_orphan_cleanup
Revises: 094_logs_txn_path
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import inspect, text

revision = "095_iam_seed_orphan_cleanup"
down_revision = "094_logs_txn_path"
branch_labels = None
depends_on = None

_IAM_TABLES = (
    "iam_resource",
    "iam_resource_api",
    "iam_role_resource_api",
    "iam_resource_i18n",
    "iam_resource_api_i18n",
)

_UPGRADE_SQL = """
SET SQL_SAFE_UPDATES = 0;

-- Generated from seed_iam._DEFAULT_RESOURCES / _DEFAULT_RESOURCE_APIS.
-- Run in ONE MySQL session before orphan DELETE statements.
-- Temp table charset/collation: utf8mb4 / utf8mb4_0900_ai_ci (see apps.app_db.config).

DROP TEMPORARY TABLE IF EXISTS tmp_seed_resource;
CREATE TEMPORARY TABLE tmp_seed_resource (
  app_key VARCHAR(10) NOT NULL,
  resource_code VARCHAR(50) NOT NULL,
  PRIMARY KEY (app_key, resource_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TEMPORARY TABLE IF EXISTS tmp_seed_api;
CREATE TEMPORARY TABLE tmp_seed_api (
  app_key VARCHAR(10) NOT NULL,
  http_method VARCHAR(10) NOT NULL,
  backend_endpoint VARCHAR(500) NOT NULL,
  UNIQUE KEY uq_tmp_seed_api (app_key, http_method, backend_endpoint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- tmp_seed_resource
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'iam');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'iam_auth');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_role_resource');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_user_role');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_dw_management');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_datawarehouse');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_admin');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_language_management');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_translations');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_api_client');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_email_templates');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_email_logs');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_error_logs');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_help');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_help_admin');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_settings');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'sys_logs');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_template_admin');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_area');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_indicator');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_unit');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_indicator_classification');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_subgroup');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_data_entry_admin');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_data_source');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_data_entry');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_timeperiod');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_calculate_ius');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_administrator');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_workflow');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_data_review');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_languages');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_transaction_logs');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_data_admin_maintenance');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_DM', 'dm_dw_logs');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_VIZ', 'viz_ai_insights');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_VIZ', 'viz_gallery');
INSERT INTO tmp_seed_resource (app_key, resource_code) VALUES ('DFA_VIZ', 'viz_share_link');

-- tmp_seed_api
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/auth/login');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'POST', '/auth/login');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/auth/refresh');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'POST', '/auth/refresh');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/auth/password/reset-request');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'POST', '/auth/password/reset-request');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/auth/password/reset-confirm');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'POST', '/auth/password/reset-confirm');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/auth/register');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'POST', '/auth/register');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/auth/logout');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'POST', '/auth/logout');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/auth/me/permissions');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/iam/roles');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/iam/roles');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/iam/roles/{role_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/iam/roles/{role_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/iam/resources');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/iam/roles/{role_id}/resource-permissions');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PUT', '/iam/roles/{role_id}/resource-permissions');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/iam/user');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/iam/users/me');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/iam/users/me');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/iam/users/me/password');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/iam/users');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/iam/users/{user_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/iam/users/{user_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PUT', '/iam/users/{user_id}/roles');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dfa-mailer/templates/');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dfa-mailer/templates/');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dfa-mailer/templates/{template_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PUT', '/dfa-mailer/templates/{template_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dfa-mailer/templates/{template_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dfa-mailer/templates/key/{template_key}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dfa-mailer/logs/');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dfa-mailer/logs/{log_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dfa-mailer/logs/recipient/{email}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dfa-mailer/logs/status/{status}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/app-config');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/app-config');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/app-config');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'PATCH', '/app-config');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/translations');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/translations/{translation_code}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/translations');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/translations/{translation_code}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/translations/import');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/translations');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/translations/{translation_code}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/translations/{translation_code}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/translations/multiple-delete');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'POST', '/dw/{dw_id}/insights');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/system-language');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/system-language');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/system-language/{id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/system-language');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/system-language/{id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/system-language/{id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/system-api-clients');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/system-api-clients');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/system-api-clients/{id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/system-api-clients/{id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/system-api-clients/{id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/system-api-clients/{id}/rotate-api-key');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/optimize');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/optimize/lowercase');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/optimize/indexes');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/optimize/housekeeping');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/optimize/foreign-keys');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/optimize/sync-metadata');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/dbmetadata');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/dbmetadata');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/gallery');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/gallery/{id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'POST', '/gallery');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'PATCH', '/gallery/{id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'DELETE', '/gallery/{id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'POST', '/share-links');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/share-links/{code}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/area-levels');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/area-levels/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/area-levels/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/area-levels');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/area-levels/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/area-levels/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/area-levels');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/area-levels/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/area-levels/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/area-levels/multiple-delete');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/areas');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/areas');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/areas/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/areas/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/areas/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/areas');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/areas/import');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/areas/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/areas/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/areas/multiple-delete');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/indicators');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/indicators');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/indicators/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/indicators/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/indicators/{identifier}/subgroups');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/indicators/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/indicators/{identifier}/subgroups');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/indicators');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/indicators/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/indicators/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/indicators/multiple-delete');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/indicators/{identifier}/metadata');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/indicators/{identifier}/validation-rules');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/indicators/{identifier}/validation-rules');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/metadata-categories');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/metadata-categories/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/metadata-categories/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/metadata-categories');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/metadata-categories/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/metadata-categories/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/indicator-classifications');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/indicator-classifications');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/indicator-classifications/type');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/indicator-classifications/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/indicator-classifications');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/indicator-classifications/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/indicator-classifications/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PUT', '/dw/{dw_id}/indicator-classifications/ius');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/ic/{ic_identifier}/indicators');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/ic/{ic_identifier}/indicators');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/ic-ius/export');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/ius');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/indicator/{indicator_identifier}/ius');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/ius');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/indicator/{indicator_identifier}/ius');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/ius');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/ius/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/ius/multi-delete');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/ius/mark-default-subgroups');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/units');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/units/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/units/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/units');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/units/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/units/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/units/multiple-delete');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/sg-categories');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/sg-categories/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/sg-categories/{sg_category_identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/sg-categories');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/sg-categories/{sg_category_identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/sg-categories/{sg_category_identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/sg-categories-values');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/sg-categories-values/{value_identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/sg-categories/values');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/sg-categories-values/{value_identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/sg-categories-values/{value_identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/subgroups');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/subgroups');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/subgroups/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/subgroups/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/subgroups/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/subgroups');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/subgroups/multiple-delete');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/subgroups/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/time-periods');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/time-periods');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/time-periods/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/time-periods/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/time-periods');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/time-periods/import');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/time-periods/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/time-periods/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/time-periods/multiple-delete');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/sources');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/sources');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/sources/breakup');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/sources/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/sources/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/sources');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/sources/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/sources/{identifier}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/data');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/data');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/data');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/data');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/data/set-mrd');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/data/set-ius-data-exist');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/dataset');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/dataset');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/dataset/{dataset_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/dataset/{dataset_id}/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/dataset/{dataset_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/dataset/{dataset_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/data-points');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/data-points');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/data-points');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/data-point/{data_point_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/dataset');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/dataset/{dataset_id}/comments');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/dataset/{dataset_id}/comments');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/dataset/{dataset_id}/scope-check');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/dataset/{dataset_id}/data-points/import');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/search');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/dw/{dw_id}/search');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/languages');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/languages/{lang_code}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/languages');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/languages/{lang_code}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/languages/{lang_code}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/languages/export');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/languages/import');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/workflow');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/workflow');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/workflow/{workflow_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/workflow/{workflow_id}/association-count');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/workflow/{workflow_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/workflow/{workflow_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/workflow/{workflow_id}/level');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/workflow/{workflow_id}/level');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/workflow/{workflow_id}/level/{level_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/workflow/{workflow_id}/dataentry');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PUT', '/dw/{dw_id}/workflow/{workflow_id}/dataentry');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/workflow/{workflow_id}/user-assignments');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/workflow/{workflow_id}/user-assignments');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/workflow/{workflow_id}/user-assignments/{assignment_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/dataset/review');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/dataset/{dataset_id}/review');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/dataset/{dataset_id}/review');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/dataset/review-rejection-reasons');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/formula/total');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/formula/percent');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/formula/minus');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/formula/time');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/formula/area');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/compute/formula/{operation_type}/ius/{ius_gid}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/formula/resolve-ius');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/formula/operation-types');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/formula/target-ius/{ic_type}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/formula/ius/{ius_gid}/validate');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/formula/ius/{ius_gid}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/process');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/process');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/process/summary');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/process/eligible-target-ius');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/process/time/{process_time_id}/re-execute');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/process/{process_id}/status');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/process/{process_id}/estimate');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/process/{process_id}/execute');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/process/{process_id}/cancel');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PATCH', '/dw/{dw_id}/compute/process/{process_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/compute/process/{process_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/logs/summary');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/logs/search');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/logs/process/{process_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/logs/time/{process_time_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/logs/{process_time_log_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/dw/{dw_id}/compute/logs/{process_time_log_id}/sync-progress');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/dw/{dw_id}/compute/logs/{process_time_log_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/dw/{dw_id}/compute/logs/{process_time_log_id}/export');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/logs/server-errors');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/logs/transactions');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/help/api/keydata/{key_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/help/api/keydata/{key_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/help/api/health');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_VIZ', 'GET', '/help/api/health');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/help/api/adaptations');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'GET', '/help/api/keys/{adaptation_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'POST', '/help/api/create');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'PUT', '/help/api/update/{key_id}');
INSERT INTO tmp_seed_api (app_key, http_method, backend_endpoint) VALUES ('DFA_DM', 'DELETE', '/help/api/delete/{key_id}');

START TRANSACTION;

DELETE rra
FROM iam_role_resource_api AS rra
JOIN iam_resource_api AS api ON api.id = rra.resource_api_id
LEFT JOIN tmp_seed_api AS s
  ON s.app_key = api.app_key
 AND s.http_method = api.http_method
 AND s.backend_endpoint = api.backend_endpoint
WHERE s.app_key IS NULL;

DELETE i
FROM iam_resource_api_i18n AS i
JOIN iam_resource_api AS api ON api.id = i.master_id
LEFT JOIN tmp_seed_api AS s
  ON s.app_key = api.app_key
 AND s.http_method = api.http_method
 AND s.backend_endpoint = api.backend_endpoint
WHERE s.app_key IS NULL;

DELETE api
FROM iam_resource_api AS api
LEFT JOIN tmp_seed_api AS s
  ON s.app_key = api.app_key
 AND s.http_method = api.http_method
 AND s.backend_endpoint = api.backend_endpoint
WHERE s.app_key IS NULL;

DELETE rra
FROM iam_role_resource_api AS rra
JOIN iam_resource_api AS api ON api.id = rra.resource_api_id
JOIN iam_resource AS r ON r.id = api.resource_id
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL;

DELETE i
FROM iam_resource_api_i18n AS i
JOIN iam_resource_api AS api ON api.id = i.master_id
JOIN iam_resource AS r ON r.id = api.resource_id
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL;

DELETE api
FROM iam_resource_api AS api
JOIN iam_resource AS r ON r.id = api.resource_id
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL;

DELETE rra
FROM iam_role_resource_api AS rra
JOIN iam_resource AS r ON r.id = rra.resource_id
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL;

DELETE ri
FROM iam_resource_i18n AS ri
JOIN iam_resource AS r ON r.id = ri.master_id
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL;

DELETE r
FROM iam_resource AS r
LEFT JOIN tmp_seed_resource AS sr
  ON sr.app_key = r.app_key AND sr.resource_code = r.resource_code
WHERE sr.app_key IS NULL;

COMMIT;
SET SQL_SAFE_UPDATES = 1;
"""


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _iter_sql_statements(sql: str):
    """Yield semicolon-terminated statements; skip blank lines and -- comments."""
    buf: list[str] = []
    for line in sql.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        buf.append(line)
        if stripped.endswith(";"):
            statement = "\n".join(buf).strip()
            buf = []
            if statement:
                yield statement
    if buf:
        trailing = "\n".join(buf).strip()
        if trailing:
            yield trailing if trailing.endswith(";") else f"{trailing};"


def _execute_sql_script(connection, sql: str) -> None:
    for statement in _iter_sql_statements(sql):
        connection.execute(text(statement))


def upgrade() -> None:
    if not all(_table_exists(t) for t in _IAM_TABLES):
        return
    _execute_sql_script(op.get_bind(), _UPGRADE_SQL)


def downgrade() -> None:
    pass
