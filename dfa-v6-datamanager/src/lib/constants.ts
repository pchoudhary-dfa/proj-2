/**
 * Core constants – DFA Visualizer env contract.
 */

export const APP_BASE_ID =
  process.env.NEXT_PUBLIC_APP_BASE_ID ?? process.env.APP_BASE_ID ?? "DTK_DM";
export const APP_ID =
  process.env.NEXT_PUBLIC_APP_ID ?? process.env.APP_ID ?? "DFATSTDM";

// Frontend app URL (useful for redirects and app-level links)
export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

// Backend API URL for direct calls when proxy is disabled
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

/** API key for X-Api-Key header. */
export const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "dfa_dm_fed_app";

/** Shared signature secret/token for DFA Visualizer signature flow. */
export const API_SIGNATURE = process.env.NEXT_PUBLIC_API_SIGNATURE ?? "";

/**
 * Key material used by signature builder in this project's signing flow.
 * Prefer server-only signing key.
 */
export const API_PUBLIC_KEY =
  (
    process.env.DM_API_SIGNING_PRIVATE_KEY ??
    ""
  ).trim();

/**
 * Same-origin BFF path; browser uses this so HttpOnly auth cookies attach to API calls.
 */
export const BFF_API_PREFIX = "/api/backend";

/** GET /logs/server-errors — system error log list (app_db). */
export const LOGS_SERVER_ERRORS_API_URL = `${BFF_API_PREFIX}/logs/server-errors`;

/** GET /logs/transactions — warehouse transaction audit log list (app_db). */
export const LOGS_TRANSACTIONS_API_URL = `${BFF_API_PREFIX}/logs/transactions`;

/**
 * Browser-facing base URL for DFA Help **keydata** lookups.
 * Routes through the BFF proxy so auth headers are injected automatically.
 */
export const DFA_HELP_KEYDATA_URL = `${BFF_API_PREFIX}/help/api/keydata`;

/**
 * Browser-facing base URL for DFA Help **admin** operations (CRUD on keys/adaptations).
 * Routes through the BFF proxy so session auth is used (no separate bearer token needed).
 */
export const DFA_HELP_ADMIN_URL = `${BFF_API_PREFIX}/help/api`;

/**
 * Help key used when the pathname does not map to a feature-specific key
 * (short path, only IDs, etc.). Must match a key configured in DFA Help admin.
 */
export const DFA_HELP_FALLBACK_KEY = "DM-DATAWAREHOUSE";

/** Legacy proxy prefix (still stripped in `getBackendPathWithQuery` for signing). */
export const API_PROXY_PREFIX = "/api/proxy";

/** @deprecated Kept for env parity; browser API traffic always uses `BFF_API_PREFIX`. */
export const ENABLE_API_PROXY =
  process.env.NEXT_PUBLIC_ENABLE_API_PROXY === "true";

export const API_PROXY_URL =
  process.env.NEXT_PUBLIC_API_PROXY_URL ?? "http://fastapi-service";

/**
 * Toolkit API base URL for server-side fetches (RSC, Route Handlers).
 * Set `DFA_TOOLKIT_INTERNAL_API_URL` in production when the API is not reachable at the public URL.
 */
export const SERVER_TOOLKIT_API_BASE = (
  process.env.DFA_TOOLKIT_INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

/**
 * Toolkit (or legacy proxy) origin for calls that bypass `/api/backend`, e.g. DFA Mailer on `/dfa-mailer`.
 * Aligns with dfa-toolkit-app-visualizer `API_FINAL_BASE_URL`.
 */
export const API_FINAL_BASE_URL = (
  ENABLE_API_PROXY ? API_PROXY_PREFIX : API_BASE_URL
).replace(/\/$/, "");

/**
 * Base URL for API fetches: browser → BFF; server → direct toolkit URL.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return BFF_API_PREFIX;
  }
  return SERVER_TOOLKIT_API_BASE;
}

/**
 * Ghost autocomplete on grid text fields (NIS.Cost-style).
 * On by default; set `NEXT_PUBLIC_ENABLE_AUTO_SUGGESTIONS=false` to disable.
 */
export const ENABLE_GRID_AUTOSUGGESTIONS =
  process.env.NEXT_PUBLIC_ENABLE_AUTO_SUGGESTIONS !== "false";

/**
 * Common API path segments – build full URLs as: `${getApiBaseUrl()}${PATH}`
 */
export const AUTH_PATH_SEGMENT = "/auth";
export const AUTH_ME_PERMISSIONS_PATH = "/auth/me/permissions";
export const APP_CONFIG_PATH_SEGMENT = "/app-config";
export const TRANSLATIONS_PATH_SEGMENT = "/translations";
export const SYSTEM_LANGUAGE_PATH_SEGMENT = "/system-language";
export const IAM_USER_PATH_SEGMENT = "/iam/user";
export const IAM_ROLES_PATH = "/iam/roles";
export const NOTIFICATIONS_PATH_SEGMENT = "/notifications";

// Data warehouse
export const DW_PATH_PREFIX = "/dw";
export const REFERENCE_PATH_INDICATORS = "/indicators";
/** GET/PATCH .../metadata-categories */
export const REFERENCE_PATH_METADATA_CATEGORIES = "/metadata-categories";
export const REFERENCE_PATH_AREAS = "/areas";
export const REFERENCE_PATH_AREA_LEVELS = "/area-levels";
export const REFERENCE_PATH_SUBGROUPS = "/subgroups";
export const REFERENCE_PATH_UNITS = "/units";
export const REFERENCE_PATH_INDICATOR_CLASSIFICATIONS = "/indicator-classifications";
export const REFERENCE_PATH_IC_IUS_EXPORT = "/ic-ius/export";
export const REFERENCE_PATH_IC_IUS_IMPORT = "/ic-ius/import";
export const REFERENCE_PATH_SG_CATEGORIES = "/sg-categories";
/** Bulk POST subgroup category values: /dw/{dw_id}/sg-categories/values */
export const REFERENCE_PATH_SG_CATEGORIES_VALUES = "/sg-categories/values";
/** GET all subgroup category values: /dw/{dw_id}/sg-categories-values */
export const REFERENCE_PATH_SG_CATEGORIES_VALUES_LIST = "/sg-categories-values";
export const REFERENCE_PATH_TIME_PERIODS = "/time-periods";
/** GET list workflows: /dw/{dw_id}/workflow */
export const REFERENCE_PATH_WORKFLOW = "/workflow";
/** GET/POST datasets: /dw/{dw_id}/dataset */
export const REFERENCE_PATH_DATASET = "/dataset";
/** GET/POST dataset comments: /dw/{dw_id}/dataset/{dataset_id}/comments */
export const REFERENCE_PATH_COMMENTS = "/comments";
/** GET merged data-entry rows: /dw/{dw_id}/data-points */
export const REFERENCE_PATH_DATA_POINTS = "/data-points";
/** POST data-points import: /dw/{dw_id}/dataset/{dataset_id}/data-points/import */
export const REFERENCE_PATH_DATA_POINTS_IMPORT = `${REFERENCE_PATH_DATA_POINTS}/import`;
/** GET import logs: /dw/{dw_id}/dataset/{dataset_id}/data-points/import-logs */
export const REFERENCE_PATH_DATA_POINTS_IMPORT_LOGS = `${REFERENCE_PATH_DATA_POINTS}/import-logs`;
export const REFERENCE_PATH_SOURCES = "/sources";
export const REFERENCE_PATH_IUS = "/ius";
export const REFERENCE_PATH_DB_METADATA = "/dbmetadata";
/** POST generate / GET download warehouse MySQL SQL dump (.sql.gz). */
export const REFERENCE_PATH_SQL_DUMP = "/sql-dump";
export const REFERENCE_PATH_LANGUAGES = "/languages";
export const REFERENCE_PATH_TOOLS = "/tools";
/** GET /dw/{dw_id}/users — list warehouse members (scoped by app_key + dw_id). */
export const REFERENCE_PATH_USERS = "/users";
export const DATA_PATH_SEGMENT = "/data";
export const SEARCH_PATH_SEGMENT = "/search";

// ---------------------------------------------------------------------------
// Reports API path constants — GET /dw/{dw_id}/reports/{slug}
// Use with getDWAPIURL(dwId, REPORT_*) or the helper getReportURL(dwId, slug).
// Base: /dw/{dw_id}/reports
// ---------------------------------------------------------------------------

/** Base reports prefix for all report endpoints. */
export const REPORTS_PATH = "/reports";

/** GET /dw/{dw_id}/reports/summary — all 31 counts + analytics totals in one call (PUBLIC). */
export const REPORTS_SUMMARY_PATH = "/reports/summary";

// ── Quality reports — Group A: Indicator Quality (AUTHENTICATED) ───────────
/** Indicators that have no IUS row assigned. */
export const REPORT_QUALITY_INDICATORS_NO_IUS = "/reports/quality/indicators/no-ius";
/** Indicators that have IUS rows but none is marked as the default subgroup. */
export const REPORT_QUALITY_INDICATORS_NO_DEFAULT_SUBGROUP = "/reports/quality/indicators/no-default-subgroup";
/** Indicators where i_has_data = false. */
export const REPORT_QUALITY_INDICATORS_NO_DATA = "/reports/quality/indicators/no-data";

// ── Quality reports — Group B: IUS Quality (AUTHENTICATED) ────────────────
/** IUS rows where ius_min_value > ius_max_value. */
export const REPORT_QUALITY_IUS_INVALID_VALUE_RANGE = "/reports/quality/ius/invalid-value-range";
/** IUS rows not mapped to any IC via ut_ic_ius. */
export const REPORT_QUALITY_IUS_NO_IC_MAPPING = "/reports/quality/ius/no-ic-mapping";
/** IUS rows with broken indicator/unit/subgroup_val FK references. Returns i_ref_missing, u_ref_missing, sg_ref_missing flags. */
export const REPORT_QUALITY_IUS_ORPHAN_REFS = "/reports/quality/ius/orphan-refs";

// ── Quality reports — Group C: Area Quality (AUTHENTICATED) ───────────────
/** Areas where i_has_data = false. */
export const REPORT_QUALITY_AREAS_NO_DATA = "/reports/quality/areas/no-data";
/** Areas whose ar_parent_nid points to a non-existent area row. */
export const REPORT_QUALITY_AREAS_ORPHAN_PARENT = "/reports/quality/areas/orphan-parent";

// ── Quality reports — Group D: Time Period Quality (AUTHENTICATED) ─────────
/** Time periods not referenced by any ut_data row. */
export const REPORT_QUALITY_TIME_PERIODS_UNUSED = "/reports/quality/time-periods/unused";

// ── Quality reports — Group E: Subgroup Quality (AUTHENTICATED) ───────────
/** SubgroupVal rows not used in any ut_indicator_unit_subgroup row. */
export const REPORT_QUALITY_SUBGROUPS_VALS_NOT_IN_IUS = "/reports/quality/subgroups/vals-not-in-ius";

// ── Quality reports — Group F: Data Value Integrity (AUTHENTICATED) ────────
/** Data rows where dt_value < ius_min_value or dt_value > ius_max_value. */
export const REPORT_QUALITY_DATA_VALUES_OUT_OF_RANGE = "/reports/quality/data/values-out-of-range";
/** IUS+Area combinations that have no row with dt_is_mrd = true. */
export const REPORT_QUALITY_DATA_MISSING_MRD = "/reports/quality/data/missing-mrd";

// ── Quality reports — Group G: Metadata Completeness (AUTHENTICATED) ───────
/** Indicators missing a ut_metadatareport entry for mandatory metadata categories. */
export const REPORT_QUALITY_METADATA_MISSING_MANDATORY = "/reports/quality/metadata/missing-mandatory";

// ── Quality reports — Group H: Source Quality (AUTHENTICATED) ─────────────
/** Source ICs (ic_type='SR') not referenced in any ut_data.source_nid. */
export const REPORT_QUALITY_SOURCES_UNUSED = "/reports/quality/sources/unused";

// ── Quality reports — Group I: IC / Classification Quality (AUTHENTICATED) ─
/** IC nodes with no IUS mapping in ut_ic_ius. Supports ?include_sr=false (default). */
export const REPORT_QUALITY_IC_NO_IUS = "/reports/quality/indicator-classifications/no-ius";
/** IC leaf nodes (no children) with no IUS mapping. */
export const REPORT_QUALITY_IC_LEAF_NO_IUS = "/reports/quality/indicator-classifications/leaf-no-ius";
/** ut_ic_ius rows where ic_nid or iusnid no longer exists. Returns ic_ref_missing, ius_ref_missing flags. */
export const REPORT_QUALITY_IC_IUS_ORPHAN_REFS = "/reports/quality/ic-ius/orphan-refs";

// ── Quality reports — Group N: Data Referential Integrity (AUTHENTICATED) ──
// Always on-the-fly. Expose raw broken FK values — strictly internal.
/** Data rows whose iusnid has no matching ut_indicator_unit_subgroup row. */
export const REPORT_QUALITY_DATA_ORPHAN_IUS = "/reports/quality/data/orphan-ius";
/** Data rows whose area_nid has no matching ut_area row. */
export const REPORT_QUALITY_DATA_ORPHAN_AREA = "/reports/quality/data/orphan-area";
/** Data rows whose timeperiod_nid has no matching ut_timeperiod row. */
export const REPORT_QUALITY_DATA_ORPHAN_TIMEPERIOD = "/reports/quality/data/orphan-timeperiod";
/** Data rows whose source_nid (when non-null) has no matching ut_indicator_classifications row. */
export const REPORT_QUALITY_DATA_ORPHAN_SOURCE = "/reports/quality/data/orphan-source";

// ── Analytical reports — Group J: Coverage & Completeness (PUBLIC) ─────────
/** Per-indicator: total areas, areas with data, coverage %, with subgroup_breakdown. */
export const REPORT_ANALYTICS_COVERAGE_INDICATOR_BY_AREA = "/reports/analytics/coverage/indicator-by-area";
/** Per-indicator: earliest/latest period, periods_with_data, total_periods, with subgroup_breakdown. */
export const REPORT_ANALYTICS_COVERAGE_INDICATOR_BY_TIMEPERIOD = "/reports/analytics/coverage/indicator-by-timeperiod";
/** Per-area: total IUS, IUS with data, completeness %. */
export const REPORT_ANALYTICS_COVERAGE_AREA_COMPLETENESS = "/reports/analytics/coverage/area-completeness";
/** Flat indicator × subgroup-value cross-table with has_data flag and row count. Supports ?indicator= scope. */
export const REPORT_ANALYTICS_COVERAGE_INDICATOR_SUBGROUP = "/reports/analytics/coverage/indicator-subgroup";

// ── Analytical reports — Group K: Data Volume & Distribution (PUBLIC) ──────
/** Indicators ranked by ut_data row count. Supports ?top_n= (default 20). */
export const REPORT_ANALYTICS_VOLUME_TOP_INDICATORS = "/reports/analytics/volume/top-indicators";
/** Per-IUS: total rows, value stats, earliest/latest period. */
export const REPORT_ANALYTICS_VOLUME_IUS_DENSITY = "/reports/analytics/volume/ius-density";
/** Per-subgroup value: total rows, distinct indicators and areas. */
export const REPORT_ANALYTICS_VOLUME_SUBGROUP_DISTRIBUTION = "/reports/analytics/volume/subgroup-distribution";

// ── Analytical reports — Group L: IC & Source Utilisation (PUBLIC) ─────────
/** Per-source IC: total rows, distinct IUS, areas, and time periods. */
export const REPORT_ANALYTICS_UTILISATION_SOURCE_USAGE = "/reports/analytics/utilisation/source-usage";
/** Per-IC node: mapped IUS count, total data rows, distinct areas. */
export const REPORT_ANALYTICS_UTILISATION_IC_COVERAGE = "/reports/analytics/utilisation/ic-coverage";

// ── Data reports — Group M: Published Data (PUBLIC) ────────────────────────
/** Enriched view of ut_data — all filters optional; page_size ceiling 50 000. */
export const REPORT_DATA_PUBLISHED_FULL = "/reports/data/published/full";

// ── Operational reports (AUTHENTICATED) ────────────────────────────────────
/** Single-call operational dashboard for a data-entry workflow. */
export const REPORT_OPERATIONAL_DASHBOARD = "/reports/operational-dashboard";
/** Base path for the 5 paginated operational report endpoints (append `/{workflow_id}/{slug}`). */
export const REPORT_OPERATIONAL_REPORTS = "/reports/operational-reports";

/** Full URLs for top-level APIs (call at request time — browser vs server base differs). */
export function getAuthApiUrl(): string {
  return `${getApiBaseUrl()}${AUTH_PATH_SEGMENT}`;
}

/** DW-scoped permissions URL: GET /auth/me/permissions?dw_id={dwId} */
export function getAuthMePermissionsUrl(dwId: string): string {
  return `${getApiBaseUrl()}${AUTH_ME_PERMISSIONS_PATH}?dw_id=${encodeURIComponent(dwId)}`;
}

/**
 * Same-origin Next `/api/auth/*` handlers — set HttpOnly session cookies on login.
 * Use as `dfa-v6-comp-login` `baseUrl` (`{AUTH_SESSION_BFF_BASE}/login`), not `getAuthApiUrl()`.
 */
export const AUTH_SESSION_BFF_BASE = "/api/auth";

export function getAppConfigApiUrl(): string {
  return `${getApiBaseUrl()}${APP_CONFIG_PATH_SEGMENT}`;
}
export function getTranslationsApiUrl(): string {
  return `${getApiBaseUrl()}${TRANSLATIONS_PATH_SEGMENT}`;
}
export function getSystemLanguageApiUrl(): string {
  return `${getApiBaseUrl()}${SYSTEM_LANGUAGE_PATH_SEGMENT}`;
}
export function getIamUserApiUrl(): string {
  return `${getApiBaseUrl()}${IAM_USER_PATH_SEGMENT}`;
}
export function getIamRolesApiUrl(): string {
  return `${getApiBaseUrl()}${IAM_ROLES_PATH}`;
}
export function getNotificationsApiUrl(): string {
  return `${getApiBaseUrl()}${NOTIFICATIONS_PATH_SEGMENT}`;
}

/**
 * DFA Mailer (email templates / logs) API prefix on the Toolkit host.
 * Must match Toolkit `DFA_MAILER_API_PREFIX` (default `/dfa-mailer`). Not under `/api/`.
 * Note: Toolkit `AccessControlMiddleware` currently skips IAM for paths starting with `/dfa-mailer`;
 * JWT + X-Api-Key are still sent by the datamanager for consistency if that changes.
 */
export const DFA_MAILER_PATH =
  (process.env.NEXT_PUBLIC_DFA_MAILER_PATH ?? "/dfa-mailer").replace(/\/+$/, "") ||
  "/dfa-mailer";

export const DFA_MAILER_API_URL = `${API_FINAL_BASE_URL}${DFA_MAILER_PATH}`;

/**
 * Mailer API base for browser UI (`dfa-mailer-templates` axios calls).
 * Same-origin `/api/backend/...` so HttpOnly session cookies attach and the BFF
 * forwards `Authorization` + signing to the toolkit. Do not use `DFA_MAILER_API_URL`
 * from client components — it targets the toolkit host directly and gets 401.
 */
export const DFA_MAILER_BROWSER_API_BASE = `${BFF_API_PREFIX}${DFA_MAILER_PATH}`;

/** localStorage key for sidebar-selected data warehouse (indicator + DW-scoped APIs). */
export const SELECTED_DW_STORAGE_KEY = "dfa-selected-dw-id";

/**
 * API request key format – must match backend ADAPTATION.
 * "internal" = indicator_name, unit_gid, subgroup_val_gid, highisgood
 * "external" = i_name, u_gid, sg_gid, i_high_is_good
 * Default "external" for backends with ADAPTATION=external.
 */
export const API_KEY_FORMAT: "internal" | "external" = "external";

/** Build URL for GET system datawarehouses list: GET /dw */
export function getDatawarehousesListUrl(): string {
  return `${getApiBaseUrl()}${DW_PATH_PREFIX}`;
}

/**
 * Build a data-warehouse–scoped API URL: `/dw/{dwId}{apiPath}` under the resolved API base.
 * `apiPath` should start with `/` (e.g. `REFERENCE_PATH_INDICATORS`). Use `""` for `/dw/{dwId}` only.
 */
export function getDWAPIURL(dwId: string, apiPath: string): string {
  return `${getApiBaseUrl()}${DW_PATH_PREFIX}/${dwId}${apiPath}`;
}

/**
 * Build a report API URL: `/dw/{dwId}/reports/{reportPath}`.
 * Pass one of the `REPORT_*` or `REPORTS_*` path constants as `reportPath`.
 * Example: `getReportURL(dwId, REPORT_QUALITY_INDICATORS_NO_IUS)`
 */
export function getReportURL(dwId: string, reportPath: string): string {
  return getDWAPIURL(dwId, reportPath);
}

/**
 * Build an IAM (non-DW-scoped) API URL: `{base}{apiPath}`.
 * Use for endpoints under `/iam/...` that are scoped by X-Api-Key, not by dw_id.
 */
export function getIAMAPIURL(apiPath: string): string {
  return `${getApiBaseUrl()}${apiPath}`;
}

/**
 * Subgroup type GID for “Others” (matches API DW_SYSTEM_SUBGROUP_CATG_GID, default OTHERS).
 * Used with ensure_sg_cat_gids when creating values under that type.
 */
export const SUBGROUP_OTHERS_TYPE_GID = "OTHERS";

/**
 * Default subgroup gid for indicator -> IUS create/edit flows.
 * Keeps add-row subgroup locked to a single value controlled by env.
 */
export const DEFAULT_IUS_SUBGROUP_GID =
  process.env.NEXT_PUBLIC_DEFAULT_IUS_SUBGROUP_GID?.trim() || "TOTAL";

/**
 * Fallback locale when app-config (LANGUAGE_DEFAULT) cannot be read.
 * Also used for middleware/bootstrap if the internal API fails.
 */
export const FALLBACK_DEFAULT_LOCALE = "en";

/**
 * Allowed `[locale]` URL segments when GET /system-language fails or returns nothing.
 * Keeps the app usable offline; should stay in sync with minimal login language fallback.
 */
export const FALLBACK_ALLOWED_LOCALE_CODES: readonly string[] = [
  FALLBACK_DEFAULT_LOCALE,
];

/** App route slug after locale (and optional `[dw_id]`) — mirrors `src/app/[locale]/...` segments. */
export type LocaleAppPage =
  | "indicator"
  | "overview"
  | "units"
  | "subgroups"
  | "areas"
  | "indicator-classifications"
  | "data-entry"
  | "data-review"
  | "timeperiod"
  | "workflow"
  | "languages"
  | "sources"
  | "roles"
  | "users"
  | "about"
  | "version-log"
  | "preferences"
  | "datawarehouse"
  | "administration"
  | "logs"
  | "translations"
  | "tools";

/**
 * Build a locale-prefixed dashboard path: `/{locale}/{page}` or `/{locale}/{dwId}/{page}`.
 * `datawarehouse` is always `/{locale}/datawarehouse` (ignores `dwId`).
 * `version-log` is always `/{locale}/version-log` (ignores `dwId`; changelog is app-wide).
 * Other pages omit `dwId` from the path when it is empty.
 */
export function buildLocaleAppPath(
  locale: string,
  page: LocaleAppPage,
  dwId?: string
): string {
  const seg = locale.trim() || FALLBACK_DEFAULT_LOCALE;
  if (page === "datawarehouse") {
    return `/${seg}/datawarehouse`;
  }
  if (page === "administration") {
    return `/${seg}/administration`;
  }
  if (page === "logs") {
    const dwSegLogs = dwId?.trim() ?? "";
    if (!dwSegLogs) return `/${seg}/logs`;
    return `/${seg}/${dwSegLogs}/logs`;
  }
  if (page === "version-log") {
    return `/${seg}/version-log`;
  }
  if (page === "preferences") {
    return `/${seg}/preferences`;
  }
  if (page === "translations") {
    return `/${seg}/translations`;
  }
  const dwSeg = dwId?.trim() ?? "";
  if (!dwSeg) return `/${seg}/${page}`;
  return `/${seg}/${dwSeg}/${page}`;
}

/**
 * @deprecated Use `buildLocaleAppPath(locale, "indicator", dwId)` with locale from URL or `resolveDefaultAppLocale()`.
 * Kept for one-off redirects that only know the static locale fallback.
 */
export const INDICATORS_PAGE_PATH = `/${FALLBACK_DEFAULT_LOCALE}/indicator`;

/**
 * Paths that must NOT show the common dashboard shell (sidebar + toolbar).
 * Used by Sidebar layout to render only children on login and similar pages.
 */
export const LAYOUT_EXCLUDED_PATHS: string[] = [
  "/",
  "/auth",
  "/signin",
];

/** True for `/xx` login surface (single locale segment, not `/xx/yy`). */
export function isLocaleOnlyLoginPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return false;
  const [a] = parts;
  if (a === "api" || a.startsWith("_")) return false;
  return /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(a);
}

/**
 * Execution log job-detail view (often opened in a new tab). Renders without sidebar or toolbar.
 */
export function isComputeExecutionLogDetailPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/[^/]+\/[^/]+\/compute-engine\/execute\/logs\/[^/]+$/.test(
    pathname
  );
}

/**
 * Page title and toolbar icon per pathname (for dashboard toolbar).
 * Add entries for each page that uses the shell.
 */
export const PAGE_CONFIG: Record<
  string,
  { titleKey: string; icon: string }
> = {
  [INDICATORS_PAGE_PATH]: { titleKey: "INDICATORS", icon: "table_chart" },
  [buildLocaleAppPath(FALLBACK_DEFAULT_LOCALE, "overview")]: {
    titleKey: "OVERVIEW",
    icon: "grid_view",
  },
  [buildLocaleAppPath(FALLBACK_DEFAULT_LOCALE, "datawarehouse")]: {
    titleKey: "LABEL_DATAWAREHOUSE",
    icon: "storage",
  },
};

/** Resolve toolbar titleKey/icon for locale-prefixed routes (e.g. /fr/indicator). */
export function getPageConfigForPathname(
  pathname: string | null
): { titleKey: string; icon: string } | null {
  if (!pathname) return null;
  const exact = PAGE_CONFIG[pathname];
  if (exact) return exact;
  if (/^\/[^/]+\/version-log$/.test(pathname)) {
    return { titleKey: "VERSION_LOG", icon: "system_update_alt" };
  }
  if (/^\/[^/]+\/[^/]+\/indicator$/.test(pathname)) {
    return { titleKey: "INDICATORS", icon: "table_chart" };
  }
  if (/^\/[^/]+\/[^/]+\/overview$/.test(pathname)) {
    return { titleKey: "OVERVIEW", icon: "grid_view" };
  }
  if (/^\/[^/]+\/[^/]+\/units$/.test(pathname)) {
    return { titleKey: "UNITS", icon: "table_chart" };
  }
  if (/^\/[^/]+\/[^/]+\/subgroups$/.test(pathname)) {
    return { titleKey: "SUBGROUPS", icon: "table_chart" };
  }
  if (/^\/[^/]+\/[^/]+\/areas$/.test(pathname)) {
    return { titleKey: "AREAS", icon: "table_chart" };
  }
  if (/^\/[^/]+\/[^/]+\/indicator-classifications$/.test(pathname)) {
    return { titleKey: "CLASSIFICATIONS", icon: "category" };
  }
  if (/^\/[^/]+\/[^/]+\/data-entry\/dataset(?:\/[^/]+)?$/.test(pathname)) {
    return { titleKey: "DATA_ENTRY", icon: "edit_note" };
  }
  if (/^\/[^/]+\/[^/]+\/data-review\/dataset(?:\/[^/]+)?$/.test(pathname)) {
    return { titleKey: "DATA_REVIEW", icon: "edit_note" };
  }
  if (/^\/[^/]+\/[^/]+\/timeperiod$/.test(pathname)) {
    return { titleKey: "TIME_PERIOD", icon: "calendar_month" };
  }
  if (/^\/[^/]+\/[^/]+\/workflow$/.test(pathname)) {
    return { titleKey: "WORKFLOW", icon: "shield" };
  }
  if (/^\/[^/]+\/[^/]+\/languages$/.test(pathname)) {
    return { titleKey: "LANGUAGES", icon: "translate" };
  }
  if (/^\/[^/]+\/[^/]+\/tools$/.test(pathname)) {
    return { titleKey: "TOOLS", icon: "build" };
  }
  if (/^\/[^/]+\/[^/]+\/sources$/.test(pathname)) {
    return { titleKey: "SOURCES", icon: "source" };
  }
  if (/^\/[^/]+\/[^/]+\/publish-data\/mobile-app$/.test(pathname)) {
    return { titleKey: "PUBLISH_DATA", icon: "publish" };
  }
  if (/^\/[^/]+\/[^/]+\/reports\/data-report$/.test(pathname)) {
    return { titleKey: "DATA_REPORT", icon: "bar_chart" };
  }
  if (/^\/[^/]+\/[^/]+\/reports\/analytical-report$/.test(pathname)) {
    return { titleKey: "ANALYTICAL_REPORT", icon: "analytics" };
  }
  if (/^\/[^/]+\/[^/]+\/reports\/quality-report$/.test(pathname)) {
    return { titleKey: "QUALITY_REPORT", icon: "verified" };
  }
  if (/^\/[^/]+\/[^/]+\/reports\/operational-dashboard$/.test(pathname)) {
    return { titleKey: "OPERATIONAL_DASHBOARD", icon: "dashboard" };
  }
  if (/^\/[^/]+\/[^/]+\/reports\/operational-reports$/.test(pathname)) {
    return { titleKey: "OPERATIONAL_REPORTS", icon: "assignment" };
  }
  if (/^\/[^/]+\/administration$/.test(pathname)) {
    return { titleKey: "ADMINISTRATION", icon: "admin_panel_settings" };
  }
  if (/^\/[^/]+\/[^/]+\/about$/.test(pathname)) {
    return { titleKey: "ABOUT_US", icon: "info" };
  }
  if (
    /^\/[^/]+\/[^/]+\/compute-engine\/execute$/.test(pathname) ||
    /^\/[^/]+\/[^/]+\/compute-engine\/execute\/logs\/[^/]+$/.test(pathname)
  ) {
    return { titleKey: "CALCULATE_IUS", icon: "functions" };
  }
  if (/^\/[^/]+\/indicator$/.test(pathname)) {
    return { titleKey: "INDICATORS", icon: "table_chart" };
  }
  if (/^\/[^/]+\/datawarehouse$/.test(pathname)) {
    return { titleKey: "LABEL_DATAWAREHOUSE", icon: "storage" };
  }
  if (/^\/[^/]+\/preferences$/.test(pathname)) {
    return { titleKey: "PREFERENCES", icon: "tune" };
  }
  if (/^\/[^/]+\/translations$/.test(pathname)) {
    return { titleKey: "TRANSLATIONS", icon: "translate" };
  }
  if (/^\/[^/]+\/logs$/.test(pathname)) {
    return { titleKey: "LOGS", icon: "receipt_long" };
  }
  if (/^\/[^/]+\/[^/]+\/logs$/.test(pathname)) {
    return { titleKey: "TRANSACTION_LOGS", icon: "receipt_long" };
  }
  return null;
}

/** Shape of a data warehouse option in the sidebar/page list (from API or fallback). */
export type DwOption = {
  id: string;
  name: string;
  indicatorCount?: number;
  datawarehouseType?: string;
  hostAddress?: string;
  username?: string;
  port?: string;
  databaseName?: string;
  defaultLanguage?: string;
};

// HEADER NAMES FOR THE DFA API
// WILL BE SEND IN EACH API CALL TO AUTHENTICATE THE APP.
export const X_APP_KEY_HEADER = "X-Api-Key";
export const X_APP_SIGNATURE_HEADER = "X-Api-Signature";
export const X_APP_TIMESTAMP_HEADER = "X-Api-Timestamp";

// DEFAULT LOGO AND FAVICON FOR THE DFA DATA MANAGER
export const DEFAULT_DM_LOGO = "/images/dfa_def_dm.png";
export const DEFAULT_DM_FAVICON = "/images/dfa_def_dm.png";

export const MANUAL_GID_INVALID_CHARS_REGEX = /[^A-Za-z0-9_-]/g;

/**
 * Datawarehouse dictionary used by the Datawarehouse page form.
 * Keep this list as the single source of truth for selectable types and default ports.
 */
export const DATAWAREHOUSE_DICTIONARY = [
  {
    uiType: "MySQL",
    dbSourceType: "mysql",
    port: "3306",
  },
] as const;

export type DatawarehouseDictionaryEntry =
  (typeof DATAWAREHOUSE_DICTIONARY)[number];

export const DEFAULT_DATAWAREHOUSE: DatawarehouseDictionaryEntry =
  DATAWAREHOUSE_DICTIONARY[0];

// ---------------------------------------------------------------------------
// Dataset completeness thresholds
// pct >= HIGH  → success (green)
// pct >= MEDIUM → warning (yellow)
// pct <  MEDIUM → error   (red)
// ---------------------------------------------------------------------------
export const COMPLETENESS_HIGH_THRESHOLD = 90;
export const COMPLETENESS_MEDIUM_THRESHOLD = 60;