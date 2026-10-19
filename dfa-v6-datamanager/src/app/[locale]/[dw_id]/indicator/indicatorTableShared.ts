import type { Indicator } from "@/lib/api/types";

export type InlineEditModel = {
  rowId: string;
  indicatorNid: number;
  originalUnitGid: string | null;
  originalDefaultSg: string | null;
  originalSgGids: string[];
  name: string;
  unitGid: string | null;
  subgroupGid: string | null;
  highIsGood: boolean;
  unitSearch: string;
  subgroupSearch: string;
  unitDdOpen: boolean;
  subgroupDdOpen: boolean;
  unitHi: number;
  subgroupHi: number;
  /** Subgroups are only editable in Configure; grid inline edit keeps this false. */
  subgroupEditable: boolean;
};

export type InlineEditFocusField = "name" | "unit" | "subgroup" | "high";

export type IndicatorTableRow = {
  indicator: Indicator;
  unitGid: string | null;
  defaultSgGid: string | null;
  sgGids: string[];
  rowId: string;
};
