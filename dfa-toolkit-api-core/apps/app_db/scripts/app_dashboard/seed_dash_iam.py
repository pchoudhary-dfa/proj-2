"""
Seed IAM resources and resource APIs for DFA_DASH (app_dashboard).

Resource tree (2-level — matches role-management UI contract):

  sys_dashboard          (root group header, is_dw_spec=0, is_dash_spec=0)
    dash_core            leaf — list/get/create* dashboard, viewer-bundle (is_dash_spec=0)
                         (* POST /dash PERMISSION, seeded to NO role — super-admin only)
    dash_settings        leaf — PATCH dashboard settings (is_dash_spec=1; ADMIN+EDITOR)
    dash_admin_ops       leaf — delete, clone, publish (is_dash_spec=1)
    dash_vis             leaf — visualization CRUD (is_dash_spec=1)
    dash_section         leaf — section CRUD (is_dash_spec=1)
    dash_template        leaf — canvas layout GET/PUT (is_dash_spec=1)
    dash_user_areas      leaf — per-dashboard user management (is_dash_spec=1)
    dash_ai_analysis     leaf — AI chart analysis (is_dash_spec=1)
    dash_media_scoped    leaf — dashboard-scoped media writes (is_dash_spec=1)

  sys_header_footer      (root group header, is_dw_spec=0, is_dash_spec=0)
    dash_theme           leaf — themes CRUD (is_dash_spec=0)

  sys_media_files        (root group header, is_dw_spec=0, is_dash_spec=0)
    dash_media           leaf — media upload / list / delete (is_dash_spec=0)

  dash_embed             (root group header, is_dw_spec=0, is_dash_spec=0)
    dash_embed_ops       leaf — embed VO CRUD (is_dash_spec=0)

Rules:
  - Group-header resources have NO iam_resource_api rows (UI renders them as section labels).
  - All resources are is_dw_spec=0 (Application Module tab in role-management UI).
  - is_dash_spec=0 → returned at login / GET /auth/me/permissions with no ids.
  - is_dash_spec=1 → returned only via GET /auth/me/permissions?dashboard_ids=.
  - DW read endpoints (/dw/{dw_id}/...) are APP_CLIENT so no PERMISSION role-check needed.
  - POST /dash (create dashboard) lives on dash_core (is_dash_spec=0) as PERMISSION
    but is deliberately seeded to NO role; only is_super_admin users bypass the check.

Requires seed_iam.py (app_db) to have run first so the system_application row for
DFA_DASH already exists.

Run from project root:
    python apps/app_db/scripts/app_dashboard/seed_dash_iam.py
    python apps/app_db/scripts/app_dashboard/seed_dash_iam.py --force
    python apps/app_db/scripts/app_dashboard/seed_dash_iam.py --dry-run
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.core import IamResource, IamResourceApi, IamResourceApiI18n, IamResourceI18n  # noqa: E402
from apps.shared.config.config import settings  # noqa: E402

_DASH_APP_KEY = settings.DFA_DASH_APP_KEY

_METHOD_TO_ACTION: dict[str, str] = {
    "GET": "READ", "POST": "CREATE", "PUT": "UPDATE", "PATCH": "UPDATE", "DELETE": "DELETE",
}


def _dash(resource_code: str, method: str, path: str, description: str,
          access: str = "APP_CLIENT", action: str | None = None) -> dict:
    return {
        "app_key": _DASH_APP_KEY,
        "resource_code": resource_code,
        "http_method": method,
        "backend_endpoint": path,
        "action": action or _METHOD_TO_ACTION.get(method.upper(), "CREATE"),
        "access_level": access,
        "is_active": 1,
        "_description": description,
    }


# ---------------------------------------------------------------------------
# Resources — 2-level tree: root group headers + leaf resources
# All is_dw_spec=0 → "Application Module" tab in role-management UI
# is_dash_spec=1 → returned only via GET /auth/me/permissions?dashboard_ids=
# is_dash_spec=0 → returned at login / no-id permissions (app-level)
# ---------------------------------------------------------------------------

_DEFAULT_RESOURCES: list[dict] = [
    # ── Dashboard group ─────────────────────────────────────────────────────
    {"app_key": _DASH_APP_KEY, "resource_code": "sys_dashboard",    "parent_resource_code": None,            "is_dw_spec": 0, "is_dash_spec": 0, "description": "Dashboard",                         "is_active": 1, "display_order": 1},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_core",        "parent_resource_code": "sys_dashboard", "is_dw_spec": 0, "is_dash_spec": 0, "description": "Dashboard core (list/get/create*/viewer-bundle; create is super-admin only)", "is_active": 1, "display_order": 1},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_settings",    "parent_resource_code": "sys_dashboard", "is_dw_spec": 0, "is_dash_spec": 1, "description": "Dashboard settings (PATCH)",         "is_active": 1, "display_order": 2},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_admin_ops",   "parent_resource_code": "sys_dashboard", "is_dw_spec": 0, "is_dash_spec": 1, "description": "Dashboard admin operations (delete, clone, publish)", "is_active": 1, "display_order": 3},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_vis",         "parent_resource_code": "sys_dashboard", "is_dw_spec": 0, "is_dash_spec": 1, "description": "Dashboard visualizations",           "is_active": 1, "display_order": 4},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_section",     "parent_resource_code": "sys_dashboard", "is_dw_spec": 0, "is_dash_spec": 1, "description": "Dashboard sections",                "is_active": 1, "display_order": 5},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_template",    "parent_resource_code": "sys_dashboard", "is_dw_spec": 0, "is_dash_spec": 1, "description": "Dashboard canvas layout (gridster)", "is_active": 1, "display_order": 6},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_user_areas",  "parent_resource_code": "sys_dashboard", "is_dw_spec": 0, "is_dash_spec": 1, "description": "Per-dashboard user management",      "is_active": 1, "display_order": 7},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_ai_analysis", "parent_resource_code": "sys_dashboard", "is_dw_spec": 0, "is_dash_spec": 1, "description": "AI chart analysis",                 "is_active": 1, "display_order": 8},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_media_scoped","parent_resource_code": "sys_dashboard", "is_dw_spec": 0, "is_dash_spec": 1, "description": "Dashboard-scoped media writes",       "is_active": 1, "display_order": 9},

    # ── Themes group ────────────────────────────────────────────────────────
    {"app_key": _DASH_APP_KEY, "resource_code": "sys_header_footer", "parent_resource_code": None,               "is_dw_spec": 0, "is_dash_spec": 0, "description": "Themes",         "is_active": 1, "display_order": 2},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_theme",        "parent_resource_code": "sys_header_footer","is_dw_spec": 0, "is_dash_spec": 0, "description": "Themes CRUD",    "is_active": 1, "display_order": 1},

    # ── Media Files group ───────────────────────────────────────────────────
    {"app_key": _DASH_APP_KEY, "resource_code": "sys_media_files",   "parent_resource_code": None,               "is_dw_spec": 0, "is_dash_spec": 0, "description": "Media Files",    "is_active": 1, "display_order": 3},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_media",        "parent_resource_code": "sys_media_files",  "is_dw_spec": 0, "is_dash_spec": 0, "description": "Media Files CRUD","is_active": 1, "display_order": 1},

    # ── Embed group ─────────────────────────────────────────────────────────
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_embed",        "parent_resource_code": None,               "is_dw_spec": 0, "is_dash_spec": 0, "description": "Embed",          "is_active": 1, "display_order": 4},
    {"app_key": _DASH_APP_KEY, "resource_code": "dash_embed_ops",    "parent_resource_code": "dash_embed",       "is_dw_spec": 0, "is_dash_spec": 0, "description": "Embed VO CRUD",  "is_active": 1, "display_order": 1},
    
    # ── Help group ───────────────────────────────────────────────────────────
    {"app_key": _DASH_APP_KEY,  "resource_code": "sys_help",         "parent_resource_code": None,               "description": "Help content (read)",     "is_active": 1, "is_dw_spec": 0, "is_role_assignable": 0},

]

_RESOURCE_I18N: dict[str, dict[str, str]] = {
    "sys_dashboard":    {"en": "Dashboard",   "ar": "لوحة المعلومات",    "zh": "仪表板",   "fr": "Tableau de bord",        "ru": "Панель управления", "es": "Panel de control"},
    "dash_core":        {"en": "Dashboard (incl. create)", "ar": "لوحة المعلومات (يشمل الإنشاء)", "zh": "仪表板（含创建）", "fr": "Tableau de bord (création incluse)", "ru": "Панель (включая создание)", "es": "Panel (incluye crear)"},
    "dash_settings":    {"en": "Dashboard Settings", "ar": "إعدادات لوحة المعلومات", "zh": "仪表板设置", "fr": "Paramètres du tableau de bord", "ru": "Настройки панели", "es": "Configuración del panel"},
    "dash_admin_ops":   {"en": "Dashboard Admin", "ar": "إدارة لوحة المعلومات", "zh": "仪表板管理", "fr": "Admin Tableau de bord", "ru": "Администрирование панели", "es": "Admin Panel"},
    "dash_vis":         {"en": "Visualizations",  "ar": "التصورات البيانية",   "zh": "可视化",   "fr": "Visualisations",         "ru": "Визуализации",      "es": "Visualizaciones"},
    "dash_section":     {"en": "Sections",    "ar": "الأقسام",           "zh": "分区",     "fr": "Sections",               "ru": "Разделы",           "es": "Secciones"},
    "dash_template":    {"en": "Canvas Layout","ar": "تخطيط اللوحة",     "zh": "画布布局", "fr": "Mise en page",           "ru": "Шаблон",            "es": "Diseño del lienzo"},
    "dash_user_areas":  {"en": "User Management","ar": "إدارة المستخدمين","zh": "用户管理", "fr": "Gestion des utilisateurs","ru": "Управление пользователями","es": "Gestión de usuarios"},
    "dash_ai_analysis": {"en": "AI Analysis", "ar": "تحليل الذكاء الاصطناعي","zh": "AI 分析","fr": "Analyse IA",             "ru": "ИИ-анализ",         "es": "Análisis con IA"},
    "dash_media_scoped":{"en": "Dashboard Media","ar": "وسائط لوحة المعلومات","zh": "仪表板媒体","fr": "Médias du tableau de bord","ru": "Медиа панели","es": "Medios del panel"},
    "sys_header_footer":{"en": "Themes",      "ar": "السمات",            "zh": "主题",     "fr": "Thèmes",                 "ru": "Темы",              "es": "Temas"},
    "dash_theme":       {"en": "Themes",      "ar": "السمات",            "zh": "主题",     "fr": "Thèmes",                 "ru": "Темы",              "es": "Temas"},
    "sys_media_files":  {"en": "Media Files", "ar": "ملفات الوسائط",     "zh": "媒体文件", "fr": "Fichiers médias",        "ru": "Медиафайлы",        "es": "Archivos multimedia"},
    "dash_media":       {"en": "Media Files", "ar": "ملفات الوسائط",     "zh": "媒体文件", "fr": "Fichiers médias",        "ru": "Медиафайлы",        "es": "Archivos multimedia"},
    "dash_embed":       {"en": "Embed",       "ar": "تضمين",             "zh": "嵌入",     "fr": "Intégration",            "ru": "Встраивание",       "es": "Incrustar"},
    "dash_embed_ops":   {"en": "Embed",       "ar": "تضمين",             "zh": "嵌入",     "fr": "Intégration",            "ru": "Встраивание",       "es": "Incrustar"},
}

# ---------------------------------------------------------------------------
# Resource APIs
# Group-header resources (sys_dashboard, sys_header_footer, sys_media_files,
# dash_embed) have NO entries here — their leaf children hold all APIs.
# ---------------------------------------------------------------------------

_DEFAULT_RESOURCE_APIS: list[dict] = [
    # ── Auth (shared — same access level as DFA_DM) ────────────────────────
    _dash("iam_auth", "POST", "/auth/login",                    "Generate JWT token",            access="APP_CLIENT"),
    _dash("iam_auth", "POST", "/auth/refresh",                  "Refresh access token",          access="PUBLIC"),
    _dash("iam_auth", "POST", "/auth/password/reset-request",   "Request password reset email",  access="APP_CLIENT"),
    _dash("iam_auth", "POST", "/auth/password/reset-confirm",   "Complete password reset",       access="APP_CLIENT"),
    _dash("iam_auth", "POST", "/auth/register",                 "Register a new user account",   access="APP_CLIENT"),
    _dash("iam_auth", "POST", "/auth/logout",                   "User logout",                   access="AUTHENTICATED"),
    _dash("iam_auth", "GET",  "/auth/me/permissions",           "Get current user permissions",  access="AUTHENTICATED"),
    _dash("iam_auth", "GET",  "/auth/captcha/challenge",        "Request PoW CAPTCHA challenge", access="APP_CLIENT"),

    # ── dash_core: list/get/create dashboard, viewer-bundle (app-level) ────
    # POST /dash is PERMISSION but deliberately seeded to NO role —
    # only is_super_admin users (who bypass the role check) can create dashboards.
    _dash("dash_core", "GET",   "/dash",                                "List dashboards",                  access="PERMISSION"),
    _dash("dash_core", "POST",  "/dash",                                "Create dashboard (super-admin only)", access="PERMISSION"),
    _dash("dash_core", "GET",   "/dash/{dashboard_id}",                 "Get dashboard",                    access="PERMISSION"),
    _dash("dash_core", "GET",   "/dash/viewer-bundle/{dashboard_title}","Get publish viewer runtime bundle", access="APP_CLIENT"),

    # ── dash_settings: per-dashboard settings (is_dash_spec=1; ADMIN+EDITOR) ─
    _dash("dash_settings", "PATCH", "/dash/{dashboard_id}",             "Update dashboard settings",        access="PERMISSION"),

    # ── dash_admin_ops: owner-only operations (delete / clone / publish) ───
    _dash("dash_admin_ops", "DELETE", "/dash/{dashboard_id}",         "Delete dashboard",                    access="PERMISSION"),
    _dash("dash_admin_ops", "POST",   "/dash/{dashboard_id}/clone",   "Clone dashboard",                     access="PERMISSION", action="UPDATE"),
    _dash("dash_admin_ops", "POST",   "/dash/{dashboard_id}/publish", "Publish/unpublish dashboard",         access="PERMISSION", action="UPDATE"),

    # ── dash_section ───────────────────────────────────────────────────────
    _dash("dash_section", "GET",    "/dash/{dashboard_id}/sections",                      "List sections",         access="PERMISSION"),
    _dash("dash_section", "POST",   "/dash/{dashboard_id}/sections",                      "Create section",        access="PERMISSION"),
    _dash("dash_section", "PATCH",  "/dash/{dashboard_id}/sections/{section_id}",         "Update section",        access="PERMISSION"),
    _dash("dash_section", "DELETE", "/dash/{dashboard_id}/sections/{section_id}",         "Delete section",        access="PERMISSION"),
    _dash("dash_section", "PUT",    "/dash/{dashboard_id}/sections/bulk",                 "Bulk reorder sections", access="PERMISSION"),

    # ── dash_template ──────────────────────────────────────────────────────
    _dash("dash_template", "GET", "/dash/{dashboard_id}/template", "Get dashboard template",    access="PERMISSION"),
    _dash("dash_template", "PUT", "/dash/{dashboard_id}/template", "Update dashboard template", access="PERMISSION"),

    # ── dash_vis ───────────────────────────────────────────────────────────
    _dash("dash_vis", "GET",    "/dash/{dashboard_id}/vis",               "List dashboard visualizations",  access="PERMISSION"),
    _dash("dash_vis", "GET",    "/dash/{dashboard_id}/vis/{viz_id}",      "Get visualization",              access="PERMISSION"),
    _dash("dash_vis", "POST",   "/dash/{dashboard_id}/vis",               "Create visualization",           access="PERMISSION"),
    _dash("dash_vis", "POST",   "/dash/{dashboard_id}/vis/{viz_id}/copy", "Copy visualization",             access="PERMISSION"),
    _dash("dash_vis", "PATCH",  "/dash/{dashboard_id}/vis/{viz_id}",      "Update visualization",           access="PERMISSION"),
    _dash("dash_vis", "DELETE", "/dash/{dashboard_id}/vis/{viz_id}",      "Delete visualization",           access="PERMISSION"),

    # ── dash_user_areas ────────────────────────────────────────────────────
    _dash("dash_user_areas", "GET",    "/dash/{dashboard_id}/users",                    "List dashboard users config", access="PERMISSION"),
    _dash("dash_user_areas", "DELETE", "/dash/{dashboard_id}/users/{user_id}",          "Remove dashboard user",       access="PERMISSION"),
    _dash("dash_user_areas", "PUT",    "/dash/{dashboard_id}/users/{user_id}/roles",    "Assign dashboard role to user", access="PERMISSION"),

    # ── dash_media_scoped ──────────────────────────────────────────────────
    _dash("dash_media_scoped", "POST",   "/dash/{dashboard_id}/media",             "Upload dashboard-scoped media file", access="PERMISSION"),
    _dash("dash_media_scoped", "DELETE", "/dash/{dashboard_id}/media/{upload_id}", "Delete dashboard-scoped media file", access="PERMISSION"),

    # ── dash_ai_analysis ───────────────────────────────────────────────────
    _dash("dash_ai_analysis", "GET",  "/dash/analyses",                                   "List analyses",    access="AUTHENTICATED"),
    _dash("dash_ai_analysis", "POST", "/dash/{dashboard_id}/vis/{gallery_id}/ai-analyze", "Run AI analysis", access="PERMISSION"),

    # ── dash_theme ─────────────────────────────────────────────────────────
    _dash("dash_theme", "GET",    "/dash/themes",                 "List themes",  access="AUTHENTICATED"),
    _dash("dash_theme", "POST",   "/dash/themes",                 "Create theme", access="PERMISSION"),
    _dash("dash_theme", "GET",    "/dash/themes/{theme_id}",      "Get theme",    access="PERMISSION"),
    _dash("dash_theme", "POST",   "/dash/themes/{theme_id}/copy", "Copy theme",   access="PERMISSION"),
    _dash("dash_theme", "PATCH",  "/dash/themes/{theme_id}",      "Update theme", access="PERMISSION"),
    _dash("dash_theme", "DELETE", "/dash/themes/{theme_id}",      "Delete theme", access="PERMISSION"),

    # ── dash_media ─────────────────────────────────────────────────────────
    _dash("dash_media", "GET",    "/dash/media",                     "List media files",       access="APP_CLIENT"),
    _dash("dash_media", "POST",   "/dash/media",                     "Upload media file",      access="PERMISSION"),
    _dash("dash_media", "DELETE", "/dash/media/{upload_id}",         "Delete media file",      access="PERMISSION"),
    _dash("dash_media", "GET",    "/dash/media/{upload_id}/content", "Serve media file bytes", access="APP_CLIENT"),

    # ── dash_embed_ops ─────────────────────────────────────────────────────
    _dash("dash_embed_ops", "GET",    "/dash/embed",                    "List embed VOs",   access="APP_CLIENT"),
    _dash("dash_embed_ops", "POST",   "/dash/embed",                    "Create embed VO",  access="PERMISSION"),
    _dash("dash_embed_ops", "GET",    "/dash/embed/{embed_id}",         "Get embed VO",     access="PUBLIC"),
    _dash("dash_embed_ops", "DELETE", "/dash/embed/{embed_id}",         "Delete embed VO",  access="PERMISSION"),
    _dash("dash_embed_ops", "POST",   "/dash/embed/{embed_id}/track",   "Track embed view", access="PUBLIC"),

    # ── System Datawarehouses (mirrored from DFA_DM) ───────────────────────
    _dash("sys_datawarehouse", "GET",    "/dw",                               "List system datawarehouses",                       access="AUTHENTICATED"),
    _dash("sys_datawarehouse", "GET",    "/dw/{dw_id}",                       "Get system datawarehouse by ID",                   access="AUTHENTICATED"),

    # ── DW read endpoints (APP_CLIENT — no role check required) ───────────
    _dash("dm_dw_area",                     "GET", "/dw/{dw_id}/areas",                                    "List areas"),
    _dash("dm_dw_area",                     "GET", "/dw/{dw_id}/area-levels",                              "List area levels"),
    _dash("dm_dw_indicator",                "GET", "/dw/{dw_id}/indicators",                               "List indicators"),
    _dash("dm_dw_indicator",                "GET", "/dw/{dw_id}/indicators/{identifier}",                  "Get indicator by identifier"),
    _dash("dm_dw_subgroup",                 "GET", "/dw/{dw_id}/subgroups",                                "List subgroups"),
    _dash("dm_dw_timeperiod",               "GET", "/dw/{dw_id}/time-periods",                             "List time periods"),
    _dash("dm_dw_indicator_classification", "GET", "/dw/{dw_id}/indicator-classifications",                "List indicator classifications"),
    _dash("dm_dw_indicator_classification", "GET", "/dw/{dw_id}/indicator-classifications/type",           "Get IC types"),
    _dash("dm_dw_indicator",                "GET", "/dw/{dw_id}/indicators/{identifier}/subgroups",        "Get subgroups for indicator"),
    _dash("dm_dw_reports_data",             "GET", "/dw/{dw_id}/reports/data/published/full",              "Published Data — Full Export", access="APP_CLIENT"),
    _dash("dm_dw_languages",                "GET",  "/dw/{dw_id}/languages",                               "List DW languages" , access="AUTHENTICATED" ),
    _dash("dm_dw_languages",                "POST", "/dw/{dw_id}/languages/export",                        "Export language translations", action="READ", access="AUTHENTICATED"),
    _dash("dm_dw_languages",                "POST", "/dw/{dw_id}/languages/import",                        "Import language translations", action="UPDATE", access="AUTHENTICATED"),
    _dash("dm_dw_unit",                     "GET", "/dw/{dw_id}/units",                                    "List units", access="APP_CLIENT"),
    _dash("dm_dw_indicator", "GET", "/dw/{dw_id}/ius",                                   "List IUS"),


    # ── IAM Roles (mirrored from DFA_DM) ──────────────────────────────────
    _dash("sys_role_resource", "GET",    "/iam/roles",                               "List IAM roles",                     access="PERMISSION"),
    _dash("sys_role_resource", "POST",   "/iam/roles",                               "Create IAM role",                    access="PERMISSION"),
    _dash("sys_role_resource", "PATCH",  "/iam/roles/{role_id}",                     "Partially update IAM role",          access="PERMISSION"),
    _dash("sys_role_resource", "DELETE", "/iam/roles/{role_id}",                     "Delete IAM role",                    access="PERMISSION"),
    _dash("sys_role_resource", "GET",    "/iam/resources",                           "List IAM resources",                 access="PERMISSION"),
    _dash("sys_role_resource", "GET",    "/iam/roles/{role_id}/resource-permissions","Get IAM role resource permissions",  access="PERMISSION"),
    _dash("sys_role_resource", "PUT",    "/iam/roles/{role_id}/resource-permissions","Save role permissions",              access="PERMISSION"),

    # ── IAM Users (mirrored from DFA_DM) ──────────────────────────────────
    _dash("sys_user_role", "GET",    "/iam/user",                  "List users scoped to app_key/dw_id", access="PERMISSION"),
    _dash("sys_user_role", "GET",    "/iam/users/me",              "Get current user profile",           access="AUTHENTICATED"),
    _dash("sys_user_role", "PATCH",  "/iam/users/me",              "Update current user profile",        access="AUTHENTICATED"),
    _dash("sys_user_role", "PATCH",  "/iam/users/me/password",     "Change current user password",       access="AUTHENTICATED"),
    _dash("sys_user_role", "POST",   "/iam/users",                 "Create new user (admin)",            access="PERMISSION"),
    _dash("sys_user_role", "PATCH",  "/iam/users/{user_id}",       "Admin update user by ID",            access="PERMISSION"),
    _dash("sys_user_role", "DELETE", "/iam/users/{user_id}",       "Admin delete user by ID",            access="PERMISSION"),
    _dash("sys_user_role", "PUT",    "/iam/users/{user_id}/roles", "Assign roles to a user",             access="PERMISSION"),

    # ── App Config / Settings (mirrored from DFA_DM) ──────────────────────
    _dash("sys_settings", "GET",   "/app-config", "Get app config by app_key",   access="APP_CLIENT"),
    _dash("sys_settings", "PATCH", "/app-config", "Patch app config by app_key", access="PERMISSION"),

    # ── Translations / System Language (mirrored from DFA_DM) ─────────────
    _dash("sys_language_management", "GET",    "/translations",                    "Get translations (global/app by query)",            access="APP_CLIENT"),
    _dash("sys_language_management", "GET",    "/translations/{translation_code}", "Get translations by code",                         access="APP_CLIENT"),
    _dash("sys_language_management", "POST",   "/translations/import",             "Import translations from XLSX",                    access="PERMISSION"),
    _dash("sys_language_management", "POST",   "/translations",                    "Create translation (global/app by payload)",       access="PERMISSION"),
    _dash("sys_language_management", "PATCH",  "/translations/{translation_code}", "Patch translation by code",                       access="PERMISSION"),
    _dash("sys_language_management", "DELETE", "/translations/{translation_code}", "Delete translation by code",                      access="PERMISSION"),
    _dash("sys_language_management", "POST",   "/translations/multiple-delete",    "Delete multiple translations by code",            access="PERMISSION", action="DELETE"),
    _dash("sys_language_management", "GET",    "/system-language",                 "List system languages",                           access="APP_CLIENT"),
    _dash("sys_language_management", "GET",    "/system-language/{id}",            "Get system language by id",                       access="AUTHENTICATED"),
    _dash("sys_language_management", "POST",   "/system-language",                 "Create a system language",                        access="AUTHENTICATED"),
    _dash("sys_language_management", "PATCH",  "/system-language/{id}",            "Patch a system language",                         access="AUTHENTICATED"),
    _dash("sys_language_management", "DELETE", "/system-language/{id}",            "Delete a system language",                        access="AUTHENTICATED"),

    # ── Logs (mirrored from DFA_DM) ────────────────────────────────────────
    _dash("sys_logs", "GET", "/logs/server-errors", "List server error logs", access="PERMISSION"),
    _dash("sys_logs", "GET", "/logs/transactions",  "List transaction logs",  access="PERMISSION"),

    # ── Help content (mirrored from DFA_DM) ────────────────────────────────
    _dash("sys_help", "GET",    "/help/api/keydata/{key_id}",  "Get help content by key (public read)", access="APP_CLIENT"),
    _dash("sys_help", "GET",    "/help/api/health",            "Help service health check",             access="PUBLIC"),

]


# ---------------------------------------------------------------------------
# Seed functions
# ---------------------------------------------------------------------------

def seed_resources(db, force: bool, dry_run: bool) -> tuple[int, int, dict[str, int]]:
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    code_to_id: dict[str, int] = {
        r.resource_code: r.id
        for r in db.query(IamResource).all()
    }

    for data in _DEFAULT_RESOURCES:
        code = data["resource_code"]
        parent_code = data.pop("parent_resource_code", None)
        parent_id = code_to_id.get(parent_code, 0) if parent_code else 0
        is_dw_spec = data.get("is_dw_spec", 0)
        is_dash_spec = data.get("is_dash_spec", 0)

        existing = db.query(IamResource).filter(
            IamResource.app_key == _DASH_APP_KEY,
            IamResource.resource_code == code,
        ).first()

        if existing:
            if force:
                if not dry_run:
                    existing.parent_id = parent_id
                    existing.description = data.get("description", "")
                    existing.is_active = data.get("is_active", 1)
                    existing.display_order = data.get("display_order", 0)
                    existing.is_dw_spec = is_dw_spec
                    existing.is_dash_spec = is_dash_spec
                else:
                    print(f"  [dry-run] Would overwrite resource '{code}'")
                inserted += 1
            else:
                print(f"  Skipping resource '{code}' — already exists")
                skipped += 1
        else:
            if dry_run:
                print(f"  [dry-run] Would insert resource '{code}'")
            else:
                row = IamResource(
                    app_key=_DASH_APP_KEY,
                    resource_code=code,
                    parent_id=parent_id,
                    description=data.get("description", ""),
                    is_active=data.get("is_active", 1),
                    display_order=data.get("display_order", 0),
                    is_dw_spec=is_dw_spec,
                    is_dash_spec=is_dash_spec,
                    created=now,
                    created_user_id=settings.SYSTEM_USER_ID,
                    modified=now,
                    modified_user_id=settings.SYSTEM_USER_ID,
                )
                db.add(row)
                db.flush()
                code_to_id[code] = row.id
            inserted += 1

    return inserted, skipped, code_to_id


def seed_resource_apis(db, code_to_id: dict[str, int], force: bool, dry_run: bool) -> tuple[int, int]:
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for data in _DEFAULT_RESOURCE_APIS:
        description = data.pop("_description", "")
        resource_code = data["resource_code"]
        resource_id = code_to_id.get(resource_code)
        if not resource_id:
            print(
                f"  WARNING: resource_code '{resource_code}' not found — "
                f"skipping {data['http_method']} {data['backend_endpoint']}"
            )
            skipped += 1
            continue

        existing = db.query(IamResourceApi).filter(
            IamResourceApi.app_key == _DASH_APP_KEY,
            IamResourceApi.http_method == data["http_method"],
            IamResourceApi.backend_endpoint == data["backend_endpoint"],
        ).first()

        if existing:
            if force:
                if not dry_run:
                    existing.resource_id = resource_id
                    existing.action = data["action"]
                    existing.access_level = data["access_level"]
                    existing.is_active = data["is_active"]
                else:
                    print(f"  [dry-run] Would overwrite API {data['http_method']} {data['backend_endpoint']}")
                inserted += 1
            else:
                skipped += 1
        else:
            if dry_run:
                print(f"  [dry-run] Would insert API {data['http_method']} {data['backend_endpoint']}")
            else:
                row = IamResourceApi(
                    app_key=_DASH_APP_KEY,
                    resource_id=resource_id,
                    http_method=data["http_method"],
                    backend_endpoint=data["backend_endpoint"],
                    action=data["action"],
                    access_level=data["access_level"],
                    is_active=data["is_active"],
                    created=now,
                    created_user_id=settings.SYSTEM_USER_ID,
                    modified=now,
                    modified_user_id=settings.SYSTEM_USER_ID,
                )
                db.add(row)
                if description:
                    db.flush()
                    db.add(IamResourceApiI18n(
                        master_id=row.id,
                        locale="en",
                        description=description,
                    ))
            inserted += 1

    return inserted, skipped


def seed_resource_i18n(db, code_to_id: dict[str, int], force: bool, dry_run: bool) -> tuple[int, int]:
    inserted = skipped = 0
    for resource_code, names in _RESOURCE_I18N.items():
        master_id = code_to_id.get(resource_code)
        if master_id is None:
            continue
        for locale, name in names.items():
            existing = db.query(IamResourceI18n).filter(
                IamResourceI18n.master_id == master_id,
                IamResourceI18n.locale == locale,
            ).first()
            if existing:
                if force:
                    if not dry_run:
                        existing.name = name
                    inserted += 1
                else:
                    skipped += 1
            else:
                if not dry_run:
                    db.add(IamResourceI18n(master_id=master_id, locale=locale, name=name))
                inserted += 1
    return inserted, skipped


def seed(force: bool = False, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        print("=== Seeding DFA_DASH IAM resources ===")
        r_ins, r_skip, code_to_id = seed_resources(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding DFA_DASH IAM resource APIs ===")
        a_ins, a_skip = seed_resource_apis(db, code_to_id, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding DFA_DASH IAM resource i18n ===")
        i_ins, i_skip = seed_resource_i18n(db, code_to_id, force=force, dry_run=dry_run)

        if not dry_run:
            db.commit()
            print(
                f"\nDone. Resources → {r_ins} inserted/updated, {r_skip} skipped. "
                f"APIs → {a_ins} inserted/updated, {a_skip} skipped. "
                f"i18n → {i_ins} inserted/updated, {i_skip} skipped."
            )
        else:
            print("\n[dry-run] No changes written.")
    except Exception as exc:
        db.rollback()
        print(f"Error during DFA_DASH IAM seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed DFA_DASH IAM resources and resource APIs.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing rows.")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing to DB.")
    args = parser.parse_args()
    seed(force=args.force, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
