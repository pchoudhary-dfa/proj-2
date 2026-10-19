/**
 * Core API client: app-config and translations.
 * Used from server (layout) and optionally from client (re-fetch on locale change).
 * Endpoints are defined in @/lib/constants.
 */

import {
  API_BASE_URL,
  API_FINAL_BASE_URL,
  APP_BASE_ID,
  APP_CONFIG_API_ENDPOINT,
  DW_PATH_PREFIX,
  SYSTEM_LANGUAGE_API_ENDPOINT,
  TRANSLATIONS_API_ENDPOINT,
  ENABLE_API_PROXY,
  API_PROXY_PREFIX,
} from "@/lib/constants";
import { getAuthHeaders } from "@/lib/auth/authService";
import { apiFetch } from "@/lib/api/client";
import { ensureRefreshed, emitSessionExpired } from "@/lib/api/tokenRefresh";
import type {
  ApiResponse,
  AppConfigData,
  SystemLanguageEntry,
  TranslationsData,
  SearchSyncJobRef,
  SearchSyncJobStatus,
} from "@/lib/api/types";
import { isApiError } from "@/lib/api/types";
import { getDataWarehouseIdFromConfig } from "@/lib/appConfig/utils";

async function fetchCore<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const method = (options.method ?? "GET").toUpperCase();

  function buildInit(): RequestInit {
    const headers = new Headers({
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(options.headers as Record<string, string> | undefined),
    });
    return { ...options, method, cache: "no-store" as RequestCache, headers };
  }

  let res: Response;
  try {
    res = await fetch(url, buildInit());
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { success: false, code: "NETWORK_ERROR", message };
  }

  if (res.status === 401 && typeof window !== "undefined") {
    const refreshed = await ensureRefreshed();
    if (refreshed) {
      try {
        res = await fetch(url, buildInit());
      } catch (err) {
        const message = err instanceof Error ? err.message : "fetch failed";
        return { success: false, code: "NETWORK_ERROR", message };
      }
    } else {
      emitSessionExpired();
    }
  }

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    return {
      success: false,
      code: "INVALID_RESPONSE",
      message: res.ok ? "Invalid JSON in response" : res.statusText,
    };
  }

  if (!res.ok) {
    return {
      success: false,
      code: (json as { code?: string }).code ?? "UNKNOWN_ERROR",
      message: (json as { message?: string }).message ?? res.statusText,
      errors: (json as { errors?: Record<string, unknown> }).errors,
    };
  }
  return json;
}

/**
 * GET /app-config
 * Returns app key-value config. The backend resolves `app_key` from `X-Api-Key`
 * (fed client); path must not include a keyword — IAM only registers `/app-config`.
 * When `dwId` is set, the backend merges per-warehouse `db_configuration` (e.g. `DW_MAPS`).
 */
export async function fetchAppConfig(
  _keyword: string = APP_BASE_ID,
  _baseUrl: string = API_BASE_URL,
  dwId?: string | null
): Promise<ApiResponse<AppConfigData>> {
  void _keyword;
  void _baseUrl;
  const trimmed = (dwId ?? "").trim();
  const q =
    trimmed !== "" && trimmed !== "0"
      ? `?dw_id=${encodeURIComponent(trimmed)}`
      : "";
  return fetchCore<AppConfigData>(`${APP_CONFIG_API_ENDPOINT}${q}`);
}

/**
 * GET /translations
 * App scope (global + app rows) is resolved from `X-Api-Key`, not query params.
 * Uses Accept-Language for locale. Pass `is_global=true` on the backend to force global-only.
 */
export async function fetchTranslations(
  locale: string,
  options: {
    /** @deprecated Unused: scope comes from X-Api-Key. Kept for call-site compatibility. */
    keyword?: string | null;
    baseUrl?: string;
  } = {}
): Promise<ApiResponse<TranslationsData>> {
  void options.keyword;
  void options.baseUrl;
  return fetchCore<TranslationsData>(TRANSLATIONS_API_ENDPOINT, {
    headers: {
      "Accept-Language": locale,
    },
  });
}

/**
 * GET /system-language
 * Returns the list of active (non-deleted) UI languages configured on the backend.
 * The response envelope wraps an array; we extract it into SystemLanguageEntry[].
 */
export async function fetchSystemLanguages(): Promise<SystemLanguageEntry[]> {
  const res = await fetchCore<SystemLanguageEntry[]>(SYSTEM_LANGUAGE_API_ENDPOINT);
  if (isApiError(res)) return [];
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * PATCH /app-config
 * Update one or more config keys for the current app (resolved from X-Api-Key).
 * Payload: { KEY_CODE: { value, description? }, ... }
 * When `dwId` is set, warehouse-mirrored keys (e.g. DW_MAPS) are written to db_configuration.
 */
export async function patchAppConfig(
  payload: Record<string, { value: string; description?: string }>,
  options?: { dwId?: string | null },
): Promise<ApiResponse<{ updated_count: number; updated_keys: string[]; missing_keys: string[] }>> {
  const trimmed = (options?.dwId ?? "").trim();
  const q =
    trimmed !== "" && trimmed !== "0"
      ? `?dw_id=${encodeURIComponent(trimmed)}`
      : "";
  return fetchCore(`${APP_CONFIG_API_ENDPOINT}${q}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type FetchAppConfigAndTranslationsResult =
  | { ok: true; config: AppConfigData; translations: TranslationsData }
  | { ok: false; error: ApiResponse<unknown> };

/**
 * Fetches app config and translations for the given locale and keyword.
 * Returns both or the first error. Useful for initial load in layout or client.
 */
export async function fetchAppConfigAndTranslations(
  locale: string,
  keyword: string = APP_BASE_ID,
  baseUrl: string = API_BASE_URL
): Promise<FetchAppConfigAndTranslationsResult> {
  const [configRes, translationsRes] = await Promise.all([
    fetchAppConfig(keyword, baseUrl),
    fetchTranslations(locale, { keyword, baseUrl }),
  ]);

  if (isApiError(configRes)) {
    return { ok: false, error: configRes };
  }
  if (isApiError(translationsRes)) {
    return { ok: false, error: translationsRes };
  }

  let config = configRes.data;
  const dwId = getDataWarehouseIdFromConfig(config);
  if (dwId && dwId !== "0") {
    const mergedRes = await fetchAppConfig(keyword, baseUrl, dwId);
    if (!isApiError(mergedRes)) {
      config = mergedRes.data;
    }
  }

  return {
    ok: true,
    config,
    translations: translationsRes.data,
  };
}

// ---------------------------------------------------------------------------
// Translation admin functions (used by TranslationsPanel)
// ---------------------------------------------------------------------------

export type TranslationRow = {
  code: string;
  translations: Record<string, string>;
};

export type TranslationsListMeta = {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type TranslationsListResult =
  | { ok: true; rows: TranslationRow[]; meta: TranslationsListMeta }
  | { ok: false; error: string };

export type TranslationMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export type TranslationImportResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export type FetchTranslationsListParams = {
  page: number;
  pageSize: number;
  searchCode?: string;
  searchText?: string;
  sortField?: string;
  sortOrder?: "asc" | "desc";
};

function parseTranslationRows(
  items: Record<string, Record<string, string>>[]
): TranslationRow[] {
  return items.map((item) => {
    const [code, translations] = Object.entries(item)[0] ?? ["", {}];
    return { code, translations: translations ?? {} };
  });
}

/**
 * GET /translations?other_language=all&page=...
 * Returns paginated rows where each row has a code + all locale values.
 */
export async function fetchTranslationsList(
  params: FetchTranslationsListParams
): Promise<TranslationsListResult> {
  const qs = new URLSearchParams();
  qs.set("other_language", "all");
  qs.set("is_global", "false");
  qs.set("page", String(params.page));
  qs.set("page_size", String(params.pageSize));
  if (params.sortField) qs.set("sort_field", params.sortField);
  if (params.sortOrder) qs.set("sort_order", params.sortOrder);
  if (params.searchCode) {
    qs.set("search", params.searchCode);
    qs.set("search_by", "trans_code");
  } else if (params.searchText) {
    qs.set("search", params.searchText);
    qs.set("search_by", "translation_text");
  }

  // fetchCore returns the raw JSON envelope: { success, data: [...], meta: {...} }
  // We cast to unknown first so we can safely inspect both data and meta.
  const raw = await fetchCore<unknown>(`${TRANSLATIONS_API_ENDPOINT}?${qs.toString()}`);

  if (!raw.success) {
    return { ok: false, error: (raw as { message?: string }).message ?? "Request failed" };
  }

  const envelope = raw as { data?: unknown; meta?: unknown };
  if (!Array.isArray(envelope.data)) {
    return { ok: false, error: "Unexpected response shape" };
  }

  return {
    ok: true,
    rows: parseTranslationRows(envelope.data as Record<string, Record<string, string>>[]),
    meta: (envelope.meta ?? {}) as TranslationsListMeta,
  };
}

/**
 * PATCH /translations/{code}
 * Upserts locale texts for a given translation code.
 */
export async function updateTranslation(
  code: string,
  translations: Record<string, string>
): Promise<TranslationMutationResult> {
  const res = await fetchCore(
    `${TRANSLATIONS_API_ENDPOINT}/${encodeURIComponent(code)}`,
    { method: "PATCH", body: JSON.stringify({ translations }) }
  );
  if (!res.success) {
    return { ok: false, error: (res as { message?: string }).message ?? "Update failed" };
  }
  return { ok: true };
}

/**
 * GET /translations?export=true
 * Downloads the XLSX file via the proxy (which handles signing) and triggers a browser download.
 */
export async function downloadTranslationsExport(params: {
  searchCode?: string;
  searchText?: string;
  sortField?: string;
  sortOrder?: "asc" | "desc";
}): Promise<TranslationMutationResult> {
  const qs = new URLSearchParams();
  qs.set("export", "true");
  qs.set("other_language", "all");
  if (params.sortField) qs.set("sort_field", params.sortField);
  if (params.sortOrder) qs.set("sort_order", params.sortOrder);
  if (params.searchCode) {
    qs.set("search", params.searchCode);
    qs.set("search_by", "trans_code");
  } else if (params.searchText) {
    qs.set("search", params.searchText);
    qs.set("search_by", "translation_text");
  }

  let fetchRes: Response;
  try {
    // apiFetch goes through the proxy (when enabled) which applies app-client signing.
    // Explicit Accept header signals to the backend that we want the binary XLSX response.
    fetchRes = await apiFetch(`${TRANSLATIONS_API_ENDPOINT}?${qs.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
        ...getAuthHeaders(),
      },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }

  const contentType = fetchRes.headers.get("Content-Type") ?? "";
  if (!fetchRes.ok || contentType.includes("application/json")) {
    try {
      const json = (await fetchRes.json()) as { err_message?: string; message?: string };
      return { ok: false, error: json.err_message ?? json.message ?? `Export failed (${fetchRes.status})` };
    } catch {
      return { ok: false, error: `Export failed (${fetchRes.status})` };
    }
  }

  // Read as ArrayBuffer to preserve binary integrity, then wrap in Blob
  const buffer = await fetchRes.arrayBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  const cd = fetchRes.headers.get("Content-Disposition");
  let filename = `translations-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  if (cd) {
    const quoted = cd.match(/filename="([^"]+)"/i);
    const unquoted = cd.match(/filename=([^;\s]+)/i);
    const raw = quoted?.[1] ?? unquoted?.[1];
    if (raw) filename = raw.replace(/^["']|["']$/g, "");
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
  return { ok: true };
}

/**
 * POST /translations/import?app_key=<APP_BASE_ID>
 * Accepts a multipart FormData with a single "file" field (.xlsx).
 * Routes through the proxy so app-client signing headers are applied server-side.
 * Passes app_key so the import is scoped to the visualizer app (not global scope).
 */
export async function importTranslationsXlsx(
  file: File
): Promise<TranslationImportResult> {
  const form = new FormData();
  form.append("file", file);

  const baseUrl = ENABLE_API_PROXY
    ? `${API_PROXY_PREFIX}/translations`
    : TRANSLATIONS_API_ENDPOINT;
  const importUrl = `${baseUrl}/import?app_key=${encodeURIComponent(APP_BASE_ID)}`;

  async function doImport(): Promise<Response> {
    const reqHeaders = new Headers(getAuthHeaders() as Record<string, string>);
    return fetch(importUrl, { method: "POST", headers: reqHeaders, body: form });
  }

  let fetchRes: Response;
  try {
    fetchRes = await doImport();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }

  if (fetchRes.status === 401 && typeof window !== "undefined") {
    const refreshed = await ensureRefreshed();
    if (refreshed) {
      try {
        fetchRes = await doImport();
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Network error" };
      }
    } else {
      emitSessionExpired();
    }
  }

  let json: Record<string, unknown>;
  try {
    json = (await fetchRes.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Import failed (${fetchRes.status})` };
  }

  if (json.success === true) {
    return {
      ok: true,
      message: typeof json.message === "string" ? json.message : "Import successful",
    };
  }
  return {
    ok: false,
    error: typeof json.err_message === "string" ? json.err_message : "Import failed",
  };
}

/**
 * Trigger a background search index sync for the given data warehouse.
 * Creates tables if missing, then rebuilds the full search index.
 */
export async function syncSearchData(
  dwId: string
): Promise<
  | { ok: true; data: SearchSyncJobRef; message: string }
  | { ok: false; error: string }
> {
  const url = `${API_FINAL_BASE_URL}${DW_PATH_PREFIX}/${encodeURIComponent(dwId)}/search/sync`;
  const res = await fetchCore<SearchSyncJobRef>(url, { method: "POST" });
  if (isApiError(res)) {
    return { ok: false, error: res.message ?? "Sync request failed" };
  }
  return {
    ok: true,
    data: res.data,
    message: res.message ?? "Search sync job has been queued",
  };
}

/**
 * Poll the status of a search sync background job.
 * Pass either db_job_id or celery_task_id from the job reference.
 */
export async function getSearchSyncJobStatus(
  dwId: string,
  ref: Pick<SearchSyncJobRef, "db_job_id" | "celery_task_id">
): Promise<
  | { ok: true; data: SearchSyncJobStatus }
  | { ok: false; error: string }
> {
  const params = new URLSearchParams();
  if (ref.db_job_id !== null) {
    params.set("db_job_id", String(ref.db_job_id));
  } else if (ref.celery_task_id !== null) {
    params.set("celery_task_id", ref.celery_task_id);
  } else {
    return { ok: false, error: "No job_id or task_id provided" };
  }

  const url = `${API_FINAL_BASE_URL}${DW_PATH_PREFIX}/${encodeURIComponent(dwId)}/search/sync/status?${params}`;
  const res = await fetchCore<SearchSyncJobStatus>(url);
  if (isApiError(res)) {
    return { ok: false, error: res.message ?? "Failed to get job status" };
  }
  return { ok: true, data: res.data };
}

/**
 * Get the currently active search sync job for this warehouse (DB mode only).
 * Used to resume UI polling after page refresh.
 */
export async function getActiveSearchSyncJob(
  dwId: string
): Promise<
  | { ok: true; data: SearchSyncJobStatus | null }
  | { ok: false; error: string }
> {
  const url = `${API_FINAL_BASE_URL}${DW_PATH_PREFIX}/${encodeURIComponent(dwId)}/search/sync/active`;
  const res = await fetchCore<SearchSyncJobStatus | null>(url);
  if (isApiError(res)) {
    return { ok: false, error: res.message ?? "Failed to get active job" };
  }
  return { ok: true, data: res.data };
}
