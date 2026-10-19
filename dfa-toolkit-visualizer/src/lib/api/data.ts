/**
 * Data API client: GET /dw/{dw_id}/reports/data/published/full
 * Fetches indicator data with filters (indicator, area, subgroup, time period).
 */

import { API_QUERY_DEFAULTS } from "@/lib/constants";
import { getDataApiUrl } from "@/lib/appConfig/utils";
import { apiGet } from "@/lib/api/client";

/** One row in the Data API response (data[] element). Supports legacy (dv, s_gid/s_name) and new (dt_value/dt_text_value, sg_gid/sg_name) shapes. */
export interface DataApiRow {
  i_nid?: number | null;
  i_gid: string;
  i_name: string;
  u_nid?: number | null;
  u_gid: string;
  u_name: string;
  /** Legacy subgroup; new API uses sg_gid/sg_name. */
  s_nid?: number | null;
  s_gid?: string;
  s_name?: string;
  /** New API subgroup fields. */
  sg_nid?: number | null;
  sg_gid?: string;
  sg_name?: string;
  ar_nid?: number | null;
  /** Area ID (DML map code, e.g. AMR010); published API now returns this directly. */
  ar_id: string;
  /** Published API area GID (e.g. "12"); for display/filter, use ar_id for map joins. */
  ar_gid?: string;
  ar_name: string;
  tp_nid?: number | null;
  tp_timeperiod: string;
  ius_nid?: number | null;
  ius_gid: string;
  src_nid?: number | null;
  src_name: string;
  /** Legacy data value (string). New API uses dt_value (number) and dt_text_value. */
  dv?: string;
  /** New API: numeric value. */
  dt_value?: number | null;
  /** New API: textual value when dt_is_textual is true. */
  dt_text_value?: string | null;
  dt_is_textual?: boolean;
  /** Unit format code from ut_unit (e.g. "USD", "PERCENTAGE"); null when unit has no format. */
  u_format?: string | null;
  /** Server-formatted display string for the data value (e.g. "$1,234.00"); null when u_format is null. */
  formatted_data_value?: string | null;
  /** Published API formatted value key (before normalization). */
  formatted_dt_value?: string | null;
  footnote?: string;
}

/** Pagination in meta (aligned with ListPaginationMetaSchema / other DW list APIs). */
export interface DataApiPagination {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** Subgroup value entry in GET /data meta (keyed by sv_nid string). Matches API meta.subgroup. */
export interface DataApiSubgroupMetaEntry {
  sv_nid?: number;
  sv_gid: string;
  sv_name?: string;
  sv_order?: number | null;
}

/** Meta maps from data responses. Published/full uses flat pagination only. */
export interface DataApiMeta {
  pagination: DataApiPagination;
  indicator?: Record<string, { i_nid?: number; i_gid: string; i_name: string }>;
  unit?: Record<string, { u_nid?: number; u_gid: string; u_name: string }>;
  subgroup?: Record<string, DataApiSubgroupMetaEntry>;
  ius?: Record<string, { ius_nid?: number; ius_gid: string }>;
  ic?: Record<string, unknown>;
  time_period?: Record<string, { tp_nid?: number; tp_timeperiod: string }>;
  area?: Record<string, { ar_nid?: number; ar_id: string; ar_name: string }>;
  area_level?: Record<string, unknown>;
  /** Legacy wrong keys (ignored by server); may appear if reading old cached responses. */
  i_info?: Record<string, { i_nid?: number; i_gid: string; i_name: string }>;
  u_info?: Record<string, { u_nid?: number; u_gid: string; u_name: string }>;
  sv_info?: Record<string, DataApiSubgroupMetaEntry>;
  ius_info?: Record<string, { ius_nid?: number; ius_gid: string }>;
  ic_info?: Record<string, unknown>;
  tp_info?: Record<string, { tp_nid?: number; tp_timeperiod: string }>;
  ar_info?: Record<string, { ar_nid?: number; ar_id: string; ar_name: string }>;
  arl_info?: Record<string, unknown>;
}

/** Success response envelope. meta may be omitted in some API versions. */
export interface DataApiSuccessResponse {
  success: true;
  message: string;
  data: DataApiRow[];
  meta?: DataApiMeta;
}

/** Error response envelope. */
export interface DataApiErrorResponse {
  success: false;
  err_message: string;
  data: null;
  errors?: { code?: string };
}

export type DataApiResponse = DataApiSuccessResponse | DataApiErrorResponse;

export function isDataApiError(
  res: DataApiResponse
): res is DataApiErrorResponse {
  return res.success === false;
}

/** Query parameters for GET /dw/{dw_id}/reports/data/published/full. At least one of i_identifier required. */
export interface DataApiParams {
  /** Comma-separated indicator identifiers (NIDs or GIDs). */
  i_identifier?: string;
  /** Comma-separated unit identifiers (NIDs or GIDs). */
  u_identifier?: string;
  /** Comma-separated subgroup value identifiers (NIDs or GIDs). */
  sg_identifier?: string;
  /** Comma-separated area identifiers (NIDs or area IDs). */
  ar_identifier?: string;
  /** Comma-separated IUS identifiers (NIDs or composite i_gid|u_gid|sg_gid). */
  ius_identifier?: string;
  /** When true (default), resolve default-subgroup IUS when no subgroup/ius filter is set. */
  isdefaultsubgroup?: boolean;
  /** Time period NID(s). */
  tp_nid?: number | number[];
  /** Time period string(s), e.g. "2024", "2025". */
  tp_timeperiod?: string | string[];
  /** Page number (≥ 1). */
  page?: number;
  /** Records per page (1–50000); sent as `page_size`. */
  pageSize?: number;
  /** Locale for names; only used to set Accept-Language header (not sent as query param). */
  locale?: string;
  /** Legacy meta flags from old /data API — not sent to published/full. */
  i_info?: boolean;
  u_info?: boolean;
  sv_info?: boolean;
  ius_info?: boolean;
  ic_info?: boolean;
  tp_info?: boolean;
  ar_info?: boolean;
  arl_info?: boolean;
}

/** Options for fetchDataApi. */
export interface FetchDataApiOptions {
  /** Data warehouse ID (from app config e.g. useCore().dataWarehouseId). */
  dwId?: string;
  /** Accept-Language header (used if locale not in params). */
  acceptLanguage?: string;
}

type PublishedFlatMeta = {
  total_count?: number;
  count?: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
  pagination?: DataApiPagination;
};

function toQueryArray(value: string | string[] | number | number[]): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [String(value)];
}

/** Map internal DataApiParams to published/full query string. */
function buildSearchParams(params: DataApiParams): URLSearchParams {
  const search = new URLSearchParams();

  if (params.i_identifier != null && params.i_identifier !== "") {
    search.set("indicator", params.i_identifier);
  }
  if (params.u_identifier != null && params.u_identifier !== "") {
    search.set("unit", params.u_identifier);
  }
  if (params.sg_identifier != null && params.sg_identifier !== "") {
    search.set("subgroup", params.sg_identifier);
  }
  if (params.ar_identifier != null && params.ar_identifier !== "") {
    search.set("area", params.ar_identifier);
  }
  if (params.ius_identifier != null && params.ius_identifier !== "") {
    search.set("ius", params.ius_identifier);
  }

  const timeParts: string[] = [];
  if (params.tp_nid != null) {
    timeParts.push(...toQueryArray(params.tp_nid));
  }
  if (params.tp_timeperiod != null) {
    timeParts.push(...toQueryArray(params.tp_timeperiod));
  }
  if (timeParts.length > 0) {
    search.set("time_period", timeParts.join(","));
  }

  const defaultData = API_QUERY_DEFAULTS.DATA_API;
  search.set("page", String(params.page ?? defaultData.page));
  search.set("page_size", String(params.pageSize ?? defaultData.pageSize));
  const isDefaultSubgroup = params.isdefaultsubgroup ?? defaultData.isdefaultsubgroup;
  search.set("isdefaultsubgroup", isDefaultSubgroup ? "true" : "false");

  return search;
}

function normalizePublishedRow(row: DataApiRow): DataApiRow {
  return {
    ...row,
    ar_id: row.ar_id ?? "",
    formatted_data_value: row.formatted_data_value ?? row.formatted_dt_value ?? null,
    ius_gid: row.ius_gid ?? "",
    src_name: row.src_name ?? "",
    i_gid: row.i_gid ?? "",
    i_name: row.i_name ?? "",
    u_gid: row.u_gid ?? "",
    u_name: row.u_name ?? "",
    ar_name: row.ar_name ?? "",
    tp_timeperiod: row.tp_timeperiod ?? "",
  };
}

function normalizePublishedMeta(meta: PublishedFlatMeta | undefined): DataApiMeta | undefined {
  if (!meta) return undefined;
  if (meta.pagination) {
    return meta as DataApiMeta;
  }
  if (meta.total_count == null) return undefined;
  return {
    pagination: {
      total_count: meta.total_count ?? 0,
      count: meta.count ?? 0,
      page: meta.page ?? 1,
      page_size: meta.page_size ?? 0,
      total_pages: meta.total_pages ?? 0,
    },
  };
}

function normalizePublishedSuccessResponse(
  json: DataApiSuccessResponse & { meta?: PublishedFlatMeta }
): DataApiSuccessResponse {
  const meta = normalizePublishedMeta(json.meta);
  return {
    success: true,
    message: json.message,
    data: (json.data ?? []).map((row) => normalizePublishedRow(row)),
    ...(meta ? { meta } : {}),
  };
}

async function fetchPublishedDataPage(
  url: string,
  acceptLanguage?: string
): Promise<DataApiResponse> {
  const result = await apiGet<DataApiResponse & { meta?: PublishedFlatMeta }>(url, {
    acceptLanguage,
    cache: "no-store",
  });

  if (!result.ok) {
    return {
      success: false,
      err_message: result.error ?? result.statusText ?? "Request failed",
      data: null,
      errors: { code: result.status === 0 ? "NETWORK_ERROR" : "UNKNOWN_ERROR" },
    };
  }

  const json = result.data;
  if (json == null) {
    return {
      success: false,
      err_message: "Invalid JSON in response",
      data: null,
      errors: { code: "INVALID_RESPONSE" },
    };
  }

  if (isDataApiError(json)) {
    return json;
  }

  return normalizePublishedSuccessResponse(json);
}

/**
 * Fetches data from GET /dw/{dw_id}/reports/data/published/full.
 * Requires i_identifier in params.
 */
export async function fetchDataApi(
  params: DataApiParams,
  options: FetchDataApiOptions = {}
): Promise<DataApiResponse> {
  const { dwId = "", acceptLanguage } = options;

  const hasIndicator =
    params.i_identifier != null && String(params.i_identifier).trim() !== "";
  if (!hasIndicator) {
    return {
      success: false,
      err_message: "At least one indicator (i_identifier) is required.",
      data: null,
      errors: { code: "MISSING_INDICATOR" },
    };
  }

  const lang = acceptLanguage ?? params.locale;
  const baseUrl = getDataApiUrl(dwId);
  const search = buildSearchParams(params);
  const firstUrl = `${baseUrl}?${search.toString()}`;

  const firstPage = await fetchPublishedDataPage(firstUrl, lang);
  if (isDataApiError(firstPage)) {
    return firstPage;
  }

  const pagination = firstPage.meta?.pagination;
  const totalPages = pagination?.total_pages ?? 1;
  const totalCount = pagination?.total_count ?? firstPage.data.length;

  if (!pagination || totalPages <= 1 || firstPage.data.length >= totalCount) {
    return firstPage;
  }

  const allRows = [...firstPage.data];
  const currentPage = pagination.page ?? 1;
  const pageSize = pagination.page_size ?? params.pageSize ?? API_QUERY_DEFAULTS.DATA_API.pageSize;

  for (let page = currentPage + 1; page <= totalPages; page += 1) {
    const pageSearch = buildSearchParams({ ...params, page, pageSize });
    const pageUrl = `${baseUrl}?${pageSearch.toString()}`;
    const pageResult = await fetchPublishedDataPage(pageUrl, lang);
    if (isDataApiError(pageResult)) {
      return pageResult;
    }
    allRows.push(...pageResult.data);
  }

  return {
    success: true,
    message: firstPage.message,
    data: allRows,
    meta: {
      pagination: {
        total_count: totalCount,
        count: allRows.length,
        page: 1,
        page_size: allRows.length,
        total_pages: 1,
      },
    },
  };
}
