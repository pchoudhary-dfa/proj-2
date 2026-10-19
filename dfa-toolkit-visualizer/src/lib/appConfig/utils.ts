import type { AppConfigData } from "@/lib/api/types";
import {
  API_BASE_URL,
  API_PROXY_PREFIX,
  DATA_PATH_SEGMENT,
  DW_PATH_PREFIX,
  ENABLE_API_PROXY,
} from "@/lib/constants";

/** Normalize GET /app-config values (string or `{ value, description }`) to a string. */
export function unwrapAppConfigValue(entry: unknown): string {
  if (entry == null || entry === "") return "";
  if (typeof entry === "string") return entry;
  if (typeof entry === "object" && entry !== null && "value" in entry) {
    const v = (entry as { value: unknown }).value;
    return typeof v === "string" ? v : "";
  }
  return "";
}

/** Treat common truthy strings from system_configuration / app-config as enabled. */
export function parseAppConfigBoolean(raw: string): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Returns the effective data warehouse ID from app config (DWS_DEFAULT) only.
 * No env or fallback; returns "" when DWS_DEFAULT is missing or blank.
 */
export function getDataWarehouseIdFromConfig(appConfig: AppConfigData): string {
  const raw = unwrapAppConfigValue(appConfig?.DWS_DEFAULT);
  return (raw || "1").trim();
}

/** Effective dwId: trimmed argument only; no fallback. */
function effectiveDwId(dwId: string | undefined): string {
  return (dwId ?? "").trim();
}

/** Client-side base URL for reference APIs (indicators, areas, etc.). Pass dwId from app config (e.g. useCore().dataWarehouseId). */
export function getReferenceApiClientBaseUrl(dwId: string): string {
  const id = effectiveDwId(dwId);
  const dwSegment = id ? `/${id}` : "";
  return ENABLE_API_PROXY
    ? `${API_PROXY_PREFIX}${dwSegment}`
    : `${API_BASE_URL.replace(/\/$/, "")}${DW_PATH_PREFIX}${dwSegment}`;
}

/** Data API URL (proxy or direct). Pattern: /dw/{id}/reports/data/published/full. Pass dwId from app config. */
export function getDataApiUrl(dwId: string): string {
  const id = effectiveDwId(dwId);
  const dwSegment = id ? `/${id}` : "";
  return ENABLE_API_PROXY
    ? `${API_PROXY_PREFIX}${dwSegment}${DATA_PATH_SEGMENT}`
    : `${API_BASE_URL.replace(/\/$/, "")}${DW_PATH_PREFIX}${dwSegment}${DATA_PATH_SEGMENT}`;
}
