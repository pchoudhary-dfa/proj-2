/**
 * Maps reference API indicator list rows to Data Manager `Indicator` (internal keys).
 * Same role as dfa-toolkit-app-visualizer `visualizer/indicatorAdapter.ts` for list/detail.
 */

import type { IndicatorListItem } from "@/lib/api/types";
import type { Indicator } from "@/lib/api/types";

export function normalizeIndicator(raw: IndicatorListItem): Indicator {
  return {
    indicator_nid: raw.indicator_nid ?? raw.i_nid ?? 0,
    indicator_name: raw.indicator_name ?? raw.i_name ?? null,
    indicator_gid: raw.indicator_gid ?? raw.i_gid ?? null,
    highisgood: raw.highisgood ?? raw.i_high_is_good ?? false,
    data_exist: raw.data_exist ?? raw.i_has_data ?? false,
    unit_gid: raw.unit_gid ?? raw.u_gid ?? null,
    s_gid: raw.s_gid ?? null,
    indicator_order: raw.indicator_order ?? null,
  };
}
