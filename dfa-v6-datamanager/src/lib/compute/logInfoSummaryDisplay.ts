import type { ComputeLogInfo } from "@/lib/api/computeExecutionLogs";
import { formatCompositeIusDisplayLabel } from "@/lib/compute/logDetailRows";

const IUS_DELIMITER = "{||}";

function filterObject(logInfo: ComputeLogInfo): Record<string, unknown> | null {
  const raw =
    logInfo.filter_object ??
    logInfo.execution_filter_object ??
    logInfo.process_filter_object;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function areasFromFilter(fo: Record<string, unknown>): string[] {
  const legacy = fo.areaUnderName ?? fo.areas_name;
  if (Array.isArray(legacy)) {
    return legacy.map((x) => String(x).trim()).filter(Boolean);
  }
  if (fo.areaUnder === "all" || legacy === "all") return ["all"];
  const areas = fo.areas;
  if (areas === "all") return ["all"];
  if (!Array.isArray(areas)) return [];
  const tokens = areas.map((x) => String(x).trim()).filter(Boolean);
  if (tokens.length === 1 && tokens[0].toLowerCase() === "all") return ["all"];
  return tokens;
}

function targetIusFromFilter(fo: Record<string, unknown>): string[] {
  if (fo.targetIUS === "all" || fo.target_ius === "all") return ["all"];
  const raw = fo.targetIUSName ?? fo.target_ius_name;
  if (typeof raw === "string" && raw.trim()) {
    if (raw.includes(IUS_DELIMITER)) {
      return raw.split(IUS_DELIMITER).map((s) => s.trim()).filter(Boolean);
    }
    return [raw.trim()];
  }
  const sel = fo.ius_selection;
  if (!sel || typeof sel !== "object" || Array.isArray(sel)) return [];
  const ti = (sel as Record<string, unknown>).target_ius;
  if (ti === "all") return ["all"];
  if (Array.isArray(ti)) {
    const gids = ti.map((x) => String(x).trim()).filter(Boolean);
    if (gids.length === 1 && gids[0].toLowerCase() === "all") return ["all"];
    return gids;
  }
  if (typeof ti === "string" && ti.trim()) return [ti.trim()];
  return [];
}

/** Split API joined display strings on `", "` (area/time labels from server). */
function splitJoinedDisplay(display: string): string[] {
  const trimmed = display.trim();
  if (!trimmed) return [];
  if (!trimmed.includes(", ")) return [trimmed];
  const parts = trimmed.split(", ").map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [trimmed];
}

export type AreaNameResolver = ReadonlyMap<string, string>;

function resolveAreaLabel(
  token: string,
  t: (code: string, fallback?: string) => string,
  areaNameByKey?: AreaNameResolver
): string {
  const key = token.trim();
  if (!key) return "";
  if (key.toLowerCase() === "all") return t("ALL", "All");
  const resolved = areaNameByKey?.get(key)?.trim();
  return resolved || key;
}

function areasItemsFromDisplay(
  display: string,
  t: (code: string, fallback?: string) => string,
  areaNameByKey?: AreaNameResolver
): string[] {
  const trimmed = display.trim();
  if (!trimmed) return [];
  if (trimmed.toLowerCase() === "all") return [t("ALL", "All")];
  return splitJoinedDisplay(trimmed).map((a) =>
    resolveAreaLabel(a, t, areaNameByKey)
  );
}

function timeperiodsFromFilter(fo: Record<string, unknown>): string[] {
  const names = fo.timeperiods_name ?? fo.timeperiodNames;
  if (Array.isArray(names)) {
    return names.map((x) => String(x).trim()).filter(Boolean);
  }
  const tp = fo.timeperiods;
  if (tp === "all") return ["all"];
  if (!Array.isArray(tp)) return [];
  const tokens = tp.map((x) => String(x).trim()).filter(Boolean);
  if (tokens.length === 1 && tokens[0].toLowerCase() === "all") return ["all"];
  return tokens;
}

function timeItemsFromDisplay(
  display: string,
  t: (code: string, fallback?: string) => string
): string[] {
  const trimmed = display.trim();
  if (!trimmed) return [];
  if (trimmed.toLowerCase() === "all") return [t("ALL", "All")];
  return splitJoinedDisplay(trimmed).map((tp) => normalizeAllLabel(tp, t));
}

function formatTargetIusToken(token: string): string {
  const s = token.trim();
  if (!s) return s;
  if (s.toLowerCase() === "all") return "All";
  return formatCompositeIusDisplayLabel(s);
}

/** Multiple target composites are joined in API responses as ``{||} `` between entries. */
function targetIusItemsFromDisplay(display: string): string[] {
  const trimmed = display.trim();
  if (!trimmed) return [];
  if (trimmed === "all") return ["All"];
  if (trimmed.includes(`${IUS_DELIMITER} `)) {
    const chunks = trimmed
      .split(`${IUS_DELIMITER} `)
      .map((s) => s.trim())
      .filter(Boolean);
    if (chunks.length > 1) {
      return chunks.map(formatTargetIusToken);
    }
  }
  return [formatTargetIusToken(trimmed)];
}

export function formatLogAreasDisplay(
  logInfo: ComputeLogInfo,
  t: (code: string, fallback?: string) => string,
  areaNameByKey?: AreaNameResolver
): string {
  const items = logAreaListItems(logInfo, t, areaNameByKey);
  if (items.length === 0) return "—";
  if (items.length === 1) return items[0]!;
  return items.join(", ");
}

function normalizeAllLabel(
  token: string,
  t: (code: string, fallback?: string) => string
): string {
  if (token.toLowerCase() === "all") return t("ALL", "All");
  return token;
}

export type LogAreaListEntry = {
  /** Area id or gid from the log filter. */
  key: string;
  /** Resolved display name. */
  name: string;
};

function toAreaListEntry(
  key: string,
  t: (code: string, fallback?: string) => string,
  areaNameByKey?: AreaNameResolver
): LogAreaListEntry {
  const trimmed = key.trim();
  if (!trimmed) return { key: "", name: "" };
  if (trimmed.toLowerCase() === "all") {
    return { key: trimmed, name: t("ALL", "All") };
  }
  const name = resolveAreaLabel(trimmed, t, areaNameByKey);
  return { key: trimmed, name };
}

/** One row per area (id + name) for summary lists and modals. */
export function logAreaListEntries(
  logInfo: ComputeLogInfo,
  t: (code: string, fallback?: string) => string,
  areaNameByKey?: AreaNameResolver
): LogAreaListEntry[] {
  const fo = filterObject(logInfo);
  if (fo) {
    const legacy = fo.areaUnderName ?? fo.areas_name;
    if (Array.isArray(legacy)) {
      const named = legacy.map((x) => String(x).trim()).filter(Boolean);
      if (named.length > 0) {
        return named.map((a) => {
          const label = normalizeAllLabel(a, t);
          return { key: a, name: label };
        });
      }
    }
  }
  const areas = logInfo.areas ?? [];
  if (areas.length > 0) {
    return areas
      .map((a) => toAreaListEntry(String(a), t, areaNameByKey))
      .filter((e) => e.name);
  }
  if (fo) {
    const fromFilter = areasFromFilter(fo);
    if (fromFilter.length > 0) {
      return fromFilter
        .map((a) => toAreaListEntry(a, t, areaNameByKey))
        .filter((e) => e.name);
    }
  }
  const display = logInfo.areas_display?.trim();
  if (display) {
    const trimmed = display.trim();
    if (trimmed.toLowerCase() === "all") {
      return [{ key: "all", name: t("ALL", "All") }];
    }
    const keys = splitJoinedDisplay(trimmed);
    if (keys.length > 0) {
      return keys
        .map((k) => toAreaListEntry(k, t, areaNameByKey))
        .filter((e) => e.name);
    }
  }
  return [];
}

/** Display names only (summary table inline list). */
export function logAreaListItems(
  logInfo: ComputeLogInfo,
  t: (code: string, fallback?: string) => string,
  areaNameByKey?: AreaNameResolver
): string[] {
  return logAreaListEntries(logInfo, t, areaNameByKey).map((e) => e.name);
}

/** One row per time period for summary lists. */
export function logTimeListItems(
  logInfo: ComputeLogInfo,
  t: (code: string, fallback?: string) => string
): string[] {
  const names = logInfo.timeperiods_name ?? [];
  if (names.length > 0) {
    return names.map((tp) => String(tp).trim()).filter(Boolean);
  }
  const tokens = logInfo.timeperiods ?? [];
  if (tokens.length > 0) {
    if (tokens.length === 1 && tokens[0] === "all") {
      return [t("ALL", "All")];
    }
    return tokens.map((tp) => String(tp).trim()).filter(Boolean);
  }
  const fo = filterObject(logInfo);
  if (fo) {
    const fromFilter = timeperiodsFromFilter(fo);
    if (fromFilter.length > 0) {
      return fromFilter.map((tp) => normalizeAllLabel(tp, t));
    }
  }
  const display = logInfo.timeperiods_display?.trim();
  if (display) {
    const fromDisplay = timeItemsFromDisplay(display, t);
    if (fromDisplay.length > 0) return fromDisplay;
  }
  return [];
}

export function formatLogTimeperiodsDisplay(
  logInfo: ComputeLogInfo,
  t: (code: string, fallback?: string) => string
): string {
  const items = logTimeListItems(logInfo, t);
  if (items.length === 0) return "—";
  if (items.length === 1) return items[0]!;
  return items.join(", ");
}

/** One row per target IUS for summary lists (avoids splitting on ``{||}`` inside labels). */
export function logTargetIusListItems(logInfo: ComputeLogInfo): string[] {
  const list = logInfo.target_ius ?? [];
  if (list.length > 0) {
    return list.map((x) => formatTargetIusToken(String(x)));
  }
  const display = logInfo.target_ius_display?.trim();
  if (display) {
    return targetIusItemsFromDisplay(display);
  }
  const fo = filterObject(logInfo);
  if (fo) {
    const fromFilter = targetIusFromFilter(fo);
    if (fromFilter.length > 0) {
      return fromFilter.map((x) => formatTargetIusToken(x));
    }
  }
  const text = formatLogTargetIusDisplay(logInfo);
  if (text === "—") return [];
  return [text];
}

export function formatLogTargetIusDisplay(logInfo: ComputeLogInfo): string {
  const items = logTargetIusListItems(logInfo);
  if (items.length === 0) return "—";
  if (items.length === 1) return items[0]!;
  return items.join(", ");
}

export { IUS_DELIMITER as LOG_INFO_IUS_DELIMITER };
