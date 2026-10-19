import type { Indicator } from "@/lib/visualizer/types";
import type { IndicatorDetailItem } from "@/lib/api/reference";

/**
 * Maps reference API indicator detail to the visualizer Indicator type (for metadata, share, etc.).
 * Supports both internal and external (ADAPTATION=external) response keys.
 */
export function apiIndicatorToIndicator(raw: IndicatorDetailItem): Indicator {
  const id = raw.indicator_gid ?? raw.i_gid ?? String(raw.indicator_nid ?? raw.i_nid ?? "");
  const name = raw.indicator_name ?? raw.i_name ?? "";
  const description = raw.indicator_info ?? (raw as { i_description?: string }).i_description ?? "";
  return {
    id,
    name,
    code: raw.short_name ?? id,
    description,
    defaultTimeStart: 2020,
    defaultTimeEnd: 2024,
    defaultArea: "",
    defaultSubgroup: "",
    unit: "",
    source: "",
    frequency: "",
    tags: [],
    aliases: [],
    definition: description,
    disaggregation: "",
    methodOfComputation: "",
  };
}
