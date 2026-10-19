/**
 * CORE CONSTANTS
 */
// DFA VISUALIZER BY DEFAULT FAVICON
export const DEFAULT_FAVICON = "/images/dfa_fav_vis.png";

// DFA BY DEFAULT LOGO
export const DEFAULT_LOGO = "/images/dfa_fav_vis.png";

// API BASE URL - WILL COME FORM ENV
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
export const API_PROXY_URL = process.env.NEXT_PUBLIC_API_PROXY_URL ?? "http://127.0.0.1:8000";

// DFA VISUALIZER BASE ID - WILL COME FORM ENV BUT THIS IS FIXED FOR VISUALIZER APPLICATION
// USE THIS FOR TRANSLATION/CONFIGURATION API CALLS TO FETCH VISUALIZER CONFIGURATION AND TRANSLATIONS
export const APP_BASE_ID = process.env.NEXT_PUBLIC_APP_BASE_ID ?? "DFA_VIZ";

// DFA CUSTOM VISUALIZER ID - WILL COME FORM ENV. HELPFUL IF NEED TO USE A UNIQUE ID
// FOR EXAMPLE, IF NEED TO USE A UNIQUE ID FOR LOCAL STORAGE OR OTHER REASONS
export const APP_ID = process.env.NEXT_PUBLIC_APP_ID ?? "DFATSTVIZ";

// DFA VISUALIZER API KEY - WILL COME FORM ENV
// DFA VISUALIZER APP WILL BE REGISTERED WITH API, AND THAT WILL GENERATE A UNIQUE KEY FOR THE APP
export const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

/** Gate: signing runs when this and `API_SIGNING_PRIVATE_KEY` are set (direct / proxy-off mode). */
export const API_SIGNATURE = process.env.NEXT_PUBLIC_API_SIGNATURE ?? "";

/**
 * Ed25519 private key for browser signing when `ENABLE_API_PROXY=false`.
 * From `NEXT_PUBLIC_API_SIGNING_PRIVATE_KEY` (required NEXT_PUBLIC_ prefix for client bundle).
 * Proxy-on mode signs on the server via non-public `API_SIGNING_PRIVATE_KEY` on `/api/proxy`.
 */
export const API_SIGNING_PRIVATE_KEY = (
  process.env.NEXT_PUBLIC_API_SIGNING_PRIVATE_KEY ?? ""
).trim();

// ENABLE API PROXY - FROM ENV
// NEXT_PUBLIC_ENABLE_API_PROXY: fallback when USE_INTERNAL_API_ROUTING is not set; "false" = direct.
// When proxy disabled, browser calls API_BASE_URL directly (requires backend CORS).
export const ENABLE_API_PROXY = process.env.NEXT_PUBLIC_ENABLE_API_PROXY?.toLowerCase() === "true";

// Same-origin proxy base path when proxy is enabled (must match Next.js route, e.g. app/api/proxy).
export const API_PROXY_PREFIX = "/api/proxy";

// API FINAL BASE URL - WILL BE THE API BASE URL IF ENABLE_API_PROXY IS FALSE, OTHERWISE THE API PROXY PREFIX
export const API_FINAL_BASE_URL = ENABLE_API_PROXY ? `${API_PROXY_PREFIX}` : `${API_BASE_URL}`;
// DATA WAREHOUSE PATH PREFIX - FIXED
export const DW_PATH_PREFIX = "/dw";

/**
 * PARENT API ENDPOINTS
 */
// System Configuration API ENDPOINT
export const APP_CONFIG_API_ENDPOINT = `${API_FINAL_BASE_URL}/app-config`;
// Translation API ENDPOINT 
export const TRANSLATIONS_API_ENDPOINT = `${API_FINAL_BASE_URL}/translations`;
// System Language API ENDPOINT
export const SYSTEM_LANGUAGE_API_ENDPOINT = `${API_FINAL_BASE_URL}/system-language`;

/**
 * COMPONENT API ENDPOINTS
 */
export const REFERENCE_PATH_INDICATORS = "/indicators";
export const REFERENCE_PATH_AREAS = "/areas";
export const REFERENCE_PATH_AREA_LEVELS = "/area-levels";
export const REFERENCE_PATH_SUBGROUPS = "/subgroups";
export const REFERENCE_PATH_TIME_PERIODS = "/time-periods";
export const REFERENCE_PATH_IUS = "/ius";
export const DATA_PATH_SEGMENT = "/reports/data/published/full";
export const SEARCH_PATH_SEGMENT = "/search";
export const GALLERY_PATH_SEGMENT = "/gallery";


export const GALLERY_API_URL = `${API_FINAL_BASE_URL}${GALLERY_PATH_SEGMENT}`;

// Auth APIs
export const AUTH_PATH_SEGMENT = "/auth";
export const AUTH_API_URL = `${API_FINAL_BASE_URL}${AUTH_PATH_SEGMENT}`;
/** Same-origin BFF for login/refresh/logout — sets httpOnly cookies for middleware. */
export const AUTH_SESSION_BFF_BASE = "/api/auth";

/** localStorage key for the current user object (id, username, email, displayName, roles). Used to restore session on load. */
export const AUTH_USER_STORAGE_KEY = "dfa_viz_auth_user";
/** localStorage key for the JWT access token. Sent as Bearer token in API requests. */
export const AUTH_TOKEN_STORAGE_KEY = "dfa_viz_auth_token";

/**
 * Default query parameters for APIs that use them (e.g. Data API).
 * Use these in API clients so changes apply everywhere.
 */
export const API_QUERY_DEFAULTS = {
  /** GET /dw/{id}/reports/data/published/full – pagination: page, page_size */
  DATA_API: {
    page: 1,
    pageSize: 5000,
    isdefaultsubgroup: true,
  } as const,
} as const;

/**
 * Browser sessionStorage keys for the visualizer flow.
 * Roles are documented in `src/lib/visualizer/sessionAdapter.ts` (single source of truth).
 */
export const SESSION_STORAGE_KEYS = {
  /**
   * One-shot payload: full chip list when the user applies search on landing (or similar).
   * Drained on visualizer mount — never used for refresh (that is `VISUALIZER_SELECTION`).
   */
  VIZ_SEARCH_HANDOFF: "dfa_viz_search_handoff",
  /** Legacy migration only; not written by the app anymore. */
  LEGACY_SEARCH_CHIPS: "dfa_search_chips",
  LEGACY_SEARCH_PAYLOAD: "dfa_search_payload",
  /** Canonical `SelectedComponents` for `/visualizer` tab refresh. */
  VISUALIZER_SELECTION: "dfa_visualizer_selection",
  /** `VisualizationConfig` snapshot restored on `/visualizer` tab refresh (chart type, colors, fonts, mapping, etc.). */
  VISUALIZER_VIZ_CONFIG: "dfa_visualizer_viz_config",
  /** Viz config snapshot used by save-to-gallery sign-in redirect flow. */
  VISUALIZER_PENDING_VIZ_CONFIG: "dfa_visualizer_pending_viz_config",
  /**
   * UI state for `/visualizer` refresh: which side panel was open and which tab was active.
   * Stored separately from `VISUALIZER_VIZ_CONFIG` so layout/UI can restore without conflating with chart config.
   */
  VISUALIZER_UI_STATE: "dfa_visualizer_ui_state",
  /**
   * Full path + query of `/visualizer` when opening My Gallery (e.g. `/en/visualizer?gid=45`).
   * Used by the gallery "Back to visualization" control so the saved item reloads.
   */
  VISUALIZER_GALLERY_RETURN: "dfa_visualizer_gallery_return",
  /** Search sync job reference for background polling. */
  SEARCH_SYNC_JOB: "dfa_viz_search_sync_job",
} as const;

// Route Paths
export const ROUTES = {
  VISUALIZER: "/visualizer",
  /** Share link path (e.g. /visualize?indicator=...&filters=...). */
  VISUALIZE: "/visualize",
} as const;


// App Config Defaults: fallback values when the API returns empty or the key is missing.
// Used by getConfig() in CoreContext.tsx. Keys match GET /app-config `data` (app from X-Api-Key).
export const APP_CONFIG_DEFAULTS: Record<string, string> = {
  APP_NAME: "DFA Visualizer",
  APP_TITLE: "Data NeTT Visualizer",
  APP_FOOTER_NOTE: "",
  APP_ID: "DFA_VIZ",
  IUS_GID_SEPARATOR: "|",
  ALLOWED_IMPORT_FILE_SIZE_MB: "50",
  SSO_ENABLED: "false",
  FLAVOR_COLOR: "",
  FLAVOR_COLOR_HOVER: "",
  FLAVOR_FAVICON: "",
  FLAVOR_LOGO: "",
  LANGUAGE_ENABLED: "no",
  LANGUAGE_DEFAULT: "en",
  DWS_ENABLED: "no",
  DWS_DEFAULT: "",
  /** Area identifier(s) for data API when no area is selected: single ar_id or comma-separated (e.g. "TTO" or "TTO,IND,BRA"). */
  DWS_DEFAULT_AREA: "",
  /** Base URL (domain) of the hosted DML map library application. Empty = maps disabled. */
  DFA_DML_URL: "",
  /** Per-warehouse choropleth basemap JSON (DML /getmap paths); prefer over legacy DFA_MAPS. See packages/dfa-v6-comp-visualization README (Host app: DFA_MAPS). */
  DW_MAPS: "{}",
  /** @deprecated Use DW_MAPS (merged from db_configuration when app-config is fetched with dw_id). */
  DFA_MAPS: "{}",
};

/** App settings (super-admin) — `ENABLE_INSIGHTS` PATCH values; labels are Title Case for the UI. */
export const APP_SETTINGS_ENABLE_INSIGHTS_OPTIONS: { value: string; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/** Yes/no options for other app-config toggles (language, DWS, etc.). */
export const APP_SETTINGS_YES_NO_OPTIONS = APP_SETTINGS_ENABLE_INSIGHTS_OPTIONS;

/** App settings — `SSO_ENABLED` PATCH values (`true` / `false` strings in system_configuration). */
export const APP_SETTINGS_SSO_ENABLED_OPTIONS: { value: string; label: string }[] = [
  { value: "false", label: "False" },
  { value: "true", label: "True" },
];

/** App settings — `AI_PROVIDER` PATCH values; extend as more providers are supported. */
export const APP_SETTINGS_AI_PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: "OpenAI", label: "OpenAI" },
];

// HEADER NAMES FOR THE DFA API
// WILL BE SEND IN EACH API CALL TO AUTHENTICATE THE APP.
export const X_APP_KEY_HEADER = "X-Api-Key";
export const X_APP_SIGNATURE_HEADER = "X-Api-Signature";
export const X_APP_TIMESTAMP_HEADER = "X-Api-Timestamp";


