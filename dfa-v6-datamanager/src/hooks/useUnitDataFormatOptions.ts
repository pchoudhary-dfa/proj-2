"use client";

import { useMemo } from "react";
import { useAppConfig } from "@/contexts/AppConfigContext";
import {
  buildUnitFormatSelectOptions,
  getUnitDataFormatCatalogFromConfig,
  type UnitDataFormatCatalog,
  type UnitFormatSelectOption,
} from "@/lib/unitDataFormatCatalog";

export type UseUnitDataFormatOptionsParams = {
  /** Codes to keep in the edit dropdown (e.g. the row being edited). */
  editLegacyValues?: string[];
  /** Codes to keep resolvable for read-only labels in the grid. */
  displayLegacyValues?: string[];
};

export type UseUnitDataFormatOptionsResult = {
  catalog: UnitDataFormatCatalog;
  filterOptions: UnitFormatSelectOption[];
  editOptions: UnitFormatSelectOption[];
  /** Options for filter + display lookup (no empty / all row). */
  displayOptions: UnitFormatSelectOption[];
};

export function useUnitDataFormatOptions(
  t: (code: string, fallback?: string) => string,
  params: UseUnitDataFormatOptionsParams = {}
): UseUnitDataFormatOptionsResult {
  const { config } = useAppConfig();
  const editLegacyValues = params.editLegacyValues;
  const displayLegacyValues = params.displayLegacyValues;

  return useMemo(() => {
    const catalog = getUnitDataFormatCatalogFromConfig(config);
    const displayOptions = buildUnitFormatSelectOptions(catalog, t, {
      legacyValues: displayLegacyValues,
    });
    return {
      catalog,
      filterOptions: buildUnitFormatSelectOptions(catalog, t, {
        includeAll: true,
        allLabel: t("ALL"),
      }),
      editOptions: buildUnitFormatSelectOptions(catalog, t, {
        includeEmpty: true,
        emptyLabel: t("NONE", "—"),
        legacyValues: editLegacyValues,
      }),
      displayOptions,
    };
  }, [config, t, editLegacyValues, displayLegacyValues]);
}
