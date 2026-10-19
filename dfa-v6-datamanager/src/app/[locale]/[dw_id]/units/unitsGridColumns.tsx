"use client";

// Column definitions for the Units data grid (checkboxes, unit name, GID, actions).

import type { RefObject } from "react";
import { useMemo } from "react";
import type { UnitRaw } from "@/lib/api/types";
import { GridInlineSaveCancelActions } from "@/components/GridInlineSaveCancelActions";
import { gridTextFieldClassName } from "@/components/TextField";
import {
  resolveUnitFormatLabel,
  unitFormatOptionsToComboboxOptions,
  type UnitFormatSelectOption,
} from "@/lib/unitDataFormatCatalog";
import { ICON_ACTION_COLUMN_LAYOUT } from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  type EditableGridColumnDef,
} from "@/components/TableView";

function getUnitGid(u: UnitRaw): string | null {
  return u.unit_gid ?? u.u_gid ?? null;
}

// Stable string ID for one unit row (GID if present, else a fallback from node id).
export function unitRowId(row: UnitRaw): string {
  const g = getUnitGid(row);
  if (g) return g;
  const nid = row.unit_nid ?? row.u_nid;
  if (nid != null) return `nid-${nid}`;
  return "";
}

// Everything the grid columns need from the parent page: selection, filters, sort, delete.
export type UseUnitsGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  allRowsSelected: boolean;
  selectedRowIds: Set<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  colFilterUnit: string;
  setColFilterUnit: (v: string) => void;
  colFilterGid: string;
  setColFilterGid: (v: string) => void;
  colFilterFormat: string;
  setColFilterFormat: (v: string) => void;
  onSortUnit: () => void;
  onSortGid: () => void;
  unitSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  gidSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  editingRowId: string | null;
  inlineName: string;
  setInlineName: (v: string) => void;
  inlineNameInputRef: RefObject<HTMLInputElement | null>;
  inlineGid: string;
  setInlineGid: (v: string) => void;
  inlineGidInputRef: RefObject<HTMLInputElement | null>;
  inlineFormat: string;
  setInlineFormat: (v: string) => void;
  inlineFormatSearch: string;
  setInlineFormatSearch: (v: string) => void;
  inlineFormatDdOpen: boolean;
  setInlineFormatDdOpen: (v: boolean) => void;
  inlineFormatHi: number;
  setInlineFormatHi: (v: number) => void;
  inlineFormatInputRef: RefObject<HTMLInputElement | null>;
  filteredInlineFormatOptions: UnitFormatSelectOption[];
  formatFilterOptions: UnitFormatSelectOption[];
  formatEditOptions: UnitFormatSelectOption[];
  formatDisplayOptions: UnitFormatSelectOption[];
  inlineSaveLoading: boolean;
  onStartInlineEdit: (row: UnitRaw, focus?: "name" | "gid" | "format") => void;
  onInlineSave: () => void;
  onInlineCancel: () => void;
};

// Builds the list of table columns; memoized so the grid does not re-render needlessly.
export function useUnitsGridColumns(
  p: UseUnitsGridColumnsParams
): EditableGridColumnDef<UnitRaw>[] {
  const { t } = p;
  const inlineFormatComboOptions = useMemo(
    () => unitFormatOptionsToComboboxOptions(p.filteredInlineFormatOptions),
    [p.filteredInlineFormatOptions]
  );
  const inlineFormatNavCount = inlineFormatComboOptions.length;

  return useMemo((): EditableGridColumnDef<UnitRaw>[] => {
    return [
      {
        id: "select",
        layout: { width: 1},
        header: {
          kind: "selectAll",
          checked: p.allRowsSelected,
          onChange: p.selectAll,
          ariaLabel: t("SELECT_ALL"),
        },
        filter: null,
        cell: ({ row }) => {
          const id = unitRowId(row);
          return (
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={id ? p.selectedRowIds.has(id) : false}
              onChange={() => id && p.toggleSelect(id)}
              aria-label={t("SELECT_UNIT").replace(
                "{id}",
                id || "row"
              )}
            />
          );
        },
      },
      {
        id: "unit",
        layout: { width: 5, minWidth: 120, sticky: true, main: true },
        header: {
          kind: "sort",
          text: t("UNITS"),
          onSort: p.onSortUnit,
          sortIcon: p.unitSortIcon,
          sortAriaLabel: t("SORT_BY_UNIT"),
        },
        filter: {
          kind: "search",
          value: p.colFilterUnit,
          onChange: p.setColFilterUnit,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_UNIT"),
        },
        onCellDoubleClick: ({ row }) => p.onStartInlineEdit(row, "name"),
        viewCell: ({ row }) => (
          <span className="cell-name">
            {(row.unit_name ?? row.u_name ?? "—") || "—"}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineName,
          onChange: p.setInlineName,
          inputRef: p.inlineNameInputRef,
          disabled: p.inlineSaveLoading,
          ariaLabel: t("EDIT_UNIT_NAME"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "gid",
        layout: { width: 5, minWidth: 80, main: true },
        header: {
          kind: "sort",
          text: t("ID"),
          onSort: p.onSortGid,
          sortIcon: p.gidSortIcon,
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("ID")),
        },
        filter: {
          kind: "search",
          value: p.colFilterGid,
          onChange: p.setColFilterGid,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("ID")),
        },
        onCellDoubleClick: ({ row }) => p.onStartInlineEdit(row, "gid"),
        viewCell: ({ row }) => (
          <span className="break-all text-xs">
            {row.unit_gid ?? row.u_gid ?? "—"}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineGid,
          onChange: p.setInlineGid,
          inputRef: p.inlineGidInputRef,
          className: gridTextFieldClassName("text-xs"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("ID"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "format",
        layout: { width: 5, minWidth: 80 },
        header: {
          kind: "sort",
          text: t("UNIT_FORMAT", "Format"),
          onSort: () => undefined,
          sortAriaLabel: t("UNIT_FORMAT", "Format"),
          sortHidden: true,
        },
        filter: {
          kind: "select",
          menuPortal: true,
          searchEnabled: p.formatFilterOptions.length > 12,
          value: p.colFilterFormat,
          onChange: p.setColFilterFormat,
          ariaLabel: t("FILTER_BY_LABEL", "Filter by {label}").replace(
            "{label}",
            t("UNIT_FORMAT", "Format")
          ),
          options: p.formatFilterOptions,
        },
        onCellDoubleClick: ({ row }) => p.onStartInlineEdit(row, "format"),
        viewCell: ({ row }) => (
          <span className="text-xs" title={(row.unit_format ?? row.u_format) ?? undefined}>
            {resolveUnitFormatLabel(
              row.unit_format ?? row.u_format,
              p.formatDisplayOptions
            ) || "—"}
          </span>
        ),
        editField: {
          kind: "combobox",
          inputRef: p.inlineFormatInputRef,
          inputClassName: gridTextFieldClassName(),
          placeholder: t("UNIT_FORMAT_COMBO_PLACEHOLDER"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("UNIT_FORMAT", "Format"),
          inputValue: p.inlineFormatDdOpen
            ? p.inlineFormatSearch
            : p.inlineFormat
              ? resolveUnitFormatLabel(p.inlineFormat, p.formatEditOptions) ||
                p.inlineFormat
              : "",
          onInputChange: (v) => {
            p.setInlineFormatSearch(v);
            p.setInlineFormatDdOpen(true);
            p.setInlineFormatHi(-1);
            if (!v.trim()) {
              p.setInlineFormat("");
            }
          },
          open: p.inlineFormatDdOpen,
          onOpenChange: (open) => {
            p.setInlineFormatDdOpen(open);
            if (!open) {
              p.setInlineFormatHi(-1);
              p.setInlineFormatSearch("");
            }
          },
          highlightIndex: p.inlineFormatHi,
          onHighlightChange: p.setInlineFormatHi,
          navigableCount: inlineFormatNavCount,
          options: inlineFormatComboOptions,
          selectedId: p.inlineFormat,
          onSelect: (id) => {
            p.setInlineFormat(id);
            p.setInlineFormatSearch("");
            p.setInlineFormatDdOpen(false);
            p.setInlineFormatHi(-1);
          },
          onEnterWhenClosed: p.onInlineSave,
          emptyMessage: t("NO_FORMAT_MATCH"),
          openOnArrowDown: false,
          menuPortal: true,
        },
      },
      {
        id: "inlineActions",
        layout: ICON_ACTION_COLUMN_LAYOUT,
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        cell: ({ row, mode }) => {
          if (mode !== "edit" || p.editingRowId !== unitRowId(row)) {
            return null;
          }
          const nameOk = p.inlineName.trim().length > 0;
          const gidTrim = p.inlineGid.trim();
          const gidOk = gidTrim.length > 0;
          const saveOk = nameOk && gidOk;
          return (
            <GridInlineSaveCancelActions
              onSave={p.onInlineSave}
              onCancel={p.onInlineCancel}
              saveLoading={p.inlineSaveLoading}
              saveDisabled={!saveOk}
              saveTitle={
                !nameOk
                  ? t("ADD_SAVE_TITLE_NEED_NAME")
                  : !gidOk
                    ? t("UNIT_ID_MANDATORY")
                    : t("SAVE_UNIT")
              }
              saveAriaLabel={
                !nameOk
                  ? t("SAVE_UNIT_ARIA_NEED_NAME")
                  : !gidOk
                    ? t("UNIT_ID_MANDATORY")
                    : t("SAVE_UNIT")
              }
              cancelTitle={t("CANCEL_EDIT")}
              cancelAriaLabel={t("CANCEL_EDIT")}
            />
          );
        },
      },
    ];
  }, [
    t,
    p.allRowsSelected,
    p.selectedRowIds,
    p.selectAll,
    p.toggleSelect,
    p.colFilterUnit,
    p.setColFilterUnit,
    p.colFilterGid,
    p.setColFilterGid,
    p.colFilterFormat,
    p.setColFilterFormat,
    p.onSortUnit,
    p.onSortGid,
    p.unitSortIcon,
    p.gidSortIcon,
    p.editingRowId,
    p.inlineName,
    p.setInlineName,
    p.inlineNameInputRef,
    p.inlineGid,
    p.setInlineGid,
    p.inlineGidInputRef,
    p.inlineFormat,
    p.setInlineFormat,
    p.inlineFormatSearch,
    p.setInlineFormatSearch,
    p.inlineFormatDdOpen,
    p.setInlineFormatDdOpen,
    p.inlineFormatHi,
    p.setInlineFormatHi,
    p.inlineFormatInputRef,
    p.filteredInlineFormatOptions,
    p.formatFilterOptions,
    p.formatEditOptions,
    p.formatDisplayOptions,
    p.inlineSaveLoading,
    p.onStartInlineEdit,
    p.onInlineSave,
    p.onInlineCancel,
    inlineFormatComboOptions,
    inlineFormatNavCount,
  ]);
}
