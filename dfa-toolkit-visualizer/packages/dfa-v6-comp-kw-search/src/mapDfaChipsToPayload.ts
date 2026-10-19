import type { DfaPayload, Keyword } from "./types";

/**
 * Opinionated DFA Toolkit mapping: chips -> visualizer payload.
 * Kept framework-agnostic so React/Vue/vanilla integrations share one mapping.
 */
export function mapDfaChipsToPayload(chips: Keyword[]): DfaPayload {
  const out: DfaPayload = {
    indicator_id: null,
    area_id: null,
    time_period_id: null,
    subgroup_id: null,
  };

  const list = Array.isArray(chips) ? chips : [];
  for (const c of list) {
    const t = String((c && c.keywordType) || "").toUpperCase();
    const id = Number(c && c.keywordId);
    if (Number.isNaN(id)) continue;

    if (t === "INDICATOR") out.indicator_id = id;
    else if (t === "AREA") out.area_id = id;
    else if (t === "TIME PERIOD" || t === "TIME_PERIOD") out.time_period_id = id;
    else if (t === "SUBGROUP") out.subgroup_id = id;
  }

  return out;
}
