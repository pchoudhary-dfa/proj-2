/**
 * Export metadata — supports both legacy (single indicator) and multi-dimensional modes.
 *
 * mode="legacy": I=1, S=1, A=1, T>0 — backward-compatible header block.
 * mode="multi":  any of I,S,A > 1  — descriptor columns (Indicator, Subgroup, Area) + time columns.
 */

export interface ExportIndicatorInfo {
  name: string;
  code: string;
  unit: string;
}

export interface ExportMeta {
  mode: "legacy" | "multi";
  /** Present in both modes; in "multi" lists every indicator in the data. */
  indicators: ExportIndicatorInfo[];
  timeStart: number | null;
  timeEnd: number | null;
  areas: string[];
  subgroups: string[];
  exportedAt: string; // ISO 8601

  // --- Legacy-only convenience fields (populated when mode="legacy") ---
  indicatorName: string;
  indicatorCode: string;
  unit: string;
}

/**
 * Table-shaped payload for CSV/XLSX/JSON export.
 *
 * Legacy:  headers = ["Region", ...timePeriods]; rows = [area, ...values]
 * Multi:   headers = ["Indicator", "Subgroup", "Area", ...timePeriods]; rows = [ind, sg, area, ...values]
 */
export interface ExportPayload {
  meta: ExportMeta;
  headers: string[];
  rows: (string | number)[][];
}

/**
 * One data row as an object (headers as keys). Used for JSON export.
 */
export type ExportDataRow = Record<string, string | number | null>;
