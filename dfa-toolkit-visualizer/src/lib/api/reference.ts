/**
 * Data Warehouse Reference APIs client: Indicators, Time Periods, Areas, Subgroups.
 * Used to populate side panel options. See docs/DATAWAREHOUSE_REFERENCE_APIS.md.
 */

import {
  API_BASE_URL,
  DW_PATH_PREFIX,
  REFERENCE_PATH_AREA_LEVELS,
  REFERENCE_PATH_AREAS,
  REFERENCE_PATH_INDICATORS,
  REFERENCE_PATH_SUBGROUPS,
  REFERENCE_PATH_TIME_PERIODS,
} from "@/lib/constants";
import { getAuthHeaders } from "@/lib/auth/authService";
import { ensureRefreshed, emitSessionExpired } from "@/lib/api/tokenRefresh";

/** Common success envelope from reference APIs. */
export interface ReferenceSuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
}

/** Common error envelope. */
export interface ReferenceErrorEnvelope {
  success: false;
  err_message: string;
  data: null;
  errors?: Record<string, unknown>;
}

export type ReferenceResponse<T> = ReferenceSuccessEnvelope<T> | ReferenceErrorEnvelope;

export function isReferenceError<T>(
  res: ReferenceResponse<T>
): res is ReferenceErrorEnvelope {
  return res.success === false;
}

// --- Indicators (internal keys; external may use i_nid, i_gid, i_name, etc.) ---

export interface IndicatorListItem {
  indicator_nid?: number;
  indicator_gid?: string;
  indicator_name?: string;
  indicator_info?: string;
  short_name?: string;
  indicator_order?: number;
  data_exist?: boolean;
  highisgood?: boolean;
  locale?: string;
  // External adaptation keys
  i_nid?: number;
  i_gid?: string;
  i_name?: string;
  i_order?: number;
  [key: string]: unknown;
}

export interface IndicatorsMeta {
  totalCount?: number;
  count?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

export async function fetchIndicators(
  dwId: string,
  options: { baseUrl?: string; acceptLanguage?: string } = {}
): Promise<ReferenceResponse<IndicatorListItem[]>> {
  const { baseUrl = API_BASE_URL, acceptLanguage } = options;
  const dwSegment = dwId ? `/${encodeURIComponent(dwId)}` : "";
  const url = `${baseUrl.replace(/\/$/, "")}${DW_PATH_PREFIX}${dwSegment}${REFERENCE_PATH_INDICATORS}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;

  return fetchJson<IndicatorListItem[]>(url, headers);
}

export interface IndicatorDetailItem extends IndicatorListItem {
  unit_nid?: unknown;
  subgroup_val_nid?: unknown;
  default_subgroup_nid?: number;
  ic_nid?: unknown;
}

/** Single metadata report entry returned inside `meta.metadata` when `?metadata=true`. */
export interface MetadataReportItem {
  mt_rpt_nid: number;
  mt_rpt_target_nid: number;
  mt_rpt_category_nid: number;
  mt_rpt_metadata: string;
  mt_catg_name: string;
  mt_catg_gid: string;
  mt_catg_order: number;
}

/** Response envelope from GET /dw/{id}/indicators?i_identifier=...&u_identifier=...&metadata=true. */
export interface IndicatorWithMetaEnvelope {
  success: boolean;
  message: string;
  /** Single indicator object or array when multiple identifiers are requested. */
  data: IndicatorDetailItem | IndicatorDetailItem[];
  meta?: {
    metadata?: Record<string, MetadataReportItem>;
    unit?: Record<string, { u_nid?: number; u_gid?: string; u_name?: string }>;
  };
}

export async function fetchIndicatorById(
  dwId: string,
  identifier: string,
  options: { baseUrl?: string; acceptLanguage?: string } = {}
): Promise<ReferenceResponse<IndicatorDetailItem>> {
  const { baseUrl = API_BASE_URL, acceptLanguage } = options;
  const dwSegment = dwId ? `/${encodeURIComponent(dwId)}` : "";
  const url = `${baseUrl.replace(/\/$/, "")}${DW_PATH_PREFIX}${dwSegment}${REFERENCE_PATH_INDICATORS}/${encodeURIComponent(identifier)}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;

  return fetchJson<IndicatorDetailItem>(url, headers);
}

// --- Time periods ---

export interface TimePeriodItem {
  tp_nid?: number;
  tp_timeperiod?: string;
  tp_startdate?: string | null;
  tp_enddate?: string | null;
  tp_periodicity?: string | null;
  [key: string]: unknown;
}

export async function fetchTimePeriods(
  dwId: string,
  options: { baseUrl?: string; acceptLanguage?: string } = {}
): Promise<ReferenceResponse<TimePeriodItem[]>> {
  const { baseUrl = API_BASE_URL, acceptLanguage } = options;
  const dwSegment = dwId ? `/${encodeURIComponent(dwId)}` : "";
  const url = `${baseUrl.replace(/\/$/, "")}${DW_PATH_PREFIX}${dwSegment}${REFERENCE_PATH_TIME_PERIODS}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;

  return fetchJson<TimePeriodItem[]>(url, headers);
}

// --- Areas ---

export interface AreaLevelListItem {
  al_nid?: number;
  al_level: number;
  al_name: string;
}

export interface AreaListItem {
  ar_nid?: number;
  ar_parent_nid?: number | null;
  ar_id?: string;
  ar_name?: string;
  ar_gid?: string;
  ar_level?: number;
  ar_short_name?: string;
  ar_is_global?: boolean;
  ar_has_data?: boolean;
  a_nid?: number;
  a_parent_nid?: number | null;
  a_id?: string;
  a_name?: string;
  a_gid?: string;
  a_level?: number;
  [key: string]: unknown;
}

export interface FetchAreasParams {
  level?: number;
  language?: string;
}

export async function fetchAreas(
  dwId: string,
  params: FetchAreasParams = {},
  options: { baseUrl?: string; acceptLanguage?: string } = {}
): Promise<ReferenceResponse<AreaListItem[]>> {
  const { baseUrl = API_BASE_URL, acceptLanguage } = options;
  const search = new URLSearchParams();
  if (params.level != null) search.set("level", String(params.level));
  if (params.language) search.set("language", params.language);

  const qs = search.toString();
  const dwSegment = dwId ? `/${encodeURIComponent(dwId)}` : "";
  const url = `${baseUrl.replace(/\/$/, "")}${DW_PATH_PREFIX}${dwSegment}${REFERENCE_PATH_AREAS}${qs ? `?${qs}` : ""}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;

  return fetchJson<AreaListItem[]>(url, headers);
}

export async function fetchAreaLevels(
  dwId: string,
  options: { baseUrl?: string; acceptLanguage?: string } = {}
): Promise<ReferenceResponse<AreaLevelListItem[]>> {
  const { baseUrl = API_BASE_URL, acceptLanguage } = options;
  const search = new URLSearchParams({ page: "1", page_size: "100" });
  const url = `${baseUrl}${DW_PATH_PREFIX}/${encodeURIComponent(dwId)}${REFERENCE_PATH_AREA_LEVELS}?${search.toString()}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;

  return fetchJson<AreaLevelListItem[]>(url, headers);
}

// --- Subgroups ---

export interface SubgroupListItem {
  sg_nid?: number;
  sg_gid?: string;
  sg_name?: string;
  sg_order?: number;
  sg_is_global?: boolean;
  subgroup_categories?: unknown;
  [key: string]: unknown;
}

export interface FetchSubgroupsParams {
  inc_subgroups?: boolean;
  language?: string;
}

export async function fetchSubgroups(
  dwId: string,
  params: FetchSubgroupsParams = {},
  options: { baseUrl?: string; acceptLanguage?: string } = {}
): Promise<ReferenceResponse<SubgroupListItem[]>> {
  const { baseUrl = API_BASE_URL, acceptLanguage } = options;
  const search = new URLSearchParams();
  if (params.inc_subgroups != null) search.set("inc_subgroups", String(params.inc_subgroups));
  if (params.language) search.set("language", params.language);

  const qs = search.toString();
  const dwSegment = dwId ? `/${encodeURIComponent(dwId)}` : "";
  const url = `${baseUrl.replace(/\/$/, "")}${DW_PATH_PREFIX}${dwSegment}${REFERENCE_PATH_SUBGROUPS}${qs ? `?${qs}` : ""}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;

  return fetchJson<SubgroupListItem[]>(url, headers);
}

/** Subgroup option shape for preloaded options (matches dfa-v6-comp-subgroup SubgroupItem). */
export interface SubgroupOptionItem {
  id: string | number;
  label: string;
  nid?: number;
}



/**
 * Fetches subgroup options for the given indicator NIDs via
 * GET /dw/{dwId}/indicators/{nids}/subgroups.
 * Call with the DW base URL (e.g. getReferenceApiClientBaseUrl(dwId)).
 * Returns options from meta.subgroup.
 */
export async function fetchSubgroupOptionsViaIus(
  dwBaseUrl: string,
  indicatorNids: number[],
  options: { acceptLanguage?: string } = {}
): Promise<SubgroupOptionItem[]> {
  if (indicatorNids.length === 0) return [];
  const base = dwBaseUrl.replace(/\/$/, "");
  const nidsSegment = encodeURIComponent(indicatorNids.join(","));
  const url = `${base}${REFERENCE_PATH_INDICATORS}/${nidsSegment}${REFERENCE_PATH_SUBGROUPS}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.acceptLanguage) headers["Accept-Language"] = options.acceptLanguage;

  const res = await fetchJson<unknown>(url, headers);
  if (res.success === false) return [];
  const meta = res.meta as Record<string, unknown> | undefined;
  const subgroupDict = meta?.subgroup as Record<string, Record<string, unknown>> | undefined;
  if (!subgroupDict || typeof subgroupDict !== "object") return [];
  return Object.values(subgroupDict).map((item) => {
    const nid = item.sg_nid as number | undefined;
    const id = (item.sg_gid as string) ?? (item.sg_nid as number) ?? item.id;
    const label = (item.sg_name as string) ?? (item.label as string) ?? (id != null ? String(id) : "");
    return {
      id: id as string | number,
      label: label || String(id),
      ...(nid != null ? { nid } : {}),
    };
  });
}

// --- Helpers ---

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<ReferenceResponse<T>> {
  function buildMergedHeaders(): Record<string, string> {
    return { ...getAuthHeaders(), ...headers };
  }

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", headers: buildMergedHeaders() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { success: false, err_message: message, data: null, errors: { code: "NETWORK_ERROR" } };
  }

  if (res.status === 401 && typeof window !== "undefined") {
    const refreshed = await ensureRefreshed();
    if (refreshed) {
      try {
        res = await fetch(url, { cache: "no-store", headers: buildMergedHeaders() });
      } catch (err) {
        const message = err instanceof Error ? err.message : "fetch failed";
        return { success: false, err_message: message, data: null, errors: { code: "NETWORK_ERROR" } };
      }
    } else {
      emitSessionExpired();
    }
  }

  let json: ReferenceResponse<T>;
  try {
    json = (await res.json()) as ReferenceResponse<T>;
  } catch {
    return {
      success: false,
      err_message: res.ok ? "Invalid JSON in response" : res.statusText,
      data: null,
      errors: { code: "INVALID_RESPONSE" },
    };
  }

  if (!res.ok) {
    return {
      success: false,
      err_message: isReferenceError(json) ? json.err_message : res.statusText,
      data: null,
      errors: isReferenceError(json) ? json.errors : { code: "UNKNOWN_ERROR" },
    };
  }

  return json;
}
