/**
 * Shared Data API param builder. Single source of truth for building
 * GET /dw/{id}/reports/data/published/full query params from FilterValues +
 * SelectedComponents. Used by the visualizer page and by the gallery when
 * item.selectedComponents is present, so the same chart yields the same URL in both places.
 */

import type { DataApiParams } from "@/lib/api/data";
import { API_QUERY_DEFAULTS } from "@/lib/constants";
import type { FilterValues, SelectedComponents } from "./types";

export interface BuildDataApiParamsOptions {
  /** Optional resolver to get indicator nid from id (e.g. from options cache). Used by visualizer when selected items lack nid. */
  indicatorNidResolver?: (id: string) => number | undefined;
}

/**
 * Builds Data API params from filter values and selected components.
 * Prefers nid when available (shorter URLs); falls back to id/gid with numeric detection.
 */
export function buildDataApiParams(
  f: FilterValues,
  selected: SelectedComponents,
  options: BuildDataApiParamsOptions = {}
): DataApiParams {
  const tpIds =
    selected.timePeriod?.length
      ? selected.timePeriod.map((t) => String(t.id))
      : f.selectedYears && f.selectedYears.length > 0
        ? f.selectedYears.map(String)
        : [];

  const indicatorIds = f.indicator?.length ? f.indicator.map(String) : [];
  const areaIds = selected.area?.length ? selected.area.map((a) => String(a.id)) : [];
  const subgroupIds = selected.subgroup?.length ? selected.subgroup.map((s) => String(s.id)) : [];

  const params: DataApiParams = {
    ...API_QUERY_DEFAULTS.DATA_API,
  };

  if (selected.indicator?.length) {
    const resolver = options.indicatorNidResolver;

    // Build per-item resolved nid + base GID in one pass
    const resolved = selected.indicator.map((item) => {
      const itemId = String(item.id);
      const nid = (resolver ? (resolver(itemId) ?? item.nid) : item.nid) ?? undefined;
      // Strip unit suffix from composite id (format: baseGid_unitGid).
      // Only strip when unitGid is explicitly known to avoid cutting real GID characters.
      const ug = item.unitGid;
      const baseGid = (ug && itemId.endsWith(`_${ug}`))
        ? itemId.slice(0, itemId.length - ug.length - 1)
        : itemId;
      return { nid, baseGid, unitGid: ug };
    });

    const allHaveNid = resolved.every((r) => r.nid != null);
    if (allHaveNid) {
      params.i_identifier = resolved.map((r) => String(r.nid)).join(",");
    } else {
      params.i_identifier = resolved.map((r) => r.baseGid).join(",");
    }

    // Add unit identifiers if available in selected items
    const unitGids = resolved
      .map((r) => r.unitGid)
      .filter((gid): gid is string => gid != null && gid !== "");

    if (unitGids.length > 0 && unitGids.length === resolved.length) {
      params.u_identifier = unitGids.join(",");
    }
  }

  if (selected.area?.length) {
    const nids = selected.area.map((a) => a.nid).filter((n): n is number => n != null);
    if (nids.length === selected.area.length) {
      params.ar_identifier = nids.join(",");
    } else if (areaIds.length > 0) {
      params.ar_identifier = areaIds.join(",");
    }
  }

  if (selected.subgroup?.length) {
    const nids = selected.subgroup.map((s) => s.nid).filter((n): n is number => n != null);
    if (nids.length === selected.subgroup.length) {
      params.sg_identifier = nids.join(",");
    } else if (subgroupIds.length > 0) {
      params.sg_identifier = subgroupIds.join(",");
    }
  }

  if (tpIds.length > 0 && selected.timePeriod?.length) {
    const tpNids = selected.timePeriod.map((t) => t.nid).filter((n): n is number => n != null);
    if (tpNids.length === selected.timePeriod.length) {
      params.tp_nid = tpNids;
    } else {
      params.tp_timeperiod = selected.timePeriod.map((t) => t.label || String(t.id));
    }
  } else if (tpIds.length > 0) {
    params.tp_timeperiod = tpIds;
  }

  return params;
}
