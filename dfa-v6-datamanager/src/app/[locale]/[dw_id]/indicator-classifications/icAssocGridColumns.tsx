"use client";

import type { RefObject } from "react";
import { useMemo } from "react";
import type { EditableGridColumnDef } from "@/components/TableView";

export type IcAssocTab = "ius" | "iu";

export type IcAssocGridRow = {
  id: string;
  indicator: string;
  unit: string;
  subgroup: string;
};

export function icAssocRowId(row: IcAssocGridRow): string {
  return row.id;
}

export type UseIcAssocGridColumnsParams = {
  assocTab: IcAssocTab;
  headerSelectAllRef: RefObject<HTMLInputElement | null>;
  allPageRowsSelected: boolean;
  mappingDisabled: boolean;
  mappingDisabledTitle: string;
  toggleAll: () => void;
  filterIndicator: string;
  setFilterIndicator: (v: string) => void;
  filterUnit: string;
  setFilterUnit: (v: string) => void;
  filterSubgroup: string;
  setFilterSubgroup: (v: string) => void;
  checked: Set<string>;
  toggleCheck: (id: string) => void;
  t: (code: string, fallback?: string) => string;
};

export function useIcAssocGridColumns(
  p: UseIcAssocGridColumnsParams
): EditableGridColumnDef<IcAssocGridRow>[] {
  return useMemo((): EditableGridColumnDef<IcAssocGridRow>[] => {
    return [
      {
        id: "select",
        layout: { width: 1 },
        header: {
          kind: "selectAll",
          inputRef: p.headerSelectAllRef,
          checked: p.allPageRowsSelected,
          disabled: p.mappingDisabled,
          onChange: p.toggleAll,
          title: p.mappingDisabled ? p.mappingDisabledTitle : undefined,
          ariaLabel: "Select all on this page",
        },
        filter: null,
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="checkbox-comp"
            checked={p.checked.has(row.id)}
            disabled={p.mappingDisabled}
            onChange={() => p.toggleCheck(row.id)}
            title={p.mappingDisabled ? p.mappingDisabledTitle : undefined}
            aria-label={`Select ${row.indicator}`}
          />
        ),
      },
      {
        id: "indicator",
        layout: { width: 5, unit: "%", sticky: true, main: true },
        header: p.t("INDICATORS", "Indicators"),
        filter: {
          kind: "search",
          value: p.filterIndicator,
          onChange: p.setFilterIndicator,
          placeholder: p.t("SEARCH_PLACEHOLDER", "Search…"),
          ariaLabel: p.t("FILTER_BY_INDICATOR", "Filter by indicator"),
        },
        cell: ({ row }) => <span className="break-words">{row.indicator}</span>,
      },
      {
        id: "unit",
        layout: { width: 10, unit: "%" },
        header: p.t("UNITS", "Units"),
        filter: {
          kind: "search",
          value: p.filterUnit,
          onChange: p.setFilterUnit,
          placeholder: p.t("SEARCH_PLACEHOLDER", "Search…"),
          ariaLabel: p.t("FILTER_BY_UNIT", "Filter by unit"),
        },
        cell: ({ row }) => row.unit,
      },
      {
        id: "subgroup",
        layout: { width: 30, unit: "%" },
        header: p.assocTab === "ius" ? p.t("SUBGROUPS", "Subgroups") : "",
        filter:
          p.assocTab === "ius"
            ? {
                kind: "search",
                value: p.filterSubgroup,
                onChange: p.setFilterSubgroup,
                placeholder: p.t("SEARCH_PLACEHOLDER", "Search…"),
                ariaLabel: p.t("FILTER_BY_SUBGROUP_NAME", "Filter by subgroup"),
              }
            : null,
        cell: ({ row }) => row.subgroup,
      },
    ];
  }, [
    p.assocTab,
    p.headerSelectAllRef,
    p.allPageRowsSelected,
    p.mappingDisabled,
    p.mappingDisabledTitle,
    p.toggleAll,
    p.filterIndicator,
    p.setFilterIndicator,
    p.filterUnit,
    p.setFilterUnit,
    p.filterSubgroup,
    p.setFilterSubgroup,
    p.checked,
    p.toggleCheck,
  ]);
}
