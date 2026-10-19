/**
 * In-memory cache for reference options (subgroups, time periods) so that
 * opening the same modal again does not trigger a new API call.
 * Cache is keyed by locale and dwId; pass dwId from app config (e.g. useCore().dataWarehouseId).
 */

import { REFERENCE_PATH_SUBGROUPS, REFERENCE_PATH_TIME_PERIODS } from "@/lib/constants";
import { getReferenceApiClientBaseUrl } from "@/lib/appConfig/utils";
import { apiGet } from "@/lib/api/client";

/** nid used so chip keywordId (nid) can match list item in selection modal */
export type CachedOptionItem = { id: string | number; label: string; nid?: number };

/** Backend envelope: { success, data?, err_message? } */
type BackendEnvelope<T> =
  | { success: true; data: T; message?: string }
  | { success: false; err_message: string; data?: null };

const subgroupsCache = new Map<string, CachedOptionItem[]>();
const timePeriodsCache = new Map<string, CachedOptionItem[]>();

function subgroupToOption(item: Record<string, unknown>): CachedOptionItem {
  const nid = item.sg_nid as number | undefined;
  const id = (item.sg_gid as string) ?? (nid != null ? String(nid) : "");
  const label = (item.sg_name as string) ?? id;
  return { id, label, ...(nid != null ? { nid } : {}) };
}

function timePeriodToOption(item: Record<string, unknown>): CachedOptionItem {
  const nid = item.tp_nid as number | undefined;
  const tp = (item.tp_timeperiod as string) ?? (nid != null ? String(nid) : "");
  const id = String((item.tp_nid as number) ?? tp);
  const label = tp || id;
  return { id, label, ...(nid != null ? { nid } : {}) };
}

async function fetchSubgroupsFromBackend(locale: string, dwId: string): Promise<CachedOptionItem[]> {
  const url = `${getReferenceApiClientBaseUrl(dwId)}${REFERENCE_PATH_SUBGROUPS}`;
  const result = await apiGet<BackendEnvelope<Record<string, unknown>[]>>(url, {
    acceptLanguage: locale,
  });
  if (!result.ok || !result.data?.success || !Array.isArray(result.data.data)) return [];
  return result.data.data.map(subgroupToOption);
}

async function fetchTimePeriodsFromBackend(locale: string, dwId: string): Promise<CachedOptionItem[]> {
  const url = `${getReferenceApiClientBaseUrl(dwId)}${REFERENCE_PATH_TIME_PERIODS}`;
  const result = await apiGet<BackendEnvelope<Record<string, unknown>[]>>(url, {
    acceptLanguage: locale,
  });
  if (!result.ok || !result.data?.success || !Array.isArray(result.data.data)) return [];
  return result.data.data.map(timePeriodToOption);
}

/**
 * Returns subgroup options, from cache if available for the locale and dwId, otherwise fetches from backend and caches.
 */
export async function getCachedSubgroups(locale: string, dwId?: string): Promise<CachedOptionItem[]> {
  const effectiveDwId = dwId ?? "";
  const cacheKey = `${locale}:${effectiveDwId}`;
  const cached = subgroupsCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const data = await fetchSubgroupsFromBackend(locale, effectiveDwId);
  subgroupsCache.set(cacheKey, data);
  return data;
}

/**
 * Returns time period options, from cache if available for the locale and dwId, otherwise fetches from backend and caches.
 */
export async function getCachedTimePeriods(locale: string, dwId?: string): Promise<CachedOptionItem[]> {
  const effectiveDwId = dwId ?? "";
  const cacheKey = `${locale}:${effectiveDwId}`;
  const cached = timePeriodsCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const data = await fetchTimePeriodsFromBackend(locale, effectiveDwId);
  timePeriodsCache.set(cacheKey, data);
  return data;
}
