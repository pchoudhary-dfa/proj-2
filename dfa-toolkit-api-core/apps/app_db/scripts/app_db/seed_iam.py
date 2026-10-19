"""
Seed IAM tables: iam_role, iam_user, and iam_user_role.

Seeds are idempotent — existing rows are skipped unless --force is passed.
Roles are matched by (app_key + role_code). Users are matched by username.

Run from project root:
    python apps/app_db/scripts/seed_iam.py
    python apps/app_db/scripts/seed_iam.py --force
    python apps/app_db/scripts/seed_iam.py --dry-run

After changing iam_resource_api bindings for existing (method, path, app_key) rows, run with
--force so resource_id updates apply. Restart the API if ENABLE_ROUTE_CACHE is enabled.
"""
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

# Project root on sys.path so local imports work
project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.core import IamResource, IamResourceApi, IamResourceApiI18n, IamResourceI18n, IamRole, IamUser, IamUserRole  # noqa: E402
import apps.app_dashboard.models.dashboard  # noqa: E402,F401 — register dash_dashboards for IamUserRole.dashboard_id FK
from apps.app_db.scripts.seed_role_i18n_utils import seed_role_i18n_entries, validate_role_i18n_data  # noqa: E402
from apps.shared.config.config import settings  # noqa: E402
from apps.shared.utils.password_utils import hash_password  # noqa: E402

# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

# App keys resolved from settings so a single .env change propagates everywhere.
_DM_APP_KEY  = settings.DFA_DM_APP_KEY
_VIZ_APP_KEY = settings.DFA_VIZ_APP_KEY

# ---------------------------------------------------------------------------
# Resource API seed helpers
# ---------------------------------------------------------------------------

# Default action derived from HTTP method when no explicit action is provided.
# POST bulk-delete / optimize / execute / cancel / export entries override this
# by passing action= explicitly so the CRUD letter resolves correctly.
_METHOD_TO_ACTION: dict[str, str] = {
    "GET":    "READ",
    "POST":   "CREATE",
    "PUT":    "UPDATE",
    "PATCH":  "UPDATE",
    "DELETE": "DELETE",
}


def _both(resource_code: str, method: str, path: str, description: str, access: str = "PUBLIC", action: str | None = None) -> list[dict]:
    """Return DFA_DM + DFA_VIZ entries for the same endpoint. description is stored in i18n."""
    resolved_action = action or _METHOD_TO_ACTION.get(method.upper(), "CREATE")
    base = {
        "resource_code": resource_code,
        "http_method": method, "backend_endpoint": path,
        "action": resolved_action,
        "access_level": access, "is_active": 1,
        "_description": description,  # kept only for i18n seeding; not written to main table
    }
    return [{**base, "app_key": _DM_APP_KEY}, {**base, "app_key": _VIZ_APP_KEY}]


def _dm(resource_code: str, method: str, path: str, description: str, access: str = "APP_CLIENT", action: str | None = None) -> dict:
    """Return a single DFA_DM-only entry. description is stored in i18n."""
    return {
        "app_key": _DM_APP_KEY, "resource_code": resource_code,
        "http_method": method, "backend_endpoint": path,
        "action": action or _METHOD_TO_ACTION.get(method.upper(), "CREATE"),
        "access_level": access, "is_active": 1,
        "_description": description,  # kept only for i18n seeding; not written to main table
    }


def _viz(resource_code: str, method: str, path: str, description: str, access: str = "APP_CLIENT", action: str | None = None) -> dict:
    """Return a single DFA_VIZ-only entry. description is stored in i18n."""
    return {
        "app_key": _VIZ_APP_KEY, "resource_code": resource_code,
        "http_method": method, "backend_endpoint": path,
        "action": action or _METHOD_TO_ACTION.get(method.upper(), "CREATE"),
        "access_level": access, "is_active": 1,
        "_description": description,  # kept only for i18n seeding; not written to main table
    }


def _dm_auth_viz_app_client(resource_code: str, method: str, path: str, description: str, action: str | None = None) -> tuple[dict, dict]:
    """DW metadata GET: DFA_DM = AUTHENTICATED; DFA_VIZ = APP_CLIENT (same path)."""
    return (
        _dm(resource_code, method, path, description, access="AUTHENTICATED", action=action),
        _viz(resource_code, method, path, description, access="APP_CLIENT", action=action),
    )


_DEFAULT_RESOURCE_APIS: list[dict] = [
    # -------------------------------------------------------------------------
    # Auth — PUBLIC for both apps
    # -------------------------------------------------------------------------
    *_both("iam_auth", "GET",  "/auth/captcha/challenge",        "Request PoW CAPTCHA challenge",   access="APP_CLIENT"),
    *_both("iam_auth", "POST", "/auth/login",          "Generate JWT token",              access="APP_CLIENT"),
    *_both("iam_auth", "POST", "/auth/refresh",        "Refresh access token",            access="PUBLIC"),
    *_both("iam_auth", "POST", "/auth/password/reset-request", "Request password reset email with link", access="APP_CLIENT"),
    *_both("iam_auth", "POST", "/auth/password/reset-confirm", "Complete password reset with JWT and new password", access="APP_CLIENT"),
    *_both("iam_auth", "POST", "/auth/register",              "Register a new user account",                        access="APP_CLIENT"),
    *_both("iam_auth", "POST", "/auth/resend-registration",  "Resend registration email with set-password link",   access="APP_CLIENT"),
    *_both("iam_auth", "POST", "/auth/logout",               "User logout",                                        access="AUTHENTICATED"),
    *_both("iam_auth", "GET",  "/auth/session-status",       "Check session validity for SLO polling",              access="AUTHENTICATED"),
    *_both("iam_auth", "POST", "/auth/sso/back-channel-logout", "IdP-initiated back-channel logout",               access="APP_CLIENT"),
    _dm("iam_auth", "GET",  "/auth/me/permissions", "Get current user permissions",    access="AUTHENTICATED"),
    _dm("iam_auth", "GET",  "/notifications/unread-count", "Get unread notification count", access="AUTHENTICATED"),
    _dm("iam_auth", "GET",  "/notifications", "List notifications and mark unread as read", access="AUTHENTICATED"),

    # -------------------------------------------------------------------------
    # SSO Auth flow — Both DM and VIZ, APP_CLIENT for /providers (no JWT; pre-login)
    # -------------------------------------------------------------------------
    *_both("sys_sso", "GET",  "/auth/sso/providers",                  "List active SSO providers for login page", access="APP_CLIENT"),
    # Browser navigations (link + IdP return) cannot send X-Api-Key / signature headers.
    *_both("sys_sso", "GET",  "/auth/sso/{provider_code}/redirect",   "Initiate SSO redirect to IdP",             access="PUBLIC"),
    *_both("sys_sso", "GET",  "/auth/sso/{provider_code}/callback",   "Handle IdP callback after authentication", access="PUBLIC"),

    # SSO Provider admin — DM only, PERMISSION (admin manages providers)
    _dm("sys_sso", "GET",    "/sso-providers",              "List all SSO providers (admin)",           access="PERMISSION"),
    _dm("sys_sso", "POST",   "/sso-providers",              "Create SSO provider",                     access="PERMISSION"),
    _dm("sys_sso", "GET",    "/sso-providers/{nid}",        "Get SSO provider details",                access="PERMISSION"),
    _dm("sys_sso", "PATCH",  "/sso-providers/{nid}",        "Update SSO provider",                     access="PERMISSION"),
    _dm("sys_sso", "DELETE", "/sso-providers/{nid}",        "Delete SSO provider",                     access="PERMISSION"),
    _dm("sys_sso", "POST",   "/sso-providers/{nid}/discover", "Discover SSO provider OIDC endpoints",  access="PERMISSION"),

    # -------------------------------------------------------------------------
    # IAM Roles — DM only
    # -------------------------------------------------------------------------
    _dm("sys_role_resource", "GET",    "/iam/roles",           "List IAM roles",          access="PERMISSION"),
    _dm("sys_role_resource", "POST",   "/iam/roles",           "Create IAM role",         access="PERMISSION"),
    _dm("sys_role_resource", "PATCH",  "/iam/roles/{role_id}", "Partially update IAM role", access="PERMISSION"),
    _dm("sys_role_resource", "DELETE", "/iam/roles/{role_id}", "Delete IAM role",         access="PERMISSION"),
    _dm("sys_role_resource", "GET", "/iam/resources", "List IAM resources", access="PERMISSION"),
    _dm(
        "sys_role_resource",
        "GET",
        "/iam/roles/{role_id}/resource-permissions",
        "Get IAM role resource permissions (CRUD)",
        access="PERMISSION",
    ),
    _dm("sys_role_resource", "PUT", "/iam/roles/{role_id}/resource-permissions", "Save role permissions", access="PERMISSION"),
    _dm("sys_user_role",      "GET", "/iam/user",                  "List users scoped to app_key/dw_id", access="PERMISSION"),
    _dm("sys_user_role",      "GET", "/iam/users/me",              "Get current user profile", access="AUTHENTICATED"),
    _dm("sys_user_role",      "PATCH", "/iam/users/me",            "Update current user profile", access="AUTHENTICATED"),
    _dm("sys_user_role",      "PATCH", "/iam/users/me/password",   "Change current user password", access="AUTHENTICATED"),
    _dm("sys_user_role",      "POST",   "/iam/users",                  "Create new user (admin)",        access="PERMISSION"),
    _dm("sys_user_role",      "PATCH",  "/iam/users/{user_id}",        "Admin update user by ID",        access="PERMISSION"),
    _dm("sys_user_role",      "DELETE", "/iam/users/{user_id}",        "Admin delete user by ID",        access="PERMISSION"),
    _dm("sys_user_role", "PUT",    "/iam/users/{user_id}/roles",  "Assign roles to a user",         access="PERMISSION"),

    # -------------------------------------------------------------------------
    # DFA Mailer (email templates / logs) — DM only; used when /dfa-mailer is not in middleware skip list
    # -------------------------------------------------------------------------
    _dm("sys_email_templates", "GET",    "/dfa-mailer/templates/",                   "List email templates", access="PERMISSION"),
    _dm("sys_email_templates", "POST",   "/dfa-mailer/templates/",                   "Create email template", access="PERMISSION"),
    _dm("sys_email_templates", "GET",    "/dfa-mailer/templates/{template_id}",      "Get email template by ID", access="PERMISSION"),
    _dm("sys_email_templates", "PUT",    "/dfa-mailer/templates/{template_id}",      "Update email template", access="PERMISSION"),
    _dm("sys_email_templates", "DELETE", "/dfa-mailer/templates/{template_id}",      "Delete email template", access="PERMISSION"),
    _dm("sys_email_templates", "GET",    "/dfa-mailer/templates/key/{template_key}", "List templates by template key", access="PERMISSION"),
    _dm("sys_email_logs", "GET",    "/dfa-mailer/logs/",                        "List email logs", access="PERMISSION"),
    _dm("sys_email_logs", "GET",    "/dfa-mailer/logs/{log_id}",                "Get email log by ID", access="PERMISSION"),
    _dm("sys_email_logs", "GET",    "/dfa-mailer/logs/recipient/{email}",       "List email logs by recipient", access="PERMISSION"),
    _dm("sys_email_logs", "GET",    "/dfa-mailer/logs/status/{status}",         "List email logs by status", access="PERMISSION"),

    # -------------------------------------------------------------------------
    # App Config — AUTHENTICATED for dm
    # -------------------------------------------------------------------------
    _dm("sys_settings", "GET", "/app-config", "Get app config by app_key", access="APP_CLIENT"),
    _dm("sys_settings", "PATCH", "/app-config", "Patch app config by app_key", access="PERMISSION"),
    _viz("sys_settings", "GET", "/app-config", "Get app config by app_key", access="APP_CLIENT"),
    _viz("sys_settings", "PATCH", "/app-config", "Patch app config by app_key", access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Translations — AUTHENTICATED for dm
    # -------------------------------------------------------------------------
    _dm("sys_translations", "GET", "/translations", "Get translations (global/app by query)", access="APP_CLIENT"),
    _dm("sys_translations", "GET", "/translations/{translation_code}", "Get translations by code", access="APP_CLIENT"),
    _viz("sys_translations", "GET", "/translations", "Get translations (global/app by query)"),
    _viz("sys_translations", "GET", "/translations/{translation_code}", "Get translations by code"),
    _dm("sys_translations", "POST", "/translations/import", "Import translations from XLSX", access="PERMISSION"),
    _dm("sys_translations", "POST", "/translations", "Create translation (global/app by payload)", access="PERMISSION"),
    _dm("sys_translations", "PATCH", "/translations/{translation_code}", "Patch translation by code", access="PERMISSION"),
    _dm("sys_translations", "DELETE", "/translations/{translation_code}", "Delete translation by code", access="PERMISSION"),
    _dm("sys_translations", "POST", "/translations/multiple-delete", "Delete multiple translations by code (app then global)", access="PERMISSION", action="DELETE"),

    # -------------------------------------------------------------------------
    # AI insights — DM + VIZ (distinct resource_code per app_key for seed maps)
    # -------------------------------------------------------------------------
    _viz("viz_ai_insights", "POST", "/dw/{dw_id}/insights", "Generate AI chart insights", access="APP_CLIENT"),

    # -------------------------------------------------------------------------
    # System Language — DM & VIZ
    # -------------------------------------------------------------------------
    _dm("sys_translations", "GET",   "/system-language",      "List system languages",   access="APP_CLIENT"),
    _viz("sys_translations", "GET",  "/system-language",      "List system languages",   access="APP_CLIENT"),
    _dm("sys_translations", "GET",   "/system-language/{id}", "Get system language by id", access="AUTHENTICATED"),
    _dm("sys_translations", "POST",  "/system-language",      "Create a system language", access="AUTHENTICATED"),
    _dm("sys_translations", "PATCH", "/system-language/{id}", "Patch a system language", access="AUTHENTICATED"),
    _dm("sys_translations", "DELETE", "/system-language/{id}", "Delete a system language", access="AUTHENTICATED"),

    # -------------------------------------------------------------------------
    # System API Clients — DM only, super-admin via PERMISSION
    # -------------------------------------------------------------------------
    _dm("sys_api_client", "GET",    "/system-api-clients",                     "List system API clients",       access="APP_CLIENT"),
    _dm("sys_api_client", "POST",   "/system-api-clients",                     "Register new API client",       access="PERMISSION"),
    _dm("sys_api_client", "GET",    "/system-api-clients/{id}",                "Get API client by ID",          access="PERMISSION"),
    _dm("sys_api_client", "PATCH",  "/system-api-clients",                     "Bulk update API clients",       access="PERMISSION"),
    _dm("sys_api_client", "DELETE", "/system-api-clients/{id}",                "Delete API client",             access="PERMISSION"),
    _dm("sys_api_client", "POST",   "/system-api-clients/{id}/rotate-api-key", "Rotate API client key",         access="PERMISSION", action="UPDATE"),

    # -------------------------------------------------------------------------
    # System Datawarehouses — DM admin; VIZ list (APP_CLIENT)
    # -------------------------------------------------------------------------
    _dm("sys_datawarehouse", "GET",    "/dw",                               "List system datawarehouses",     access="PERMISSION"),
    _viz("sys_datawarehouse", "GET",   "/dw",                               "List system datawarehouses",     access="APP_CLIENT"),
    _dm("sys_datawarehouse", "GET",    "/dw/{dw_id}",                       "Get system datawarehouse by ID", access="PERMISSION"),
    _dm("sys_datawarehouse", "POST",   "/dw/",                              "Create new datawarehouse", access="PERMISSION"),
    _dm("sys_datawarehouse", "POST",   "/dw",                               "Register and Test Connection to a Existing Data Warehouse", access="PERMISSION"),
    _dm("sys_datawarehouse", "PATCH",  "/dw/{dw_id}",                       "Update datawarehouse", access="PERMISSION"),
    _dm("sys_datawarehouse", "DELETE", "/dw/{dw_id}",                       "Delete datawarehouse", access="PERMISSION"),
    # Selective optimize steps are body flags on POST /dw/{dw_id}/optimize (no sub-paths).
    _dm("dm_dw_data_admin_maintenance", "POST",   "/dw/{dw_id}/optimize",              "Full optimize datawarehouse", access="PERMISSION", action="UPDATE"),
    # DB metadata — PUBLIC for both apps
    _dm("sys_datawarehouse", "GET", "/dw/{dw_id}/dbmetadata", "Get DW metadata counts",access="PERMISSION"),
    _dm("sys_datawarehouse", "PATCH", "/dw/{dw_id}/dbmetadata", "Update DB metadata description", access="PERMISSION"),
    _dm("sys_datawarehouse", "POST", "/dw/{dw_id}/sql-dump", "Generate SQL dump", access="PERMISSION", action="UPDATE"),
    _dm("sys_datawarehouse", "GET", "/dw/{dw_id}/sql-dump", "Download SQL dump", access="PERMISSION", action="READ"),
    _dm("sys_datawarehouse", "GET", "/dw/{dw_id}/users", "List warehouse members", access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Gallery — VIZ only, PERMISSION
    # -------------------------------------------------------------------------
    _viz("viz_gallery", "GET",    "/gallery",      "List gallery items",access="AUTHENTICATED"),
    _viz("viz_gallery", "GET",    "/gallery/{id}", "Get gallery item by ID",access="AUTHENTICATED"),
    _viz("viz_gallery", "POST",   "/gallery",      "Create gallery item",access="AUTHENTICATED"),
    _viz("viz_gallery", "PATCH",  "/gallery/{id}", "Update gallery item",access="AUTHENTICATED"),
    _viz("viz_gallery", "DELETE", "/gallery/{id}", "Delete gallery item",access="AUTHENTICATED"),

    # -------------------------------------------------------------------------
    # Share Links — VIZ only; POST = APP_CLIENT, GET = PUBLIC
    # -------------------------------------------------------------------------
    _viz("viz_share_link", "POST", "/share-links",        "Create share link", access="APP_CLIENT"),
    _viz("viz_share_link", "GET",  "/share-links/{code}", "Resolve share link", access="PUBLIC"),

    # -------------------------------------------------------------------------
    # Area Levels — reads PUBLIC both apps, writes DM PERMISSION
    # -------------------------------------------------------------------------
    _dm("dm_dw_area", "GET", "/dw/{dw_id}/area-levels",                  "List area levels"),
    _dm("dm_dw_area", "GET", "/dw/{dw_id}/area-levels/association-count", "Area level association count"),
    _dm("dm_dw_area", "GET", "/dw/{dw_id}/area-levels/{identifier}",      "Get area level by identifier"),
    _viz("dm_dw_area", "GET", "/dw/{dw_id}/area-levels",                  "List area levels"),
    _viz("dm_dw_area", "GET", "/dw/{dw_id}/area-levels/association-count", "Area level association count"),
    _viz("dm_dw_area", "GET", "/dw/{dw_id}/area-levels/{identifier}",      "Get area level by identifier"),
    _dm("dm_dw_area", "POST",   "/dw/{dw_id}/area-levels",                  "Create area level(s)",access="PERMISSION"),
    _dm("dm_dw_area", "PATCH",  "/dw/{dw_id}/area-levels/{identifier}",     "Update area level",access="PERMISSION"),
    _dm("dm_dw_area", "DELETE", "/dw/{dw_id}/area-levels/{identifier}",     "Delete area level",access="PERMISSION"),
    _dm("dm_dw_area", "POST",   "/dw/{dw_id}/area-levels/multiple-delete",  "Bulk delete area levels",access="PERMISSION", action="DELETE"),

    # -------------------------------------------------------------------------
    # Areas — DM GETs AUTHENTICATED; VIZ same paths APP_CLIENT; writes DM PERMISSION
    # -------------------------------------------------------------------------
    *_dm_auth_viz_app_client("dm_dw_area", "GET", "/dw/{dw_id}/areas", "List areas"),
    _dm("dm_dw_area", "GET", "/dw/{dw_id}/areas/association-count", "Area association count"),
    _dm("dm_dw_area", "GET", "/dw/{dw_id}/areas/{identifier}",      "Get area by identifier"),
    _viz("dm_dw_area", "GET", "/dw/{dw_id}/areas/{identifier}",      "Get area by identifier"),
    _dm("dm_dw_area", "POST",   "/dw/{dw_id}/areas",                  "Create area(s)",access="PERMISSION"),
    _dm("dm_dw_area", "POST",   "/dw/{dw_id}/areas/import",          "Import areas from XLSX", access="PERMISSION"),
    _dm("dm_dw_area", "PATCH",  "/dw/{dw_id}/areas/{identifier}",     "Update area",access="PERMISSION"),
    _dm("dm_dw_area", "DELETE", "/dw/{dw_id}/areas/{identifier}",     "Delete area",access="PERMISSION"),
    _dm("dm_dw_area", "POST",   "/dw/{dw_id}/areas/multiple-delete",  "Bulk delete areas",access="PERMISSION", action="DELETE"),

    # -------------------------------------------------------------------------
    # Indicators — DM GETs AUTHENTICATED; VIZ same paths APP_CLIENT; writes DM PERMISSION
    # -------------------------------------------------------------------------
    *_dm_auth_viz_app_client("dm_dw_indicator", "GET", "/dw/{dw_id}/indicators", "List indicators"),
    _dm("dm_dw_indicator", "GET", "/dw/{dw_id}/indicators/association-count", "Indicator association count"),
    _dm("dm_dw_indicator", "GET", "/dw/{dw_id}/indicators/{identifier}",      "Get indicator by identifier"),
    _dm("dm_dw_indicator", "GET", "/dw/{dw_id}/indicators/{identifier}/subgroups", "Get subgroups for indicator"),
    _viz("dm_dw_indicator", "GET", "/dw/{dw_id}/indicators/{identifier}",      "Get indicator by identifier"),
    _viz("dm_dw_indicator", "GET", "/dw/{dw_id}/indicators/{identifier}/subgroups", "Get subgroups for indicator"),
    _dm("dm_dw_indicator", "POST",   "/dw/{dw_id}/indicators",                       "Create indicator(s)",access="PERMISSION"),
    _dm("dm_dw_indicator", "PATCH",  "/dw/{dw_id}/indicators/{identifier}",          "Update indicator",access="PERMISSION"),
    _dm("dm_dw_indicator", "DELETE", "/dw/{dw_id}/indicators/{identifier}",          "Delete indicator",access="PERMISSION"),
    _dm("dm_dw_indicator", "POST",   "/dw/{dw_id}/indicators/multiple-delete",       "Bulk delete indicators", access="PERMISSION", action="DELETE"),
    _dm("dm_dw_indicator", "PATCH",  "/dw/{dw_id}/indicators/{identifier}/metadata", "Update indicator metadata",access="PERMISSION"),
    _dm("dm_dw_indicator", "GET",   "/dw/{dw_id}/indicators/validation-rules", "Get indicator validation rules"),
    _dm("dm_dw_indicator", "PATCH", "/dw/{dw_id}/indicators/{identifier}/validation-rules", "Upsert indicator validation rules", access="PERMISSION"),

    # Metadata Categories (mapped to Indicator resource per plan)
    _dm("dm_dw_indicator", "GET", "/dw/{dw_id}/metadata-categories",                  "List metadata categories"),
    _dm("dm_dw_indicator", "GET", "/dw/{dw_id}/metadata-categories/association-count", "Metadata category association count"),
    _dm("dm_dw_indicator", "GET", "/dw/{dw_id}/metadata-categories/{identifier}",      "Get metadata category by identifier"),
    _dm("dm_dw_indicator", "POST",   "/dw/{dw_id}/metadata-categories",             "Create metadata category(s)",access="PERMISSION"),
    _dm("dm_dw_indicator", "PATCH",  "/dw/{dw_id}/metadata-categories/{identifier}", "Update metadata category",access="PERMISSION"),
    _dm("dm_dw_indicator", "DELETE", "/dw/{dw_id}/metadata-categories/{identifier}", "Delete metadata category",access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Indicator Classifications — reads PUBLIC both apps, writes DM PERMISSION
    # -------------------------------------------------------------------------
    _dm("dm_dw_indicator_classification", "GET", "/dw/{dw_id}/indicator-classifications",                  "List indicator classifications"),
    _viz("dm_dw_indicator_classification", "GET", "/dw/{dw_id}/indicator-classifications",                  "List indicator classifications"),
    _dm("dm_dw_indicator_classification", "GET", "/dw/{dw_id}/indicator-classifications/type",             "Get IC types"),
    _viz("dm_dw_indicator_classification", "GET", "/dw/{dw_id}/indicator-classifications/type",             "Get IC types", access="APP_CLIENT"),
    _dm("dm_dw_indicator_classification", "GET", "/dw/{dw_id}/indicator-classifications/{identifier}",     "Get IC by identifier"),
    _dm("dm_dw_indicator_classification", "POST",   "/dw/{dw_id}/indicator-classifications",             "Create indicator classification(s)",access="PERMISSION"),
    _dm("dm_dw_indicator_classification", "PATCH",  "/dw/{dw_id}/indicator-classifications/{identifier}", "Update indicator classification",access="PERMISSION"),
    _dm("dm_dw_indicator_classification", "DELETE", "/dw/{dw_id}/indicator-classifications/{identifier}", "Delete indicator classification",access="PERMISSION"),
    _dm("dm_dw_indicator_classification", "PUT", "/dw/{dw_id}/indicator-classifications/ius", "Map IC to IUS combinations", access="PERMISSION"),
    _dm("dm_dw_indicator_classification", "GET", "/dw/{dw_id}/ic/{ic_identifier}/indicators", "List indicators for IC"),
    _viz("dm_dw_indicator_classification", "GET", "/dw/{dw_id}/ic/{ic_identifier}/indicators", "List indicators for IC"),
    # IC-IUS export — both apps PUBLIC (read-like export)
    _dm("dm_dw_indicator_classification", "POST", "/dw/{dw_id}/ic-ius/export", "Export IC-IUS mappings",access="AUTHENTICATED", action="READ"),
    _dm("dm_dw_indicator_classification", "POST", "/dw/{dw_id}/ic-ius/import", "Import IC-IUS mappings from XLSX or CSV", access="PERMISSION"),

    # -------------------------------------------------------------------------
    # IUS — reads PUBLIC both apps, writes DM PERMISSION
    # -------------------------------------------------------------------------
    _dm("dm_dw_indicator", "GET", "/dw/{dw_id}/ius",                                   "List IUS"),
    _viz("dm_dw_indicator", "GET", "/dw/{dw_id}/ius",                                   "List IUS"),
    _dm("dm_dw_indicator", "POST",   "/dw/{dw_id}/ius",                        "Upsert IUS",access="PERMISSION"),
    _dm("dm_dw_indicator", "DELETE", "/dw/{dw_id}/ius/{identifier}",           "Delete IUS",access="PERMISSION"),
    _dm("dm_dw_indicator", "POST",   "/dw/{dw_id}/ius/multiple-delete",        "Bulk delete IUS",access="PERMISSION", action="DELETE"),
    _dm("dm_dw_data_admin_maintenance", "POST",   "/dw/{dw_id}/ius/mark-default-subgroups", "Mark default IUS subgroups per indicator-unit pair",access="PERMISSION", action="UPDATE"),

    # -------------------------------------------------------------------------
    # Units — DM GETs AUTHENTICATED; VIZ same paths APP_CLIENT; writes DM PERMISSION
    # -------------------------------------------------------------------------
    _dm("dm_dw_unit", "GET", "/dw/{dw_id}/units", "List units"),
    _dm("dm_dw_unit", "GET", "/dw/{dw_id}/units/association-count", "Unit association count"),
    _dm("dm_dw_unit", "GET", "/dw/{dw_id}/units/{identifier}",      "Get unit by identifier"),
    _dm("dm_dw_unit", "POST",   "/dw/{dw_id}/units",                  "Create unit(s)",access="PERMISSION"),
    _dm("dm_dw_unit", "PATCH",  "/dw/{dw_id}/units/{identifier}",     "Update unit",access="PERMISSION"),
    _dm("dm_dw_unit", "DELETE", "/dw/{dw_id}/units/{identifier}",     "Delete unit",access="PERMISSION"),
    _dm("dm_dw_unit", "POST",   "/dw/{dw_id}/units/multiple-delete",  "Bulk delete units",access="PERMISSION", action="DELETE"),

    # -------------------------------------------------------------------------
    # Subgroup Categories — reads PUBLIC both apps, writes DM PERMISSION
    # -------------------------------------------------------------------------
    _dm("dm_dw_subgroup", "GET", "/dw/{dw_id}/sg-categories",                  "List subgroup categories"),
    _dm("dm_dw_subgroup", "GET", "/dw/{dw_id}/sg-categories/association-count", "Subgroup category association count"),
    _dm("dm_dw_subgroup", "GET", "/dw/{dw_id}/sg-categories/{sg_category_identifier}",        "Get subgroup category by identifier"),
    _dm("dm_dw_subgroup", "POST",   "/dw/{dw_id}/sg-categories",              "Create subgroup category(s)",access="PERMISSION"),
    _dm("dm_dw_subgroup", "PATCH",  "/dw/{dw_id}/sg-categories/{category_identifier}",         "Update subgroup category",access="PERMISSION"),
    _dm("dm_dw_subgroup", "DELETE", "/dw/{dw_id}/sg-categories/{sg_category_identifier}",   "Delete subgroup category",access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Subgroup Category Values — reads PUBLIC both apps, writes DM PERMISSION
    # -------------------------------------------------------------------------
    _dm("dm_dw_subgroup", "GET", "/dw/{dw_id}/sg-categories-values",                    "List subgroup category values"),
    _dm("dm_dw_subgroup", "GET", "/dw/{dw_id}/sg-categories-values/{value_identifier}", "Get subgroup category value"),
    _dm("dm_dw_subgroup", "POST",   "/dw/{dw_id}/sg-categories/values",                     "Create subgroup category value(s)",access="PERMISSION"),
    _dm("dm_dw_subgroup", "PATCH",  "/dw/{dw_id}/sg-categories-values/{value_identifier}",  "Update subgroup category value",access="PERMISSION"),
    _dm("dm_dw_subgroup", "DELETE", "/dw/{dw_id}/sg-categories-values/{value_identifier}",  "Delete subgroup category value",access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Subgroups — DM GETs AUTHENTICATED; VIZ same paths APP_CLIENT; writes DM PERMISSION
    # -------------------------------------------------------------------------
    *_dm_auth_viz_app_client("dm_dw_subgroup", "GET", "/dw/{dw_id}/subgroups", "List subgroups"),
    _dm("dm_dw_subgroup", "GET", "/dw/{dw_id}/subgroups/association-count", "Subgroup association count"),
    _dm("dm_dw_subgroup", "GET", "/dw/{dw_id}/subgroups/{identifier}",      "Get subgroup by identifier"),
    _dm("dm_dw_subgroup", "PATCH", "/dw/{dw_id}/subgroups/{identifier}",     "Update subgroup", access="PERMISSION"),
    _dm("dm_dw_subgroup", "POST",   "/dw/{dw_id}/subgroups",             "Create subgroup(s)",access="PERMISSION"),
    _dm("dm_dw_subgroup", "POST",   "/dw/{dw_id}/subgroups/multiple-delete", "Bulk delete subgroups",access="PERMISSION", action="DELETE"),
    _dm("dm_dw_subgroup", "DELETE", "/dw/{dw_id}/subgroups/{identifier}", "Delete subgroup",access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Time Periods — DM GETs AUTHENTICATED; VIZ same paths APP_CLIENT; writes DM PERMISSION
    # -------------------------------------------------------------------------
    *_dm_auth_viz_app_client("dm_dw_timeperiod", "GET", "/dw/{dw_id}/time-periods", "List time periods"),
    _dm("dm_dw_timeperiod", "GET", "/dw/{dw_id}/time-periods/association-count", "Time period association count"),
    _dm("dm_dw_timeperiod", "GET", "/dw/{dw_id}/time-periods/{identifier}",      "Get time period by identifier"),
    _dm("dm_dw_timeperiod", "POST",   "/dw/{dw_id}/time-periods",                  "Create time period(s)",access="PERMISSION"),
    _dm("dm_dw_timeperiod", "POST",   "/dw/{dw_id}/time-periods/import",          "Import time periods from XLSX", access="PERMISSION"),
    _dm("dm_dw_timeperiod", "PATCH",  "/dw/{dw_id}/time-periods/{identifier}",     "Update time period",access="PERMISSION"),
    _dm("dm_dw_timeperiod", "DELETE", "/dw/{dw_id}/time-periods/{identifier}",     "Delete time period",access="PERMISSION"),
    _dm("dm_dw_timeperiod", "POST",   "/dw/{dw_id}/time-periods/multiple-delete",  "Bulk delete time periods",access="PERMISSION", action="DELETE"),

    # -------------------------------------------------------------------------
    # Sources — DM GETs AUTHENTICATED; VIZ same paths APP_CLIENT; writes DM PERMISSION
    # -------------------------------------------------------------------------
    *_dm_auth_viz_app_client("dm_dw_data_source", "GET", "/dw/{dw_id}/sources", "List sources"),
    _dm("dm_dw_data_source", "GET", "/dw/{dw_id}/sources/breakup",           "Source breakup (dropdowns)"),
    _dm("dm_dw_data_source", "GET", "/dw/{dw_id}/sources/association-count", "Source association count"),
    _dm("dm_dw_data_source", "GET", "/dw/{dw_id}/sources/{identifier}",      "Get source by identifier"),
    _dm("dm_dw_data_source", "POST",   "/dw/{dw_id}/sources",             "Create source",access="PERMISSION"),
    _dm("dm_dw_data_source", "PATCH",  "/dw/{dw_id}/sources/{identifier}", "Update source",access="PERMISSION"),
    _dm("dm_dw_data_source", "DELETE", "/dw/{dw_id}/sources/{identifier}", "Delete source",access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Data — GET public (shared with viz app), writes PERMISSION
    # set-mrd and set-ius-data-exist are admin/system writes → PERMISSION
    # -------------------------------------------------------------------------
    _dm("dm_dw_data_entry", "GET",    "/dw/{dw_id}/data", "Fetch data rows"),
    _viz("dm_dw_data_entry", "GET",    "/dw/{dw_id}/data", "Fetch data rows"),
    _dm("dm_dw_data_entry", "POST",   "/dw/{dw_id}/data", "Upsert data rows", access="PERMISSION"),
    _dm("dm_dw_data_entry", "DELETE", "/dw/{dw_id}/data", "Delete data rows", access="PERMISSION"),
    _dm("dm_dw_data_admin_maintenance", "POST",   "/dw/{dw_id}/data/set-mrd", "Update ISMRD for data combinations", access="PERMISSION", action="UPDATE"),
    _dm("dm_dw_data_admin_maintenance", "POST",   "/dw/{dw_id}/data/set-ius-data-exist","Set IUS data_exist from ut_data", access="PERMISSION", action="UPDATE"),

    # -------------------------------------------------------------------------
    # Dataset — data entry operator CRUD; all require authenticated user
    # Status transitions (SUBMITTED / CANCELLED) are handled via the single
    # PATCH /dataset/{id} endpoint; status value drives implicit side-effects.
    # -------------------------------------------------------------------------
    _dm("dm_dw_data_entry", "GET",    "/dw/{dw_id}/dataset",                          "List datasets for current operator",                         access="AUTHENTICATED"),
    _dm("dm_dw_data_entry", "POST",   "/dw/{dw_id}/dataset",                          "Create a new DRAFT dataset",                                 access="PERMISSION"),
    _dm("dm_dw_data_entry", "GET",    "/dw/{dw_id}/dataset/{dataset_id}",                    "Get dataset header and status",                              access="AUTHENTICATED"),
    _dm("dm_dw_data_entry", "GET",    "/dw/{dw_id}/dataset/{dataset_id}/association-count",  "Dataset association count",                                  access="AUTHENTICATED"),
    _dm("dm_dw_data_entry", "DELETE", "/dw/{dw_id}/dataset/{dataset_id}",                    "Delete a DRAFT dataset permanently",                         access="PERMISSION"),
    # Disabled — superseded by unified /dw/{dw_id}/data-points endpoints.
    # Restore when explicit dataset-scoped data-point access is needed again.
    # _dm("dm_dw_data_entry", "GET",    "/dw/{dw_id}/dataset/{dataset_id}/data-points", "Read data points for a dataset (with filters)",              access="AUTHENTICATED"),
    # _dm("dm_dw_data_entry", "PATCH",  "/dw/{dw_id}/dataset/{dataset_id}/data-points", "Add or update data points (DRAFT / unlocked rows)",          access="AUTHENTICATED"),
    # _dm("dm_dw_data_entry", "DELETE", "/dw/{dw_id}/dataset/{dataset_id}/data-points",                "Delete selected data points",  access="AUTHENTICATED"),
    # _dm("dm_dw_data_entry", "DELETE", "/dw/{dw_id}/dataset/{dataset_id}/data-point/{data_point_id}", "Delete a single data point",   access="AUTHENTICATED"),
    _dm("dm_dw_data_entry", "PATCH",  "/dw/{dw_id}/dataset/{dataset_id}",             "Operator status transition (SUBMITTED / CANCELLED)",         access="PERMISSION"),
    # Unified FED endpoints (mode-agnostic; dataset resolved implicitly for Mode 1)
    _dm("dm_dw_data_entry", "GET",    "/dw/{dw_id}/data-points",             "Unified read: ut_data baseline merged with active dataset overlay (optional i_identifier, area_nid, timeperiod_nid)", access="AUTHENTICATED"),
    _dm("dm_dw_data_entry", "PATCH",  "/dw/{dw_id}/data-points",             "Unified upsert: add/update data points (implicit DRAFT for Mode 1)", access="PERMISSION"),
    _dm("dm_dw_data_entry", "DELETE", "/dw/{dw_id}/data-points",             "Unified bulk delete data points",                                   access="PERMISSION"),
    _dm("dm_dw_data_entry", "DELETE", "/dw/{dw_id}/data-point/{data_point_id}", "Unified single data point delete",                              access="PERMISSION"),
    _dm("dm_dw_data_entry", "PATCH",  "/dw/{dw_id}/dataset",                "Unified submit/cancel dataset",                                     access="PERMISSION"),
    # Workflow data-entry config — operator/reviewer read (mirrors GET /workflow/{id}/dataentry)
    _dm("dm_dw_data_entry",  "GET",  "/dw/{dw_id}/dataset/workflow/{workflow_id}", "Get workflow data-entry configuration (operator read)", access="AUTHENTICATED"),
    # Comment and scope-check endpoints
    _dm("dm_dw_data_entry",  "GET",  "/dw/{dw_id}/dataset/{dataset_id}/comments",       "List dataset comments",          access="AUTHENTICATED"),
    _dm("dm_dw_data_entry",  "POST", "/dw/{dw_id}/dataset/{dataset_id}/comments",       "Add dataset comment",            access="AUTHENTICATED"),
    _dm("dm_dw_data_entry",  "POST", "/dw/{dw_id}/dataset/{dataset_id}/scope-check",    "Dataset scope check (advisory)", access="AUTHENTICATED", action="READ"),
    _dm("dm_dw_data_entry",  "POST", "/dw/{dw_id}/dataset/{dataset_id}/data-points/import", "Import datapoints from XLSX or CSV (export column layout) to update data_value and footnote (DRAFT/REVISION only)", access="PERMISSION"),
    _dm("dm_dw_data_entry",  "GET", "/dw/{dw_id}/dataset/{dataset_id}/data-points/import-logs", "List data-point import job history for a dataset (grouped by request_id)", access="PERMISSION"),
    _dm("dm_dw_data_entry",  "GET", "/dw/{dw_id}/dataset/{dataset_id}/data-points/import-logs/{request_id}", "Get batch-level import logs for one import request_id", access="PERMISSION"),


    # -------------------------------------------------------------------------
    # Search — cross-resource (mapped to data entry parent); VIZ APP_CLIENT
    # -------------------------------------------------------------------------
    _dm("dm_dw_data_entry", "GET", "/dw/{dw_id}/search", "Smart search across DW"),
    _viz("dm_dw_data_entry", "GET", "/dw/{dw_id}/search", "Smart search across DW"),
    _viz("dm_dw_data_entry", "POST", "/dw/{dw_id}/search/sync", "Sync search index (create tables and rebuild)", access="PERMISSION",),
    _viz("dm_dw_data_entry", "GET", "/dw/{dw_id}/search/sync/status", "Poll search sync job status", access="PERMISSION"),
    _viz("dm_dw_data_entry", "GET", "/dw/{dw_id}/search/sync/active", "Get active search sync job", access="PERMISSION"),

    # -------------------------------------------------------------------------
    # DW Reports — parent dm_dw_reports (catalogue); children: data / quality / analytics
    # -------------------------------------------------------------------------
    *_both("dm_dw_reports", "GET", "/dw/{dw_id}/reports", "List DW reports catalogue", access="AUTHENTICATED"),
    # Quality reports (dm_dw_reports_quality) — AUTHENTICATED
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/indicators/no-ius", "Indicators with No Subgroup Assigned", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/indicators/no-default-subgroup", "Indicators Without Default Subgroup", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/indicators/no-data", "Indicators With No Reported Data", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/ius/invalid-value-range", "IUS with Invalid Value Range", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/ius/no-ic-mapping", "IUS Not Mapped to Any IC", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/areas/no-data", "Areas With No Data", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/areas/orphan-parent", "Areas With Broken Parent Reference", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/time-periods/unused", "Unused Time Periods", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/subgroups/vals-not-in-ius", "SubgroupVals Not Used in Any IUS", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/data/values-out-of-range", "Data Values Outside IUS Range", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/data/missing-mrd", "IUS+Area Combos With No MRD Row", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/metadata/missing-mandatory", "Indicators Missing Mandatory Metadata", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/sources/unused", "Sources Not Referenced in Data", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/indicator-classifications/no-ius", "ICs With No IUS Mapping", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/indicator-classifications/leaf-no-ius", "IC Leaf Nodes Without IUS", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/ic-ius/orphan-refs", "IC-IUS Links With Broken References", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/ius/orphan-refs", "IUS With Broken Dimension References", access="AUTHENTICATED"),
    # Quality reports — referential integrity (Group N)
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/data/orphan-ius", "Data Rows With Missing IUS Reference", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/data/orphan-area", "Data Rows With Missing Area Reference", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/data/orphan-timeperiod", "Data Rows With Missing Time Period Reference", access="AUTHENTICATED"),
    *_both("dm_dw_reports_quality", "GET", "/dw/{dw_id}/reports/quality/data/orphan-source", "Data Rows With Missing Source Reference", access="AUTHENTICATED"),
    # Analytics reports (dm_dw_reports_analytics) — AUTHENTICATED
    *_both("dm_dw_reports_analytics", "GET", "/dw/{dw_id}/reports/analytics/coverage/indicator-by-area", "Indicator Coverage by Area", access="AUTHENTICATED"),
    *_both("dm_dw_reports_analytics", "GET", "/dw/{dw_id}/reports/analytics/coverage/indicator-by-timeperiod", "Indicator Coverage by Time Period", access="AUTHENTICATED"),
    *_both("dm_dw_reports_analytics", "GET", "/dw/{dw_id}/reports/analytics/coverage/area-completeness", "Area Data Completeness", access="AUTHENTICATED"),
    *_both("dm_dw_reports_analytics", "GET", "/dw/{dw_id}/reports/analytics/coverage/indicator-subgroup", "Indicator Subgroup Coverage", access="AUTHENTICATED"),
    *_both("dm_dw_reports_analytics", "GET", "/dw/{dw_id}/reports/analytics/volume/top-indicators", "Top Indicators by Data Volume", access="AUTHENTICATED"),
    *_both("dm_dw_reports_analytics", "GET", "/dw/{dw_id}/reports/analytics/volume/ius-density", "IUS Data Density", access="AUTHENTICATED"),
    *_both("dm_dw_reports_analytics", "GET", "/dw/{dw_id}/reports/analytics/volume/subgroup-distribution", "Subgroup Distribution in Data", access="AUTHENTICATED"),
    *_both("dm_dw_reports_analytics", "GET", "/dw/{dw_id}/reports/analytics/utilisation/source-usage", "Source Utilisation Summary", access="AUTHENTICATED"),
    *_both("dm_dw_reports_analytics", "GET", "/dw/{dw_id}/reports/analytics/utilisation/ic-coverage", "IC Node Coverage", access="AUTHENTICATED"),
    # Data reports (dm_dw_reports_data) — PUBLIC
    *_both("dm_dw_reports_data", "GET", "/dw/{dw_id}/reports/data/published/full", "Published Data — Full Export", access="PUBLIC"),
    # Operational Dashboard (dm_dw_reports_operational) — AUTHENTICATED
    *_both("dm_dw_reports_operational", "GET", "/dw/{dw_id}/reports/operational-dashboard", "Operational Dashboard", access="AUTHENTICATED"),
    # Operational Reports — Area Submission Status (dm_dw_operational_reports) — AUTHENTICATED
    *_both("dm_dw_operational_reports", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/area-submission-status", "Operational Reports — Area Submission Status", access="AUTHENTICATED"),
    # Operational Reports — Review Status (dm_dw_operational_reports) — AUTHENTICATED
    *_both("dm_dw_operational_reports", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/review-status", "Operational Reports — Review Status", access="AUTHENTICATED"),
    # Operational Reports — Data Reporter (dm_dw_operational_reports) — AUTHENTICATED
    *_both("dm_dw_operational_reports", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/data-reporter", "Operational Reports — Data Reporter", access="AUTHENTICATED"),
    # Operational Reports — Data Reviewer (dm_dw_operational_reports) — AUTHENTICATED
    *_both("dm_dw_operational_reports", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/data-reviewer", "Operational Reports — Data Reviewer", access="AUTHENTICATED"),
    # Operational Reports — Data Completeness (dm_dw_operational_reports) — AUTHENTICATED
    *_both("dm_dw_operational_reports", "GET", "/dw/{dw_id}/reports/operational-reports/{workflow_id}/data-completeness", "Operational Reports — Data Completeness", access="AUTHENTICATED"),
    # Retired wildcard paths (deactivated by deactivate_retired_resource_apis on seed):
    #   GET /dw/{dw_id}/reports/quality/{report_path:path}
    #   GET /dw/{dw_id}/reports/analytics/{report_path:path}
    #   GET /dw/{dw_id}/reports/data/{report_path:path}

    # -------------------------------------------------------------------------
    # Languages — reads PUBLIC both apps, writes DM PERMISSION
    # -------------------------------------------------------------------------
    _dm("dm_dw_languages", "GET", "/dw/{dw_id}/languages",            "List DW languages"),
    _dm("dm_dw_languages", "GET", "/dw/{dw_id}/languages/{lang_code}", "Get language by code"),
    _dm("dm_dw_languages", "POST",   "/dw/{dw_id}/languages",            "Add DW language",access="PERMISSION"),
    _dm("dm_dw_languages", "DELETE", "/dw/{dw_id}/languages/{lang_code}", "Delete DW language",access="PERMISSION"),
    _dm("dm_dw_languages", "PATCH", "/dw/{dw_id}/languages/{lang_code}", "Patch DW language", access="PERMISSION"),
    _dm("dm_dw_languages", "POST",   "/dw/{dw_id}/languages/export",     "Export language translations", access="AUTHENTICATED", action="READ"),
    _dm("dm_dw_languages", "POST",   "/dw/{dw_id}/languages/import",     "Import language translations", access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Workflow Management — DM only, admin operations
    # GET routes → AUTHENTICATED: consumed by data entry and reviewer screens
    # user-assignments GET → PERMISSION: exposes user-to-area mappings
    # -------------------------------------------------------------------------
    # Workflow CRUD
    _dm("dm_dw_workflow", "GET",    "/dw/{dw_id}/workflow",                "List workflows for a datawarehouse",         access="AUTHENTICATED"),
    _dm("dm_dw_workflow", "POST",   "/dw/{dw_id}/workflow",                "Create a workflow",                          access="PERMISSION"),
    _dm("dm_dw_workflow", "GET",    "/dw/{dw_id}/workflow/{workflow_id}",                    "Get a workflow",                             access="AUTHENTICATED"),
    _dm("dm_dw_workflow", "GET",    "/dw/{dw_id}/workflow/{workflow_id}/association-count",  "Workflow association count",                  access="AUTHENTICATED"),
    _dm("dm_dw_workflow", "PATCH",  "/dw/{dw_id}/workflow/{workflow_id}",                    "Update a workflow",                          access="PERMISSION"),
    _dm("dm_dw_workflow", "DELETE", "/dw/{dw_id}/workflow/{workflow_id}",                    "Delete a workflow",                          access="PERMISSION"),

    # Workflow Levels
    _dm("dm_dw_workflow", "GET",    "/dw/{dw_id}/workflow/{workflow_id}/level",                      "List workflow levels",          access="AUTHENTICATED"),
    _dm("dm_dw_workflow", "POST",   "/dw/{dw_id}/workflow/{workflow_id}/level",                      "Upsert workflow levels",        access="PERMISSION"),
    _dm("dm_dw_workflow", "DELETE", "/dw/{dw_id}/workflow/{workflow_id}/level/{level_id}",           "Delete a workflow level",       access="PERMISSION"),

    # Workflow Data Entry Config
    _dm("dm_dw_workflow", "GET",    "/dw/{dw_id}/workflow/{workflow_id}/dataentry",                  "Get workflow data-entry configuration",    access="PERMISSION"),
    _dm("dm_dw_workflow", "PUT",    "/dw/{dw_id}/workflow/{workflow_id}/dataentry",                  "Upsert workflow data-entry configuration", access="PERMISSION"),

    # Workflow User Assignments — PERMISSION: exposes user-to-area/classification mappings
    _dm("dm_dw_workflow", "GET",    "/dw/{dw_id}/workflow/{workflow_id}/user-assignments",           "List workflow user assignments",            access="PERMISSION"),
    _dm("dm_dw_workflow", "POST",   "/dw/{dw_id}/workflow/{workflow_id}/user-assignments",           "Upsert workflow user assignments",          access="PERMISSION"),
    _dm("dm_dw_workflow", "DELETE", "/dw/{dw_id}/workflow/{workflow_id}/user-assignments/{assignment_id}", "Delete a workflow user assignment",  access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Data Review — reviewer actions on datasets
    # GET routes AUTHENTICATED (reviewer must be logged in to see their queue)
    # POST (decision) PERMISSION — IAM role check enforced in service layer
    # Status value in body drives side-effects: APPROVED / RETURNED / REJECTED
    # -------------------------------------------------------------------------
    _dm("dm_dw_data_review", "GET",  "/dw/{dw_id}/dataset/review",              "List datasets pending reviewer action",              access="PERMISSION"),
    _dm("dm_dw_data_review", "GET",  "/dw/{dw_id}/dataset/{dataset_id}/review", "Get unified review grid for a dataset",              access="PERMISSION"),
    _dm("dm_dw_data_review", "POST", "/dw/{dw_id}/dataset/{dataset_id}/review", "Reviewer batch decision (approved[] / rejected[])", access="PERMISSION"),
    _dm("dm_dw_data_review", "GET",  "/dw/{dw_id}/dataset/review-rejection-reasons",  "List predefined rejection reasons (i18n)",           access="AUTHENTICATED"),

    # -------------------------------------------------------------------------
    # Compute Engine — DM only, PERMISSION for writes, AUTHENTICATED for reads
    # Updated to match actual router patterns (2026-04-07)
    # -------------------------------------------------------------------------
    
    # Formula Settings - /compute/formula/ routes
    _dm("dm_dw_indicator", "POST", "/dw/{dw_id}/compute/formula/total", "Save TOTAL formula", access="PERMISSION"),
    _dm("dm_dw_indicator", "POST", "/dw/{dw_id}/compute/formula/percent", "Save PERCENT formula", access="PERMISSION"),
    _dm("dm_dw_indicator", "POST", "/dw/{dw_id}/compute/formula/minus", "Save MINUS formula", access="PERMISSION"),
    _dm("dm_dw_indicator", "POST", "/dw/{dw_id}/compute/formula/time", "Save TIME formula", access="PERMISSION"),
    _dm("dm_dw_indicator", "POST", "/dw/{dw_id}/compute/formula/area", "Save AREA formula", access="PERMISSION"),
    _dm("dm_dw_indicator", "DELETE", "/dw/{dw_id}/compute/formula/{operation_type}/ius/{ius_gid}", "Delete formula", access="PERMISSION"),
    _dm("dm_dw_indicator", "POST", "/dw/{dw_id}/compute/formula/resolve-ius", "Resolve IUS GIDs to names", access="AUTHENTICATED", action="READ"),
    _dm("dm_dw_indicator", "GET", "/dw/{dw_id}/compute/formula/operation-types", "List available operation types", access="AUTHENTICATED"),
    _dm("dm_dw_indicator", "GET", "/dw/{dw_id}/compute/formula/ius/{ius_gid}/validate", "Validate IUS for formula creation", access="AUTHENTICATED"),
    _dm("dm_dw_indicator", "GET", "/dw/{dw_id}/compute/formula/ius/{ius_gid}", "Check existing formula for an IUS", access="AUTHENTICATED"),
    
    # Process Management - /compute/process/ routes
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/process", "List process definitions", access="AUTHENTICATED"),
    _dm("dm_dw_calculate_ius", "POST", "/dw/{dw_id}/compute/process", "Create process definition", access="PERMISSION"),
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/process/summary", "Get process summary statistics", access="AUTHENTICATED"),
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/process/eligible-target-ius", "List IUS GIDs with formulas for process type (execute picker)", access="AUTHENTICATED"),
    _dm("dm_dw_calculate_ius", "POST", "/dw/{dw_id}/compute/process/time/{process_time_id}/re-execute", "Re-execute process time", access="PERMISSION"),
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/process/{process_id}/status", "Get process execution status", access="AUTHENTICATED"),
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/process/{process_id}/estimate", "Estimate process execution", access="AUTHENTICATED"),
    _dm("dm_dw_calculate_ius", "POST", "/dw/{dw_id}/compute/process/{process_id}/execute", "Execute process", access="PERMISSION"),
    _dm("dm_dw_calculate_ius", "POST", "/dw/{dw_id}/compute/process/{process_id}/cancel", "Cancel process execution", access="PERMISSION", action="UPDATE"),
    _dm("dm_dw_calculate_ius", "PATCH", "/dw/{dw_id}/compute/process/{process_id}", "Update process definition", access="PERMISSION"),
    _dm("dm_dw_calculate_ius", "DELETE", "/dw/{dw_id}/compute/process/{process_id}", "Delete process definition", access="PERMISSION"),
    
    # Execution Logs - /compute/logs/ routes
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/logs/summary", "Get execution summary statistics", access="AUTHENTICATED"),
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/logs/search", "Search execution logs", access="AUTHENTICATED"),
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/logs/process/{process_id}", "Get process time periods", access="AUTHENTICATED"),
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/logs/time/{process_time_id}", "Get logs by process time", access="AUTHENTICATED"),
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/logs/{process_time_log_id}", "Get log details", access="AUTHENTICATED"),
    _dm("dm_dw_calculate_ius", "POST", "/dw/{dw_id}/compute/logs/{process_time_log_id}/sync-progress", "Sync log progress", access="PERMISSION", action="UPDATE"),
    _dm("dm_dw_calculate_ius", "DELETE", "/dw/{dw_id}/compute/logs/{process_time_log_id}", "Delete execution log", access="PERMISSION"),
    _dm("dm_dw_calculate_ius", "GET", "/dw/{dw_id}/compute/logs/{process_time_log_id}/export", "Export log details", access="AUTHENTICATED"),

    # -------------------------------------------------------------------------
    # System Logs — DM only, PERMISSION
    # -------------------------------------------------------------------------
    _dm("sys_error_logs",       "GET", "/logs/server-errors", "List server error logs",  access="PERMISSION"),
    _dm("dm_dw_transaction_logs","GET", "/logs/transactions",  "List transaction logs",   access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Help Service — /help/api/...
    # -------------------------------------------------------------------------
    *_both("sys_help", "GET",    "/help/api/keydata/{key_id}",  "Get help content by key (public read)", access="APP_CLIENT"),
    *_both("sys_help", "GET",    "/help/api/health",            "Help service health check",             access="PUBLIC"),
    _dm("sys_help_admin", "GET",    "/help/api/adaptations",    "List help adaptations",                 access="PERMISSION"),
    _dm("sys_help_admin", "GET",    "/help/api/keys/{adaptation_id}", "List help keys for adaptation",   access="PERMISSION"),
    _dm("sys_help_admin", "POST",   "/help/api/create",         "Create help key",                       access="PERMISSION"),
    _dm("sys_help_admin", "PUT",    "/help/api/update/{key_id}","Update help key",                       access="PERMISSION"),
    _dm("sys_help_admin", "DELETE", "/help/api/delete/{key_id}","Delete help key",                       access="PERMISSION"),

    # -------------------------------------------------------------------------
    # Publish Data — Mobile App
    # -------------------------------------------------------------------------
    _dm("mobile_app", "POST",   "/dw/{dw_id}/publish-mobile/packages",                     "Create mobile package", access="PERMISSION"),
    _dm("mobile_app", "GET",    "/dw/{dw_id}/publish-mobile/packages",                     "List mobile packages", access="PERMISSION"),
    _dm("mobile_app", "GET",    "/dw/{dw_id}/publish-mobile/packages/{package_id}/status", "Get package build status", access="PERMISSION"),
    _dm("mobile_app", "POST",   "/dw/{dw_id}/publish-mobile/packages/{package_id}/publish","Publish mobile package", access="PERMISSION"),
    _dm("mobile_app", "DELETE", "/dw/{dw_id}/publish-mobile/packages/{package_id}",        "Delete mobile package", access="PERMISSION"),
    _dm("mobile_app", "GET",    "/publish_for_mobile/publish/getUpdate",                    "Get latest published version (mobile client)", access="PUBLIC"),
    _dm("mobile_app", "GET",    "/publish_for_mobile/files/{dbid}/data/{version}.zip",      "Download mobile package ZIP", access="PUBLIC"),
]

_DEFAULT_RESOURCES = [
    # parent_resource_code=None means top-level (parent_id=0 in DB).
    # No hardcoded numeric IDs — parent resolution uses resource_code at seed time.

    # --- IAM ---
    {"app_key": _DM_APP_KEY,  "resource_code": "iam",                           "parent_resource_code": None,                  "description": "IAM management",                       "is_active": 1, "is_dw_spec": 0, "display_order":1, "is_role_assignable": 0},
    {"app_key": _DM_APP_KEY,  "resource_code": "iam_auth",                           "parent_resource_code": "iam",                  "description": "IAM auth management",                       "is_active": 1, "is_dw_spec": 0,"display_order":2, "is_role_assignable": 0},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_sso",                            "parent_resource_code": "iam",                  "description": "SSO provider management",                   "is_active": 1, "is_dw_spec": 0,"display_order":3, "is_role_assignable": 0},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_role_resource",             "parent_resource_code": "sys_admin",                 "description": "Role resource management",             "is_active": 1, "is_dw_spec": 0,"display_order":6},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_user_role",                 "parent_resource_code": "sys_admin",                 "description": "User role management",                 "is_active": 1, "is_dw_spec": 0,"display_order":7},
    # --- Core ---
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_dw_management",             "parent_resource_code": None,                  "description": "Datawarehouse management",             "is_active": 1, "is_dw_spec": 0,"display_order":3},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_datawarehouse",             "parent_resource_code": "sys_dw_management",   "description": "System datawarehouse management",      "is_active": 1, "is_dw_spec": 0,"display_order":4},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_admin",                     "parent_resource_code": None,                  "description": "System administrator management",      "is_active": 1, "is_dw_spec": 0,"display_order":5},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_language_management",       "parent_resource_code": None,                  "description": "Language and translation management",  "is_active": 1, "is_dw_spec": 0,"display_order":10},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_translations",              "parent_resource_code": "sys_language_management", "description": "System translations management",       "is_active": 1, "is_dw_spec": 0,"display_order":11},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_api_client",                "parent_resource_code": "sys_admin",           "description": "System API client management",         "is_active": 1, "is_dw_spec": 0,"display_order":9, "is_role_assignable": 0},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_email_templates",           "parent_resource_code": "sys_admin",           "description": "Email Templates",                      "is_active": 1, "is_dw_spec": 0,"display_order":8},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_email_logs",                "parent_resource_code": "sys_logs",           "description": "Email Logs",                           "is_active": 1, "is_dw_spec": 0,"display_order":37},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_error_logs",                "parent_resource_code": "sys_logs",           "description": "Server Error Logs",                    "is_active": 1, "is_dw_spec": 0,"display_order":38},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_help",                      "parent_resource_code": None,                  "description": "Help content (read)",                  "is_active": 1, "is_dw_spec": 0,"display_order":33, "is_role_assignable": 0},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_help_admin",                "parent_resource_code": "sys_admin",           "description": "Help content administration",          "is_active": 1, "is_dw_spec": 0,"display_order":34},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_settings",                  "parent_resource_code": "sys_admin",           "description": "System settings management",           "is_active": 1, "is_dw_spec": 0,"display_order":35},
    {"app_key": _DM_APP_KEY,  "resource_code": "sys_logs",                      "parent_resource_code": None,                  "description": "System logs management",               "is_active": 1, "is_dw_spec": 0,"display_order":36},
    # --- Data Warehouse ---
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_template_admin",          "parent_resource_code": None,                  "description": "Template management",                  "is_active": 1,"display_order":13},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_area",                    "parent_resource_code": "dm_dw_template_admin","description": "Geographic area management",           "is_active": 1,"display_order":18},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_indicator",               "parent_resource_code": "dm_dw_template_admin","description": "Indicator management",                 "is_active": 1,"display_order":14},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_unit",                    "parent_resource_code": "dm_dw_template_admin","description": "Unit management",                      "is_active": 1,"display_order":15},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_indicator_classification","parent_resource_code": "dm_dw_template_admin","description": "Indicator classification management",  "is_active": 1,"display_order":17},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_subgroup",                "parent_resource_code": "dm_dw_template_admin","description": "Subgroup management",                  "is_active": 1,"display_order":16},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_data_entry_admin",        "parent_resource_code": None,                  "description": "Data entry admin management",          "is_active": 1,"display_order":19},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_data_source",             "parent_resource_code": "dm_dw_data_entry_admin","description": "Data source management",             "is_active": 1,"display_order":23},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_data_entry",              "parent_resource_code": "dm_dw_data_entry_admin","description": "Data management",                    "is_active": 1,"display_order":20},

    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_reports",                 "parent_resource_code": None,                  "description": "DW reports",                           "is_active": 1,"display_order":30},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_reports_data",            "parent_resource_code": "dm_dw_reports",       "description": "Published data reports",               "is_active": 1,"display_order":1},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_reports_quality",         "parent_resource_code": "dm_dw_reports",       "description": "DW quality reports",                   "is_active": 1,"display_order":3},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_reports_analytics",     "parent_resource_code": "dm_dw_reports",       "description": "DW analytical reports",                "is_active": 1,"display_order":2},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_reports_operational",     "parent_resource_code": "dm_dw_reports",       "description": "Operational Dashboard",                "is_active": 1,"display_order":4},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_operational_reports",     "parent_resource_code": "dm_dw_reports",       "description": "Operational Reports",                  "is_active": 1,"display_order":5},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_timeperiod",              "parent_resource_code": "dm_dw_data_entry_admin","description": "Timeperiod management",              "is_active": 1,"display_order":22},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_calculate_ius",           "parent_resource_code": "dm_dw_data_entry_admin","description": "Calculate IUS management",           "is_active": 1,"display_order":24},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_administrator",           "parent_resource_code": None,                  "description": "Administrator management",             "is_active": 1,"display_order":25},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_workflow",                "parent_resource_code": "dm_dw_administrator", "description": "Workflow management",                  "is_active": 1,"display_order":26},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_data_review",             "parent_resource_code": "dm_dw_data_entry_admin", "description": "Data review workflow reviewer access",    "is_active": 1,"display_order":21},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_languages",               "parent_resource_code": "dm_dw_administrator", "description": "Languages management",                 "is_active": 1,"display_order":27},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_transaction_logs",        "parent_resource_code": "dm_dw_logs",          "description": "Transaction logs management",          "is_active": 1,"display_order":29},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_data_admin_maintenance", "parent_resource_code": "dm_dw_administrator",  "description": "DW data maintenance: default IUS subgroups, ISMRD, IUS data_exist", "is_active": 1,"display_order":28, "is_role_assignable": 1},
    {"app_key": _DM_APP_KEY,  "resource_code": "dm_dw_logs",                    "parent_resource_code": None,                  "description": "DW Logs",                             "is_active": 1,"display_order":31},
    # --- Publish Data ---
    {"app_key": _DM_APP_KEY,  "resource_code": "publish_data",                "parent_resource_code": None,                  "description": "Publish Data",                         "is_active": 1, "is_dw_spec": 1, "display_order":29, "is_role_assignable": 1},
    {"app_key": _DM_APP_KEY,  "resource_code": "mobile_app",                  "parent_resource_code": "publish_data",        "description": "Mobile App",                           "is_active": 1, "is_dw_spec": 1, "display_order":1},
    # --- VIZ ---
    {"app_key": _VIZ_APP_KEY, "resource_code": "viz_ai_insights",               "parent_resource_code": None,                  "description": "AI chart insights",                    "is_active": 1,"display_order":35},
    {"app_key": _VIZ_APP_KEY, "resource_code": "viz_gallery",                   "parent_resource_code": None,                  "description": "Gallery management",                   "is_active": 1, "is_dw_spec": 0,"display_order":33},
    {"app_key": _VIZ_APP_KEY, "resource_code": "viz_share_link",                "parent_resource_code": None,                  "description": "Share link management",                "is_active": 1, "is_dw_spec": 0,"display_order":34, "is_role_assignable": 0},
]

_DEFAULT_ROLES = [
    {
        "app_key": _DM_APP_KEY,
        "role_code": "DFA_DM_SUPERADMIN",
        "is_super_admin": 1,
        "is_system_role": 1,
        "created": datetime.now(timezone.utc).replace(tzinfo=None),
        "created_user_id": settings.SYSTEM_USER_ID,
        "modified": datetime.now(timezone.utc).replace(tzinfo=None),
        "modified_user_id": settings.SYSTEM_USER_ID,
    },
    {
        "app_key": _VIZ_APP_KEY,
        "role_code": "DFA_PUBLIC",
        "is_super_admin": 0,
        "is_system_role": 1,
        "created": datetime.now(timezone.utc).replace(tzinfo=None),
        "created_user_id": settings.SYSTEM_USER_ID,
        "modified": datetime.now(timezone.utc).replace(tzinfo=None),
        "modified_user_id": settings.SYSTEM_USER_ID,
    },
    {
        "app_key": _VIZ_APP_KEY,
        "role_code": "DFA_VIZ_SUPERADMIN",
        "is_super_admin": 1,
        "is_system_role": 1,
        "created": datetime.now(timezone.utc).replace(tzinfo=None),
        "created_user_id": settings.SYSTEM_USER_ID,
        "modified": datetime.now(timezone.utc).replace(tzinfo=None),
        "modified_user_id": settings.SYSTEM_USER_ID,
    },
]

# i18n display names and descriptions per (app_key, role_code) and locale
_DEFAULT_ROLE_I18N: dict[tuple[str, str], dict[str, dict[str, str]]] = {
    (_DM_APP_KEY, "DFA_DM_SUPERADMIN"): {
        "en": {"name": "DM Super Admin", "description": "DFA Data Manager super admin"},
        "ar": {"name": "مدير النظام الفائق لمدير البيانات", "description": "المدير الفائق لتطبيق مدير بيانات DFA"},
        "fr": {"name": "Super administrateur DM", "description": "Super administrateur DFA Data Manager"},
        "es": {"name": "Superadministrador DM", "description": "Superadministrador de DFA Data Manager"},
        "tto": {"name": "Pule Lahi DM", "description": "Pule lahi 'o e DFA Data Manager"},
    },
    (_VIZ_APP_KEY, "DFA_PUBLIC"): {
        "en": {"name": "VIZ Public", "description": "Default public role for DFA Visualizer"},
        "ar": {"name": "VIZ عام", "description": "الدور العام الافتراضي لـ DFA Visualizer"},
        "fr": {"name": "VIZ Public", "description": "Rôle public par défaut pour DFA Visualizer"},
        "es": {"name": "VIZ Público", "description": "Rol público predeterminado para DFA Visualizer"},
        "tto": {"name": "VIZ Faka'ava", "description": "Kau ngāue faka'ava 'o e DFA Visualizer"},
    },
    (_VIZ_APP_KEY, "DFA_VIZ_SUPERADMIN"): {
        "en": {"name": "VIZ Super Admin", "description": "DFA Visualizer super admin"},
        "ar": {"name": "مدير VIZ الفائق", "description": "المدير الفائق لـ DFA Visualizer"},
        "fr": {"name": "Super administrateur VIZ", "description": "Super administrateur DFA Visualizer"},
        "es": {"name": "Superadministrador VIZ", "description": "Superadministrador de DFA Visualizer"},
        "tto": {"name": "Pule Lahi VIZ", "description": "Pule lahi 'o e DFA Visualizer"},
    },
}

validate_role_i18n_data(_DEFAULT_ROLE_I18N, label="seed_iam._DEFAULT_ROLE_I18N")


def _build_default_users() -> list[dict]:
    """Build the default IAM user list at runtime using config values."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return [
        {
            "id": settings.SYSTEM_USER_ID,
            "first_name": settings.SYSTEM_USER_FIRST_NAME,
            "last_name": settings.SYSTEM_USER_LAST_NAME,
            "username": settings.SYSTEM_USER_USERNAME,
            "email": settings.SYSTEM_USER_EMAIL,
            "password": hash_password(settings.SYSTEM_USER_PASSWORD),
            "status": 1,
            "is_system": 1,
            "created": now,
            "created_user_id": settings.SYSTEM_USER_ID,
            "modified": now,
            "modified_user_id": settings.SYSTEM_USER_ID,
            "last_loggedin_on": None,
        },
        # {
        #     "id": 2,
        #     "first_name": settings.VIZ_USER_FIRST_NAME,
        #     "last_name": settings.VIZ_USER_LAST_NAME,
        #     "username": settings.VIZ_USER_USERNAME,
        #     "email": settings.VIZ_USER_EMAIL,
        #     "password": hash_password(settings.VIZ_USER_PASSWORD),
        #     "status": 1,
        #     "created": now,
        #     "created_user_id": 1,
        #     "modified": now,
        #     "modified_user_id": 1,
        #     "last_loggedin_on": None,
        # },
    ]


# ---------------------------------------------------------------------------
# i18n seed data
# ---------------------------------------------------------------------------

# resource_code -> locale -> translated name
_RESOURCE_I18N: dict[str, dict[str, str]] = {
    "iam": {
        "en": "IAM", "ar": "إدارة الهوية والوصول", "zh": "身份与访问管理",
        "fr": "IAM", "ru": "Управление идентификацией", "es": "IAM",
    },
    "iam_auth": {
        "en": "IAM Auth", "ar": "إدارة الهوية والوصول", "zh": "身份与访问管理",
        "fr": "IAM Auth", "ru": "IAM Auth", "es": "IAM Auth",
    },
    "sys_role_resource": {
        "en": "Roles", "ar": "إدارة الأدوار", "zh": "角色管理",
        "fr": "Gestion des rôles", "ru": "Управление ролями", "es": "Gestión de roles",
    },
    "sys_user_role": {
        "en": "Users    ", "ar": "المستخدمين", "zh": "用户",
        "fr": "Utilisateurs", "ru": "Пользователи", "es": "Usuarios",
    },
    "sys_dw_management": {
        "en": "Datawarehouse", "ar": "إدارة مستودع البيانات", "zh": "数据仓库管理",
        "fr": "Gestion DW", "ru": "Управление хранилищем", "es": "Gestión DW",
    },
    "sys_datawarehouse": {
        "en": "Datawarehouse", "ar": "مستودع البيانات", "zh": "数据仓库",
        "fr": "Entrepôt de données", "ru": "Хранилище данных", "es": "Almacén de datos",
    },
    "sys_admin": {
        "en": "Administration", "ar": "إدارة", "zh": "管理",
        "fr": "Administration", "ru": "Администрaция", "es": "Administración",
    },
    "sys_language_management": {
        "en": "Translations", "ar": "ترجمات", "zh": "翻译", 
        "fr": "Traductions", "ru": "Переводы", "es": "Traducciones",
    },
    "sys_translations": {
        "en": "Translations", "ar": "ترجمات", "zh": "翻译",
        "fr": "Traductions", "ru": "Переводы", "es": "Traducciones",
    },
    "sys_logs": {
        "en": "Logs", "ar": "سجلات", "zh": "日志",
        "fr": "Journaux", "ru": "Журналы", "es": "Registros",
    },
    "dm_dw_template_admin": {
        "en": "Template", "ar": "قوالب", "zh": "模板",
        "fr": "Modèle", "ru": "Шаблон", "es": "Plantilla",
    },
    "dm_dw_area": {
        "en": "Areas", "ar": "المنطقة", "zh": "区域",
        "fr": "Zone", "ru": "Область", "es": "Área",
    },
    "dm_dw_indicator": {
        "en": "Indicators", "ar": "المؤشر", "zh": "指标",
        "fr": "Indicateur", "ru": "Показатель", "es": "Indicador",
    },
    "dm_dw_unit": {
        "en": "Units", "ar": "الوحدة", "zh": "单位",
        "fr": "Unité", "ru": "Единица", "es": "Unidad",
    },
    "dm_dw_indicator_classification": {
        "en": "Classifications", "ar": "تصنيف المؤشر", "zh": "指标分类",
        "fr": "Classification des indicateurs", "ru": "Классификация показателей", "es": "Clasificación de indicadores",
    },
    "dm_dw_subgroup": {
        "en": "Subgroups", "ar": "المجموعة الفرعية", "zh": "子组",
        "fr": "Sous-groupe", "ru": "Подгруппа", "es": "Subgrupo",
    },
    "dm_dw_data_entry_admin": {
        "en": "Data Management", "ar": "إدارة البيانات", "zh": "数据管理",
        "fr": "Gestion des données", "ru": "Управление данными", "es": "Gestión de datos",
    },
    "dm_dw_data_source": {
        "en": "Sources", "ar": "المصدر", "zh": "来源",
        "fr": "Source", "ru": "Источник", "es": "Fuente",
    },
    "dm_dw_data_entry": {
        "en": "Data Entry", "ar": "إدخال البيانات", "zh": "数据录入",
        "fr": "Saisie de données", "ru": "Ввод данных", "es": "Entrada de datos",
    },
    "dm_dw_timeperiod": {
        "en": "Time Period", "ar": "الفترة الزمنية", "zh": "时间段",
        "fr": "Période", "ru": "Период", "es": "Período",
    },
    "dm_dw_administrator": {
        "en": "Administration", "ar": "إدارة", "zh": "管理",
        "fr": "Administration", "ru": "Администрaция", "es": "Administración",
    },
    "dm_dw_workflow": {
        "en": "Workflow", "ar": "سير العمل", "zh": "工作流程",
        "fr": "Flux de travail", "ru": "Рабочий процесс", "es": "Flujo de trabajo",
    },
    "dm_dw_data_review": {
        "en": "Data Review", "ar": "مراجعة البيانات", "zh": "数据审核",
        "fr": "Révision des données", "ru": "Проверка данных", "es": "Revisión de datos",
    },
    "dm_dw_languages": {
        "en": "Languages", "ar": "اللغات", "zh": "语言",
        "fr": "Langues", "ru": "Языки", "es": "Idiomas",
    },
    "dm_dw_transaction_logs": {
        "en": "Transaction Logs", "ar": "سجلات المعاملات", "zh": "事务日志",
        "fr": "Journaux de transactions", "ru": "Журналы транзакций", "es": "Registros de transacciones",
    },
    "dm_dw_data_admin_maintenance": {
        "en": "Tools", "ar": "أدوات", "zh": "工具",
        "fr": "Outils", "ru": "Инструменты", "es": "Herramientas",
    },
    "dm_dw_reports": {
        "en": "Reports", "ar": "التقارير", "zh": "报告",
        "fr": "Rapports", "ru": "Отчеты", "es": "Reportes",
    },
    "dm_dw_reports_data": {
        "en": "Data Report", "ar": "تقرير البيانات", "zh": "数据报告",
        "fr": "Rapport de données", "ru": "Отчет по данным", "es": "Informe de datos",
    },
    "dm_dw_reports_quality": {
        "en": "Quality Report", "ar": "تقرير الجودة", "zh": "质量报告",
        "fr": "Rapport de qualité", "ru": "Отчет о качестве", "es": "Informe de calidad",
    },
    "dm_dw_reports_analytics": {
        "en": "Analytical Report", "ar": "تقرير تحليلي", "zh": "分析报告",
        "fr": "Rapport analytique", "ru": "Аналитический отчет", "es": "Informe analítico",
    },
    "dm_dw_reports_operational": {
        "en": "Operational Dashboard", "ar": "لوحة التحكم العملية", "zh": "运营仪表盘",
        "fr": "Tableau de bord opérationnel", "ru": "Оперативный дашборд", "es": "Tablero operativo",
    },
    "dm_dw_operational_reports": {
        "en": "Operational Reports", "ar": "التقارير التشغيلية", "zh": "运营报告",
        "fr": "Rapports opérationnels", "ru": "Операционные отчёты", "es": "Informes operativos",
    },
    "sys_api_client": {
        "en": "System API Clients", "ar": "عملاء واجهة برمجة التطبيقات", "zh": "系统API客户端",
        "fr": "Clients API système", "ru": "Системные API-клиенты", "es": "Clientes API del sistema",
    },
    "sys_email_templates": {
        "en": "Email Templates", "ar": "قوالب البريد", "zh": "邮件模板",
        "fr": "Modèles d’e-mail", "ru": "Шаблоны писем", "es": "Plantillas de correo",
    },
    "sys_email_logs": {
        "en": "Email Logs", "ar": "سجلات البريد", "zh": "邮件日志",
        "fr": "Journaux de e-mail", "ru": "Журналы писем", "es": "Registros de correo",
    },
    "sys_error_logs": {
        "en": "Server Error Logs", "ar": "سجلات أخطاء الخادم", "zh": "服务器错误日志",
        "fr": "Journaux d'erreurs serveur", "ru": "Журналы ошибок сервера", "es": "Registros de errores del servidor",
    },
    "sys_help_admin": {
        "en": "Help Admin", "ar": "إدارة المساعدة", "zh": "帮助管理",
        "fr": "Administration de l'aide", "ru": "Администрирование справки", "es": "Administración de ayuda",
    },
    "sys_settings": {
        "en": "Settings", "ar": "الإعدادات", "zh": "设置",
        "fr": "Paramètres", "ru": "Настройки", "es": "Configuración",
    },
    "dm_dw_logs": {
        "en": "Logs", "ar": "سجلات", "zh": "日志",
        "fr": "Journaux", "ru": "Журналы", "es": "Registros",
    },
    "publish_data": {
        "en": "Publish Data", "ar": "نشر البيانات", "zh": "发布数据",
        "fr": "Publier les données", "ru": "Публикация данных", "es": "Publicar datos",
    },
    "mobile_app": {
        "en": "Mobile App", "ar": "تطبيق الجوال", "zh": "移动应用",
        "fr": "Application mobile", "ru": "Мобильное приложение", "es": "Aplicación móvil",
    },
    "viz_ai_insights": {
        "en": "AI Insights", "ar": "رؤى الذكاء الاصطناعي", "zh": "AI 洞察",
        "fr": "Informations IA", "ru": "ИИ-аналитика", "es": "Información con IA",
    },
    "viz_gallery": {
        "en": "Gallery", "ar": "المعرض", "zh": "图库",
        "fr": "Galerie", "ru": "Галерея", "es": "Galería",
    },
    "dm_dw_calculate_ius": {
        "en": "Calculate IUS", "ar": "حساب الأيوس", "zh": "计算 IUS",
        "fr": "Calculer les IUS", "ru": "Вычислить IUS", "es": "Calcular IUS",
    },

}

_LOCALES = ("en", "ar", "zh", "fr", "ru", "es")

# ---------------------------------------------------------------------------
# Seed functions
# ---------------------------------------------------------------------------

def seed_resource_i18n(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed iam_resource_i18n with translated names for all locales. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0

    resource_map: dict[str, int] = {
        r.resource_code: r.id
        for r in db.query(IamResource.resource_code, IamResource.id).all()
    }

    for resource_code, translations in _RESOURCE_I18N.items():
        master_id = resource_map.get(resource_code)
        if master_id is None:
            print(f"  Skipping resource_i18n for resource_code={resource_code} — resource row not found")
            skipped += 1
            continue

        for locale, name in translations.items():
            existing = (
                db.query(IamResourceI18n)
                .filter_by(master_id=master_id, locale=locale)
                .first()
            )
            if existing:
                if force:
                    if dry_run:
                        print(f"  [dry-run] Would overwrite resource_i18n resource_code={resource_code} locale={locale}")
                    else:
                        existing.name = name
                    inserted += 1
                else:
                    skipped += 1
            else:
                if dry_run:
                    print(f"  [dry-run] Would insert resource_i18n resource_code={resource_code} locale={locale} name='{name}'")
                else:
                    db.add(IamResourceI18n(master_id=master_id, locale=locale, name=name))
                inserted += 1

    return inserted, skipped


def seed_resource_api_i18n(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed iam_resource_api_i18n with translated descriptions for all locales. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0

    api_map: dict[tuple[str, str, str], int] = {
        (r.app_key, r.http_method, r.backend_endpoint): r.id
        for r in db.query(
            IamResourceApi.app_key,
            IamResourceApi.http_method,
            IamResourceApi.backend_endpoint,
            IamResourceApi.id,
        ).all()
    }

    for data in _DEFAULT_RESOURCE_APIS:
        key = (data["app_key"], data["http_method"], data["backend_endpoint"])
        master_id = api_map.get(key)
        if master_id is None:
            skipped += 1
            continue

        en_desc = data.get("_description", "")

        translations = {
            "en": en_desc,
            "ar": en_desc,
            "zh": en_desc,
            "fr": en_desc,
            "ru": en_desc,
            "es": en_desc,
        }

        for locale, description in translations.items():
            existing = (
                db.query(IamResourceApiI18n)
                .filter_by(master_id=master_id, locale=locale)
                .first()
            )
            if existing:
                if force:
                    if dry_run:
                        print(
                            f"  [dry-run] Would overwrite resource_api_i18n "
                            f"{data['http_method']} {data['backend_endpoint']} locale={locale}"
                        )
                    else:
                        existing.description = description
                    inserted += 1
                else:
                    skipped += 1
            else:
                if dry_run:
                    print(
                        f"  [dry-run] Would insert resource_api_i18n "
                        f"{data['http_method']} {data['backend_endpoint']} locale={locale}"
                    )
                else:
                    db.add(IamResourceApiI18n(master_id=master_id, locale=locale, description=description))
                inserted += 1

    return inserted, skipped


def seed_resource_apis(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed iam_resource_api. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    resource_map: dict[str, int] = {
        r.resource_code: r.id
        for r in db.query(IamResource.resource_code, IamResource.id).all()
    }

    for data in _DEFAULT_RESOURCE_APIS:
        resource_id = resource_map.get(data["resource_code"])
        if resource_id is None:
            print(
                f"  Skipping API '{data['http_method']} {data['backend_endpoint']}' "
                f"(app_key={data['app_key']}) — resource_code '{data['resource_code']}' not found"
            )
            skipped += 1
            continue

        existing = (
            db.query(IamResourceApi)
            .filter(
                IamResourceApi.app_key == data["app_key"],
                IamResourceApi.http_method == data["http_method"],
                IamResourceApi.backend_endpoint == data["backend_endpoint"],
            )
            .first()
        )
        row_data = {k: v for k, v in data.items() if k not in ("resource_code", "_description")}
        row_data.update({
            "resource_id": resource_id,
            "created": now,
            "created_user_id": settings.SYSTEM_USER_ID,
            "modified": now,
            "modified_user_id": settings.SYSTEM_USER_ID,
        })

        if existing:
            if force:
                if dry_run:
                    print(
                        f"  [dry-run] Would overwrite resource_api "
                        f"'{data['http_method']} {data['backend_endpoint']}' (app_key={data['app_key']})"
                    )
                else:
                    for k, v in row_data.items():
                        setattr(existing, k, v)
                inserted += 1
            else:
                print(
                    f"  Skipping resource_api '{data['http_method']} {data['backend_endpoint']}' "
                    f"(app_key={data['app_key']}) — already exists"
                )
                skipped += 1
        else:
            if dry_run:
                print(
                    f"  [dry-run] Would insert resource_api "
                    f"'{data['http_method']} {data['backend_endpoint']}' (app_key={data['app_key']})"
                )
            else:
                db.add(IamResourceApi(**row_data))
            inserted += 1

    return inserted, skipped


def seed_resources(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed iam_resource. Returns (inserted_or_updated, skipped).

    Parent resolution uses resource_code (not hardcoded numeric IDs).
    Roots (parent_resource_code=None) are processed before children so that
    the resource_code → DB id map is populated before children need it.
    """
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # resource_code → actual DB primary key.
    # Pre-populate from rows that already exist in the DB.
    code_to_db: dict[str, int] = {
        r.resource_code: r.id
        for r in db.query(IamResource.resource_code, IamResource.id).all()
    }

    # Process roots (no parent) before children so the map is ready.
    ordered = (
        [d for d in _DEFAULT_RESOURCES if d["parent_resource_code"] is None]
        + [d for d in _DEFAULT_RESOURCES if d["parent_resource_code"] is not None]
    )

    for data in ordered:
        rc = data["resource_code"]
        existing_id = code_to_db.get(rc)

        if existing_id is not None:
            if force:
                if dry_run:
                    print(f"  [dry-run] Would overwrite resource '{rc}' (app_key={data['app_key']}, id={existing_id})")
                else:
                    existing = db.query(IamResource).filter(IamResource.id == existing_id).first()
                    if existing:
                        parent_rc = data["parent_resource_code"]
                        existing.parent_id = code_to_db.get(parent_rc, 0) if parent_rc else 0
                        for k, v in data.items():
                            if k not in ("parent_resource_code",):
                                setattr(existing, k, v)
                        existing.modified = now
                        existing.modified_user_id = settings.SYSTEM_USER_ID
                inserted += 1
            else:
                print(f"  Skipping resource '{rc}' (app_key={data['app_key']}) — already exists")
                skipped += 1
        else:
            # Resolve parent_resource_code → DB parent_id (0 = top-level)
            parent_rc = data["parent_resource_code"]
            db_parent_id = code_to_db.get(parent_rc, 0) if parent_rc else 0

            if dry_run:
                print(f"  [dry-run] Would insert resource '{rc}' (app_key={data['app_key']}, parent='{parent_rc}')")
            else:
                insert_data = {k: v for k, v in data.items() if k != "parent_resource_code"}
                insert_data["parent_id"] = db_parent_id
                insert_data.update({
                    "created": now,
                    "created_user_id": settings.SYSTEM_USER_ID,
                    "modified": now,
                    "modified_user_id": settings.SYSTEM_USER_ID,
                })
                new_obj = IamResource(**insert_data)
                db.add(new_obj)
                db.flush()
                code_to_db[rc] = new_obj.id
            inserted += 1

    return inserted, skipped


def seed_roles(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed iam_role. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0
    for data in _DEFAULT_ROLES:
        existing = (
            db.query(IamRole)
            .filter(IamRole.app_key == data["app_key"], IamRole.role_code == data["role_code"])
            .first()
        )
        if existing:
            if force:
                if dry_run:
                    print(
                        f"  [dry-run] Would overwrite role '{data['role_code']}' "
                        f"(app_key={data['app_key']}, id={existing.id})"
                    )
                else:
                    for k, v in data.items():
                        if k != "id":
                            setattr(existing, k, v)
                inserted += 1
            else:
                print(f"  Skipping role '{data['role_code']}' (app_key={data['app_key']}) — already exists")
                skipped += 1
        else:
            if dry_run:
                print(f"  [dry-run] Would insert role '{data['role_code']}' (app_key={data['app_key']})")
            else:
                db.add(IamRole(**data))
            inserted += 1
    return inserted, skipped


def seed_user_roles(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed iam_user_role. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Resolve user/role IDs from the DB rather than hardcoding numeric PKs.
    system_user = db.query(IamUser).filter(IamUser.username == settings.SYSTEM_USER_USERNAME).first()
    dm_superadmin_role = (
        db.query(IamRole)
        .filter(IamRole.app_key == _DM_APP_KEY, IamRole.role_code == "DFA_DM_SUPERADMIN")
        .first()
    )
    viz_superadmin_role = (
        db.query(IamRole)
        .filter(IamRole.app_key == _VIZ_APP_KEY, IamRole.role_code == "DFA_VIZ_SUPERADMIN")
        .first()
    )

    if system_user is None or dm_superadmin_role is None:
        print(
            "  WARNING: system user or DFA_DM_SUPERADMIN role not found — "
            "skipping user role assignments"
        )
        return 0, 0

    default_assignments = [
        {
            "user_id": system_user.id,
            "role_id": dm_superadmin_role.id,
            "app_key": _DM_APP_KEY,
            "dw_id": None,
            "created": now,
            "created_user_id": system_user.id,
        },
    ]
    if viz_superadmin_role is not None:
        default_assignments.append({
            "user_id": system_user.id,
            "role_id": viz_superadmin_role.id,
            "app_key": _VIZ_APP_KEY,
            "dw_id": None,
            "created": now,
            "created_user_id": system_user.id,
        })
    for data in default_assignments:
        existing = (
            db.query(IamUserRole)
            .filter(
                IamUserRole.user_id == data["user_id"],
                IamUserRole.role_id == data["role_id"],
                IamUserRole.app_key == data["app_key"],
                IamUserRole.dw_id == data["dw_id"],
            )
            .first()
        )
        if existing:
            if force:
                if dry_run:
                    print(
                        f"  [dry-run] Would overwrite user_role assignment "
                        f"(user_id={data['user_id']}, role_id={data['role_id']}, "
                        f"app_key={data['app_key']}, dw_id={data['dw_id']})"
                    )
                else:
                    for k, v in data.items():
                        setattr(existing, k, v)
                inserted += 1
            else:
                print(
                    f"  Skipping user_role (user_id={data['user_id']}, role_id={data['role_id']}, "
                    f"app_key={data['app_key']}, dw_id={data['dw_id']}) — already exists"
                )
                skipped += 1
        else:
            if dry_run:
                print(
                    f"  [dry-run] Would insert user_role assignment "
                    f"(user_id={data['user_id']}, role_id={data['role_id']}, "
                    f"app_key={data['app_key']}, dw_id={data['dw_id']})"
                )
            else:
                db.add(IamUserRole(**data))
            inserted += 1
    return inserted, skipped


def seed_role_i18n(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed iam_role_i18n with translated display names and descriptions. Returns (inserted_or_updated, skipped)."""
    return seed_role_i18n_entries(
        db,
        _DEFAULT_ROLE_I18N,
        force=force,
        dry_run=dry_run,
    )


def seed_users(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed iam_user. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0
    for data in _build_default_users():
        existing = db.query(IamUser).filter(IamUser.username == data["username"]).first()
        if existing:
            if force:
                if dry_run:
                    print(f"  [dry-run] Would overwrite user '{data['username']}' (id={existing.id})")
                else:
                    for k, v in data.items():
                        if k != "id":
                            setattr(existing, k, v)
                inserted += 1
            else:
                print(f"  Skipping user '{data['username']}' — already exists")
                skipped += 1
        else:
            if dry_run:
                print(f"  [dry-run] Would insert user '{data['username']}'")
            else:
                insert_data = {k: v for k, v in data.items() if k != "id"}
                db.add(IamUser(**insert_data))
            inserted += 1
    return inserted, skipped


def seed(force: bool = False, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        print("=== Seeding IAM roles ===")
        r_inserted, r_skipped = seed_roles(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding IAM role i18n ===")
        ri_inserted, ri_skipped = seed_role_i18n(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding IAM resources ===")
        res_inserted, res_skipped = seed_resources(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding IAM resource i18n ===")
        resi18n_inserted, resi18n_skipped = seed_resource_i18n(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding IAM resource APIs ===")
        rapi_inserted, rapi_skipped = seed_resource_apis(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding IAM resource API i18n ===")
        rapii18n_inserted, rapii18n_skipped = seed_resource_api_i18n(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding IAM users ===")
        u_inserted, u_skipped = seed_users(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding IAM user role assignments ===")
        ur_inserted, ur_skipped = seed_user_roles(db, force=force, dry_run=dry_run)

        if not dry_run:
            db.commit()
            print(
                f"\nDone. Roles -> inserted/updated: {r_inserted}, skipped: {r_skipped}. "
                f"Role i18n -> inserted/updated: {ri_inserted}, skipped: {ri_skipped}. "
                f"Resources -> inserted/updated: {res_inserted}, skipped: {res_skipped}. "
                f"Resource i18n -> inserted/updated: {resi18n_inserted}, skipped: {resi18n_skipped}. "
                f"Resource APIs -> inserted/updated: {rapi_inserted}, skipped: {rapi_skipped}. "
                f"Resource API i18n -> inserted/updated: {rapii18n_inserted}, skipped: {rapii18n_skipped}. "
                f"Users -> inserted/updated: {u_inserted}, skipped: {u_skipped}. "
                f"User role assignments -> inserted/updated: {ur_inserted}, skipped: {ur_skipped}."
            )
        else:
            print("\n[dry-run] No changes written.")
    except Exception as exc:
        db.rollback()
        print(f"Error during IAM seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed IAM roles and default super-admin user.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing rows instead of skipping them.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be seeded without writing to the DB.",
    )
    args = parser.parse_args()
    seed(force=args.force, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
