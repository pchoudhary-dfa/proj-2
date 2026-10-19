/**
 * Computes time range (for gallery payload) from selected time periods.
 * Supports calendar year (2012), financial year (2012-2013), and quarterly (Q1.2012).
 */

import {
  parseYearFromTimePeriod,
  parseTimePeriodYearBounds,
} from "@/lib/visualizer/dataApiAdapter";
import type { SelectedItem } from "@/lib/visualizer/types";

export interface TimeRangeFromSelection {
  /** First time period ID (number if plain year, else string). */
  timeStart: number | string;
  /** Last time period ID (number if plain year, else string). */
  timeEnd: number | string;
  /** Min year derived from all period IDs (for indicator.defaultTimeStart). */
  defaultTimeStart: number;
  /** Max year derived from all period IDs (for indicator.defaultTimeEnd). */
  defaultTimeEnd: number;
}

function isPlainYear(id: string): boolean {
  const n = parseInt(id, 10);
  return id !== "" && String(n) === id && n >= 1900 && n <= 2100;
}

/**
 * Returns time range from selected time periods for gallery save.
 * Orders by parsed year then by id string; returns first/last id and numeric min/max year.
 */
export function getTimeRangeFromSelection(
  timePeriod: SelectedItem[] | undefined
): TimeRangeFromSelection | null {
  if (!timePeriod?.length) return null;

  const sorted = [...timePeriod].sort((a, b) => {
    const yA = parseYearFromTimePeriod(String(a.id));
    const yB = parseYearFromTimePeriod(String(b.id));
    if (yA !== yB) return yA - yB;
    return String(a.id).localeCompare(String(b.id));
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;

  const bounds = sorted.map((p) => parseTimePeriodYearBounds(String(p.id)));
  const minYear = Math.min(...bounds.map((b) => b.startYear));
  const maxYear = Math.max(...bounds.map((b) => b.endYear));

  const timeStart: number | string = isPlainYear(String(first.id))
    ? parseInt(String(first.id), 10)
    : first.id;
  const timeEnd: number | string = isPlainYear(String(last.id))
    ? parseInt(String(last.id), 10)
    : last.id;

  return {
    timeStart,
    timeEnd,
    defaultTimeStart: minYear,
    defaultTimeEnd: maxYear,
  };
}
