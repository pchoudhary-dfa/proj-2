/**
 * Minimal share payload: only what the user actually selected (no defaults).
 * Used to build share URLs and to hydrate from URL.
 */

import type { SelectedComponents, SelectedItem, VisualizationConfig } from "@/lib/visualizer/types";
import type { DataApiParams } from "@/lib/api/data";
import { buildDataApiParams } from "@/lib/visualizer/dataApiParams";
import { selectedComponentsToFilters } from "@/lib/visualizer/selectedComponentsToFilters";

/** Time period item in share payload: id, label, and nid when available (for tp_nid). */
export interface TimePeriodPayloadItem {
  nid?: number;
  id: string;
  label: string;
}

/** One indicator in a share payload: plain id string (legacy) or object with optional unit / nid (matches main visualizer Data API). */
export type MinimalShareIndicatorEntry =
  | string
  | { id: string; unitGid?: string; nid?: number };

export interface MinimalSharePayload {
  indicator?: MinimalShareIndicatorEntry[];
  area?: string[];
  subgroup?: string[];
  /** Time period: new format (objects with id/label/nid) or legacy number[] (years). */
  timePeriod?: TimePeriodPayloadItem[] | number[];
}

const DEFAULT_SUBGROUP = "Total";

function isMinimalShareIndicatorEntry(el: unknown): el is MinimalShareIndicatorEntry {
  if (typeof el === "string") return true;
  if (typeof el !== "object" || el === null) return false;
  const o = el as Record<string, unknown>;
  if (typeof o.id !== "string") return false;
  if (o.unitGid != null && typeof o.unitGid !== "string") return false;
  if (o.nid != null && typeof o.nid !== "number") return false;
  return true;
}

/** Maps share JSON indicator entries to SelectedItem (preserves unitGid / nid for Data API). */
export function indicatorPayloadToSelectedItems(
  indicator: NonNullable<MinimalSharePayload["indicator"]>
): SelectedItem[] {
  return indicator.map((entry) => {
    if (typeof entry === "string") {
      return { id: entry, label: entry };
    }
    const id = String(entry.id);
    return {
      id,
      label: id,
      ...(entry.nid != null ? { nid: entry.nid } : {}),
      ...(entry.unitGid != null && entry.unitGid !== ""
        ? { unitGid: entry.unitGid }
        : {}),
    };
  });
}

/**
 * Builds minimal payload from SelectedComponents: only includes sections the user
 * actually selected. Omits subgroup when it's just ["Total"]; omits time when
 * not explicitly selected (we don't encode default 2020–2024).
 */
export function getMinimalSharePayload(
  selected: SelectedComponents
): MinimalSharePayload {
  const payload: MinimalSharePayload = {};

  if (selected.indicator?.length) {
    payload.indicator = selected.indicator.map((item) => {
      const id = String(item.id);
      if (item.nid != null || (item.unitGid != null && item.unitGid !== "")) {
        return {
          id,
          ...(item.nid != null ? { nid: item.nid } : {}),
          ...(item.unitGid != null && item.unitGid !== ""
            ? { unitGid: item.unitGid }
            : {}),
        };
      }
      return id;
    });
  }
  if (selected.area?.length) {
    payload.area = selected.area.map((item) => String(item.id));
  }
  if (selected.subgroup?.length) {
    const isDefaultOnly =
      selected.subgroup.length === 1 && selected.subgroup[0]?.label === DEFAULT_SUBGROUP;
    if (!isDefaultOnly) {
      payload.subgroup = selected.subgroup.map((item) => String(item.id));
    }
  }
  if (selected.timePeriod?.length) {
    payload.timePeriod = selected.timePeriod.map((t) => ({
      id: String(t.id),
      label: t.label,
      ...(t.nid != null ? { nid: t.nid } : {}),
    }));
  }

  return payload;
}

/**
 * Serializes minimal payload to query string (single param `p` as JSON).
 * Use this for the share URL so we only send what the user selected.
 */
export function sharePayloadToQueryString(payload: MinimalSharePayload): string {
  const keys = Object.keys(payload) as (keyof MinimalSharePayload)[];
  if (keys.length === 0) return "";
  const trimmed: MinimalSharePayload = {};
  for (const k of keys) {
    const v = payload[k];
    if (v != null && (Array.isArray(v) ? v.length > 0 : true)) {
      (trimmed as Record<string, unknown>)[k] = v;
    }
  }
  if (Object.keys(trimmed).length === 0) return "";
  return "p=" + encodeURIComponent(JSON.stringify(trimmed));
}

/**
 * Parses query string (param `p` = JSON) and returns raw MinimalSharePayload, or null.
 */
export function getPayloadFromQuery(searchParams: URLSearchParams): MinimalSharePayload | null {
  const p = searchParams.get("p");
  if (!p) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(p)) as MinimalSharePayload;
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Parses query string (param `p` = JSON minimal payload) and returns SelectedComponents.
 * Merges with defaults: missing sections are left out so the rest of the app can fill defaults.
 */
export function parseSharePayloadFromQuery(
  searchParams: URLSearchParams
): SelectedComponents | null {
  const payload = getPayloadFromQuery(searchParams);
  if (!payload) return null;

  const result: SelectedComponents = {};

  if (payload.indicator?.length) {
    result.indicator = indicatorPayloadToSelectedItems(payload.indicator);
  }
  if (payload.area?.length) {
    result.area = payload.area.map((name) => ({ id: name, label: name }));
  }
  if (payload.subgroup?.length) {
    result.subgroup = payload.subgroup.map((name) => ({ id: name, label: name }));
  }
  if (payload.timePeriod?.length) {
    result.timePeriod = timePeriodPayloadToSelected(payload.timePeriod);
  }

  return Object.keys(result).length > 0 ? result : null;
}

/** Maps payload.timePeriod (objects with id/label/nid or legacy number[]) to SelectedItem[]. */
function timePeriodPayloadToSelected(
  timePeriod: TimePeriodPayloadItem[] | number[]
): { id: string; label: string; nid?: number }[] {
  const first = timePeriod[0];
  if (typeof first === "object" && first !== null && "id" in first) {
    return (timePeriod as TimePeriodPayloadItem[]).map((item) => ({
      id: String(item.id),
      label: item.label ?? String(item.id),
      ...(item.nid != null ? { nid: item.nid } : {}),
    }));
  }
  return (timePeriod as number[]).map((y) => ({ id: String(y), label: String(y) }));
}

/**
 * Converts MinimalSharePayload (e.g. from viz state API) to SelectedComponents for hydration.
 */
export function fetchParamsToSelectedComponents(
  payload: MinimalSharePayload
): SelectedComponents {
  const result: SelectedComponents = {};
  if (payload.indicator?.length) {
    result.indicator = indicatorPayloadToSelectedItems(payload.indicator);
  }
  if (payload.area?.length) {
    result.area = payload.area.map((name) => ({ id: name, label: name }));
  }
  if (payload.subgroup?.length) {
    result.subgroup = payload.subgroup.map((name) => ({ id: name, label: name }));
  }
  if (payload.timePeriod?.length) {
    result.timePeriod = timePeriodPayloadToSelected(payload.timePeriod);
  }
  return result;
}

/** Full state encoded in URL (s=): fetchParams + chartConfig. No server storage. */
export interface ShareStatePayload {
  fetchParams: MinimalSharePayload;
  chartConfig: VisualizationConfig;
}

function isTimePeriodPayloadItem(el: unknown): el is TimePeriodPayloadItem {
  return (
    typeof el === "object" &&
    el !== null &&
    "id" in el &&
    typeof (el as TimePeriodPayloadItem).id !== "undefined"
  );
}

export function isMinimalSharePayload(v: unknown): v is MinimalSharePayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.indicator != null) {
    if (!Array.isArray(o.indicator)) return false;
    for (const el of o.indicator) {
      if (!isMinimalShareIndicatorEntry(el)) return false;
    }
  }
  if (o.area != null && !Array.isArray(o.area)) return false;
  if (o.subgroup != null && !Array.isArray(o.subgroup)) return false;
  if (o.timePeriod != null) {
    if (!Array.isArray(o.timePeriod)) return false;
    const first = o.timePeriod[0];
    if (o.timePeriod.length > 0) {
      if (typeof first === "number") {
        if (!o.timePeriod.every((el): el is number => typeof el === "number")) return false;
      } else if (isTimePeriodPayloadItem(first)) {
        if (!o.timePeriod.every((el) => isTimePeriodPayloadItem(el))) return false;
      } else return false;
    }
  }
  return true;
}

function isChartConfig(v: unknown): v is VisualizationConfig {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    typeof o.chartType === "string" &&
    typeof o.chartColor === "string"
  );
}

/**
 * Encodes fetchParams + chartConfig for use in share/embed URL (s= param).
 * UTF-8-safe base64 then URL-safe (no +, /, =). Client-only (uses btoa).
 */
export function encodeShareState(
  fetchParams: MinimalSharePayload,
  chartConfig: VisualizationConfig
): string {
  const json = JSON.stringify({ fetchParams, chartConfig });
  const base64 = typeof btoa !== "undefined"
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, "utf8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decodes s= param to fetchParams + chartConfig. Returns null on invalid or parse error.
 */
export function decodeShareState(encoded: string): ShareStatePayload | null {
  if (!encoded || typeof encoded !== "string") return null;
  try {
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    const json =
      typeof atob !== "undefined"
        ? decodeURIComponent(escape(atob(base64)))
        : Buffer.from(base64, "base64").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { fetchParams, chartConfig } = parsed as { fetchParams?: unknown; chartConfig?: unknown };
    if (!isMinimalSharePayload(fetchParams) || !(fetchParams.indicator?.length)) return null;
    if (!isChartConfig(chartConfig)) return null;
    return { fetchParams, chartConfig };
  } catch {
    return null;
  }
}

/**
 * Build Data API params from minimal share payload (for embed route).
 * Uses the same `buildDataApiParams` path as the main visualizer (composite indicator ids, u_identifier, nids).
 */
export function payloadToDataApiParams(
  payload: MinimalSharePayload,
  locale?: string,
  defaultAreaWhenUnset?: string
): DataApiParams {
  const selected = fetchParamsToSelectedComponents(payload);
  const f = selectedComponentsToFilters(selected);
  const params = buildDataApiParams(f, selected, {});
  if (locale) params.locale = locale;
  const trimmedDefault = defaultAreaWhenUnset?.trim();
  if (selected.area == null && trimmedDefault) {
    params.ar_identifier = trimmedDefault;
  }
  return params;
}
