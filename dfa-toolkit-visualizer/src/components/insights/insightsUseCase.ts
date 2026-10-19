 /**
 * Resolves the insights use case (UC0-UC10) based on data dimensions.
 * Based on the decision tree from insightsFrontend.md (lines 86-99).
 */

import type { VisualizerDataResponse } from "@/lib/visualizer/types";

/**
 * Resolves the insights use case based on API response dimensions.
 * 
 * @param apiResponse - The visualizer data response containing rows and cardinality
 * @returns Use case string (UC0-UC10)
 * 
 * Decision tree order (must be exact):
 * 1. UC8: Single data point (all counts = 1)
 * 2. UC6: Multi-indicator + multi-subgroup + multi-time + single-area
 * 3. UC7: Multi-indicator + multi-subgroup + single-time + multi-area
 * 4. UC5: Multi-indicator + multi-subgroup + single-time + single-area
 * 5. UC10: Single-indicator + multi-subgroup + single-time + multi-area
 * 6. UC9: Single-indicator + single-subgroup + multi-time + multi-area
 * 7. UC4: Single-indicator + single-subgroup + single-time + multi-area
 * 8. UC3: Single-indicator + multi-subgroup + single-time + single-area
 * 9. UC2: Single-indicator + multi-subgroup + multi-time + single-area
 * 10. UC1: Single-indicator + single-subgroup + multi-time + single-area
 * 11. UC0: Fallback for any other case
 */
export function resolveInsightsUseCase(apiResponse: VisualizerDataResponse | null): string {
  // Return UC0 if no data
  if (!apiResponse || !apiResponse.rows || apiResponse.rows.length === 0) {
    return "UC0";
  }

  // Try to use cardinality if available (more efficient)
  let indicatorCount: number;
  let subgroupCount: number;
  let timePeriodCount: number;
  let areaCount: number;

  if (apiResponse.cardinality) {
    indicatorCount = apiResponse.cardinality.indicators;
    subgroupCount = apiResponse.cardinality.subgroups;
    timePeriodCount = apiResponse.cardinality.timePeriods;
    areaCount = apiResponse.cardinality.areas;
  } else {
    // Count distinct values from rows
    const indicators = new Set<string>();
    const subgroups = new Set<string>();
    const timePeriods = new Set<string>();
    const areas = new Set<string>();

    for (const row of apiResponse.rows) {
      if (row.indicatorId) indicators.add(row.indicatorId);
      if (row.subgroupId) subgroups.add(row.subgroupId);
      if (row.timePeriodId) timePeriods.add(row.timePeriodId);
      if (row.areaId) areas.add(row.areaId);
    }

    indicatorCount = indicators.size;
    subgroupCount = subgroups.size;
    timePeriodCount = timePeriods.size;
    areaCount = areas.size;
  }

  // Ensure minimum count of 1 for each dimension
  indicatorCount = Math.max(1, indicatorCount);
  subgroupCount = Math.max(1, subgroupCount);
  timePeriodCount = Math.max(1, timePeriodCount);
  areaCount = Math.max(1, areaCount);

  // Create boolean flags for readability
  const multiInd = indicatorCount >= 2;
  const multiSub = subgroupCount >= 2;
  const multiTime = timePeriodCount >= 2;
  const multiArea = areaCount >= 2;
  const singlePoint = indicatorCount <= 1 && subgroupCount <= 1 && timePeriodCount <= 1 && areaCount <= 1;

  // Apply decision tree in exact order (from insightsFrontend.md lines 86-99)
  
  // UC8: Single data point
  if (singlePoint) {
    return "UC8";
  }

  // UC6: Multi-indicator + multi-subgroup + multi-time + single-area
  if (multiInd && multiSub && multiTime && !multiArea) {
    return "UC6";
  }

  // UC7: Multi-indicator + multi-subgroup + single-time + multi-area
  if (multiInd && multiSub && !multiTime && multiArea) {
    return "UC7";
  }

  // UC5: Multi-indicator + multi-subgroup + single-time + single-area
  if (multiInd && multiSub && !multiTime && !multiArea) {
    return "UC5";
  }

  // UC10: Single-indicator + multi-subgroup + single-time + multi-area
  if (!multiInd && multiSub && !multiTime && multiArea) {
    return "UC10";
  }

  // UC9: Single-indicator + single-subgroup + multi-time + multi-area
  if (!multiInd && !multiSub && multiTime && multiArea) {
    return "UC9";
  }

  // UC4: Single-indicator + single-subgroup + single-time + multi-area
  if (!multiInd && !multiSub && !multiTime && multiArea) {
    return "UC4";
  }

  // UC3: Single-indicator + multi-subgroup + single-time + single-area
  if (!multiInd && multiSub && !multiTime && !multiArea) {
    return "UC3";
  }

  // UC2: Single-indicator + multi-subgroup + multi-time + single-area
  if (!multiInd && multiSub && multiTime && !multiArea) {
    return "UC2";
  }

  // UC1: Single-indicator + single-subgroup + multi-time + single-area
  if (!multiInd && !multiSub && multiTime && !multiArea) {
    return "UC1";
  }

  // UC0: Fallback for any other case
  return "UC0";
}
